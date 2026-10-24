import type { BodyPose } from "./body-pose";
/** Keep this person's neck-to-shoulder proportions through brief silhouette
 * occlusion; move the cached outline with the current body, never the head. */
export class NeckProfileMemory {
  private profile: { left: number; right: number; y: number } | null = null;
  private lastSeen = -Infinity;
  apply(pose: BodyPose): BodyPose {
    const left = pose.points[11],
      right = pose.points[12];
    if (
      !left ||
      !right ||
      (left.visibility ?? 0) < 0.65 ||
      (right.visibility ?? 0) < 0.65
    )
      return pose;
    if (pose.time - this.lastSeen > 1200) this.profile = null;
    this.lastSeen = pose.time;
    const width = Math.abs(left.x - right.x),
      x = (left.x + right.x) / 2,
      y = (left.y + right.y) / 2;
    if (width < 0.12) return pose;
    if (pose.neck) {
      this.profile = {
        left: (pose.neck.left - x) / width,
        right: (pose.neck.right - x) / width,
        y: (pose.neck.y - y) / width,
      };
      return pose;
    }
    return this.profile
      ? {
          ...pose,
          neck: {
            left: x + this.profile.left * width,
            right: x + this.profile.right * width,
            y: y + this.profile.y * width,
          },
        }
      : pose;
  }
}
