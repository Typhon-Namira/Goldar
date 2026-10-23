import { Mesh, MeshBasicMaterial, SphereGeometry } from "three";

// Face tracking supplies a lobe point, not an ear surface scan. This small
// depth-only volume approximates tissue around the piercing (units: mm).
export const PIERCING_INSET_MM = 3;
export function createLobeOccluder() {
  const mesh = new Mesh(
    new SphereGeometry(1, 16, 12),
    new MeshBasicMaterial({ colorWrite: false, depthWrite: true }),
  );
  mesh.name = "GoldarLobeDepth";
  mesh.scale.set(4.5, 6, 2.5);
  mesh.position.y = 3;
  mesh.renderOrder = -10;
  mesh.visible = true;
  return mesh;
}
