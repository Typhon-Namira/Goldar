import { describe, it, expect } from "vitest";
import { PerspectiveCamera, Vector3 } from "three";
import { fitNeck, cameraPoint, videoPoint } from "./neck-fit";
import type { BodyPose } from "./body-pose";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
const camera = new PerspectiveCamera(60, 4 / 3, 0.01, 100);
camera.updateMatrixWorld(true);
const viewport = { width: 640, height: 480 };
function pose(): BodyPose {
  const points = Array.from({ length: 33 }, () => ({
    x: 0.5,
    y: 0.4,
    z: 0,
    visibility: 1,
  }));
  points[11] = { x: 0.7, y: 0.6, z: 0, visibility: 1 };
  points[12] = { x: 0.3, y: 0.6, z: 0, visibility: 1 };
  return { points, time: 100, width: 640, height: 480 };
}
describe("body anchored necklace", () => {
  it("fits the shoulder frame and stays independent of face yaw and chin", () => {
    const p = pose(),
      fit = fitNeck(p, viewport, camera, 1, true)!;
    const screen = fit.position.clone().project(camera);
    expect(screen.x).toBeCloseTo(0);
    expect((1 - screen.y) / 2).toBeLessThan(0.6);
    expect((1 - screen.y) / 2).toBeGreaterThan(0.5);
    expect(
      new Vector3(0, 0, 1).applyQuaternion(fit.rotation).z,
    ).toBeGreaterThan(0.99);
    p.points[0].x = 0.9; // Turning the head cannot move the necklace's body anchor.
    expect(
      fitNeck(p, viewport, camera, 1, true)!.position.distanceTo(fit.position),
    ).toBe(0);
  });
  it("does not fit guessed body geometry when a shoulder is missing", () => {
    const p = pose();
    p.points[12].visibility = 0.2;
    expect(fitNeck(p, viewport, camera, 1, true)).toBeNull();
  });
  it("maps mirrored, centre-cropped video landmarks into the camera exactly", () => {
    const point = cameraPoint(
      { x: 0.6, y: 0.4, z: 0 },
      pose(),
      { width: 400, height: 800 },
      camera,
      1,
      true,
    ).project(camera);
    expect(point.x).toBeCloseTo(-0.5333333333);
    expect(point.y).toBeCloseTo(0.2);
  });
  it("preserves projected fit across depth and updates person-specific neck width", () => {
    const p = pose();
    p.neck = { left: 0.45, right: 0.55, y: 0.5 };
    const a = fitNeck(p, viewport, camera, 1, true)!,
      b = fitNeck(p, viewport, camera, 2, true)!;
    expect(
      a.position
        .clone()
        .project(camera)
        .distanceTo(b.position.clone().project(camera)),
    ).toBeLessThan(0.02);
    expect(a.radius).toBeGreaterThan(47);
    expect(a.radius).toBeLessThan(48);
    expect(a.radius).toBeCloseTo(b.radius);
  });
  it("distinguishes a back-facing body instead of always pointing the model forward", () => {
    const p = pose();
    [p.points[11], p.points[12]] = [p.points[12], p.points[11]];
    const fit = fitNeck(p, viewport, camera, 1, true)!;
    expect(new Vector3(0, 0, 1).applyQuaternion(fit.rotation).z).toBeLessThan(
      -0.99,
    );
  });
});

