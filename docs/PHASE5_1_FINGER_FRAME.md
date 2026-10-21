# Phase 5.1 — Finger reference frame

## Scope
Only the finger reference frame is changed. No ring transform, model roll, temporal filter or occlusion is changed in this phase. The public `estimateFingerPose` adapter preserves compatibility with existing `HandTryOn`.

## Inputs
21 finite MediaPipe landmarks (prefer `worldLandmarks`), reported handedness, optional previous quaternion. Index/middle/ring/pinky use MCP, PIP, DIP triples (5/6/7, 9/10/11, 13/14/15, 17/18/19).

## Geometric construction
1. Form normalized MCP→PIP and PIP→DIP vectors. Blend a bounded distal contribution (8–25%) into the proximal axis so finger articulation contributes without allowing the distal bone to dominate the proximal ring band.
2. Across-hand vector runs from pinky MCP to index MCP. Orthogonally project it away from the longitudinal vector, rejecting near-degenerate projections.
3. Compute normal = lateral × longitudinal, then re-orthogonalize lateral = longitudinal × normal. The columns [lateral, longitudinal, normal] form a right-handed proper rotation matrix used for the quaternion.
4. Reject missing/nonfinite/degenerate landmarks, zero-length phalanges, or nearly parallel lateral/longitudinal axes rather than manufacturing an unstable orientation.
5. Optional previous quaternion controls its sign representation (not the geometry).

## Frame semantics
- Coordinates are relative, hand-local landmark units, NOT camera metric coordinates.
- Frame origin is located 22% along MCP→PIP in world-landmark coordinates. This is not a pixel anchor.
- `confidence` is *geometric frame quality*, not the confidence supplied by MediaPipe.
- `view` is a heuristic based on palm-plane direction and MediaPipe handedness, not a validated dorsal-side indicator. It must not be used as a hard gemstone-orientation lock in this phase.

## Acceptance tests
- Straight fingers: axis follows proximal phalanx; basis columns are unit length, orthogonal and right handed (positive determinant).
- Bend at PIP: distal segment contributes only bounded weight; no sudden 180° flip from bend alone.
- Hand translated/scaled in landmark coordinates: frame rotation remains unchanged.
- All four fingers: indices and anatomical axes map to their MCP/PIP/DIP.
- Nonfinite/missing/collinear landmarks: return null rather than NaN pose.
- Quaternion sign continuity with supplied previous quaternion.
- Real-device tests must cover left/right hands, palm/back/edge views, open/flexed fingers, and front-camera mirror. These tests are NOT yet certified by CI.

## Subsequent work
- Phase 5.2: model-axis and gemstone direction calibration, true ring centerline transform and finger-width-based scale.
- Phase 5.3: One Euro position and scale, quaternion smoothing, drop-out hold.
- Phase 5.4: depth-only, aligned elliptical finger occluder.

Do not claim production-grade physical ring attachment from Phase 5.1 alone. MediaPipe world-landmark coordinates alone cannot recover absolute camera depth or true finger surface radius.
