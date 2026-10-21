# Phase 5.4 — Finger Occlusion

Adds a depth-only, elliptical tapered cylinder, aligned with the calibrated model's canonical finger axis (+Y) and positioned just behind the ring's center. The geometry writes depth but not color and is scaled using the apparent finger breadth and ring fitting scale, while remaining smaller than the estimated band hole. Existing optional MediaPipe person-mask shader integration is retained.

## Validation needed

- Compare occlusion ON/OFF with both palm and back of hand toward camera.
- Check projected depth side of the GLB gemstone and whether rear band is hidden while near band remains visible.
- Test different inner diameters and GLB coordinate systems; confirm depth mesh never protrudes beyond the ring hole.
- Test mobile Safari/Chrome WebGL depth buffer ordering, and camera mirrored mode.
- Run TypeScript CI and inspect recordings from real devices.

This is an approximation rather than a pixel-accurate finger reconstruction; person segmentation cannot yield exact finger depth. True production-grade occlusion would require a dedicated hand segmentation / hand-mesh pipeline and measured depth or a validated learned proxy.
