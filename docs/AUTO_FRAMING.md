# Automatic upper-body framing

The shop mirror `/s/{slug}` starts wide. The existing single-face XR8 tracker
provides face geometry and an anonymous track ID. A sustained, adequately sized,
front-facing and optically usable face near the centre becomes the sole active
visitor. No entry button, face recognition database, depth calibration or extra
camera is involved. Standalone product previews `/ar/{id}` keep their prior view.

## Eligibility and locking

Eligibility uses the unzoomed source video: face width at least 80 pixels,
height at least 96 pixels, a fully visible face, acceptable facing angle and
about 650 ms of stable observations (at least five). A tiny 96x96 face crop is
sampled at most once per 500 ms during acquisition only in a separate bounded worker. Laplacian variance
and exposure/clipping checks are quality proxies, not a guarantee of optical
resolution. Only a fresh result for the same anonymous ID can enable entry.
Failure of this optional worker leaves the original wide camera view available.

After acquisition the crop eases in over 900 ms, with up to 3x digital zoom.
The target leaves room for the head, ears, neck and upper chest. Scale is latched
for that visit. Normal head/landmark jitter inside a broad deadband causes **no
crop change**. A substantial displacement triggers a 700 ms eased pan; only a
sustained close approach can reduce scale. It never continuously breathes in
and out with shoulder or face-width noise.

A short face dropout holds the framing. Missing/departed faces, leaving the
presentation area or inadequate source size stop renewing the visitor. After
1.2 seconds without an accepted observation the view eases back to wide over
700 ms. All other face IDs are rejected until that return finishes; the next
visitor must pass acquisition again. A spatial jump under a reused ID is also
rejected. This is anonymous visual tracking, not biometric identity assurance.

Neck profiles, bootstrap anatomy and body stabilization reset at visitor entry
and exit, even if the SDK reuses an ID. Body updates must geometrically match
the active face; hand navigation is limited to the active visitor's region.
Before acquisition, normal necklace fitting and hand navigation remain available;
image quality never blocks either feature. Face projection for framing is limited
to 10 Hz and quality crops stop entirely during a locked visit. The ownership
gate operates on raw video coordinates, preserving vertical swipe direction
regardless of zoom or selfie mirroring. Operator keyboard/card fallbacks remain.

## Rendering and lifecycle

Only the final WebGL canvas is transformed. Camera video, earrings, necklace,
and their depth occluders receive exactly the same compositor transform; the
tracking camera projection and landmark coordinate system are not changed.
The product rail and toolbar stay fixed. Crop translations are bounded to avoid
exposing the outside of the original frame. The runtime clips overflow and
uses no React rerender loop for every animation frame.

Inference continues on the original stream, so zoomed pixels cannot count as
new face detail. Zoom cannot recover detail that the webcam did not capture.
Viewport changes reset framing and reacquire safely. Product swaps preserve
the current visitor and camera stream. Disposal/camera failure releases the
quality worker and clears the transform. Images/crops remain on the device;
no visitor images or recognition templates are saved.

## Verification

Regression tests cover zero crop drift under small landmark/pose noise,
quality/size/entry-zone gates, eased pans, sustained approach, short dropouts,
visitor-ID lock, a reused-ID position jump, return-before-handoff, camera-space
projection/mirroring, stale quality rejection, one-in-flight crops and cleanup.
A browser check additionally exercises the real XR8 scene, photographic fake
webcam input, actual quality and hand workers, automatic zoom, identical settled
crop transforms, departure/return, subsequent entry and portrait resizing.
Synthetic/static-camera checks do not establish performance on every physical
webcam or remove movement of an unstably mounted camera.
