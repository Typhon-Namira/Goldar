import * as THREE from "three";

/**
 * Depth-only proximal phalanx surrogate. The band is aligned to canonical +Y;
 * this cylinder must be a sibling of the calibrated ring under the same anchor.
 *
 * It deliberately under-fills the calibrated ring hole to avoid covering the
 * near side of the band. An anatomical silhouette/depth map is not available.
 */
export function createFingerOccluder(innerDiameter: number): THREE.Mesh {
  if (!Number.isFinite(innerDiameter) || innerDiameter <= 0) {
    throw new Error("Invalid ring inner diameter for finger occlusion");
  }
  const radius = innerDiameter * 0.43;
  const geometry = new THREE.CylinderGeometry(
    radius * 0.94, radius, innerDiameter * 2.6, 64, 1, false,
  );
  const material = new THREE.MeshBasicMaterial({
    colorWrite: false,
    depthWrite: true,
    depthTest: true,
    side: THREE.DoubleSide,
    polygonOffset: true,
    polygonOffsetFactor: 1,
    polygonOffsetUnits: 1,
  });
  const occluder = new THREE.Mesh(geometry, material);
  occluder.name = "GoldarDepthOnlyFinger";
  // Depth-only geometry must render before the ring and camera-space jewelry.\n  occluder.renderOrder = -20;
  // In canonical frame +Z means outside/dorsal. Slightly behind ring center
  // keeps visible jewelry in front, while masking the ring's far-side band.
  occluder.position.z = 0;
  return occluder;
}

/** Update local cross-section to be elliptical; stay strictly within band hole. */
export function resizeFingerOccluder(
  occluder: THREE.Mesh,
  fingerWidthPx: number,
  ringScale: number,
  innerDiameter: number,
): void {
  if (![fingerWidthPx,ringScale,innerDiameter].every(Number.isFinite) ||
      ringScale <= 0 || fingerWidthPx <= 0 || innerDiameter <= 0) {
    occluder.visible = false;
    return;
  }
  const apparentDiameter = fingerWidthPx / ringScale;
  // The ring hole imposes a hard cap on the occluder cross-section.
  const ratio = THREE.MathUtils.clamp(apparentDiameter / innerDiameter, 0.62, 1);
  occluder.scale.set(ratio, 1, ratio * 0.92);
}
