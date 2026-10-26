import type { BodyPose } from './body-pose';
type Profile = { left: number; right: number; y: number };
/** Keep a measured anatomical fit while the same body is present. Silhouette
 * dropouts must not switch a good collar to a different guessed chest anchor. */
export class NeckProfileMemory {
  private profile: Profile | null = null;
  private observations: Profile[] = [];
  private lastSeen = -Infinity;
  private dimensions = '';
  private clear() { this.profile = null; this.observations = []; }
  apply(pose: BodyPose): BodyPose {
    const dimensions = `${pose.width}x${pose.height}`;
    if (dimensions !== this.dimensions) { this.clear(); this.dimensions = dimensions; }
    const left = pose.points[11], right = pose.points[12];
    if (!left || !right || (left.visibility ?? 0) < .65 || (right.visibility ?? 0) < .65) return pose;
    if (pose.time < this.lastSeen || pose.time - this.lastSeen > 1200) this.clear();
    this.lastSeen = pose.time;
    const width = Math.abs(left.x - right.x), x = (left.x + right.x) / 2, y = (left.y + right.y) / 2;
    if (width < .12) return pose;
    if (pose.neck) {
      this.observations.push({left:(pose.neck.left-x)/width,right:(pose.neck.right-x)/width,y:(pose.neck.y-y)/width});
      if (this.observations.length > 3) this.observations.shift();
      // A hand crossing the neck can produce one plausible but wrong mask.
      // Reject that single frame rather than moving the collar onto the chest.
      const median = (key: keyof Profile) => {
        if (this.observations.length < 3) return this.observations[0][key];
        const rows = this.observations.map(p => p[key]).sort((a,b) => a-b);
        return rows[Math.floor((rows.length-1)/2)];
      };
      this.profile = {left:median('left'),right:median('right'),y:median('y')};
    }
    return this.profile ? {...pose,neck:{left:x+this.profile.left*width,right:x+this.profile.right*width,y:y+this.profile.y*width}} : pose;
  }
}
