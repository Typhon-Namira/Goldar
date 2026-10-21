# Goldar Try-On Phase 2: calibrated ring geometry

## Implemented
- `src/lib/ringCalibration.ts` inspects glTF meshes after node transforms, looks for a band/shank/torus mesh, and measures radial vertex distances to the band center in model-root coordinates.
- The *inner* radial percentile is used as the hole-diameter estimate. This requires a visible inner rim and a reasonably toroidal mesh; it is not a universal ring reconstruction method.
- The calibrated band center is used as the scene pivot, and the hole axis aligns with the local finger axis.
- A separate gemstone direction determines rotation around the finger.
- `HandTryOn.tsx` scales by hole diameter rather than the whole bounding box.
- Manual overrides can be supplied through `scene.extras.ringCalibration` in the GLB and are read via `model.userData.ringCalibration`.

## GLB metadata example
A glTF scene extras object can look like:

```json
{
  "ringCalibration": {
    "center": [0.01499, 0.21233, 0],
    "holeAxis": [1, 0, 0],
    "stoneDirection": [0, 1, 0],
    "innerDiameter": 0.3144
  }
}
```

**Important:** These example values are **not** certified dimensions for the attached ring. The coordinates and diameter must be measured in the final scene-root coordinate frame **after transforms** and match the specific exported GLB. The `innerDiameter` value uses the **native model units**, not millimeters; it must be calibrated to the exported model.

## Quality checks before shipping
1. Inspect the exact deployed GLB mesh hierarchy and model transforms.
2. Ensure the band is identified; generic mesh names trigger fallback, not guaranteed accurate sizing.
3. Check ring center, hole-axis orientation, and inner diameter using a calibrated model viewer.
4. Check gemstone orientation with hand back toward camera and with palm toward camera.
5. On Android and iPhone, test at 0°, 45°, 90° hand rotations and close finger bends.
6. Record screenshots and test against the target reference before promoting the phase.

## Limitations
- MediaPipe landmarks do not measure actual finger diameter. Visual ring size is estimated from nearby hand joints.
- Per-model metadata is supported in GLB extras; **there is currently no database/admin editing UI for that metadata**.
- Occlusion and photo-realistic materials belong to Phase 3.
- Neither the CI build nor a unit-scale estimate proves realistic fit.
