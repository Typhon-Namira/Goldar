import { parseManoSnapshot } from "../manoSnapshot";
/** Network boundary. Nothing unvalidated reaches the renderer. All geometry is
 * OpenCV camera-space metres; mirroring belongs only to presentation. */
export type Vec3 = [number, number, number];
export type Intrinsics = {
  fx: number;
  fy: number;
  cx: number;
  cy: number;
  width: number;
  height: number;
  source?: string;
};
export type Finger = "index" | "middle" | "ring" | "pinky";
export type Hand = {
  side: "Left" | "Right";
  confidence: number;
  joints: Vec3[];
  vertices: Vec3[];
  faces: Vec3[];
  camera: Intrinsics;
  mano: Record<string, unknown> | null;
  diagnostics: Record<string, unknown> | null;
};
export type Observation = {
  hands: Hand[];
  inferenceMs: number;
  capturedAt: number;
  receivedAt: number;
};
const record = (x: unknown): x is Record<string, unknown> =>
  !!x && typeof x === "object" && !Array.isArray(x);
const num = (x: unknown): x is number =>
  typeof x === "number" && Number.isFinite(x);
const vec = (x: unknown): x is Vec3 =>
  Array.isArray(x) && x.length === 3 && x.every(num);
export function decodeObservation(
  raw: unknown,
  capturedAt: number,
  receivedAt: number,
): Observation {
  if (
    !record(raw) ||
    !Array.isArray(raw.hands) ||
    raw.hands.length > 4 ||
    (raw.schemaVersion !== undefined && raw.schemaVersion !== 1)
  )
    throw Error("Invalid hand response");
  const hands: Hand[] = [];
  for (const h of raw.hands) {
    if (!record(h) || (h.side !== "Left" && h.side !== "Right")) continue;
    const mesh = h.mesh;
    if (!record(mesh) || mesh.available !== true || !record(mesh.camera))
      continue;
    if (
      (mesh.units !== undefined && mesh.units !== "meters") ||
      (mesh.coordinateSystem !== undefined &&
        mesh.coordinateSystem !== "opencv_camera")
    )
      continue;
    const c = mesh.camera;
    if (
      !["fx", "fy", "cx", "cy", "width", "height"].every((k) => num(c[k])) ||
      (c.fx as number) <= 0 ||
      (c.fy as number) <= 0 ||
      (c.width as number) <= 0 ||
      (c.height as number) <= 0
    )
      continue;
    if (
      !Array.isArray(mesh.vertices) ||
      mesh.vertices.length !== 778 ||
      !mesh.vertices.every((v) => vec(v) && v[2] > 0.001)
    )
      continue;
    if (
      !Array.isArray(mesh.faces) ||
      mesh.faces.length < 100 ||
      mesh.faces.length > 4000 ||
      !mesh.faces.every(
        (f) =>
          vec(f) && f.every((i) => Number.isInteger(i) && i >= 0 && i < 778),
      )
    )
      continue;
    if (!Array.isArray(h.landmarks) || h.landmarks.length !== 21) continue;
    const camera = c as Intrinsics;
    const joints: Vec3[] = [];
    for (const p of h.landmarks) {
      if (!record(p) || !num(p.x) || !num(p.y) || !num(p.z) || p.z <= 0.001)
        break;
      joints.push([
        ((p.x * camera.width - camera.cx) * p.z) / camera.fx,
        ((p.y * camera.height - camera.cy) * p.z) / camera.fy,
        p.z,
      ]);
    }
    if (joints.length !== 21) continue;
    // Redundant server fields are consistency checks, never a second transform.
    if (num(h.focalLengthPx) && Math.abs(h.focalLengthPx - camera.fx) > 1)
      continue;
    if (num(raw.imageWidth) && raw.imageWidth !== camera.width) continue;
    if (num(raw.imageHeight) && raw.imageHeight !== camera.height) continue;
    if (
      Array.isArray(h.worldLandmarks) &&
      h.worldLandmarks.length === 21 &&
      vec(h.cameraTranslation)
    ) {
      const t = h.cameraTranslation;
      if (
        h.worldLandmarks.some(
          (p, i) =>
            !record(p) ||
            !num(p.x) ||
            !num(p.y) ||
            !num(p.z) ||
            Math.hypot(
              p.x + t[0] - joints[i][0],
              p.y + t[1] - joints[i][1],
              p.z + t[2] - joints[i][2],
            ) > 0.003,
        )
      )
        continue;
    }
    // Native posed geometry already incorporates MANO shape/pose. Applying those
    // rotations a second time would deform it twice; validate metadata instead.
    if (
      record(h.mano) &&
      h.mano.available === true &&
      !parseManoSnapshot(h.mano)
    )
      continue;
    if (
      record(h.lbsDiagnostics) &&
      h.lbsDiagnostics.available === true &&
      (h.lbsDiagnostics.passesOneMillimeterNative === false ||
        h.lbsDiagnostics.passesOneMillimeterWilor === false)
    )
      continue;
    const confidence = num(h.confidence)
      ? Math.max(0, Math.min(1, h.confidence))
      : 0.5;
    if (confidence < 0.3) continue;
    hands.push({
      side: h.side,
      confidence,
      joints,
      vertices: mesh.vertices,
      faces: mesh.faces,
      camera,
      mano: record(h.mano) ? h.mano : null,
      diagnostics: record(h.lbsDiagnostics) ? h.lbsDiagnostics : null,
    });
  }
  if (raw.hands.length && !hands.length)
    throw Error(
      "The inference service must return a valid camera-space hand mesh",
    );
  return {
    hands,
    inferenceMs: num(raw.inferenceMs) ? raw.inferenceMs : 0,
    capturedAt,
    receivedAt,
  };
}
