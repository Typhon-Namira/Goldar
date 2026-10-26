# Face Atelier: earrings and necklace previews

## What runs

`/ar/:id` loads Face Atelier for enabled `earring` and `necklace` products.
Each camera session uses an isolated same-origin `/face-runtime/:id` iframe.
Stopping removes that document and its camera, GPU resources, pose worker and SDK globals.
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
integration, and NEXT_PUBLIC_WILOR_API_URL is no longer read. Necklaces also
load same-origin MediaPipe WASM plus the checked-in Pose Lite model archive;
see THIRD_PARTY_FACE_ENGINE.md for Apache licensing and model provenance.

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
  Each lobe uses a five-sample median, a 0.35mm deadband and a time-based
  adaptive anatomical filter in head-local coordinates. Head pose remains live.
  The last valid anchor bridges detector gaps for at most 90ms, then hides;
  long gaps and face changes reset the estimate. Isolated landmark spikes
  cannot immediately move the earring.
  Tissue is a tapered, depth-only anatomical proxy whose bottom is the lobe
  landmark. Tracked canal and helix points fit its size and orientation with
  bounded dimensions and temporal smoothing; incomplete or implausible
  landmarks retain a conservative shape. The piercing and tissue share the
  same stabilized frame. Insertion varies from 2.5 to 4mm with lobe size.
  This is not segmentation or a scanned ear surface, and physical-phone
  validation remains necessary. Product XYZ offsets and model anchors tune
  each asset; preview fit changes jewelry size without resizing the tissue.
- Necklace: a complete volumetric chain, front along +Z and up along +Y,
  including its rear neck arc. A flat ring cannot wrap around a neck.
  The runtime now fits a separate body frame from MediaPipe shoulders, not
  the face/chin transform. Corrected cover-crop and front-camera mirroring
  map the shared XR8 video onto its Three.js camera. A bounded shoulder-depth
  estimate provides body yaw; head yaw cannot rotate the necklace.
  A local learned person mask supplies silhouette boundaries in a band below
  the current XR8 chin and above the shoulders. Internal shadows cannot become
  neck edges. The measured section directly anchors the collar; projected
  depth-volume edges are refined against those same video coordinates instead
  of shifting an independent mask down onto the chest. Cached body-relative
  proportions survive brief silhouette dropouts and reset after tracking loss.
  A missing initial contour waits for a measurable neck rather than guessing.
  This is person segmentation plus an anatomical heuristic, not semantic neck
  segmentation, a tissue scan, or physical sizing. Hair and clothing can still
  obscure the true neck boundary and require physical-phone validation.
  Render-frame smoothing and submillimetre/rotation deadbands stabilize body
  pose; a 650ms pose timeout hides stale fits. Smoothed neck dimensions size
  both the model and its closed depth volume.
  The built-in Emerald Halo sample uses an explicit anatomical rig: individual
  instanced gold links follow an arc-length sampled route around one shared
  neck/upper-chest surface. The same surface generates the closed depth mesh;
  front links are placed outside it, while the rear arc is hidden naturally.
  This replaces independently scaled model/mask volumes, which could erase
  disconnected chain fragments. Frontal chin observations bound collar height
  against jaw/chest misidentification; body yaw remains shoulder-driven.
  The observed neck section continues downward before the chest surface flares;
  raycast regressions check projected side boundaries within two video pixels.
  Shoulder yaw still orients the contact volume, but shoulder height imbalance
  no longer rolls the collar. The preview uses camera-up as its rest vertical
  (not a measured gravity sensor). For the articulated demo, the lowest link
  and pendant follow the viewing meridian of that same elliptical contact
  surface. This keeps the pendant on the observed neck image centreline under
  noisy shoulder depth, without translating the side contacts or depth mask.
  The pendant clearance and facing use the same bearing. Rear-facing bodies
  retain the anatomical front, with the pendant occluded. This is a preview
  drape constraint, not a physical cloth/jewelry simulation; rigid uploaded
  merchant models retain their calibration and do not acquire this rig.
  Shader preparation happens before the rig is revealed. Link/pendant sizing
  changes never expand the collar away from the measured neck.
  Uploaded GLBs without this explicit rig remain rigid calibrated previews;
  arbitrary merchant geometry is not automatically skinned or simulated.
  A missing/low-confidence shoulder hides the preview after a short timeout
  and asks the user to frame both shoulders instead of reverting to chin fit.
  Pose inference runs on CPU inside a dedicated worker, at most one 384px
  frame in flight, using the existing camera stream; it never blocks the
  camera/render loop or uploads images. Worker/model assets are self-hosted.
  The first pose may take several seconds. On unsupported devices, a clear
  error is shown; there is no claim of guaranteed mobile performance.
  Default sample height remains 85mm. Saved offset [0,-10,40]mm is the neutral
  body-fit baseline; custom offsets adjust relative to that baseline. Original
  unchanged 180mm sample defaults still resolve compatibly. Width/depth adapt
  visually to the neck: this is not a physical measurement or cloth simulation.
  For the rigged sample, height controls front drape; XYZ offsets remain active,
  while authored origin/orientation replace generic bounding-box anchor/rotation.
  The original asset contains linked gold, a pear-cut emerald, diamond halo,
  basket/prongs, bail and rear clasp. It uses glTF GPU instancing for link/stone
  reuse and requires a compatible glTF viewer (the bundled Three.js loader is tested).
  Body orientation supports rear arcs when shoulders remain tracked; physical
  front/side/back acceptance on iOS/Android remains required.
