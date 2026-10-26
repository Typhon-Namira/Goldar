import type { BodyPoint, BodyPose } from "../face/body-pose";
export type SwipeDirection = -1 | 1;
type Sample = { x: number; y: number; time: number };
/** Torso-relative wrist swipes. No hand images, second camera, or GPU model. */
export class SwipeDetector {
  private hands: Sample[][] = [[], []];
  private cooldownUntil = 0;
  private lastTime = -Infinity;
  reset() { this.hands = [[], []]; }
  update(pose: BodyPose, mirrored: boolean): SwipeDirection | null {
    const now = pose.time;
    if (!Number.isFinite(now) || now <= this.lastTime) return null;
    if (now - this.lastTime > 450) this.reset();
    this.lastTime = now;
    if (now < this.cooldownUntil) { this.reset(); return null; }
    const visible = (p?: BodyPoint): p is BodyPoint => !!p &&
      [p.x, p.y, p.visibility].every(Number.isFinite) && (p.visibility ?? 0) >= 0.7;
    const left = pose.points[11], right = pose.points[12];
    if (!visible(left) || !visible(right)) { this.reset(); return null; }
    const width = Math.abs(left.x - right.x);
    const centre = (left.x + right.x) / 2;
    const shoulderY = (left.y + right.y) / 2;
    if (width < 0.16) { this.reset(); return null; }
    for (let hand = 0; hand < 2; hand++) {
      const wrist = pose.points[15 + hand];
      // Require a raised hand near this person's torso, not a walking arm.
      if (!visible(wrist) || wrist.y > shoulderY + width * 0.55 ||
          wrist.y < shoulderY - width * 1.15 || Math.abs(wrist.x - centre) > width * 1.2) {
        this.hands[hand] = []; continue;
      }
      // Subtract body translation, so stepping sideways is not a hand swipe.
      const sample = { x: ((wrist.x - centre) / width) * (mirrored ? -1 : 1),
        y: (wrist.y - shoulderY) / width, time: now };
      const rows = this.hands[hand];
      rows.push(sample);
      while (rows.length && now - rows[0].time > 850) rows.shift();
      if (rows.length < 3) continue;
      const first = rows[0], dx = sample.x - first.x;
      if (now - first.time < 160 || Math.abs(dx) < 0.65) continue;
      const vertical = Math.max(...rows.map((p) => p.y)) - Math.min(...rows.map((p) => p.y));
      const steps = rows.slice(1).map((p, i) => Math.abs(p.x - rows[i].x));
      // One teleported wrist landmark is not an observed hand trajectory.
      if (steps.filter((step) => step > 0.08).length < 2) continue;
      const travel = steps.reduce((sum, step) => sum + step, 0);
      if (vertical > 0.32 || Math.abs(dx) / Math.max(travel, 0.001) < 0.8) continue;
      this.cooldownUntil = now + 1200;
      this.reset();
      return dx > 0 ? 1 : -1;
    }
    return null;
  }
}
