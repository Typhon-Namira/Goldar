# Goldar — Interactive Jewelry Windows

Goldar turns a jewelry shop display and webcam into a live try-on mirror. Each store has one public display link, a product rail, and raised-hand swipes for touch-free selection. A private admin studio manages stores, manually authored jewelry GLBs, cover images, publication and fitting calibration. See [display setup and operation](docs/INTERACTIVE_WINDOW.md).

## Current implementation status

- Implemented: fullscreen portrait/landscape store displays, local wrist-swipe selection, live earring/necklace swaps in one camera session, operator fullscreen/wake-lock controls, single-superadmin login, store/product CRUD, publication control, per-product calibration previews, QR links and S3-compatible presigned uploads. Existing individual product/3D viewer and native scene-placement routes remain available.
- Face Atelier: local 8th Wall face/ear tracking for earrings and MediaPipe body/neck fitting for necklaces. No WiLoR endpoint or server inference is used. Model calibration is saved per product. See [setup, model preparation and deployment](docs/FACE_ATELIER.md).
- Not validated: physical sizing, general hair/clothing occlusion, dangling-earring physics, and production accuracy/performance across physical iOS/Android devices. Necklaces use shoulder landmarks and an optional exposed-neck outline; fitting remains an approximate visual preview.

## Layout

```
backend/                FastAPI / SQLAlchemy API
frontend/               Next.js admin and live store displays
frontend/src/app/admin  Owner-only studio console
frontend/src/app/s      Public interactive shop windows
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

Validate the shop-window experience on the actual display computer/webcam, including hand swipes, street lighting, glass reflections and prolonged use. Calibrate merchant earring/necklace assets and measure browser tracking performance. Validate the shoulder/neck fit with exposed and partially covered necks; physical sizing still requires separate calibration.