describe("learned neck silhouette extraction", () => {
  const context: { self: Record<string, unknown> } = { self: {} };
  runInNewContext(
    readFileSync(
      new URL("../../../public/workers/neck-contour.js", import.meta.url),
      "utf8",
    ),
    context,
  );
  const extract = context.self.findNeckContour as (
    points: BodyPose["points"],
    pixels: Uint8ClampedArray,
    w: number,
    h: number,
    person: {
      values: Uint8Array;
      width: number;
      height: number;
      category: boolean;
    } | null,
    region?: { chinY: number },
  ) => { left: number; right: number; y: number } | null;
  it("keeps the full neck silhouette despite a dark strip inside the skin", () => {
    const p = pose().points;
    p[0] = { x: 0.5, y: 0.25, z: 0, visibility: 1 };
    p[9].y = p[10].y = 0.35;
    const pixels = new Uint8ClampedArray(100 * 100 * 4);
    const values = new Uint8Array(100 * 100).fill(255);
    for (let y = 36; y < 58; y++)
      for (let x = 42; x <= 58; x++) values[y * 100 + x] = 0;
    // All-black RGB would have failed the old cheek-colour scan.
    const result = extract(
      p,
      pixels,
      100,
      100,
      {
        values,
        width: 100,
        height: 100,
        category: true,
      },
      { chinY: 0.35 },
    )!;
    expect(result).not.toBeNull();
    expect(result.left).toBeCloseTo(0.42, 1);
    expect(result.right).toBeCloseTo(0.59, 1);
    expect(result.left).toBeLessThan(0.44);
    expect(result.right).toBeGreaterThan(0.56);
  });
  it("excludes a narrower jaw above the chin instead of fitting the collar to it", () => {
    const p = pose().points;
    p[0] = { x: 0.5, y: 0.25, z: 0, visibility: 1 };
    p[9].y = p[10].y = 0.35;
    const values = new Uint8Array(10000).fill(255);
    for (let y = 30; y < 40; y++)
      for (let x = 44; x <= 56; x++) values[y * 100 + x] = 0;
    for (let y = 40; y < 58; y++)
      for (let x = 42; x <= 58; x++) values[y * 100 + x] = 0;
    const result = extract(
      p,
      new Uint8ClampedArray(40000),
      100,
      100,
      { values, width: 100, height: 100, category: true },
      { chinY: 0.4 },
    )!;
    expect(result).not.toBeNull();
    expect(result.y).toBeGreaterThan(0.4);
    expect(result.right - result.left).toBeGreaterThan(0.15);
  });
  it("rejects an obscured neck rather than returning a chest-sized skin mask", () => {
    expect(
      extract(
        pose().points,
        new Uint8ClampedArray(100 * 100 * 4),
        100,
        100,
        null,
      ),
    ).toBeNull();
  });
});

describe("neck-defined attachment height", () => {
  it("places the collar at the observed neck instead of merely masking part of the chest", () => {
    const p = pose();
    const shoulderOnly = fitNeck(p, viewport, camera, 1, true)!;
    p.neck = { left: 0.45, right: 0.55, y: 0.46 };
    const fitted = fitNeck(p, viewport, camera, 1, true)!;
    const visible = fitted.position.clone().project(camera);
    const y = (1 - visible.y) / 2;
    expect(y).toBeCloseTo(0.46, 8);
    expect(fitted.position.y).toBeGreaterThan(shoulderOnly.position.y);
  });
});

describe("visible chin anatomical bounds", () => {
  it("rejects a chest-level skin anchor without rotating the necklace with the head", () => {
    const p = pose();
    p.neck = { left: 0.45, right: 0.55, y: 0.72 };
    const chin = cameraPoint(
      { x: 0.5, y: 0.4, z: 0 },
      p,
      viewport,
      camera,
      1,
      true,
    );
    const fit = fitNeck(p, viewport, camera, 1, true, chin)!;
    const up = new Vector3(0, 1, 0).applyQuaternion(fit.rotation);
    const below = chin.clone().sub(fit.position).dot(up) / fit.mm;
    expect(below).toBeGreaterThanOrEqual(19.999);
    expect(below).toBeLessThanOrEqual(fit.radius * 1.7 + 0.001);
    expect(fit.rotation.w).toBeCloseTo(1);
  });
});

describe("video reference mapping", () => {
  it("maps the chin reference back into raw video through centre crop and selfie mirroring", () => {
    const world = new Vector3(0.2, 0.1, 0).unproject(camera);
    const point = videoPoint(
      world,
      { width: 640, height: 480 },
      { width: 400, height: 800 },
      camera,
      true,
    );
    expect(point.x).toBeCloseTo(0.4625, 8);
    expect(point.y).toBeCloseTo(0.45, 8);
  });
});
