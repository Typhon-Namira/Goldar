import type { FaceCalibrationConfig } from "../api";
export function defaultCalibration(category: string): FaceCalibrationConfig {
  return {
    height_mm: category === "necklace" ? 85 : 35,
    offset_mm: [
      0,
      category === "necklace" ? -10 : 0,
      category === "necklace" ? 40 : 0,
    ],
    rotation_deg: [0, 0, 0],
    anchor: [0.5, 1, 0.5],
    side: "both",
    ear_anchor: "auto",
  };
}

/** Upgrade only the unchanged calibration of our old planar sample. Merchant
 * models and manually edited sample calibrations retain their saved values. */
export function resolveCalibration(product: {
  category: string;
  glb_url: string;
  face_calibration?: FaceCalibrationConfig | null;
}): FaceCalibrationConfig {
  const saved = product.face_calibration;
  const same = (a: number[], b: number[]) =>
    a.length === b.length && a.every((n, i) => n === b[i]);
  if (
    product.category === "necklace" &&
    product.glb_url === "/models/sample-necklace.glb" &&
    saved &&
    saved.height_mm === 180 &&
    same(saved.offset_mm, [0, -45, 10]) &&
    same(saved.anchor, [0.5, 1, 0.5]) &&
    same(saved.rotation_deg, [0, 0, 0])
  ) {
    return defaultCalibration("necklace");
  }
  return saved ?? defaultCalibration(product.category);
}
