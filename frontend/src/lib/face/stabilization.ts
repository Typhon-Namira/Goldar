import { Vector3 } from "three";
import type { Point } from "./types";

/** An ear is almost rigid in head-local space. Reject isolated detections,
 * then stabilize its anatomical position; head pose remains live. Units: mm. */
export class LobeStabilizer {
  private value: Vector3 | null = null;
  private samples: Vector3[] = [];
  private time = 0;
  private lastValid = -Infinity;

  reset() {
    this.value = null;
    this.samples = [];
    this.lastValid = -Infinity;
  }

  /** Bridge only very brief detector gaps using the current head transform. */
  hold(now: number): Vector3 | undefined {
    return now - this.lastValid <= 90 ? this.value?.clone() : undefined;
  }

  update(point: Point, now: number): Vector3 {
    const raw = new Vector3(point.x, point.y, point.z);
    if (!this.value || now - this.time > 350 || now < this.time) {
      this.value = raw.clone();
      this.samples = [];
    }
    this.samples.push(raw);
    if (this.samples.length > 5) this.samples.shift();
    const median = new Vector3(
      ...((["x", "y", "z"] as const).map((axis) => {
        const sorted = this.samples.map((p) => p[axis]).sort((a, b) => a - b);
        const middle = Math.floor(sorted.length / 2);
        return sorted.length % 2
          ? sorted[middle]
          : (sorted[middle - 1] + sorted[middle]) / 2;
      }) as [number, number, number]),
    );
    const distance = median.distanceTo(this.value);
    // Deadband removes tiny stationary motion; larger anatomical corrections
    // converge faster. Five-frame median rejects up to two isolated spikes.
    const dt = Math.max(0, Math.min(0.1, (now - this.time) / 1000));
    const cutoff = 0.65 + Math.min(5, Math.max(0, distance - 1) * 0.45);
    const alpha = 1 - Math.exp(-2 * Math.PI * cutoff * dt);
    if (distance > 0.35) {
      this.value.lerp(median, alpha * (1 - 0.35 / distance));
    }
    this.time = now;
    this.lastValid = now;
    return this.value.clone();
  }
}
