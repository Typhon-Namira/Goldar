import * as THREE from "three";

export type HandPoint = { x: number; y: number; z: number };
export type FingerName = "index" | "middle" | "ring" | "pinky";
export type HandSide = "Left" | "Right" | "Unknown";
export type PalmView = "palm" | "back" | "edge" | "unknown";

export type FingerFrame = {
  /** Orthonormal, right-handed local frame in MediaPipe world-landmark coordinates. */
  longitudinal: THREE.Vector3;
  lateral: THREE.Vector3;
  normal: THREE.Vector3;
  /** Proximal phalanx center in world-landmark coordinates, NOT pixels or camera meters. */
  origin: THREE.Vector3;
  quaternion: THREE.Quaternion;
  handSide: HandSide;
  view: PalmView;
  /** Geometry quality, not the MediaPipe detector's probability. */
  confidence: number;
};

export type PoseResult = Pick<FingerFrame, "quaternion" | "handSide" | "view" | "confidence">;

const JOINTS: Record<FingerName, readonly [number, number, number]> = {
  index: [5, 6, 7],
  middle: [9, 10, 11],
  ring: [13, 14, 15],
  pinky: [17, 18, 19],
};

const EPSILON = 1e-10;
const finite = (v: THREE.Vector3) =>
  Number.isFinite(v.x) && Number.isFinite(v.y) && Number.isFinite(v.z);
const fromLandmark = (point: HandPoint) =>
  new THREE.Vector3(point.x, -point.y, -point.z);
const projected = (vector: THREE.Vector3, axis: THREE.Vector3) =>
  vector.clone().addScaledVector(axis, -vector.dot(axis));

/**
 * Phase 5.1: construct a geometrically valid, right-handed finger reference frame.
 *
 * This derives relative orientation only. MediaPipe world landmarks are hand-local
 * estimates; do not treat the frame origin as camera-space metric position.
 * No ring positioning, roll locking, smoothing, or occlusion is done here.
 */
export function estimateFingerFrame(
  points: readonly HandPoint[],
  finger: FingerName,
  reportedSide: HandSide = "Unknown",
  previous?: THREE.Quaternion,
): FingerFrame | null {
  if (points.length < 21 || !points.every(p =>
    p && Number.isFinite(p.x) && Number.isFinite(p.y) && Number.isFinite(p.z)
  )) return null;

  const [mcpIndex, pipIndex, dipIndex] = JOINTS[finger];
  const mcp = fromLandmark(points[mcpIndex]);
  const pip = fromLandmark(points[pipIndex]);
  const dip = fromLandmark(points[dipIndex]);

  const proximal = pip.clone().sub(mcp);
  const distal = dip.clone().sub(pip);
  const proximalLength = proximal.length();
  const distalLength = distal.length();
  if (proximalLength < EPSILON || distalLength < EPSILON) return null;

  proximal.divideScalar(proximalLength);
  distal.divideScalar(distalLength);
  // Follow the proximal segment while incorporating the DIP's articulation.
  // The DIP contribution is intentionally limited: extreme flexion must not
  // rotate a proximal-band reference to point along the distal phalanx.
  const bendCos = THREE.MathUtils.clamp(proximal.dot(distal), -1, 1);
  const distalWeight = THREE.MathUtils.lerp(0.08, 0.25, Math.max(0, bendCos));
  const longitudinal = proximal.clone().multiplyScalar(1 - distalWeight)
    .addScaledVector(distal, distalWeight);
  if (longitudinal.lengthSq() < EPSILON) return null;
  longitudinal.normalize();

  // Across-knuckle axis is more reliable than a single neighboring finger.
  // Remove the longitudinal component so the axes remain orthogonal.
  const acrossKnuckles = fromLandmark(points[5]).sub(fromLandmark(points[17]));
  const lateralCandidate = projected(acrossKnuckles, longitudinal);
  const projectedLength = lateralCandidate.length();
  const palmBreadth = acrossKnuckles.length();
  if (palmBreadth < EPSILON || projectedLength < palmBreadth * 0.08) return null;
  const lateral = lateralCandidate.divideScalar(projectedLength);
  const normal = new THREE.Vector3().crossVectors(lateral, longitudinal);
  if (!finite(normal) || normal.lengthSq() < EPSILON) return null;
  normal.normalize();
  // Re-orthogonalize to correct accumulated numerical errors.
  lateral.crossVectors(longitudinal, normal).normalize();

  const wrist = fromLandmark(points[0]);
  const indexBase = fromLandmark(points[5]);
  const pinkyBase = fromLandmark(points[17]);
  const palmNormal = new THREE.Vector3().crossVectors(
    indexBase.clone().sub(wrist),
    pinkyBase.clone().sub(wrist),
  );
  const palmMagnitude = palmNormal.length();
  if (palmMagnitude < EPSILON) return null;
  palmNormal.divideScalar(palmMagnitude);

  // Camera-relative viewing classification is heuristic. Handedness returned
  // by MediaPipe is affected by image mirroring, so avoid using view for an
  // anatomical dorsal/volar roll lock until the camera convention is validated.
  const facing = palmNormal.z;
  const view: PalmView = reportedSide === "Unknown" ? "unknown" :
    Math.abs(facing) < 0.18 ? "edge" :
    (reportedSide === "Right" ? facing : -facing) > 0 ? "palm" : "back";

  const basis = new THREE.Matrix4().makeBasis(lateral, longitudinal, normal);
  const quaternion = new THREE.Quaternion().setFromRotationMatrix(basis).normalize();
  if (previous && quaternion.dot(previous) < 0) {
    quaternion.set(-quaternion.x, -quaternion.y, -quaternion.z, -quaternion.w);
  }

  // Quality combines finger straightness, lateral-axis observability, and
  // local 3D landmark geometry. It is not a learned confidence value.
  const geometryQuality = THREE.MathUtils.clamp(
    projectedLength / palmBreadth, 0, 1,
  );
  const articulationQuality = THREE.MathUtils.clamp((bendCos + 1) * 0.5, 0, 1);
  return {
    origin: mcp.clone().lerp(pip, 0.22),
    longitudinal,
    lateral,
    normal,
    quaternion,
    handSide: reportedSide,
    view,
    confidence: geometryQuality * (0.7 + 0.3 * articulationQuality),
  };
}

