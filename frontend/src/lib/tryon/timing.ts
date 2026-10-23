/** Inference freshness and display lifetime are different clocks. A CPU server
 * can take seconds to return an otherwise valid hand observation. */
export const MAX_REMOTE_OBSERVATION_AGE_MS = 8000;
export const POSE_HOLD_MS = 1800;
export const MAX_LIVE_POSE_AGE_MS = 350;
export function isLivePose(capturedAt: number, now: number) {
  return (
    Number.isFinite(capturedAt) &&
    now >= capturedAt &&
    now - capturedAt <= MAX_LIVE_POSE_AGE_MS
  );
}
export function isUsableObservation(capturedAt: number, receivedAt: number) {
  return (
    Number.isFinite(capturedAt) &&
    Number.isFinite(receivedAt) &&
    receivedAt >= capturedAt &&
    receivedAt - capturedAt <= MAX_REMOTE_OBSERVATION_AGE_MS
  );
}
export function canPresentPose(
  capturedAt: number,
  receivedAt: number,
  now: number,
) {
  return (
    isUsableObservation(capturedAt, receivedAt) &&
    now >= receivedAt &&
    now - receivedAt <= POSE_HOLD_MS
  );
}
