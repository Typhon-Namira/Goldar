# Goldar Phase 4 — Product calibration and mobile release gate

## Shipped in feature branch (not production)
- Per-product calibration is persisted in new `ring_calibrations` table with `product_id` primary/foreign key, leaving existing products unchanged.
- Authorized `PUT /api/admin/products/{product_id}/ring-calibration` validates fitting parameters and stores configuration.
- Public product JSON includes `ring_calibration` or null.
- Admin product editor has fields for fit multiplier, anchor fraction, diameter and model-space vectors; works for create and edit.
- HandTryOn applies saved configuration, falling back to embedded GLB metadata then automatically derived geometry.
- The tracking display includes handedness, approximate palm/back view, and tracking loop FPS.

## Database rollout
`Base.metadata.create_all(engine)` creates a *new* table at API startup in existing Postgres/SQLite deployments. It does not update existing columns. Ensure backend is redeployed **before** frontend references the new endpoint. Production schema migrations and DB backup should still be performed as a normal release practice.

## Calibration procedure
1. Create/edit product with public GLB URL and save. Enter ring geometry in **GLB units**, not millimeters.
2. For unknown axes/center, leave optional fields blank; use geometric estimation only as an initial approximation.
3. Inspect the GLB with a 3D viewer and confirm its band center, hole axis, and gem orientation before overriding.
4. Start live Try-On and calibrate fit multiplier/anchor fraction against known-good screenshots.
5. Save the product and reload to check persistence. Verify API response includes exact values.

## Phone acceptance matrix
On Android Chrome and iOS Safari record: device/OS/browser, front/rear camera, network type, GLB URL, ring selected, FPS readout; palm and back, left and right hands, slow/fast movement, 0/45/90-degree angles, occlusion on/off, 5-minute stability, lighting changes, recovery after tracking loss. Upload screenshots/videos to PR.

## Release blockers
- GitHub build success alone does not validate visual quality.
- The app still uses person segmentation and approximate depth geometry, not pixel-accurate hand segmentation.
- No actual camera/device test has been performed by CI.
- Calibration values do not establish physical ring size without an independent measurement.
- Keep PR in draft until deployment and real-device validation.
