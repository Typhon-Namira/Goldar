# Face Atelier: earrings and necklace previews

## What runs

`/ar/:id` loads Face Atelier for enabled `earring` and `necklace` products.
Each camera session uses an isolated same-origin `/face-runtime/:id` iframe.
Stopping removes that document and its camera, GPU resources and SDK globals.
Restart creates a fresh runtime; it does not reuse the upstream SDK's known
face-controller singleton after cleanup. No camera runs before Start.

The official repository was cloned to `/workspace/8thwall-source` for inspection,
revision `4edfa484936a2cc691366eeec5c6e58bb6d4c8bd`. Deployment uses the official
MIT `@8thwall/engine@0.1.0` artifacts, pinned in package.json and package-lock.json.
No separately licensed SLAM binary is used. The historically named `slam` chunk
in this MIT package contains image-target/controller utilities needed by its
Three.js bridge; `face` contains the face/ear pipeline. The actual API on this
version is `loadChunk`, singular. See the upstream license served locally at
`/vendor/8thwall/LICENSE.txt` and linked in the fitting experience.

`npm ci` installs dependencies. `npm run build` and `npm run dev` automatically
copy the SDK, chunks and models to ignored `public/vendor/8thwall`. These assets
must be deployed with the frontend; no third-party camera service or API key is
needed. Inference uses browser WebAssembly/WebGL. No frames are uploaded by this
integration, and NEXT_PUBLIC_WILOR_API_URL is no longer read.

## Model preparation and dashboard

Create or edit an earring/necklace in `/admin`, set a public HTTPS GLB URL with
CORS enabled, and save calibration. Draco and Meshopt geometry compression are
supported using local decoders. Use standard PNG/JPEG/WebP textures; KTX2/Basis
textures are not configured. The sample-model button selects an original
procedurally generated GLB in `public/models`. Samples demonstrate the workflow;
they are not a representation of a merchant's actual jewelry.

- Earring: ONE upright earring per model; the runtime creates a copy for each
  tracked ear. Choose both, left or right in calibration. Both auto and lobe-only modes require a detected earlobe and hide jewelry
  when it is lost. Face-mesh ear landmarks are not used as piercing locations.
  Lobe visibility comes from XR8 earpointfound/earpointlost events because
  the SDK removes lobe-found flags from queued face event payloads.
  Move hair aside for better tracking. Hair occlusion is not implemented.
  A time-based adaptive filter stabilizes each lobe in face-local millimetres,
  leaving head pose responsive. Filters reset on visibility loss or long gaps.
  Earrings are inserted 3mm above the detected bottom of the lobe. Small
  depth-only ellipsoids approximate lobe tissue and hide intersecting parts
  of the model. These are not an ear segmentation or a scanned ear surface.
  Product XYZ offsets and model anchors still tune the piercing for each asset;
  preview scaling changes jewelry size without changing the tissue mask.
- Necklace: the complete upright necklace, facing the camera in the XY plane.
  It is attached below the chin using the saved offset. It follows head motion:
  this is NOT shoulder tracking or a physical fit simulation.
- Model height: approximate millimetres converted relative to an assumed 160mm
  face width; this is a visual scale, not calibrated physical measurement.
- Model anchor: normalized XYZ within GLB bounds; top centre is `[0.5,1,0.5]`.
- Offset: XYZ millimetres in the face-local frame. Defaults move necklaces
  below the chin. Rotation: XYZ Euler angles in degrees.
- A face-depth mesh hides geometry behind the face. Hair, ears and torso are
  not full depth meshes; no claim of perfect hair/body occlusion is made.

Original samples can be regenerated with
`node scripts/generate-jewelry-samples.mjs` from `frontend`.

## API and database

`PUT /api/admin/products/:id/face-calibration` requires admin authentication.
Configuration is returned as `face_calibration` on existing product responses.
The new `face_calibrations` table is created by the existing startup schema
initialization; no existing product rows or ring calibration tables are deleted.
Only earring and necklace products can be created/updated by the current API.
Legacy ring/bracelet catalog data remains readable, but has no live fitting.
Convert those records deliberately; do not relabel a ring asset as an earring.

Deploy backend and frontend together: an old backend cannot save the new
calibration endpoint. Back up the existing database before normal deployment.
From the existing deployment's compose directory rebuild the API using its
usual compose configuration, then deploy the frontend with `npm ci && npm run
build`. Verify the authenticated calibration save and a public product fetch.
For a Docker frontend build, pass `--build-arg NEXT_PUBLIC_API_URL=https://YOUR_API_ORIGIN`; Next.js public configuration is set at build time.
No inference server or GPU is required for this flow. Do not stop the entire
EC2 instance if it also hosts the catalog API/PostgreSQL/Caddy. Remove the old
WiLoR process/startup rule separately only after the new frontend is live.

The remote EC2 deployment is outside this workspace. No remote process, Caddy
configuration or database was modified by these code changes.

## Validation and device acceptance

Tests cover model normalization, anchor/rotation calibration, separate defaults,
per-ear visibility, missing lobes, and invalid coordinates. API smoke checks
exercise both categories, persisted calibration/public read, and rejection of
invalid calibration and retired category creation. Browser validation uses the
REAL local SDK/model files and a photographic camera input, not mocked XR8.
A detected face, visible necklace scene and stop/restart are checked. Earring
preview is exercised using the real engine with tracked earlobe anchors,
including stop/restart.
Dashboard save is tested in Chromium through the actual cross-origin API.
The automated suite contains 19 frontend tests and 6 isolated HTTP/API tests,
including the PUT CORS preflight needed by the dashboard.

Physical iOS Safari and Android Chrome still require validation: permission
accept/deny, turning head to reveal each ear, changing camera, model material
appearance, loss/reacquisition, portrait/landscape resizing, and sustained heat
and battery use. A photograph proves inference integration, not real-ear accuracy.
The SDK is pre-release; keep it pinned until upgrades pass the same checks.
