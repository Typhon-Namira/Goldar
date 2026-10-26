# Interactive shop window

The store link `/s/{store-slug}` now opens a full-screen live mirror rather than
a catalog. The existing `/admin` dashboard manages the same stores, 3D assets,
cover images and calibration; its store action is now **Open display** /
**Copy display link**. Individual `/ar/{product-id}` previews remain available
for operator calibration.

## Operate a display

1. In the dashboard, publish the store and add its earrings/necklaces. Set a
   reachable GLB URL, enable AR, and publish each product. Uploaded merchant
   geometry uses its saved calibration; it does not acquire the demo's rig.
2. Open the store's HTTPS link in a current desktop Chrome/Edge browser on the
   display computer with its USB webcam connected. Select the intended webcam
   in the browser's camera permissions. Use the default **webcam/front camera**
   setting for a desktop; **rear camera** is available for devices with one.
3. The operator clicks **شروع نمایش ویترین** once and grants camera permission.
   The page requests fullscreen and a screen wake lock when supported. Browser
   and OS power policies still apply; this cannot bypass browser permissions
   or start fullscreen without a user action.
4. A visitor faces the screen with face, ears, neck and both shoulders visible.
   Raise one hand near the upper torso and sweep horizontally. A rightward
   sweep in the mirrored display selects the next card to the right; a leftward
   sweep selects the previous card. Selection wraps at both ends.
5. Operator fallback: arrow keys and product buttons. The power button stops
   and unloads the camera runtime. Restart reloads the isolated runtime. Reload
   the store page after changing the published inventory in the dashboard.

Camera framing matters: keep the webcam near eye level, show both shoulders and
raised hands, and mark a standing spot for one visitor. Test the actual glass,
street lighting, viewing distance and camera exposure before unattended use.
This implementation does not add multi-person fitting, hair segmentation,
physical sizing, or automatic rigging of merchant jewelry.

## Session and gesture design

- A same-origin iframe owns one XR8 scene and one camera stream. The display
  chrome remains mounted outside it. Live model swaps reuse the camera and
  tracking pipeline, including cross-category swaps. Stale asynchronous model
  loads are disposed; failed GLB downloads preserve the previous fitted model.
- The bounded CPU worker already used for necklace tracking also provides
  shoulder and wrist landmarks for the display's gestures. No second camera
  or separate hand inference stream is opened; frames remain local.
- Wrist movement is normalized to shoulder span and body translation. A raised
  hand must travel at least 0.65 shoulder spans across >=3 observations over
  160–850ms, with limited vertical drift and directional reversals. At least
  two meaningful movement steps reject isolated landmark jumps. A 1.2 second
  cooldown prevents a single sweep from skipping several products.
- The rail confirms selection only after the runtime accepts the model. It
  locks overlapping selections, shows loading/error states, and validates both
  message origin and iframe source. Empty, hidden, unsupported, disabled and
  model-less products do not appear. A one-product store does not change index.
- The layout supports portrait and landscape. Large instructions disappear
  once fitting is tracked so text does not obscure the face/jewelry. An active
  screen wake lock is reacquired after the document becomes visible again.

## Validation

Automated tests cover display inventory filtering, selection wrapping, mirrored
swipes, body translation rejection, vertical/lowered hands, low confidence,
landmark spikes, cooldown, missing frames, live asset swaps, failed downloads
and superseded downloads, alongside the existing fitting regressions.

Chromium with the real local XR8 engine and GLBs plus photographic webcam input
verified earring rendering, a simulated failed GLB request preserving the prior
selection/camera, retry, an injected *protocol* swipe selecting the necklace,
keyboard return to earrings, one camera opening across swaps, iframe identity,
portrait canvas sizing, message-source rejection and Stop/restart. This is not
an end-to-end test of a real pedestrian's hand: wrist-motion classification is
tested with synthetic landmarks. Physical webcam/hand testing on the display
hardware remains necessary. The collared photographic input does not establish
correct necklace fitting; existing geometric fitting tests cover that route.
