# Goldar AR repository audit — 2026-10-21

## Reproducible baseline
- Goldar main SHA: `91be7c571426f567873d3bc47ef8e3b27fb62f3c`
- Goldar_CDN main SHA: `e820681db84781ee687289c36dd08522a5cf25a4`
- Source: GitHub connector; direct git clone from execution container failed (DNS resolution).
- Baseline install, lint, typecheck, build, browser/device QA: **NOT TESTED**. Do not report PASS.

## Confirmed source architecture
- `backend/app/main.py`: FastAPI settings, SQLAlchemy models, JWT admin, catalog CRUD, presigned S3 POST, ring calibration persistence.
- `frontend/src/app/admin/page.tsx`: single-superadmin store and product management; ring calibration editor.
- `frontend/src/app/s/[slug]/page.tsx`: public catalog.
- `frontend/src/app/ar/[id]/page.tsx`: experimental hand try-on and native scene placement.
- `frontend/src/components/HandTryOn.tsx`: MediaPipe CPU HandLandmarker, GLTFLoader, Three.js, proxy occluder, optional person segmentation, temporal filtering, resource lifecycle.
- `frontend/src/components/TryOnSwitcher.tsx`: legacy MediaPipe vs isolated WebAR.rocks iframe. WebAR scale/XYZ defaults hardcoded and must not be product calibration.
- `frontend/src/lib/cameraRingGeometry.ts`: camera-space ring solver with monocular scale approximation; projected 2D landmark geometry, depth heuristics.
- `frontend/src/lib/handPose.ts`: finger reference frame, One Euro filtering, quaternion smoothing.
- `frontend/src/lib/ringCalibration.ts`: heuristic GLB band detection; explicit overrides supported.
- `frontend/src/components/ModelViewer.tsx`: native environmental AR via model-viewer with GLB/USDZ.
- `frontend/package.json`: Next.js 15, React 19, Three.js 0.183, MediaPipe 0.10.32.
- Goldar_CDN: repository present; root README inspected (title only). Full asset inventory and license provenance NOT VERIFIED.

## Security and reliability findings
1. **CRITICAL**: `backend/.env.example` contained literal administrator credentials and JWT signing secret in a publicly visible repository. Sample values have been replaced on this development branch, but **all actual deployed credentials must be rotated immediately**; editing a sample file does not eliminate exposed Git history.
2. **HIGH**: `/api/auth/login` lacks effective throttling; raw shared admin password is compared directly, without a user/roles model.
3. **HIGH**: `/api/admin/uploads/presign` trusts declared metadata; server does not inspect or quarantine uploaded GLB/USDZ bytes.
4. **HIGH**: no vendor-scoped authentication/authorization, despite multi-store catalog data model. Avoid claiming full multi-tenant isolation.
5. **HIGH**: `Product` has no DB-level composite unique constraint for `(store_id, slug)`; application SELECT-before-INSERT is race-prone.
6. **MEDIUM**: startup `Base.metadata.create_all` is not versioned migration management.
7. **MEDIUM**: product and ring-calibration saves are separate transactions, allowing partial success.
8. **MEDIUM**: public and store-specific inventory endpoints lack pagination.
9. **MEDIUM**: browser session token persists in `sessionStorage`; security requires threat-model review.
10. **AR QUALITY**: absolute finger diameter is not observable from monocular landmarks alone. Solver estimates visual fit; it cannot certify real-world ring size.
11. **AR QUALITY**: segmentation is a person mask, not a finger-depth reconstruction. Proxy occlusion requires ground-truth rotating-hand tests.
12. **AR PERFORMANCE**: tracking and segmentation run client-side; CPU, FPS, thermal, battery, camera/mirror correctness, and Safari support NOT TESTED.

## Preserve
Existing `/s/{slug}/p/{productSlug}`, `/ar/{id}`, administration, product metadata and GLB/USDZ scene placement must remain intact.

## Immediate gates
- Rotate potentially leaked production admin password and JWT secret; review all repository history, sessions, audit logs and deployments.
- Establish executable frontend/backend CI baselines on a connected runner; verify `npm run lint`, `npx tsc --noEmit`, `npm run build` and pytest if present.
- Inventory CDN assets, origins, Content-Type/CORS headers and explicit usage licenses.
- Gather controlled ring/hand sample clips and calibrated assets before claiming production tracking accuracy.

This file is an audit of inspected source, not a statement that runtime tests passed.
