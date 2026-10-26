import { describe, expect, it } from "vitest";
import { SwipeDetector } from "./swipe";
import type { BodyPose } from "../face/body-pose";
function pose(x: number, time: number, y = 0.45, shift = 0): BodyPose {
  const points = Array.from({ length: 33 }, () => ({ x: 0.5, y: 0.9, z: 0, visibility: 0 }));
  points[11] = { x: 0.7 + shift, y: 0.5, z: 0, visibility: 1 };
  points[12] = { x: 0.3 + shift, y: 0.5, z: 0, visibility: 1 };
  points[15] = { x: x + shift, y, z: 0, visibility: 1 };
  return { points, time, width: 640, height: 480 };
}
describe("raised-hand product swipes", () => {
  it("recognizes one horizontal sweep in display coordinates, including selfie mirroring", () => {
    for (const mirrored of [false, true]) for (const direction of [-1, 1]) {
      const detector = new SwipeDetector();
      expect(detector.update(pose(0.5 - direction * 0.16, 0), mirrored)).toBeNull();
      expect(detector.update(pose(0.5, 110), mirrored)).toBeNull();
      expect(detector.update(pose(0.5 + direction * 0.16, 220), mirrored)).toBe(direction * (mirrored ? -1 : 1));
      expect(detector.update(pose(0.3, 330), mirrored)).toBeNull();
      expect(detector.update(pose(0.7, 550), mirrored)).toBeNull();
    }
  });
  it("ignores a pedestrian moving sideways with their hand still relative to their body", () => {
    const detector = new SwipeDetector();
    for (let i = 0; i < 4; i++)
      expect(detector.update(pose(0.4, i * 110, 0.45, i * 0.1), false)).toBeNull();
  });
  it("rejects walking arms, vertical gestures, tiny jitter and low-confidence wrists", () => {
    for (const kind of ["low", "vertical", "jitter", "uncertain"]) {
      const detector = new SwipeDetector();
      for (let i = 0; i < 4; i++) {
        const p = pose(kind === "jitter" ? 0.5 + i * 0.005 : 0.34 + i * 0.11, i * 110,
          kind === "low" ? 0.85 : kind === "vertical" ? 0.3 + i * 0.08 : 0.45);
        if (kind === "uncertain") p.points[15].visibility = 0.3;
        expect(detector.update(p, false)).toBeNull();
      }
    }
  });
  it("rejects an isolated landmark jump after stationary frames", () => {
    const detector = new SwipeDetector();
    detector.update(pose(0.34, 0), false);
    detector.update(pose(0.34, 110), false);
    expect(detector.update(pose(0.67, 220), false)).toBeNull();
  });
  it("does not connect detections across a tracking gap or use an old repeated frame", () => {
    const detector = new SwipeDetector();
    detector.update(pose(0.3, 0), false);
    detector.update(pose(0.5, 110), false);
    expect(detector.update(pose(0.7, 1000), false)).toBeNull();
    expect(detector.update(pose(0.3, 1000), false)).toBeNull();
  });
});