- Model height: approximate millimetres converted relative to an assumed 160mm
  face width; this is a visual scale, not calibrated physical measurement.
- Model anchor: normalized XYZ within GLB bounds; top centre is `[0.5,1,0.5]`.
- Offset: XYZ millimetres in the face-local frame for earrings; body-local
  adjustments relative to the neutral default for necklaces. Rotation: XYZ
  Euler angles in degrees.
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
The automated suite contains 68 frontend tests and 6 isolated HTTP/API tests,
including the PUT CORS preflight needed by the dashboard.

Physical iOS Safari and Android Chrome still require validation: permission
accept/deny, turning head to reveal each ear, changing camera, model material
appearance, loss/reacquisition, portrait/landscape resizing, and sustained heat
and battery use. A photograph proves inference integration, not real-ear accuracy.
The SDK is pre-release; keep it pinned until upgrades pass the same checks.

The contour update adds 54 passing frontend regressions, including actual
mesh raycasts at the measured video row under yaw/roll and cropped mirrored
video mapping. A full Chromium photographic fitting check with a collared
astronaut portrait did not acquire a valid neck contour (the preview remained
hidden); it is not evidence of successful human fitting. Validation on exposed
necks and real phones is still required for anatomical accuracy.

The centering regressions load and refit the actual necklace GLB, then project
its pendant under asymmetric shoulder heights/depths, both mirror modes,
off-centre necks and portrait cover-crop. Pendant attachment stays within one
viewport pixel of the fitted neck centreline. Additional raycasts verify one
connected visible arc and hidden rear links after recentering. Phone imagery
is still required to judge real anatomical alignment.

## Lifecycle and tracking audit

- Body results retain image-capture time, including bitmap creation latency;
  a delayed worker result cannot revive a necklace as a fresh observation.
- Cached neck proportions expire 1.2 seconds after the last measured contour,
  even if shoulders remain visible. Camera-dimension changes force acquisition.
- Chin-to-shoulder scan margins use camera-frame aspect ratio, not the square
  segmentation tensor's aspect.
- Camera failure status and pipeline exceptions hide both jewelry roots and
  stop body inference. Subsequent face events cannot revive a failed session.
- Failed engine scripts can be retried. Stop deduplicates shared geometry,
  textures and materials across clones and disposes instance/bone GPU buffers;
  preview lights are removed and the previous scene environment restored.

Tests exercise delayed inference, Stop during bitmap creation, failed frame
transfer, face-loss/reacquisition, camera failure, resource cleanup and loading
retry. The audit also runs the six isolated backend calibration/API tests.

The audit's Chromium run used the actual 8th Wall engine and photographic
camera input: earring display and Stop/restart passed. A separate real CPU
worker run loaded both local models and returned 33 body landmarks; its
collared portrait did not acquire a neck contour. This confirms model/worker
integration, not a successful necklace fitting or phone performance.
