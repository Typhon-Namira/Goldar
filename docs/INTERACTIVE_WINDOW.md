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

One raised hand sweeping horizontally selects a product. Direction refers to
the mirrored display. Selection wraps at the ends. Icon cards and arrow keys
remain operator fallbacks. Place the webcam near eye level and frame the ears,
neck, shoulders and a raised hand at the actual standing position. Validate the
real glass, street lighting, distance, exposure and prolonged use before leaving
a display unattended. This is not multi-person fitting or physical sizing.

## Tracking and fitting

A single XR8 camera stream/scene persists across product swaps. Failed GLB
requests preserve the current asset; superseded loads are disposed. Same-origin
iframe messages validate origin/source and allow only the published inventory.

Gesture control now uses an independent CPU MediaPipe HandLandmarker worker
and a palm-centre trajectory. It no longer requires visible shoulder landmarks
or their confidence. One 320px image is in flight at a time, from the same video
stream. At least three observations, 0.085 normalized horizontal travel, two
movement steps, limited vertical drift and a one-second cooldown reject jitter,
single jumps and repeated selection. No camera frames are uploaded.

The independent body worker still supplies necklace pose. A measured silhouette
is preferred; when clothing/hair or a temporary missed chin prevents a contour,
a live face/chin and confident shoulders provide a bounded *estimated* neck fit.
This fallback is less precise than measured contour fitting and does not scan
anatomy. Missing/low-confidence anatomy cannot generate a fit. Segmentation is
sampled every third pose frame; cached measured proportions carry the intervals.
Capture timestamps are retained. A measured latency/cadence hold bridges slower
inference, with a hard 1.4-second stale-pose limit; it does not retain a model
indefinitely after a visitor leaves. Earring/necklace calibration is unchanged.
Merchant models remain rigid calibrated previews unless explicitly authored
with the supported demo rig; models are not automatically rigged or simulated.

## Validation

Tests cover palm motion without body landmarks, selfie mirroring, slower sweeps,
noise, vertical motion, jumps, tracking gaps, missing contour fallback, invalid
anatomy, bounded slow-inference hold and model/camera lifecycle regressions.

A photographic hand translated across real image frames was processed by the
actual CPU hand model; its inferred landmarks produced a swipe. This is stronger
than injecting a navigation message, but still not a physical pedestrian test.
The real-browser store test exercises automatic startup, text-free UI, real
inferred hand motion changing products, one camera stream and visible necklace
rendering. Device-specific fitting/hand accuracy still needs onsite validation.
