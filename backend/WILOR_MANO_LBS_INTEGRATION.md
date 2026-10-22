# WiLoR MANO LBS backend integration

This repository's `backend/app/main.py` is the **catalog API**, not the
live WiLoR inference service on EC2. Do not import this exporter there.

`backend/wilor_mano_lbs_export.py` is an integration module for the
separately deployed WiLoR process. It does not run or modify that process.

## Required backend work

1. On the WiLoR server, inspect the actual MANO layer implementation and
   its handedness, coordinate convention, joint order and units.
2. Obtain the matching `v_template`, `shapedirs`, `posedirs`,
   `J_regressor`, `kintree_table` and `lbs_weights` tensors. Do not
   fabricate these from the returned 778 posed vertices.
3. Convert WiLoR pose matrices to **16 local** MANO rotations, including
   the root. WiLoR's current `handPose` has only 15 rotations, while its
   `globalOrient` is separate.
4. Call `export_mano_lbs(model, betas, rotations)` and verify the resulting
   posed vertices numerically against the native MANO forward pass.
5. Resolve and return the **explicit model-to-camera transform** and
   intrinsic camera calibration. WiLoR cameraTranslation is not
   automatically a MANO model-space translation.
6. Add an opt-in response field (for example `manoLbs`) on
   `POST /v1/hand-pose`; retain the old response for existing clients.
7. Do not distribute MANO model assets or canonical weights without
   confirming their license terms.

## Acceptance gates before frontend activation

- All 778 reconstructed vertices agree with native MANO forward output
  within a documented millimetre tolerance in the same coordinate system.
- Parent hierarchy and all 16 joint frames match the source model.
- Reprojection error is measured against image landmarks on both cameras
  and at multiple distances.
- iOS Safari and Android Chrome are tested on physical devices.
- No regression in ring placement, finger identity, hand occlusion or
  camera mirroring.

## Safety and deployment

Do not restart the existing EC2 process until its actual code and
environment are inspected and a rollback path is prepared. The unrelated
service on port 8000 must not be touched. A PR in this repository does
not deploy changes to the separately running WiLoR EC2 service.
