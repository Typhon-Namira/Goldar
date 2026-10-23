import { CylinderGeometry, Mesh, MeshBasicMaterial } from "three";

/** Body-relative neck proxy, in anatomical mm. Not a scanned neck surface.
 * Body frame: +Y up, +Z chest/front. The base is inferred from shoulders.
 * A closed elliptical frustum provides depth from front, sides and rear. */
export function createNeckOccluder() {
  const geometry = new CylinderGeometry(0.88, 1.08, 110, 64, 1, false);
  geometry.scale(48, 1, 32);
  geometry.translate(0, 43, 0);
  const mask = new Mesh(
    geometry,
    new MeshBasicMaterial({ colorWrite: false, depthWrite: true }),
  );
  mask.name = "GoldarNeckDepth";
  mask.renderOrder = -15;
  mask.frustumCulled = false;
  return mask;
}
