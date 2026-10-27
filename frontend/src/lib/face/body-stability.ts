import { MathUtils } from "three";
import type { NeckFit } from "./neck-fit";

/** Smooth body detections on every render frame, with anatomical deadbands. */
export class StableNeckFrame {
  private value: NeckFit | null = null;
  private time = 0;
  update(target: NeckFit, now: number, reset = false): NeckFit {
    if (!this.value || reset || now - this.time > 500) {
      this.value = {
        ...target,
        position: target.position.clone(),
        rotation: target.rotation.clone(),
      };
    } else {
      const dt = Math.max(0, Math.min(0.1, (now - this.time) / 1000));
      const alpha = 1 - Math.exp(-dt / 0.065);
      const distance =
        this.value.position.distanceTo(target.position) / target.mm;
      if (distance > 0.7)
        this.value.position.lerp(target.position, alpha * (1 - 0.7 / distance));
      const angle = this.value.rotation.angleTo(target.rotation);
      if (angle > 0.012)
        this.value.rotation.slerp(target.rotation, alpha * (1 - 0.012 / angle));
      // Stabilize projected contact dimensions jointly with scale. Filtering
      // radius and mm independently makes the skin boundary breathe when the
      // shoulder estimator changes scale even though the measured neck is fixed.
      const radius = this.value.radius * this.value.mm;
      const height = this.value.height * this.value.mm;
      const scaleChange = Math.abs(this.value.mm - target.mm) / target.mm;
      if (scaleChange > 0.004)
        this.value.mm = MathUtils.lerp(
          this.value.mm,
          target.mm,
          1 - Math.exp(-dt / (scaleChange > 0.12 ? 0.065 : 0.22)),
        );
      const adapt = (a: number, b: number, threshold: number) =>
        Math.abs(a - b) > threshold
          ? MathUtils.lerp(a, b, 1 - Math.exp(-dt / 0.2))
          : a;
      this.value.radius =
        adapt(radius, target.radius * target.mm, 0.5 * target.mm) /
        this.value.mm;
      this.value.height =
        adapt(height, target.height * target.mm, target.mm) / this.value.mm;
      this.value.time = target.time;
    }
    this.time = now;
    return this.value;
  }
}
