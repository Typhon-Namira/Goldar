import { describe, it, expect } from "vitest";
import { Quaternion, Vector3 } from "three";
import { StableNeckFrame } from "./body-stability";
const frame = () => ({
  position: new Vector3(0, 0, -1),
  rotation: new Quaternion(),
  mm: 0.001,
  radius: 48,
  height: 90,
  time: 0,
});
describe("render-frame body stabilization", () => {
  it("holds submillimetre body noise without drifting or resizing the neck", () => {
    const filter = new StableNeckFrame();
    filter.update(frame(), 0);
    for (let i = 1; i < 180; i++) {
      const target = frame();
      target.position.x = Math.sin(i) * 0.0004;
      target.radius += Math.sin(i) * 0.3;
      target.mm *= 1 + Math.cos(i) * 0.002;
      const result = filter.update(target, i * 16);
      expect(result.position.x).toBe(0);
      expect(result.radius).toBe(48);
      expect(result.mm).toBe(0.001);
    }
  });
  it("follows intentional body movement promptly and reacquires without travelling from the old wearer", () => {
    const filter = new StableNeckFrame();
    filter.update(frame(), 0);
    const target = frame();
    target.position.x = 0.05;
    let result = frame();
    for (let i = 1; i <= 12; i++) result = filter.update(target, i * 16);
    expect(result.position.x).toBeGreaterThan(0.045);
    const next = frame();
    next.position.x = -0.1;
    expect(filter.update(next, 220, true).position.x).toBe(-0.1);
  });
});

it("does not make the measured skin boundary breathe when only shoulder scale is noisy", () => {
  const filter = new StableNeckFrame();
  filter.update(frame(), 0);
  const scales: number[] = [];
  for (let i = 1; i <= 180; i++) {
    const target = frame(),
      noise = i % 2 === 0 ? 1.08 : 0.92;
    target.mm *= noise;
    target.radius /= noise;
    target.height /= noise;
    const result = filter.update(target, i * 16);
    expect(result.radius * result.mm).toBeCloseTo(0.048, 10);
    expect(result.height * result.mm).toBeCloseTo(0.09, 10);
    if (i > 20) scales.push(result.mm);
  }
  expect((Math.max(...scales) - Math.min(...scales)) / 0.001).toBeLessThan(
    0.015,
  );
});
