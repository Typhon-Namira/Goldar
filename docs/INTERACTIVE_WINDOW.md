# Interactive shop mirror

`/s/{store-slug}` opens the camera directly. There is no application entry page,
Start button, visible caption, product name, price, greeting, or language selector.
The viewport contains the live mirror, a narrow vertical product rail on the
right and a bottom icon toolbar. Selection uses a blue outline. Product covers
are optional; jewelry silhouette icons provide a fallback. Accessible names
remain available to assistive technology, but are not drawn on the display.

The existing `/admin` dashboard manages stores, manually authored GLBs, product
covers, publication and fitting calibration. **Open display / Copy display link**
opens the same store URL. Reload after editing published inventory. Only public,
AR-enabled earrings/necklaces with a model appear. `/ar/{id}` remains an operator
preview, separate from the text-free shop mirror.

## Operation

Connect the display's webcam and open its HTTPS store URL in Chrome/Edge.
The browser may request camera permission the first time; an application cannot
bypass that native permission. Once allowed, the mirror starts automatically.
Use the bottom icons to switch camera, enter fullscreen, or restart. Fullscreen
still needs an operator action under browser policy. Screen wake lock is
requested when supported. A camera-off/retry icon represents camera failure;
model errors use a retry icon. No Persian or other visible UI wording is used.

Move either hand **down** to select the next/lower product in the right rail,
or **up** to select the previous/upper product. Selfie mirroring never reverses
this vertical mapping. One continuous sweep selects one product; pause briefly
or reverse to begin another. Selection wraps at the ends. Icon cards and the
Up/Down arrow keys remain operator fallbacks. Place the webcam near eye level
and frame the ears, neck, shoulders and a raised hand at the actual standing
position. Validate the real glass, street lighting, distance, exposure and
prolonged use before leaving a display unattended. This is not multi-person
fitting or physical sizing.

## Tracking and fitting

A single XR8 camera stream/scene persists across product swaps. Failed GLB
requests preserve the current asset; superseded loads are disposed. Same-origin
iframe messages validate origin/source and allow only the published inventory.

Gesture control uses an independent CPU MediaPipe HandLandmarker worker on
the existing camera. Its fast bundle combines Google's Full palm detector with
Lite hand landmarks. Image-mode detection refreshes palms every frame rather
than letting persistent video ROIs lock onto resting hands. A cheap local-motion
map proposes a square search crop for newly raised or quickly moving hands;
ONLY a confirmed learned-model hand becomes a gesture sample. Crop landmarks
are mapped back to original video coordinates before motion/identity matching.
Search focus expires after 500ms without motion, returning to the full frame;
global scene changes clear it. A failed crop falls back to full-frame detection.
No optical/image motion can directly select a product. It observes up to two hands; handedness and geometric palm
association preserve identity when result ordering changes. Each palm has its
own gesture trajectory, with a shared 180ms refractory period so two hands
moving together cannot skip an extra product. It does not need body landmarks.

Only one image (up to 480px on the longest edge) is in flight. Capture follows
video-frame callbacks and completed inference, with a 33ms poll only on browsers
without frame callbacks. Results older than 350ms clear gesture history instead
of issuing delayed navigation. Aspect changes also reset history. Palm movement
is measured in image-height units, independent of camera aspect and mirroring.

A coherent fast pair (16–360ms, travel at least .045 image heights and .48 palm
spans) can select without a dwell or a third frame. Palm shape is aligned for
natural wrist rotation before comparison. Scale, shape, speed and horizontal
drift reject disconnected detections. Slower deliberate trajectories are also
supported. Pause/exit/reversal rearming consumes each continuous sweep once;
rearming discards its old trajectory so a settled tail cannot replay. A brief
missing detection can reconnect to the same palm within 360ms.

