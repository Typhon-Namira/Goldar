/** Remote poses have a short lifetime on live video. Never extend it from the
 * receive time: the hand may have moved while the request was in flight. */
export const MAX_LIVE_POSE_AGE_MS = 350;
export function isLivePose(capturedAt: number, now: number) {
  return (
    Number.isFinite(capturedAt) &&
    now >= capturedAt &&
    now - capturedAt <= MAX_LIVE_POSE_AGE_MS
  );
}
