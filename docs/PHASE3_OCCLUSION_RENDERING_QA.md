# Goldar Phase 3: jewelry rendering and occlusion QA

## Implemented in branch
- Local Three.js RoomEnvironment to provide image-based studio reflections through PMREM (no paid APIs).
- Adjusted ambient/key/fill light and ACES exposure for reflective jewelry.
- Retains existing GLB textures/materials instead of replacing precious metal or gemstone shaders.
- Finger depth proxy is a conservative cylinder tied to the fitted ring's internal model diameter.
- Optional person-segmentation mask still clips the proxy to a hand landmark ROI; an expired mask is no longer treated as current.
- Renderer cleanup disposes environment textures and PMREM generator.

## IMPORTANT: not a production-grade pixel hand segmenter
The existing Selfie Segmenter detects a person, not fingers or depth.
Its category output and the cylindrical occluder are insufficient to guarantee correct front-versus-back skin contact. This iteration does NOT claim solved hand reconstruction, measured depth or true photo-realistic jewelry lighting.

## Visual QA needed before merging
1. On Android Chrome and iPhone Safari, show the back and palm of the hand at 0, 45, 90 degrees; ensure the upper gemstone and visible band do NOT disappear.
2. Compare occlusion checkbox ON and OFF, with screenshot/video pairs.
3. Inspect a gold band and a stone-bearing ring: verify normal orientation, absence of solid black metal faces and plausible environment reflections.
4. Measure startup time, actual frame rate, overheating and whether segmentation remains usable in bright and low light.
5. For every imported GLB, confirm geometry is physically appropriate, textures are present and calibration metadata corresponds to the final transformed scene units.
6. Test what happens when the segmentation model fails or connectivity is lost; AR must remain functional and clearly indicate estimated fit.

This phase passes compilation only when GitHub actions succeed; it cannot be called device-validated until this QA is completed.
