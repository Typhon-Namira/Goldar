# Goldar WiLoR integration rollout

This branch integrates the exact MANO LBS reconstruction at **acquisition** when the API returns `hands[0].manoLbs`. It does not yet replace the per-frame MediaPipe-driven approximation with full pose-dependent MANO deformation. Do not label the result as full SLAM or calibrated metric AR.

## API contract

`manoLbs` is optional, and only for model assets licensed for browser distribution:

```json
{
  "schemaVersion": 1,
  "rig": {
    "templateVertices": [[0,0,0]],
    "shapeOffsets": [[0,0,0]],
    "poseOffsets": [[0,0,0]],
    "restJoints": [[0,0,0]],
    "parents": [-1],
    "weights": [[1]]
  },
  "pose": {"localPose": [], "rootTranslation": [0,0,0]},
  "requiresModelToCameraTransform": true
}
```

Array examples above are abbreviated: the frontend requires 778 vertices, 16 joints, and 16 weights per vertex. The existing `mano.cameraTranslation` is used after WiLoR's handedness correction. The client verifies reconstruction against `mesh.vertices` with a 3mm guard.

**Do not enable this field by default.** MANO template and skinning weights may be subject to license restrictions. Do not distribute those buffers to browsers until permission is established. For restricted assets, prefer server-side reconstruction and send posed vertices only; the current app continues to use the native WiLoR mesh in that case.

## EC2

The WiLoR API source lives on EC2, outside the GitHub backend app. This branch does not deploy it. Preserve the existing Caddy routing and port 8000 service. Any opt-in sidecar changes should be deployed to the WiLoR service process only after backing up its files and confirming its startup command. No automated restart is included.

## Remaining before claiming full upgrade

- Replace live inverse-distance joint deformation with true MANO LBS using a temporally fitted 16-joint pose, or server-side pose mesh updates.
- Add calibrated intrinsics when the browser/device makes them available; otherwise label focal length estimated.
- Validate camera mirror and left-hand mapping in real sessions.
- Run frontend build and real mobile tests before merging.
