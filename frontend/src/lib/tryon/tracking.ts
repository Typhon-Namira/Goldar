import * as T from "three";
import type { Finger, Hand, Observation } from "./protocol";
const bones: Record<Finger, [number, number]> = {
  index: [5, 6],
  middle: [9, 10],
  ring: [13, 14],
  pinky: [17, 18],
};
const vector = (v: readonly number[]) => new T.Vector3(v[0], -v[1], -v[2]);
export type SolvedHand = {
  hand: Hand;
  position: T.Vector3;
  rotation: T.Quaternion;
  diameter: number;
  capturedAt: number;
};
/** Mesh and attachment are solved from the SAME snapshot. Smoothing just the
 * ring while leaving the hand at the new pose creates visible penetration. */
export class HandSolver {
  private side: Hand["side"] | null = null;
  private last = -Infinity;
  reset() {
    this.side = null;
    this.last = -Infinity;
  }
  solve(
    o: Observation,
    finger: Finger,
    anchorFraction = 0.22,
  ): SolvedHand | null {
    if (o.capturedAt <= this.last || o.receivedAt - o.capturedAt > 1200)
      return null;
    const hand = this.side
      ? o.hands.find((h) => h.side === this.side)
      : [...o.hands].sort((a, b) => b.confidence - a.confidence)[0];
    if (!hand) return null;
    const p = hand.joints.map(vector),
      [a, b] = bones[finger];
    const axis = p[b].clone().sub(p[a]);
    if (axis.length() < 0.008 || axis.length() > 0.12) return null;
    axis.normalize();
    const across = p[5].clone().sub(p[17]);
    across.addScaledVector(axis, -across.dot(axis));
    if (across.length() < 0.008) return null;
    across.normalize();
    // Correct dorsal direction for handedness. Never flip to face the camera.
    const normal = new T.Vector3()
      .crossVectors(across, axis)
      .normalize()
      .multiplyScalar(hand.side === "Left" ? -1 : 1);
    const lateral = new T.Vector3().crossVectors(axis, normal).normalize();
    const position = p[a]
      .clone()
      .lerp(p[b], T.MathUtils.clamp(anchorFraction, 0.05, 0.65));
    // Isolate this finger's cross section using its nearest proximal axis,
    // excluding adjacent fingers and palm; no global hand-vertex percentile.
    const radii: number[] = [];
    for (const raw of hand.vertices) {
      const vertex = vector(raw),
        d = vertex.clone().sub(position),
        along = d.dot(axis);
      if (Math.abs(along) > 0.004) continue;
      const r = d.addScaledVector(axis, -along).length();
      if (r < 0.004 || r > 0.016) continue;
      let nearest: Finger = finger,
        dist = Infinity;
      for (const key of Object.keys(bones) as Finger[]) {
        const [m, n] = bones[key],
          line = new T.Line3(p[m], p[n]);
        const distance = line
          .closestPointToPoint(vertex, true, new T.Vector3())
          .distanceToSquared(vertex);
        if (distance < dist) {
          dist = distance;
          nearest = key;
        }
      }
      if (nearest === finger) radii.push(r);
    }
    radii.sort((a, b) => a - b);
    // Insufficient mesh support must not silently become a fabricated ring size.
    if (radii.length < 5) return null;
    const diameter = T.MathUtils.clamp(
      radii[Math.floor(radii.length * 0.65)] * 2,
      0.01,
      0.03,
    );
    this.last = o.capturedAt;
    this.side = hand.side;
    return {
      hand,
      position,
      rotation: new T.Quaternion().setFromRotationMatrix(
        new T.Matrix4().makeBasis(lateral, axis, normal),
      ),
      diameter,
      capturedAt: o.capturedAt,
    };
  }
}
