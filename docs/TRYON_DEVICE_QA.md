# Goldar ring fitting: device quality gate

Status: **not signed off**. A successful Next.js build is not equivalent to mobile AR validation.

## Device matrix
Record date, device model, OS version, browser version, camera (front/rear), GLB URL, ring geometry (inner diameter, hole axis, model origin), and the Git commit under test. Use at least one Android Chrome device and one iPhone Safari device; test each independently. iOS may require separate MediaPipe/WASM compatibility assessment.

## Ring asset calibration
1. Measure the model's inside ring diameter from source geometry in millimetres. Never infer this from outer bounding-box dimensions.
2. Measure ring-hole axis and center, and document the center of the finger segment to which it should be fitted.
3. Convert imported glTF units consistently; record mm-per-model-unit.
4. Verify metal materials, mesh normals, texture compression and that GLB works in a standalone viewer.
5. Check at least three different GLB assets: plain band, solitaire with stone, and wide band. Test settings must be independent per asset.
6. Set user visual calibration while the hand is steady, and compare resulting placement in multiple orientations. Visual calibration does **not** measure the actual finger circumference.

## Live device test
For each device/model, record a 20-second screen recording for: palm facing camera, hand angled ~45 degrees, rotated ~90 degrees, bent MCP/PIP finger, rapid movement, temporary occlusion of the hand, and reacquisition. Repeat with the camera changed and with occlusion toggled.

## Acceptance criteria (targets, not measured results)
- Startup: camera stream visible within 3 seconds after permission on adequate network; no indefinite initialization.
- Tracking: jewelry stays near the proximal phalanx throughout slow motion; no model flipping or geometry disappearance.
- Stability: visual jitter <= 5 px RMS at a 720p preview when stationary (measure against screen recordings).
- Responsiveness: < 120 ms visual lag for deliberate slow motion on reference hardware (record and measure).
- Occlusion: rear band hidden where the finger should be in front, but stone and near band do not disappear, in >= 95% of manually annotated test frames.
- Failure behavior: if tracking/segmentation fails, overlay hides or uses a clearly disclosed fallback; camera remains usable.
- Performance: sustained >= 24 FPS on each reference phone, without overheating or crash during a 5-minute run.

## Important limitations
MediaPipe's selfie segmenter classifies a person, not a distinct finger. The current person mask intersected with a finger ROI, together with an approximate 3D occluder, is not true per-pixel anatomical hand depth. Real-world calibration and mask accuracy cannot be signed off from CI alone.

## Release rule
Do not merge this branch to main or label it production-ready unless CI succeeds, reference Android and iPhone tests pass, and ring asset calibration evidence is attached to the PR.
