import { describe, it, expect } from "vitest";
import { Vector3 } from "three";
import { decodeObservation } from "./protocol";
import { HandSolver } from "./tracking";
import { coverProjection } from "./camera";
function payload(side = "Right") {
  const vertices = Array.from({ length: 778 }, (_, i) => [
    0.008 * Math.cos((i / 778) * Math.PI * 2),
    -0.0066 + ((i % 3) - 1) * 0.0008,
    0.5 + 0.008 * Math.sin((i / 778) * Math.PI * 2),
  ]);
  const landmarks = Array.from({ length: 21 }, () => ({
    x: 0.5,
    y: 0.5,
    z: 0.5,
  }));
  for (const [a, b, x] of [
    [5, 6, 0.56],
    [9, 10, 0.53],
    [13, 14, 0.5],
    [17, 18, 0.47],
  ]) {
    landmarks[a] = { x, y: 0.5, z: 0.5 };
    landmarks[b] = { x, y: 0.44, z: 0.5 };
  }
  return {
    hands: [
      {
        side,
        confidence: 0.95,
        landmarks,
        mesh: {
          available: true,
          vertices,
          faces: Array.from({ length: 200 }, (_, i) => [0, i + 1, i + 2]),
          camera: {
            fx: 500,
            fy: 500,
            cx: 320,
            cy: 240,
            width: 640,
            height: 480,
          },
        },
      },
    ],
    inferenceMs: 23,
  };
}
describe("inference boundary", () => {
  it("lifts image landmarks to camera-space metres", () =>
    expect(decodeObservation(payload(), 10, 50).hands[0].joints[13]).toEqual([
      0, 0, 0.5,
    ]));
  it("rejects invalid indices and nonfinite intrinsics", () => {
    const raw = payload();
    raw.hands[0].mesh.faces[0] = [0, 1, 778];
    expect(() => decodeObservation(raw, 1, 2)).toThrow();
    raw.hands[0].mesh.faces[0] = [0, 1, 2];
    raw.hands[0].mesh.camera.cx = NaN;
    expect(() => decodeObservation(raw, 1, 2)).toThrow();
  });
  it("accepts empty detections", () =>
    expect(decodeObservation({ hands: [] }, 1, 2).hands).toEqual([]));
  it("requires an actual posed mesh", () =>
    expect(() =>
      decodeObservation({ hands: [{ side: "Right" }] }, 1, 2),
    ).toThrow());
});
describe("anatomical attachment", () => {
  it("fits the selected cross section and rejects old responses", () => {
    const solver = new HandSolver(),
      o = decodeObservation(payload(), 100, 150),
      s = solver.solve(o, "ring");
    expect(s).not.toBeNull();
    expect(s!.diameter).toBeCloseTo(0.016, 2);
    expect(s!.position.z).toBe(-0.5);
    expect(solver.solve(o, "ring")).toBeNull();
    expect(
      solver.solve({ ...o, capturedAt: 200, receivedAt: 1600 }, "ring"),
    ).toBeNull();
  });
  it("locks handedness until reset", () => {
    const solver = new HandSolver();
    expect(
      solver.solve(decodeObservation(payload(), 100, 150), "ring"),
    ).not.toBeNull();
    expect(
      solver.solve(decodeObservation(payload("Left"), 200, 250), "ring"),
    ).toBeNull();
    solver.reset();
    expect(
      solver.solve(decodeObservation(payload("Left"), 200, 250), "ring"),
    ).not.toBeNull();
  });
  it("corrects the dorsal frame for left-handed anatomy", () => {
    const r = new HandSolver().solve(
      decodeObservation(payload(), 100, 150),
      "ring",
    )!;
    const l = new HandSolver().solve(
      decodeObservation(payload("Left"), 100, 150),
      "ring",
    )!;
    expect(
      new Vector3(0, 0, 1)
        .applyQuaternion(r.rotation)
        .dot(new Vector3(0, 0, 1).applyQuaternion(l.rotation)),
    ).toBeCloseTo(-1);
  });
});
describe("camera alignment", () => {
  it("matches off-centre intrinsics under portrait cover cropping", () => {
    const c = { width: 640, height: 480, fx: 500, fy: 510, cx: 300, cy: 230 },
      s = 640 / 480;
    const p = new Vector3(0.02, -0.01, -0.5).applyMatrix4(
      coverProjection(c, 360, 640),
    );
    expect((p.x + 1) * 180).toBeCloseTo(
      ((c.fx * 0.02) / 0.5 + c.cx) * s + (360 - 640 * s) / 2,
    );
    expect((1 - p.y) * 320).toBeCloseTo(((c.fy * 0.01) / 0.5 + c.cy) * s);
  });
});
describe("server consistency", () => {
  it("rejects conflicting units and schema versions", () => {
    const raw = payload();
    expect(() =>
      decodeObservation({ ...raw, schemaVersion: 2 }, 1, 2),
    ).toThrow();
    raw.hands[0].mesh = Object.assign(raw.hands[0].mesh, {
      units: "millimeters",
    });
    expect(() => decodeObservation(raw, 1, 2)).toThrow();
  });
  it("rejects a different capture resolution", () =>
    expect(() =>
      decodeObservation({ ...payload(), imageWidth: 1280 }, 1, 2),
    ).toThrow());
  it("rejects native reconstruction diagnostics that report a mismatch", () => {
    const raw = payload();
    Object.assign(raw.hands[0], {
      lbsDiagnostics: { available: true, passesOneMillimeterNative: false },
    });
    expect(() => decodeObservation(raw, 1, 2)).toThrow();
  });
});
