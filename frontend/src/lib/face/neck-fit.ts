import { refineNeckProjection } from "./neck-projection";
import { Matrix4, PerspectiveCamera, Quaternion, Vector3 } from "three";
import type { BodyPoint, BodyPose } from "./body-pose";
export type NeckFit = {
  position: Vector3;
  rotation: Quaternion;
  mm: number;
  time: number;
  radius: number;
  height: number;
};
export function cameraPoint(
  point: BodyPoint,
  pose: Pick<BodyPose, "width" | "height">,
  viewport: { width: number; height: number },
  camera: PerspectiveCamera,
  depth: number,
  mirrored: boolean,
) {
  const cover = Math.max(
    viewport.width / pose.width,
    viewport.height / pose.height,
  );
  const u = mirrored ? 1 - point.x : point.x;
  const x = (((u - 0.5) * pose.width * cover) / viewport.width) * 2;
  const y = ((-(point.y - 0.5) * pose.height * cover) / viewport.height) * 2;
  const origin = camera.getWorldPosition(new Vector3());
  const direction = new Vector3(x, y, 0).unproject(camera).sub(origin);
  const forward = camera.getWorldDirection(new Vector3());
  return origin.addScaledVector(direction, depth / direction.dot(forward));
}
export function videoPoint(
  point: Vector3,
  pose: Pick<BodyPose, "width" | "height">,
  viewport: { width: number; height: number },
  camera: PerspectiveCamera,
  mirrored: boolean,
) {
  const ndc = point.clone().project(camera);
  const cover = Math.max(
    viewport.width / pose.width,
    viewport.height / pose.height,
  );
  const u = 0.5 + (ndc.x * viewport.width) / (2 * pose.width * cover);
  return {
    x: mirrored ? 1 - u : u,
    y: 0.5 - (ndc.y * viewport.height) / (2 * pose.height * cover),
  };
}
export function fitNeck(
  pose: BodyPose,
  viewport: { width: number; height: number },
  camera: PerspectiveCamera,
  depth: number,
  mirrored: boolean,
  chin?: Vector3,
): NeckFit | null {
  const valid = (p: BodyPoint | undefined): p is BodyPoint =>
    !!p &&
    [p.x, p.y, p.z, p.visibility ?? 0].every(Number.isFinite) &&
    (p.visibility ?? 0) > 0.65 &&
    p.x > -0.05 &&
    p.x < 1.05 &&
    p.y > 0 &&
    p.y < 0.98;
  const left = pose.points[11],
    right = pose.points[12];
  if (
    !valid(left) ||
    !valid(right) ||
    Math.abs(left.x - right.x) < 0.12 ||
    pose.width <= 0 ||
    pose.height <= 0
  )
    return null;
  const l = cameraPoint(left, pose, viewport, camera, depth, mirrored);
  const r = cameraPoint(right, pose, viewport, camera, depth, mirrored);
  const screenWidth = cameraPoint(
    { x: 1, y: 0.5, z: 0 },
    pose,
    viewport,
    camera,
    depth,
    false,
  ).distanceTo(
    cameraPoint({ x: 0, y: 0.5, z: 0 }, pose, viewport, camera, depth, false),
  );
  const forward = camera.getWorldDirection(new Vector3());
  const difference =
    Math.max(-0.3, Math.min(0.3, left.z - right.z)) * screenWidth;
  l.addScaledVector(forward, difference / 2);
  r.addScaledVector(forward, -difference / 2);
  const shoulderAxis = (
    mirrored ? r.clone().sub(l) : l.clone().sub(r)
  ).normalize();
  const up = new Vector3(0, 1, 0).applyQuaternion(
    camera.getWorldQuaternion(new Quaternion()),
  );
  // Shoulder height asymmetry is not gravity: a raised/cropped shoulder must
  // not roll the entire collar and swing the pendant sideways. Retain yaw.
  const x = shoulderAxis.addScaledVector(up, -shoulderAxis.dot(up)).normalize();
  const z = x.clone().cross(up).normalize();
  const width = l.distanceTo(r);
  const mm = width / 380;
  const position = l
    .clone()
    .add(r)
    .multiplyScalar(0.5)
    .addScaledVector(up, width * 0.08);
  let radius = 48;
  let height = 90;
  if (
    pose.neck &&
    [pose.neck.left, pose.neck.right, pose.neck.y].every(Number.isFinite)
  ) {
    const nl = cameraPoint(
      { x: pose.neck.left, y: pose.neck.y, z: 0 },
      pose,
      viewport,
      camera,
      depth,
      mirrored,
    );
    const nr = cameraPoint(
      { x: pose.neck.right, y: pose.neck.y, z: 0 },
      pose,
      viewport,
      camera,
      depth,
      mirrored,
    );
    const cameraRight = new Vector3(1, 0, 0).applyQuaternion(
      camera.getWorldQuaternion(new Quaternion()),
    );
    const projection = Math.max(
      0.5,
      Math.hypot(x.dot(cameraRight), 0.78 * z.dot(cameraRight)),
    );
    radius = Math.max(
      24,
      Math.min(140, nl.distanceTo(nr) / (2 * mm * projection)),
    );
    // Bind the collar to this observed row, not to a lower inferred chest row.
    const mid = nl.add(nr).multiplyScalar(0.5);
    position.copy(mid);
    height = 60;
  }
  let refineObservedRow = true;
  if (chin) {
    const origin = camera.getWorldPosition(new Vector3());
    const direction = chin.clone().sub(origin);
    const denominator = direction.dot(camera.getWorldDirection(new Vector3()));
    if (denominator > 0) {
      const chinPlane = origin.addScaledVector(direction, depth / denominator);
      const distance = chinPlane.sub(position).dot(up) / mm;
      // A silhouette can include the chest. The collar must remain within
      // the anatomical neck band below the visible chin, never on the chest.
      const bounded = Math.max(
        20,
        Math.min(Math.max(35, Math.min(65, radius * 0.9)), distance),
      );
      if (Math.abs(distance - bounded) > 2) refineObservedRow = false;
      position.addScaledVector(up, (distance - bounded) * mm);
      height = Math.max(45, Math.min(110, bounded + 4));
    }
  }
  const rotation = new Quaternion().setFromRotationMatrix(
    new Matrix4().makeBasis(x, up, z),
  );
  if (pose.neck && refineObservedRow) {
    const nl = cameraPoint(
      { x: pose.neck.left, y: pose.neck.y, z: 0 },
      pose,
      viewport,
      camera,
      depth,
      mirrored,
    );
    const nr = cameraPoint(
      { x: pose.neck.right, y: pose.neck.y, z: 0 },
      pose,
      viewport,
      camera,
      depth,
      mirrored,
    );
    radius = refineNeckProjection(
      position,
      rotation,
      mm,
      radius,
      height,
      camera,
      nl,
      nr,
    );
  }
  return {
    position,
    rotation,
    mm,
    radius,
    height,
    time: pose.time,
  };
}
