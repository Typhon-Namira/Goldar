import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { expect, it } from "vitest";
type ROI = { x: number; y: number; width: number; height: number };
const context = {
  self: {} as {
    createHandFocus: () => (
      pixels: Uint8ClampedArray,
      w: number,
      h: number,
    ) => ROI | null;
    mapHandFocus: (
      hands: { x: number; y: number; z: number }[][],
      roi: ROI,
    ) => { x: number; y: number; z: number }[][];
  },
};
runInNewContext(
  readFileSync(
    new URL("../../../public/workers/hand-focus.js", import.meta.url),
    "utf8",
  ),
  context,
);
const pixels = () => new Uint8ClampedArray(32 * 24 * 4).fill(60);
function patch(image: Uint8ClampedArray) {
  for (let y = 3; y < 12; y++)
    for (let x = 1; x < 9; x++)
      for (let c = 0; c < 3; c++) image[(y * 32 + x) * 4 + c] = 220;
  return image;
}
it("only proposes a local search after sufficient image motion, never from a static frame", () => {
  const update = context.self.createHandFocus(),
    image = pixels();
  expect(update(image, 640, 480)).toBeNull();
  expect(update(image, 640, 480)).toBeNull();
  const roi = update(patch(pixels()), 640, 480)!;
  expect(roi).not.toBeNull();
  expect(roi.x).toBe(0);
  expect(roi.x + roi.width).toBeLessThanOrEqual(1);
  expect(roi.y + roi.height).toBeLessThanOrEqual(1);
  expect(roi.width * 640).toBeCloseTo(roi.height * 480);
  expect(roi.y).toBeLessThanOrEqual(3 / 24);
  expect(roi.y + roi.height).toBeGreaterThanOrEqual(12 / 24);
});
it("rejects whole-image motion and exposure shifts as focus cues", () => {
  const update = context.self.createHandFocus();
  update(pixels(), 640, 480);
  expect(
    update(new Uint8ClampedArray(32 * 24 * 4).fill(220), 640, 480),
  ).toBeNull();
});
it("maps crop landmarks and depth into the exact original camera coordinates", () => {
  const mapped = context.self.mapHandFocus([[{ x: 0.25, y: 0.75, z: 0.1 }]], {
    x: 0.2,
    y: 0.1,
    width: 0.4,
    height: 0.6,
  })[0][0];
  expect(mapped.x).toBeCloseTo(0.3);
  expect(mapped.y).toBeCloseTo(0.55);
  expect(mapped.z).toBeCloseTo(0.04);
});
it("keeps the focus inside portrait cameras without stretching the detector input", () => {
  const update = context.self.createHandFocus();
  update(pixels(), 270, 480);
  const roi = update(patch(pixels()), 270, 480)!;
  expect(roi.width * 270).toBeCloseTo(roi.height * 480);
  expect(roi.x).toBeGreaterThanOrEqual(0);
  expect(roi.y).toBeGreaterThanOrEqual(0);
  expect(roi.x + roi.width).toBeLessThanOrEqual(1);
  expect(roi.y + roi.height).toBeLessThanOrEqual(1);
});
