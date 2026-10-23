import { Vector3 } from "three";
import type { Point } from "./types";

/** One Euro filter in face-local millimetres: suppress detector noise without
 * delaying head pose. A faster cutoff follows deliberate lobe motion. */
export class LobeStabilizer {
  private value: Vector3 | null = null;
  private previous = new Vector3();
  private velocity = new Vector3();
  private time = 0;

  reset() {
    this.value = null;
  }

  update(point: Point, now: number): Vector3 {
    const raw = new Vector3(point.x, point.y, point.z);
    if (!this.value || now - this.time > 250 || now <= this.time) {
      this.value = raw.clone();
      this.previous.copy(raw);
      this.velocity.set(0, 0, 0);
    } else {
      const dt = (now - this.time) / 1000;
      const alpha = (cutoff: number) =>
        1 - Math.exp(-2 * Math.PI * cutoff * dt);
      const speed = raw.clone().sub(this.previous).divideScalar(dt);
      this.velocity.lerp(speed, alpha(1));
      const cutoff = 1.5 + 0.08 * this.velocity.length();
      this.value.lerp(raw, alpha(cutoff));
      this.previous.copy(raw);
    }
    this.time = now;
    return this.value.clone();
  }
}
