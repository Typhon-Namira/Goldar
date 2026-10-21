# Anatomical anchoring module (Phase 3 foundation)

## What changed
- `frontend/src/lib/anchors/ringAnchor.ts` is the isolated, deterministic, side-effect-free 3D camera-space ring anchor estimator. It has no camera lifecycle, React hooks, network, or renderer effects.
- `frontend/src/lib/cameraRingGeometry.ts` preserves the previous `solveCameraRingPose` public API as a re-export, so `HandTryOn.tsx` continues using the same interface.
- `frontend/src/lib/anchors/ringAnchor.test.ts` introduces synthetic unit tests for normalized orientation, translation invariance, explicit scaling, image-plane rotation, and rejection of invalid input.
- `frontend/package.json` adds `npm run test:unit` via Vitest.

## Input contract
Normalized hand landmarks, a shared normalized-to-screen projection, viewport CSS pixel dimensions, intended finger, asset inner diameter in GLB units, anchor fraction, visual fit and width calibration, reported handedness, and whether the camera is front or rear.

## Output contract
Camera-space center and orientation quaternion, visual scale, estimated apparent finger width, dorsal direction, proximal finger axis, and heuristic geometric quality.

## Important limitations
- All results are visual alignment estimates, **not metric ring-sizing measurements**.
- MediaPipe's handedness convention depends on camera mirroring. Current adapter convention is inherited from the existing implementation and must be verified on both camera modes and physical devices.
- Depth estimation and segmentation/occlusion remain approximate.
- Existing pose smoothing is outside this module and remains in `handPose.ts`.
- This phase is an isolation/refactor and numerical-input-hardening step, **not a newly validated high-accuracy solver**.

## Verification status
- GitHub write and read-back: pending final confirmation.
- `npm install`, `npm run test:unit`, `npx tsc --noEmit`, `npm run lint`, `npm run build`: **NOT RUN**, because source and package dependencies were not made available to an executable environment. There is no claim of test success.
- Add/update the package lockfile using `npm install --package-lock-only` in the actual frontend workspace before merging.

## Suggested execution
```bash
cd frontend
npm install
npm run test:unit
npx tsc --noEmit
npm run lint
npm run build
```

## Next engineering step
Create replay tests with consented labeled hand motion frames and verify joint indexing, mirror convention, dorsal/volar roll, edge-on hand behavior, partial occlusion, device-specific rotations, and motion lag; then revise pose solver based on measured geometric error.

## Rollout
Do not merge or deploy to production without test results and manual mobile-device verification.
