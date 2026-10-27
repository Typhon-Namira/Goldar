import { it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
const context = {
  self: {} as {
    faceQualityMetrics: (
      p: Uint8ClampedArray,
      w: number,
      h: number,
    ) => { sharpness: number; usable: boolean };
  },
};
runInNewContext(
  readFileSync(
    new URL("../../../public/workers/face-quality-metrics.js", import.meta.url),
    "utf8",
  ),
  context,
);
it("rejects flat/blurred and clipped lighting rather than zooming noise-free blank frames", () => {
  for (const value of [0, 120, 255])
    expect(
      context.self.faceQualityMetrics(
        new Uint8ClampedArray(96 * 96 * 4).fill(value),
        96,
        96,
      ).usable,
    ).toBe(false);
});
it("accepts a resolved, adequately exposed textured crop", () => {
  const p = new Uint8ClampedArray(96 * 96 * 4).fill(255);
  for (let y = 0; y < 96; y++)
    for (let x = 0; x < 96; x++)
      for (let c = 0; c < 3; c++)
        p[(y * 96 + x) * 4 + c] =
          (Math.floor(x / 5) + Math.floor(y / 5)) % 2 ? 70 : 180;
  expect(context.self.faceQualityMetrics(p, 96, 96).usable).toBe(true);
});
