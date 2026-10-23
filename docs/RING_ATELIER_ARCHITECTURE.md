# Ring Atelier architecture

The active ring fitting path is `ar/[id] → RingAtelier → RingSession`. Legacy
MediaPipe/hybrid/spatial engines, the WebAR runner and their inactive deformation helpers have
been removed. Historical experiments and math tests do not run in this path.

## Data flow

1. `session.ts` owns camera permission, a single in-flight request, capture
   timestamps, cancellation, timeout, teardown and retry. No camera starts on
   page load. The request uploads an uncropped 480px-wide JPEG to
   `NEXT_PUBLIC_WILOR_API_URL/v1/hand-pose` with `include_mesh=true`.
2. `protocol.ts` validates topology, finite coordinates, depth, confidence,
   units and intrinsics. It lifts 21 normalized image landmarks to metric
   camera space. Optional world landmarks plus translation, image dimensions,
   focal length, MANO metadata and LBS diagnostics are consistency checks.
   Pose and shape are already applied to native vertices; never apply them twice.
   Licensed canonical MANO buffers are unnecessary and are not requested.
3. `tracking.ts` locks hand identity, solves the selected proximal finger frame,
   corrects handedness, estimates the local mesh cross section excluding nearby
   fingers, and applies the product's anchor fraction. Frames older than 1200ms
   or received out of capture order are rejected. Reacquisition clears identity.
4. `renderer.ts` uses the same camera for depth-only hand geometry and jewelry,
   product GLB calibration and fit multiplier, original PBR materials, PMREM
   studio reflections, ACES tone mapping and bounded device pixel ratio.
   `camera.ts` applies exactly the same cover crop to image and projection.
5. `RingAtelier.tsx` owns presentation, finger selection, fit adjustment,
   camera switch, stop, accessible status and optional image capture.

## Temporal contract and current limits

The browser displays its native camera video directly, independent of inference,
model loading and WebGL. A transparent WebGL canvas contains only the ring and
depth occluder. Server responses never supply or replace the preview image.
This prevents slow or stalled inference from freezing the camera or hiding hands.

Poses older than 350ms from **capture time** are not rendered on the live video.
An existing overlay expires independently while the next request is pending.
Camera playback continues during timeouts, invalid payloads and failed requests.
The renderer redraws on geometry/visibility/viewport changes rather than uploading
camera images to a GPU texture at display refresh rate. Export composites the
current video and overlay with identical cover crop and optional mirroring.

Remote inference still cannot provide unseen current hand geometry. A fresh
remote pose can lag the live hand by up to the age limit. For continuous
StyleAR-class motion, a measured low-latency on-device pose estimator or a
separately validated local tracking layer is still needed. Do not label this
implementation equivalent to StyleAR or calibrated ring sizing without
physical-device evidence.

All focal lengths from the repository WiLoR model are estimates, not measured
browser camera calibration. Cross-section diameter is a visual fit estimate.
Physical sizing requires a known-size reference and validated camera intrinsics.
Jewelry appearance depends on the authored model's geometry and materials.

## Backend contract and deployment

The catalog API remains unchanged. `wilor_service/app.py` now exports native
`pred_vertices` from the same inference as its joints, applies the existing
mirror-X then camera-translation transform, corrects left-hand winding and
includes mesh intrinsics and explicit metre units. This uses upstream
`model.mano.faces`; validate this against the actual deployed model version.
It exports posed surfaces, not the licensed MANO template or skinning weights.

The repository service is separate from any service already deployed on EC2.
No remote service was inspected, changed or restarted. Deploy the sidecar with
its model assets in its existing inference environment, then configure the
frontend's `NEXT_PUBLIC_WILOR_API_URL` before building. Use HTTPS and the
sidecar's frontend origin allowlist. Without an endpoint the interface clearly
disables fitting and does not request camera access. Server inference and
model weights cannot be validated in the lightweight catalog environment.

## Validation

Run `npm run test:unit -- --maxWorkers=2 --minWorkers=1` and `npm run build`
from `frontend`. Tests cover invalid payloads, capture ordering, latency,
hand identity, handedness, cross-section fitting and portrait/off-centre
projection. Existing geometry tests are retained.

Current validation: 30 unit tests and the production build pass. Chromium with a synthetic camera,
synthetic GLTF ring and intercepted inference responses verifies camera start,
mesh presentation, finger switching, photo capture, camera release and restart.
A pixel assertion verifies the captured camera image survives compositing and
PNG export. Slow-response regression tests verify camera independence and
expiration of old overlays. These are lifecycle/rendering tests, not real-hand
accuracy tests.

Before production: test real left/right hands and front/rear cameras on iOS
Safari and Android Chrome, portrait/landscape crops, side views and palm turns,
rapid movement, temporary hand loss, poor light, denied permission, interrupted
network, stop/restart during model loading, GLB texture export/CORS, and thermal
performance. Measure end-to-end refresh rate, reprojection error and occlusion;
a successful build or mocked browser session is not device accuracy evidence.
