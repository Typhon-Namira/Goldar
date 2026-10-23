import {
  Group,
  MathUtils,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  Quaternion,
  SphereGeometry,
  Vector3,
} from "three";
import type { Point } from "./types";

// Small anatomical proxy, not ear segmentation. Coordinates are head-local mm.
export const PIERCING_INSET_MM = 3;
export function createLobeOccluder() {
  const geometry = new SphereGeometry(1, 32, 24);
  const positions = geometry.getAttribute("position");
  for (let i = 0; i < positions.count; i++) {
    const y = positions.getY(i);
    // Narrow, rounded bottom rather than a symmetric ball below the earlobe.
    const taper = 0.78 + (0.22 * (y + 1)) / 2;
    positions.setXYZ(
      i,
      positions.getX(i) * taper,
      y,
      positions.getZ(i) * taper,
    );
  }
  geometry.computeVertexNormals();
  const mesh = new Mesh(
    geometry,
    new MeshBasicMaterial({ colorWrite: false, depthWrite: true }),
  );
  mesh.name = "GoldarLobeDepth";
  mesh.scale.set(5, 5, 2.7);
  mesh.position.y = 5;
  mesh.renderOrder = -10;
  return mesh;
}

export class LobeSurface {
  readonly group = new Group();
  readonly mesh = createLobeOccluder();
  private time = 0;
  private initialized = false;
  private frame = new Quaternion();
  private dimensions = new Vector3(5, 5, 2.7);
  constructor() {
    this.group.add(this.mesh);
  }
  reset() {
    this.initialized = false;
    this.time = 0;
    this.frame.identity();
    this.dimensions.set(5, 5, 2.7);
  }
  update(
    lobe: Point,
    canal: Point | undefined,
    helix: Point | undefined,
    now: number,
  ) {
    const origin = new Vector3(lobe.x, lobe.y, lobe.z);
    const targetFrame = new Quaternion();
    const targetSize = new Vector3(5, 5, 2.7);
    let measured = false;
    if (canal) {
      const up = new Vector3(canal.x, canal.y, canal.z).sub(origin);
      const distance = up.length();
      if (distance >= 8 && distance <= 40 && up.y > 0) {
        measured = true;
        up.normalize();
        const normal = new Vector3(0, 0, 1);
        if (helix) {
          const upper = new Vector3(helix.x, helix.y, helix.z).sub(origin);
          const candidate = up.clone().cross(upper);
          // Near-collinear landmarks cannot define a trustworthy surface normal.
          if (
            upper.length() >= 20 &&
            upper.length() <= 85 &&
            candidate.length() > 4
          ) {
            normal.copy(candidate.normalize());
            if (normal.z < 0) normal.negate();
          }
        }
        const x = up.clone().cross(normal).normalize();
        const z = x.clone().cross(up).normalize();
        targetFrame.setFromRotationMatrix(new Matrix4().makeBasis(x, up, z));
        const height = MathUtils.clamp(distance * 0.65, 9, 15);
        targetSize.set(
          MathUtils.clamp(height * 0.43, 4, 6.5),
          height / 2,
          MathUtils.clamp(height * 0.23, 2.2, 3.5),
        );
      }
    }
    const dt = Math.max(0, Math.min(0.1, (now - this.time) / 1000));
    const alpha = this.initialized ? 1 - Math.exp(-dt / 0.3) : 1;
    // Retain a previously measured shape through partial landmark dropouts.
    if (measured || !this.initialized) {
      this.frame.slerp(targetFrame, alpha);
      this.dimensions.lerp(targetSize, alpha);
    }
    this.initialized = true;
    this.time = now;
    this.group.quaternion.copy(this.frame);
    this.mesh.scale.copy(this.dimensions);
    this.mesh.position.set(0, this.dimensions.y, 0);
    const inset = MathUtils.clamp(this.dimensions.y * 0.6, 2.5, 4);
    return new Vector3(0, inset, 0).applyQuaternion(this.frame);
  }
}
