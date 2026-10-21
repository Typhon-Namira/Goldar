# Goldar Phase 1 hand pose verification

## Scope
This branch replaces the inline orientation and time smoothing with a reusable pose estimator and filter. It does **not** solve ring geometry, true finger-surface occlusion, or metric sizing.

## Acceptance procedure (reference Android Chrome and iPhone Safari)
1. Use a rear camera with one hand in frame. Verify status reports detected Left/Right with each hand; repeat using selfie camera. Observe if the browser's mirrored frame changes the interpretation.
2. Show palm and back of both hands, then rotate through edge-on views. Record whether palm/back is classified correctly. The classifier is a signed normal heuristic, not an independently trained palm/back model.
3. Hold the hand still for 20 seconds; use screen recording to measure the ring anchor jitter at the fingertip base. Note sudden flips.
4. Move hand left/right slowly, then quickly; verify tracking recovers after dropping a frame and does not freeze forever.
5. Remove hand for >= 1 second then show it again; ring should disappear and reinitialize without a stale offset.
6. Compare index, middle, ring and pinky selections while filming from multiple angles. The classification is diagnostic; accuracy is not implied by the displayed confidence.
7. Switch cameras and repeat. Test several light levels and hand sizes.

## Sign-off
- CI build passes.
- Side labels and view labels match actual hand on both cameras.
- No persistent overlay when the hand leaves the frame.
- Rotation remains stable through moderate movement.
- Attach screenshots/videos and browser/device version to PR before merging.

## Dependencies
Hand pose module: src/lib/handPose.ts
UI integration: src/components/HandTryOn.tsx

Do not label Phase 1 device-validated until the above tests pass.
