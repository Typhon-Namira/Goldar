import { PerspectiveCamera, Quaternion, Vector3 } from "three";
import { bodyLevels, bodySection, neckSurface } from "./neck-surface";
const SIDES = 64;
/** Fit the rendered silhouette at the measured video row, including camera
 * perspective/body yaw. World-space width alone is not a screen-space fit. */
export function refineNeckProjection(
  position: Vector3,
  rotation: Quaternion,
  mm: number,
  radius: number,
  height: number,
  camera: PerspectiveCamera,
  left: Vector3,
  right: Vector3,
) {
  const a = left.clone().project(camera),
    b = right.clone().project(camera);
  const targetMin = Math.min(a.x, b.x),
    targetMax = Math.max(a.x, b.x),
    row = (a.y + b.y) / 2;
  const cameraRight = new Vector3(1, 0, 0).applyQuaternion(
    camera.getWorldQuaternion(new Quaternion()),
  );
  const depth = -position.clone().applyMatrix4(camera.matrixWorldInverse).z;
  const point = new Vector3(),
    projected = new Float64Array(15 * SIDES * 2);
  for (let iteration = 0; iteration < 3; iteration++) {
    const surface = neckSurface(radius, height),
      levels = bodyLevels(surface);
    for (let r = 0; r < levels.length; r++) {
      const y = levels[r],
        section = bodySection(surface, y);
      for (let i = 0; i < SIDES; i++) {
        const angle = (i / SIDES) * Math.PI * 2;
        point
          .set(
            section.radius * Math.cos(angle),
            y,
            section.depth * Math.sin(angle),
          )
          .applyQuaternion(rotation)
          .multiplyScalar(mm)
          .add(position)
          .project(camera);
        const j = (r * SIDES + i) * 2;
        projected[j] = point.x;
        projected[j + 1] = point.y;
      }
    }
    let min = Infinity,
      max = -Infinity;
    const edge = (i: number, j: number) => {
      const x1 = projected[i * 2],
        y1 = projected[i * 2 + 1],
        x2 = projected[j * 2],
        y2 = projected[j * 2 + 1];
      if ((y1 <= row && y2 >= row) || (y2 <= row && y1 >= row)) {
        if (Math.abs(y2 - y1) < 1e-12) return;
        const x = x1 + ((x2 - x1) * (row - y1)) / (y2 - y1);
        min = Math.min(min, x);
        max = Math.max(max, x);
      }
    };
    for (let r = 0; r < levels.length; r++)
      for (let i = 0; i < SIDES; i++) {
        edge(r * SIDES + i, r * SIDES + ((i + 1) % SIDES));
        if (r + 1 < levels.length) edge(r * SIDES + i, (r + 1) * SIDES + i);
      }
    if (!Number.isFinite(min) || max - min < 1e-6) break;
    position.addScaledVector(
      cameraRight,
      (((targetMin + targetMax - min - max) / 2) * depth) /
        camera.projectionMatrix.elements[0],
    );
    radius = Math.max(
      24,
      Math.min(140, (radius * (targetMax - targetMin)) / (max - min)),
    );
  }
  return radius;
}
