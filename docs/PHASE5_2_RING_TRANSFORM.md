# Phase 5.2 — Ring transform

## Scope
Only transforms of the ring model in camera overlay coordinates. Phase 5.3 temporal filtering and Phase 5.4 occlusion remain unchanged.

## Implementation
- Frame: `estimateFingerFrame` built from MCP/PIP/DIP world landmarks.
- Camera center: interpolate normalized-image MCP→PIP projected into CSS overlay pixels at calibrated `anchorFraction`, clamped 0.05–0.65. This is the *projected centerline proxy*, not measured skin depth.
- Model hole axis: `attachCalibratedRing` maps calibrated model hole axis to canonical +Y; ring frame maps canonical +Y to longitudinal finger axis.
- Gem direction: model calibration projects gem direction onto transverse plane and aligns to canonical +Z. The frame +Z is `lateral × longitudinal`. It follows an anatomical relative basis; *true back-of-finger lock for all handedness, mirroring and unusual gestures needs device validation*.
- Scale: estimate finger breadth from knuckle separation, bounded to 16–29% of palm width, then multiply by per-user widthCalibration and fitMultiplier; divide by estimated/overridden inner model diameter. A landmark-based width estimate cannot replace real ring measurement.

## QA before merge
1. Left/right hands, rear/front mirrored video, four fingers and hand back/palm/edge views.
2. Check gem side against actual back-of-finger for both handedness; orientation correction may require explicitly signed dorsal direction after controlled device tests.
3. Check visually that ring center follows proximal segment and does not sit on a fingertip/palm.
4. Test invalid/calibration-less GLBs and models with rotated gemstone axes.
5. CI TypeScript/build and runtime on mobile required.

## Limitations
Absolute depth / true cylinder embedding cannot be solved from 21 normalized landmarks and orthographic overlay alone. Physical fitting and stability on movement also depend on Phase 5.3 and occlusion in Phase 5.4.
