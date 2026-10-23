# Goldar — Digital Jewelry Atelier

Goldar is a multi-tenant jewelry catalog platform with a private admin studio, premium public catalog pages, individual product URLs, QR codes, GLB/USDZ storage and native device AR scene placement.

## Current implementation status
- Implemented: single-superadmin API login, store/product CRUD, publication control, responsive luxury catalog, 3D viewer, native AR environment placement (compatible iOS Quick Look / Android Scene Viewer), per-product AR routes, QR codes, S3-compatible presigned uploads.
- Face Atelier: local 8th Wall face/ear tracking for earrings and approximate face-guided necklace previews. No WiLoR endpoint or server inference is used. Model calibration is saved per product. See [setup, model preparation and deployment](docs/FACE_ATELIER.md).
- Not validated: physical sizing, true neck/shoulder tracking, hair/body occlusion, dangling-earring physics, and production performance on physical iOS/Android devices. Necklaces follow head motion and are visual previews only.

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
npm ci
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
Validate Face Atelier on physical iPhone Safari and Android Chrome, calibrate merchant earring/necklace assets, and measure browser tracking performance. Neck/shoulder tracking and physical sizing require separate development.
