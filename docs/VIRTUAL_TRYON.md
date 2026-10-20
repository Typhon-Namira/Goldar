# Goldar — Virtual Try-On development branch

This branch adds an **experimental hand-tracked 3D fitting-room preview** on the existing `/ar/[id]` route. The experiment runs MediaPipe Hand Landmarker and Three.js in the user's browser. The EC2 backend serves only the catalog metadata and URLs, so it does not perform video inference.

## Supported now
- Live camera input using `getUserMedia` over HTTPS.
- Hand landmark detection in-browser (one hand; CPU mode).
- Basic 3D GLB anchor placement and temporal smoothing.
- Select a finger for rings, camera direction and visual fit multiplier.
- Stop camera and release its tracks and GPU resources.
- Preserve the existing native model-viewer path for iOS Quick Look USDZ and Android-compatible scene placement.

## Not yet production ready
- **Ring:** This prototype infers a projected finger direction/position and does **not** reconstruct a 3D finger cylinder, physical circumference or finger depth. Jewelry geometry may be misoriented, offset or incorrectly sized.
- **Bracelet:** An approximate wrist anchor; no wrist circumference, chain draping or reliable motion/depth reconstruction.
- **Necklace and earrings:** Do not use hand landmarks. Need separate body/face pose anchors, occlusion and geometry pipelines.
- Proper occlusion between finger, metal and gem, physically based reflection matched to live lighting, accurate GLB canonical orientation, skin segmentation, anti-jitter benchmarking, accessibility/device compatibility are still required.
- Need asset normalization: GLB and USDZ are *different device capabilities*, and USDZ does not automatically provide anatomically attached Try-On.
- Need systematic mobile device tests, HTTPS/camera permission testing, performance profiling, build and release gates. Do not claim consumer-grade precision.

## Development setup
```sh
cd frontend
npm install
npm run build
npm run dev
```
`NEXT_PUBLIC_API_URL` should be a reachable HTTPS API. A published product with a valid CORS-enabled GLB URL is required for camera try-on. WebGL context, model URLs and WASM files must be accessible from mobile browsers. The MediaPipe WASM/model files are loaded from pinned public URLs; before production, serve approved immutable copies under the project origin and verify license and hashes.

## Acceptance criteria before production
1. Build passes on GitHub Actions and Vercel preview.
2. Test on multiple iOS Safari and Android Chrome physical devices, including mid-range handsets, with stable camera permission and stop/restart behavior.
3. Validate jewelry asset geometry and orientation in a controlled 3D coordinate system and millimeter scale.
4. Quantify landmark jitter, overlay alignment error and lost tracking in controlled lighting, poses and skin tones.
5. Explicitly handle hands leaving frame, rapid motion, partial occlusion and unsupported devices.
6. Implement neck/ear-specific pipelines, and never fall back to visually misleading hand placement.
7. Security/privacy review, CSP/CDN pinning, testing of external GLB URLs, and a staged rollout.

## Rollout
Keep branch `feature/virtual-tryon-engine` separate from `main` until quality gates and mobile tests succeed. Current EC2 deployment is unchanged.
