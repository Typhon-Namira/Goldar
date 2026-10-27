import { expect, it } from "vitest";
import { estimatedNeck } from "./neck-observation";
import type { BodyPose } from "./body-pose";
const pose = (): BodyPose => {
  const points = Array.from({ length: 33 }, () => ({
    x: 0.5,
    y: 0.35,
    z: 0,
    visibility: 1,
  }));
  points[11] = { x: 0.7, y: 0.6, z: 0, visibility: 1 };
  points[12] = { x: 0.3, y: 0.6, z: 0, visibility: 1 };
  return { points, time: 0, width: 640, height: 480 };
};
it("provides a bounded visible necklace fit without a segmented silhouette", () => {
  const p = pose(),
    neck = estimatedNeck(p, 0.42)!;
  expect(neck).toBeTruthy();
  expect(neck.y).toBeGreaterThan(0.42);
  expect(neck.y).toBeLessThan(0.46);
  expect((neck.left + neck.right) / 2).toBeCloseTo(0.5);
  expect(neck.right - neck.left).toBeCloseTo(0.132);
});
it("never invents a chin from mouth landmarks when the face engine misses it", () => {
  expect(estimatedNeck(pose())).toBeNull();
});
it("rejects missing shoulders/face and impossible anatomy instead of fitting arbitrary frames", () => {
  const p = pose();
  p.points[12].visibility = 0.1;
  expect(estimatedNeck(p, 0.42)).toBeNull();
  const missing = pose();
  missing.points[9].visibility = 0.1;
  expect(estimatedNeck(missing)).toBeNull();
  expect(estimatedNeck(pose(), 0.8)).toBeNull();
});
it("centres bootstrap under a leaning chin without following it outside the shoulder frame", () => {
  const p = pose();
  p.reference = { chinX: 0.54, chinY: 0.42 };
  const neck = estimatedNeck(p, 0.42)!;
  expect((neck.left + neck.right) / 2).toBeCloseTo(0.526);
  p.reference.chinX = 0.99;
  const bounded = estimatedNeck(p, 0.42)!;
  expect((bounded.left + bounded.right) / 2).toBeLessThan(0.54);
});
