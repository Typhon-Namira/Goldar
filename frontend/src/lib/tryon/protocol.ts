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
    const mesh = record(h.mesh) && h.mesh.available === true ? h.mesh : null;
    // Older inference deployments return valid joints and focal length without
    // a MANO surface. Those can still drive a visual preview, without occlusion.
    const c =
      mesh && record(mesh.camera)
        ? mesh.camera
        : {
            fx: h.focalLengthPx,
            fy: h.focalLengthPx,
            cx: num(raw.imageWidth) ? raw.imageWidth / 2 : undefined,
            cy: num(raw.imageHeight) ? raw.imageHeight / 2 : undefined,
            width: raw.imageWidth,
            height: raw.imageHeight,
            source: "estimated",
          };
    if (
      !["fx", "fy", "cx", "cy", "width", "height"].every((k) => num(c[k])) ||
      (c.fx as number) <= 0 ||
      (c.fy as number) <= 0 ||
      (c.width as number) <= 0 ||
      (c.height as number) <= 0
    )
      continue;
    let vertices: Vec3[] = [],
      faces: Vec3[] = [];
    if (mesh) {
      if (
        (mesh.units !== undefined && mesh.units !== "meters") ||
        (mesh.coordinateSystem !== undefined &&
          mesh.coordinateSystem !== "opencv_camera")
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
      vertices = mesh.vertices;
      faces = mesh.faces;
    }
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
    // Native posed geometry already contains pose and shape. Optional MANO
    // reconstruction diagnostics do not veto that independent native surface.
    const confidence = num(h.confidence)
      ? Math.max(0, Math.min(1, h.confidence))
      : 0.5;
    if (confidence < 0.3) continue;
    hands.push({
      side: h.side,
      confidence,
      joints,
      vertices,
      faces,
      camera,
      mano: record(h.mano) ? h.mano : null,
      diagnostics: record(h.lbsDiagnostics) ? h.lbsDiagnostics : null,
    });
  }
  if (raw.hands.length && !hands.length)
    throw Error(
      "The fitting service returned a hand without valid joints or camera geometry",
    );
  return {
    hands,
    inferenceMs: num(raw.inferenceMs) ? raw.inferenceMs : 0,
    capturedAt,
    receivedAt,
  };
}
