# Phase 5.3 — Temporal stabilization

- Independent One Euro filters for x/y/z overlay-space position and model scale; dynamic cutoff responds to motion.
- Hemisphere-aware, normalized quaternion slerp with frame-rate-aware exponential interpolation.
- Hold the last rendered pose without extrapolation for up to 320 ms after landmark dropouts or invalid finger frames.
- Reacquire cleanly after larger temporal gaps or discontinuous (>220 CSS-pixel) translations.
- Preserve the previous Phase 5.2 transform and existing occlusion behavior.

## Required QA
- Stable hand, varying frame rates, fast translations, rotation, resizing finger image in camera.
- 1–9 missing frames and prolonged detection loss; no movement while frozen, no retained pose after timeout.
- Hand switching/reacquisition and left/right camera switching.
- Unit tests for timestamp regressions, NaN inputs, quaternion antipodes and large jumps.
- Mobile device confirmation is required before claiming production readiness.

## Limitations
Filters cannot repair erroneous anatomical association or inaccurate depth, and brief freezing may be noticeable; occlusion geometry is Phase 5.4.
