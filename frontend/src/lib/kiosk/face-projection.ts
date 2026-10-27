import { Matrix4, Quaternion, Vector3, type PerspectiveCamera } from "three";
import type { FaceData } from "../face/types";
import type { FaceFrame } from "./auto-frame";
export function projectFace(
  face: FaceData,
  camera: PerspectiveCamera,
  viewport: { width: number; height: number },
  source: { width: number; height: number },
  mirrored: boolean,
  time: number,
): FaceFrame | null {
  const t = face.transform;
  if (
    face.vertices.length < 20 ||
    source.width <= 0 ||
    source.height <= 0 ||
    viewport.width <= 0 ||
    viewport.height <= 0
  )
    return null;
  const q = new Quaternion(
    t.rotation.x,
    t.rotation.y,
    t.rotation.z,
    t.rotation.w,
  ).normalize();
  const position = new Vector3(t.position.x, t.position.y, t.position.z);
  const matrix = new Matrix4().compose(
    position,
    q,
    new Vector3(t.scale, t.scale, t.scale),
  );
  const point = new Vector3();
  let minX = Infinity,
    minY = Infinity,
    maxX = -Infinity,
    maxY = -Infinity,
    count = 0;
  for (const v of face.vertices) {
    if (![v.x, v.y, v.z].every(Number.isFinite)) continue;
    point.set(v.x, v.y, v.z).applyMatrix4(matrix).project(camera);
    if (
      point.z < -1 ||
      point.z > 1 ||
      ![point.x, point.y].every(Number.isFinite)
    )
      continue;
    const x = (point.x + 1) / 2,
      y = (1 - point.y) / 2;
    minX = Math.min(minX, x);
    maxX = Math.max(maxX, x);
    minY = Math.min(minY, y);
    maxY = Math.max(maxY, y);
    count++;
  }
  if (count < 20 || maxX <= minX || maxY <= minY) return null;
  const cover = Math.max(
    viewport.width / source.width,
    viewport.height / source.height,
  );
  const toRawX = (x: number) => {
    const u = 0.5 + ((x - 0.5) * viewport.width) / (source.width * cover);
    return mirrored ? 1 - u : u;
  };
  const rawX = [toRawX(minX), toRawX(maxX)];
  const rawY = 0.5 + ((minY - 0.5) * viewport.height) / (source.height * cover);
  const bounds = { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
  const raw = {
    x: Math.min(...rawX),
    y: rawY,
    width: Math.abs(rawX[1] - rawX[0]),
    height: (bounds.height * viewport.height) / (source.height * cover),
  };
  const view = camera.getWorldPosition(new Vector3()).sub(position).normalize();
  return {
    id: face.id,
    bounds,
    source: raw,
    sourceWidth: raw.width * source.width,
    sourceHeight: raw.height * source.height,
    frontality: Math.abs(new Vector3(0, 0, -1).applyQuaternion(q).dot(view)),
    quality: false,
    time,
  };
}
