import * as THREE from "three";
import type {FingerFrame, FingerName, HandPoint} from "./handPose";

export type RingTransform = {
  center: THREE.Vector3;
  rotation: THREE.Quaternion;
  scale: number;
  fingerWidthPx: number;
};

/** Maps model canonical +Y (hole axis) and +Z (gem direction) to the finger frame. */
export function ringRotationFromFrame(frame: FingerFrame): THREE.Quaternion {
  return frame.quaternion.clone();
}

const joints: Record<FingerName, [number, number]> = {
  index: [5, 6], middle: [9, 10], ring: [13, 14], pinky: [17, 18],
};
const neighborPairs: Record<FingerName, [number, number]> = {
  index: [5, 9], middle: [5, 13], ring: [9, 17], pinky: [13, 17],
};

/**
 * Build a camera-overlay-space ring transform.
 * Camera XY is in CSS pixels and +Y is upward. The relative Z component
 * is intentionally zero: MediaPipe does not provide metric camera depth.
 */
export function computeRingTransform(options: {
  landmarks: readonly HandPoint[];
  finger: FingerName;
  frame: FingerFrame;
  toScreen: (point: HandPoint) => { x: number; y: number };
  viewportWidth: number;
  viewportHeight: number;
  innerDiameter: number;
  fitRatio: number;
  sizeMultiplier: number;
  widthCalibration: number;
}): RingTransform | null {
  const {landmarks, finger, frame, toScreen, viewportWidth, viewportHeight,
    innerDiameter, fitRatio, sizeMultiplier, widthCalibration} = options;
  if (landmarks.length < 21 || !Number.isFinite(innerDiameter) || innerDiameter <= 1e-6 ||
      !Number.isFinite(fitRatio) || !Number.isFinite(sizeMultiplier) || sizeMultiplier <= 0 ||
      !Number.isFinite(widthCalibration) || widthCalibration <= 0 ||
      viewportWidth <= 0 || viewportHeight <= 0) return null;

  const [mcp, pip] = joints[finger];
  const base = toScreen(landmarks[mcp]);
  const end = toScreen(landmarks[pip]);
  const t = THREE.MathUtils.clamp(fitRatio, 0.05, 0.65);
  const x = THREE.MathUtils.lerp(base.x, end.x, t);
  const y = THREE.MathUtils.lerp(base.y, end.y, t);
  const indexMcp = toScreen(landmarks[5]);
  const pinkyMcp = toScreen(landmarks[17]);
  const palmWidth = Math.hypot(indexMcp.x - pinkyMcp.x, indexMcp.y - pinkyMcp.y);
  const [n1, n2] = neighborPairs[finger];
  const a = toScreen(landmarks[n1]);
  const b = toScreen(landmarks[n2]);
  const spacing = Math.hypot(a.x - b.x, a.y - b.y);
  if (![x,y,palmWidth,spacing].every(Number.isFinite) || palmWidth < 1 || spacing < 1) return null;
  // Landmarks do not mark actual skin boundaries. Use a conservative,
  // bounded anatomical proxy and permit per-ring/per-user calibration.
  const approximateWidth = Math.min(palmWidth * 0.29,
    Math.max(palmWidth * 0.16, spacing * 0.68));
  const fingerWidthPx = Math.max(1, approximateWidth * widthCalibration);
  const scale = fingerWidthPx / innerDiameter * sizeMultiplier;
  if (!Number.isFinite(scale) || scale <= 0) return null;

  return {
    center: new THREE.Vector3(x - viewportWidth / 2, viewportHeight / 2 - y, 0),
    rotation: ringRotationFromFrame(frame),
    scale, fingerWidthPx,
  };
}
