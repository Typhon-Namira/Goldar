import type { BodyPose } from './body-pose';
/** Bootstrap only from an observed XR8 chin. A mouth-based chin extrapolation
 * can put the entire collar on the chest and must never replace a measured fit. */
export function estimatedNeck(pose: BodyPose, chinY?: number): BodyPose['neck'] {
  const a = pose.points[11], b = pose.points[12];
  const valid = (p: typeof a) => p && [p.x, p.y, p.visibility].every(Number.isFinite) && (p.visibility ?? 0) > .65;
  if (!valid(a) || !valid(b) || !Number.isFinite(chinY) || pose.width <= 0 || pose.height <= 0) return null;
  const width = Math.abs(a.x - b.x), aspect = pose.width / pose.height;
  if (width < .12) return null;
  // About 27mm below the observed chin at the 380mm shoulder scale. The old
  // mouth extrapolation + margin could place it almost 100mm below the mouth.
  const y = chinY! + width * .07 * aspect;
  if (y > (a.y + b.y) / 2 + width * .02 * aspect || y >= .97) return null;
  const centre = (a.x + b.x) / 2, span = width * .33;
  return { left: centre - span / 2, right: centre + span / 2, y };
}
