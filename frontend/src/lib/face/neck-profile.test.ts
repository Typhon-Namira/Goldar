import { describe, it, expect } from "vitest";
import { NeckProfileMemory } from "./neck-profile";
import type { BodyPose } from "./body-pose";
function pose(time: number): BodyPose {
  const points = Array.from({ length: 33 }, () => ({
    x: 0.5,
    y: 0.4,
    z: 0,
    visibility: 1,
  }));
  points[11].x = 0.7;
  points[12].x = 0.3;
  return { points, time, width: 640, height: 480 };
}
describe("person-specific neck proportions", () => {
  it("retains a fitted neck during skin occlusion and follows body translation", () => {
    const memory = new NeckProfileMemory();
    const first = pose(0);
    first.neck = { left: 0.45, right: 0.55, y: 0.35 };
    memory.apply(first);
    const next = pose(100);
    next.points[11].x += 0.1;
    next.points[12].x += 0.1;
    const fitted = memory.apply(next);
    expect(fitted.neck!.left).toBeCloseTo(0.55);
    expect(fitted.neck!.right).toBeCloseTo(0.65);
    expect(fitted.neck!.y).toBeCloseTo(0.35);
  });
  it("does not transfer an old neck fit after the body leaves the camera", () => {
    const memory = new NeckProfileMemory();
    const first = pose(0);
    first.neck = { left: 0.45, right: 0.55, y: 0.35 };
    memory.apply(first);
    expect(memory.apply(pose(2000)).neck).toBeUndefined();
  });
});
