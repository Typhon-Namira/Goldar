import { describe, expect, it } from "vitest";
import { LobeStabilizer } from "./stabilization";
import { createLobeOccluder, PIERCING_INSET_MM } from "./ear-occlusion";

describe("ear stability", () => {
  it("reduces stationary detector jitter", () => {
    const filter = new LobeStabilizer();
    let variance = 0;
    for (let i = 0; i < 120; i++) {
      const filtered = filter.update(
        { x: i % 2 ? 1 : -1, y: 0, z: 0 },
        (i * 1000) / 30,
      );
      if (i > 30) variance += filtered.x ** 2;
    }
    expect(Math.sqrt(variance / 89)).toBeLessThan(0.25);
  });
  it("follows intentional movement without prolonged lag", () => {
    const filter = new LobeStabilizer();
    filter.update({ x: 0, y: 0, z: 0 }, 0);
    let value;
    for (let i = 1; i <= 6; i++)
      value = filter.update({ x: 12, y: 0, z: 0 }, (i * 1000) / 30);
    expect(value!.x).toBeGreaterThan(10);
  });
  it("reacquires directly after a gap or visibility reset", () => {
    const filter = new LobeStabilizer();
    filter.update({ x: 0, y: 0, z: 0 }, 0);
    expect(filter.update({ x: 20, y: 0, z: 0 }, 400).x).toBe(20);
    filter.reset();
    expect(filter.update({ x: -10, y: 0, z: 0 }, 433).x).toBe(-10);
  });
});

describe("piercing depth", () => {
  it("writes only tissue depth and intersects the inserted model top", () => {
    const mask = createLobeOccluder();
    expect(mask.material.colorWrite).toBe(false);
    expect(mask.material.depthWrite).toBe(true);
    expect(mask.renderOrder).toBeLessThan(0);
    expect(PIERCING_INSET_MM).toBeGreaterThan(mask.position.y - mask.scale.y);
    expect(PIERCING_INSET_MM).toBeLessThan(mask.position.y + mask.scale.y);
    expect(PIERCING_INSET_MM - 15).toBeLessThan(mask.position.y - mask.scale.y);
    mask.geometry.dispose();
    mask.material.dispose();
  });
});
