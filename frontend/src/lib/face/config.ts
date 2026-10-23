import type { FaceCalibrationConfig } from "../api";
export function defaultCalibration(category: string): FaceCalibrationConfig {
  return {
    height_mm: category === "necklace" ? 180 : 35,
    offset_mm: [
      0,
      category === "necklace" ? -45 : 0,
      category === "necklace" ? 10 : 0,
    ],
    rotation_deg: [0, 0, 0],
    anchor: [0.5, 1, 0.5],
    side: "both",
    ear_anchor: "auto",
  };
}
