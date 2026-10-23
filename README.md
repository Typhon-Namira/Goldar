# Goldar — Digital Jewelry Atelier

Goldar is a multi-tenant jewelry catalog platform with a private admin studio, premium public catalog pages, individual product URLs, QR codes, GLB/USDZ storage and native device AR scene placement.

## Current implementation status
- Implemented: single-superadmin API login, store/product CRUD, publication control, responsive luxury catalog, 3D viewer, native AR environment placement (compatible iOS Quick Look / Android Scene Viewer), per-product AR routes, QR codes, S3-compatible presigned uploads.
- Experimental ring fitting: Ring Atelier uses server-posed WiLoR meshes, camera-space attachment and depth occlusion with synchronized captured frames. Requires a separately configured inference endpoint. Refresh rate depends on server/network latency; real-device accuracy and physical sizing are not validated. See [architecture and validation](docs/RING_ATELIER_ARCHITECTURE.md).
- **Not yet implemented**: production-validated anatomical tracking and sizing (finger/wrist/neck/ear), real-world scale calibration, occlusion, physics-based dangling jewelry, production payment plans, audit logs, automated asset validation, anti-bruteforce rate limiting, production load/device testing.
- **Do not market scene placement as body-tracked jewelry try-on.** Android and iOS browsers may differ in native AR launch behavior. Native iOS Quick Look requires a valid USDZ asset and supported Safari/device. Body tracking requires a separate interactive camera renderer and testing on physical devices.

## Layout
```
backend/                FastAPI / SQLAlchemy API
frontend/               Next.js admin and public catalog
frontend/src/app/admin  Owner-only studio console
frontend/src/app/s      Public jewelry catalogs
frontend/src/app/ar     Product-specific AR scene placement
```

## Local backend
```sh
cd backend
python -m venv .venv
. .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
# Set strong JWT_SECRET, ADMIN_EMAIL, ADMIN_PASSWORD
uvicorn app.main:app --reload --port 8000
```
For deployment use PostgreSQL, Caddy HTTPS reverse proxy, restricted access, migrations, backups, and server hardening; SQLite is for local development only.

## Local frontend
```sh
cd frontend
npm install
cp .env.example .env.local
npm run dev
```
The frontend requires NEXT_PUBLIC_API_URL set to the HTTPS backend origin in deployment. Set PUBLIC_BASE_URL on the backend to the public frontend URL and CORS_ORIGINS to the frontend origin.

## Upload configuration
Configure S3_BUCKET, S3_ENDPOINT_URL (optional for AWS S3), S3_REGION, S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY, S3_PUBLIC_URL. Use a private write policy and scoped public read distribution/CDN, and configure the bucket CORS for uploads from the admin frontend origin. Production should verify MIME content and geometry, quarantine risky input, inspect size limits and verify files after upload; the current presigned flow checks declared filename/type/size but does not scan bytes.

## Lightweight EC2 deployment
Host only FastAPI, PostgreSQL and Caddy on EC2. Serve media from object storage/CDN. Client devices render 3D and native environment AR. No GPU is required for the current scene-placement functionality. For a 2GB ARM instance validate dependency compatibility, memory budgets and concurrent traffic with measured tests before launch.

## Security checklist before exposure to internet
Replace development secrets, enforce HTTPS and strict CORS, add login throttling, CSRF-safe cookie strategy or short-lived token handling, rotating credentials, database migration tool, storage upload validation, server-side pagination, backup/restore rehearsal, health monitoring, asset ownership checks, and explicit administrator authorization rules. Only trusted operators should have access to admin routes.

## Next milestone
Develop dedicated MediaPipe/Three.js body-tracked AR modules by category, with calibrated jewelry anchors, smoothing, proper depth occlusion and handling of device cameras. Test on physical iPhone Safari and Android Chrome; no claim of high-fidelity try-on until validated.
