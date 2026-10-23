import * as T from "three";
import type { FaceCalibrationConfig } from "../api";
/** Anchor is normalized in the authored model bounds. Never rely on a GLB's
 * arbitrary origin; each earring asset must contain ONE earring. */
export function prepareJewelry(model: T.Object3D, c: FaceCalibrationConfig) {
  model.updateMatrixWorld(true);
  const box = new T.Box3().setFromObject(model),
    size = box.getSize(new T.Vector3());
  if (!Number.isFinite(size.y) || size.y < 1e-8)
    throw Error("The model has no usable height");
  const anchor = new T.Vector3(
    c.anchor[0] * size.x,
    c.anchor[1] * size.y,
    c.anchor[2] * size.z,
  ).add(box.min);
  const normalized = new T.Group();
  normalized.add(model);
  model.position.sub(anchor);
  normalized.scale.setScalar(c.height_mm / 160 / size.y);
  const attachment = new T.Group();
  attachment.rotation.set(
    ...(c.rotation_deg.map(T.MathUtils.degToRad) as [number, number, number]),
  );
  attachment.add(normalized);
  return attachment;
}
export function disposeModel(root: T.Object3D) {
  const materials = new Set<T.Material>(),
    textures = new Set<T.Texture>(),
    geometries = new Set<T.BufferGeometry>();
  root.traverse((o) => {
    if (o instanceof T.Mesh) {
      geometries.add(o.geometry);
      for (const m of Array.isArray(o.material) ? o.material : [o.material])
        materials.add(m);
    }
  });
  materials.forEach((m) => {
    Object.values(m).forEach((v) => {
      if (v instanceof T.Texture) textures.add(v);
    });
    m.dispose();
  });
  textures.forEach((t) => t.dispose());
  geometries.forEach((g) => g.dispose());
}
