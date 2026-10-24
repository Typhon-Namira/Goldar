import {
  BufferAttribute,
  BufferGeometry,
  DoubleSide,
  Mesh,
  MeshBasicMaterial,
} from "three";
import { neckSurface, bodySection, type NeckSurface } from "./neck-surface";
const SIDES = 64,
  ROWS = 14;
export function createNeckOccluder(): Mesh<BufferGeometry, MeshBasicMaterial> {
  const geometry = new BufferGeometry();
  const count = (ROWS + 1) * (SIDES + 1);
  geometry.setAttribute(
    "position",
    new BufferAttribute(new Float32Array((count + 2) * 3), 3),
  );
  const indices: number[] = [];
  for (let row = 0; row < ROWS; row++)
    for (let i = 0; i < SIDES; i++) {
      const a = row * (SIDES + 1) + i,
        b = a + SIDES + 1;
      indices.push(a, b, a + 1, a + 1, b, b + 1);
    }
  for (let i = 0; i < SIDES; i++) {
    indices.push(
      count,
      i + 1,
      i,
      count + 1,
      ROWS * (SIDES + 1) + i,
      ROWS * (SIDES + 1) + i + 1,
    );
  }
  geometry.setIndex(indices);
  const mesh = new Mesh(
    geometry,
    new MeshBasicMaterial({
      colorWrite: false,
      depthWrite: true,
      side: DoubleSide,
    }),
  );
  mesh.name = "GoldarNeckDepth";
  mesh.renderOrder = -15;
  mesh.frustumCulled = false;
  updateNeckOccluder(mesh, neckSurface(48, 90));
  return mesh;
}
export function updateNeckOccluder(
  mesh: Mesh<BufferGeometry, MeshBasicMaterial>,
  surface: NeckSurface,
) {
  const key = `${surface.radius.toFixed(2)}:${surface.height.toFixed(2)}`;
  if (mesh.userData.surfaceKey === key) return;
  mesh.userData.surfaceKey = key;
  const position = mesh.geometry.getAttribute("position") as BufferAttribute;
  const levels = [
    -150,
    -125,
    -100,
    -80,
    -60,
    -40,
    -25,
    -15,
    -8,
    -4,
    0,
    surface.height * 0.25,
    surface.height * 0.5,
    surface.height * 0.75,
    surface.height,
  ];
  for (let row = 0; row <= ROWS; row++) {
    const y = levels[row],
      section = bodySection(surface, y);
    for (let i = 0; i <= SIDES; i++) {
      const a = (i / SIDES) * Math.PI * 2;
      position.setXYZ(
        row * (SIDES + 1) + i,
        section.radius * Math.cos(a),
        y,
        section.depth * Math.sin(a),
      );
    }
  }
  const count = (ROWS + 1) * (SIDES + 1);
  position.setXYZ(count, 0, -150, 0);
  position.setXYZ(count + 1, 0, surface.height, 0);
  position.needsUpdate = true;
  mesh.geometry.computeBoundingSphere();
  mesh.geometry.computeBoundingBox();
}
