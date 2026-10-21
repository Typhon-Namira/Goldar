import * as THREE from "three";
import type {FingerFrame, FingerName, HandPoint} from "./handPose";

export type RingTransform = {
  center: THREE.Vector3;
  rotation: THREE.Quaternion;
  scale: number;
  fingerWidthPx: number;
};

/**
 * Camera-space anatomical basis for an orthographic WebGL overlay.
 * MediaPipe world landmarks are hand-relative, not the same coordinate system
 * as the camera overlay. Using their quaternion directly here made the ring
 * hole face the camera instead of wrap around the projected finger.
 *
 * +Y is the proximal finger axis. +Z is the outward/dorsal face when
 * handedness is known. Depth deltas are scaled from MediaPipe normalized z
 * into the SAME CSS-pixel space as projected x/y.
 */
export function ringRotationFromFrame(
  frame: FingerFrame,
  landmarks?: readonly HandPoint[],
  finger?: FingerName,
  toScreen?: (point: HandPoint) => {x:number;y:number},
  depthPixelsPerUnit = 0,
): THREE.Quaternion {
  if (!landmarks || !finger || !toScreen || !(depthPixelsPerUnit > 0)) {
    return frame.quaternion.clone();
  }
  const [mcpIndex,pipIndex] = joints[finger];
  const mcp = toScreen(landmarks[mcpIndex]);
  const pip = toScreen(landmarks[pipIndex]);
  const axis = new THREE.Vector3(
    pip.x-mcp.x, mcp.y-pip.y,
    -(landmarks[pipIndex].z-landmarks[mcpIndex].z)*depthPixelsPerUnit,
  );
  if (axis.lengthSq() < 1) return frame.quaternion.clone();
  axis.normalize();
  const index = toScreen(landmarks[5]), pinky = toScreen(landmarks[17]);
  const across = new THREE.Vector3(
    index.x-pinky.x, pinky.y-index.y,
    -(landmarks[5].z-landmarks[17].z)*depthPixelsPerUnit,
  );
  across.addScaledVector(axis,-across.dot(axis));
  if (across.lengthSq() < 1) return frame.quaternion.clone();
  across.normalize();
  // Normalize outward-facing orientation by anatomical handedness. This
  // follows the knuckle order, not a camera-facing billboard convention.
  // MediaPipe handedness conventions must be confirmed for mirrored inputs.
  const dorsal = new THREE.Vector3().crossVectors(across,axis);
  if (frame.handSide === "Right") dorsal.negate();
  if (dorsal.lengthSq() < 1e-8) return frame.quaternion.clone();
  dorsal.normalize();
  const lateral = new THREE.Vector3().crossVectors(axis,dorsal).normalize();
  const matrix = new THREE.Matrix4().makeBasis(lateral,axis,dorsal);
  return new THREE.Quaternion().setFromRotationMatrix(matrix).normalize();
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
  /** Width of the camera frame projected into screen CSS pixels. */
  depthPixelsPerUnit: number;
}): RingTransform | null {
  const {landmarks, finger, frame, toScreen, viewportWidth, viewportHeight,
    innerDiameter, fitRatio, sizeMultiplier, widthCalibration,depthPixelsPerUnit} = options;
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
    rotation: ringRotationFromFrame(frame,landmarks,finger,toScreen,depthPixelsPerUnit),
    scale, fingerWidthPx,
  };
}
