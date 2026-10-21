# Goldar Precision Ring AR — target architecture

## Scope and release gates
Ring try-on is the first supported body-tracked category. Bracelet support remains experimental and necklace/earring tracking is out of scope until independently validated. Preserve existing native GLB/USDZ scene placement.

## Data plane
Camera frame -> landmark tracking adapter -> normalized camera frame and handedness -> pose/anchor solver -> position/orientation/scale temporal filters -> proxy-depth occlusion with optional segmentation -> physically-based GLB renderer -> camera compositing.

All video frames stay on-device by default. The backend supplies metadata and signed or public asset locations, not per-frame inference.

## Module contracts
- `camera`: media lifecycle, facing mode, sensor-to-display transformations, frame timestamp.
- `tracking`: swappable MediaPipe/WebAR adapters; documented coordinate convention, hand identity and missing-frame status.
- `pose`: normalized camera-space finger frame, quaternion, confidence, and uncertainty.
- `anchors`: model-to-anatomy transform; no global hardcoded offsets.
- `calibration`: explicit asset units, GLB inner radius, axis, gem normal, model version and confidence.
- `occlusion`: camera-projected finger depth proxy; segmentation is only a silhouette aid, never metric depth.
- `smoothing`: distinct adaptive position/rotation/scale filters using frame timestamps.
- `rendering`: color-managed Three.js with PBR materials, HDR environment, performance presets.
- `assets`: validated and versioned GLB, texture and optional USDZ, served by existing storage/CDN.
- `performance`: measured inference/render/total latency and adaptive resolution.
- `diagnostics`: privacy-preserving counters; never record live camera by default.
- `testing`: unit tests, deterministic recorded sequences (with consent), integration tests and real-device QA.

## Backend changes — migration-first
Introduce a per-product versioned AR asset/calibration record, asset validation state and geometry metadata through Alembic migrations. Do not replace existing Product and RingCalibrationRecord without backwards-compatible migration. Tenant owner and roles must be resolved before expanding admin access.

## Acceptance and non-claims
- Tests for mirror transforms, handedness, 180-degree hand roll, lost tracking, responsive scaling and depth ordering.
- Quantify jitter, angular deviation, occlusion error, motion-to-photon delay, memory and thermal stability.
- Distinguish visual fit from measured physical ring size.
- Target 30 FPS on named tested mid-range devices; no claim until hardware validation.
- StyleAR is an observed performance benchmark only; do not infer proprietary internals.

## Release sequence
1. Security stabilization and CI baseline.
2. Camera/tracker interfaces and deterministic geometry tests.
3. Robust anatomical anchoring and calibration metadata.
4. Occlusion accuracy and pose smoothing.
5. PBR materials, model optimization and adaptive quality.
6. End-to-end mobile comparison and rollout behind feature flag.

**Status:** architecture specification only; implementation/benchmarks not yet verified.
