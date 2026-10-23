import { CylinderGeometry, Mesh, MeshBasicMaterial } from "three";

/** Chin-relative neck proxy, in face-local mm. Not shoulder/body tracking.
 * XR8 face-local front is -Z; the neck centre sits behind the chin at +Z.
 * A closed elliptical frustum provides depth from front, sides and rear. */
export function createNeckOccluder() {
  const geometry = new CylinderGeometry(0.88, 1.08, 102, 64, 1, false);
  geometry.scale(48, 1, 32);
  geometry.translate(0, -59, 40);
  const mask = new Mesh(
    geometry,
    new MeshBasicMaterial({ colorWrite: false, depthWrite: true }),
  );
  mask.name = "GoldarNeckDepth";
  mask.renderOrder = -15;
  mask.frustumCulled = false;
  return mask;
}
