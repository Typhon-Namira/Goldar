# Goldar Spatial Engine v2

## Main rendering path
- Camera frame is captured with its original aspect ratio.
- EC2 WiLoR supplies a complete posed 778-vertex mesh, 21 camera-depth joints, handedness and estimated camera intrinsics.
- `GoldarSpatialEngine` is the only source of 3D geometry and the ring's proximal-finger attachment.
- Each accepted WiLoR observation updates all 778 mesh vertices directly. No MediaPipe or inverse-distance skin warp runs in this path.
- A time-ordered rigid attachment filter reduces snapshot jitter without changing mesh geometry.
- The Three.js scene renders the ring and a depth-only hand occluder with the same projection.

## Not yet solved
- WiLoR service remains external to GitHub and is not deployed by this branch.
- Monocular intrinsics are estimated, not device-calibrated.
- Between WiLoR responses, the pose is held, not a guaranteed 60-fps prediction.
- Browser distribution of MANO model weights is not required in this architecture.
- No live-device acceptance tests or successful Vercel build are recorded for this branch.

## Production gate
Before merging: run `npm run build` from `frontend`, test rear/front cameras, verify side/mirror mapping, and ensure ring/occluder remain visible at first acquisition and after reacquisition. Keep production rollback available.