/** Compatibility adapter used by the existing try-on render pipeline. */
export function estimateFingerPose(
  points: readonly HandPoint[],
  finger: FingerName,
  reportedSide: HandSide = "Unknown",
  previous?: THREE.Quaternion,
): PoseResult | null {
  const frame = estimateFingerFrame(points, finger, reportedSide, previous);
  return frame && {
    quaternion: frame.quaternion,
    handSide: frame.handSide,
    view: frame.view,
    confidence: frame.confidence,
  };
}

// Existing smoother retained verbatim: its replacement belongs to Phase 5.3.
export class PoseSmoother{
 readonly position=new THREE.Vector3();
 readonly rotation=new THREE.Quaternion();
 scale=1;
 ready=false;
 lastTime=0;
 reset(){this.ready=false;this.lastTime=0;this.scale=1;this.position.set(0,0,0);this.rotation.identity()}
 update(position:THREE.Vector3,rotation:THREE.Quaternion,scale:number,time:number):boolean{
  if(!finite(position)||!Number.isFinite(scale)||scale<=0||!Number.isFinite(rotation.w))return false;
  if(!this.ready){this.position.copy(position);this.rotation.copy(rotation);this.scale=scale;this.ready=true;this.lastTime=time;return true}
  const dt=Math.max(0.001,Math.min(.1,(time-this.lastTime)/1000));this.lastTime=time;
  const distance=this.position.distanceTo(position);
  // Reject impossible one-frame jumps rather than propagating corrupted landmarks.
  if(distance>220){this.reset();return false}
  const moving=Math.min(1,distance/38);
  const posAlpha=1-Math.exp(-dt*(7+moving*16));
  const rotAlpha=1-Math.exp(-dt*(8+moving*10));
  const scaleAlpha=1-Math.exp(-dt*6);
  this.position.lerp(position,posAlpha);
  this.rotation.slerp(rotation,rotAlpha);
  this.scale+= (scale-this.scale)*scaleAlpha;
  return true;
 }
}