Selections during an asset download retain the latest requested destination;
they are not silently dropped by a loading lock. The rail scrolls the pending
product into view immediately, while the confirmed outline follows successful
model loading. Abrupt whole-image changes clear gesture history and allow
180ms for the model to settle. All camera data stays local. Throughput depends
on device inference speed, camera FPS and exposure; it is not guaranteed 30Hz.

For necklaces, the measured upper-neck contact row is preferred and a median
of three body-relative measurements rejects isolated silhouette errors. A
measured profile follows the same tracked body across segmentation gaps; it
resets after a body gap, image-dimension change, or new XR8 tracking identity.
An in-flight result from an older tracking identity is discarded. A fresh
body pose bridges a face-ID reacquisition for one body interval, avoiding an
unnecessary flash while the new body observation arrives. There is no
periodic swap from a good profile to a chest estimate. Initial bootstrap requires
an actually tracked chin plus shoulders, with its collar about 27mm below the
chin at the nominal 380mm shoulder scale. Mouth landmarks cannot invent a chin.
When a frontal chin is available, collar height is bounded within 20–65mm below
it. The projective body frame uses a fixed camera plane, avoiding depth/scale
pumping when face depth is lost and reacquired. Missing anatomy may still hide
a fit; the system does not scan or infer a physically exact neck.

Segmentation is sampled every third pose frame. Capture timestamps and the
measured latency/cadence hold remain bounded at 1.4 seconds. Stored proportions
are not a frozen pose: fresh body observations still drive position/rotation.
Merchant models remain rigid calibrated previews unless explicitly authored
with the supported demo rig; models are not automatically rigged or simulated.

## Validation

Tests cover palm motion without body landmarks, selfie mirroring, slower sweeps,
noise, fast two-frame sweeps, reversals, continuous-sweep deduplication, brief
blur gaps, shape-inconsistent jumps, chin-only bootstrap, retained neck fit,
silhouette outliers, new-person reset and model/camera lifecycle regressions.

A photographic hand translated across three image frames 60ms apart was
processed by the actual CPU hand model; the inferred landmarks produced a swipe
after the second frame. This is stronger
than injecting a navigation message, but still not a physical pedestrian test.
The real-browser store test exercises automatic startup, text-free UI, real
inferred hand motion changing products, one camera stream and visible necklace
rendering. Device-specific fitting/hand accuracy still needs onsite validation.

The release browser check used fast photographic hand motion through the real
model (no injected selection event for that step), then verified one camera
stream, a collar contact about 26mm below the tracked chin and 12/12 visible
necklace samples after acquisition. A separate delayed-download check verified
two rapid selection intents. These are reproducible browser/geometry checks,
not proof of anatomical accuracy or responsiveness on every physical webcam.


Necklace body inference uses the locally hosted BlazePose Full bundle (roughly
9 MB on first use), with a robust multi-row foreground-confidence neck fit and
capture-aligned chin references. This increases client CPU/model download cost;
it adds no EC2 inference requirement. Setup and limitations are documented in
FACE_ATELIER.md under “Necklace measurement refinement”.


Vertical gesture validation uses 118 frontend regression tests, including both
hand identities, reordered results, wrist rotation, portrait/wide aspect ratios,
slow and fast flicks, continuous-sweep deduplication, stale-result rejection and
video-callback cleanup. Four real CPU-model photo-motion runs (up/down in both
portrait and landscape) each produced exactly one selection, first recognized
on the first moving frame after a stationary baseline. These are repeatable
inference checks, not a substitute for an onsite pedestrian/webcam test.


The 360ms observation-gap limit supports slow camera/inference cadence without
adding a dwell on fast devices. Low-latency two-frame detection still fires as
soon as adequate motion is observed. Headless software rendering is useful for
regression checks but does not establish physical-camera recognition latency.


Overlapping palm detections are deduplicated before hand association. Nearby
crop/handedness reacquisition preserves the consumed-sweep latch while reseeding
coordinates; it cannot create a second armed gesture from the tail of the same
sweep. Both cases have explicit regression coverage.
