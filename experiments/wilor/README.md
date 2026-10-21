# WiLoR isolated personal-use integration (NOT production)

WiLoR is **not cloned into this public repository**: upstream models use CC BY-NC-ND 4.0; MANO and Ultralytics have separate terms. The intended deployment is private, non-commercial, and on explicitly authorized hardware only. Neither model weights nor live camera frames belong in git, Goldar's object store or its regular API by default.

## Why not switch live Goldar immediately?
Goldar EC2 has 1 vCPU. WiLoR's reference PyTorch pipeline includes a YOLO detector, model forward pass and MANO mesh reconstruction. One CPU core cannot be assumed to deliver interactive latency, and sending mobile camera video continuously to EC2 creates a privacy and latency problem. **Main user-facing engine remains unchanged until actual tests prove feasibility.**

## Local private experiment
1. Create a private working directory outside the public Goldar checkout.
2. Clone upstream at a pinned commit: `git clone --recursive https://github.com/rolpotamias/WiLoR.git`.
3. Follow upstream README to obtain detector.pt, wilor_final.ckpt, model_config.yaml and independently licensed MANO_RIGHT.pkl. Do not redistribute them.
4. Install Python 3.10, CPU PyTorch, upstream requirements in an isolated virtual environment.
5. Launch `python experiments/wilor/benchmark_cpu.py --wilor-dir /path/to/WiLoR --image /path/to/consented-hand.jpg` from Goldar repo root.
6. Benchmark 20+ images and rotating-hand clips under representative load before attempting interactive backend use.

## Exit criteria before product integration
- Consented image dataset; evaluate index 13-16 anatomical ring position, rotational flips, reprojection, occlusion and jitter.
- Record cold-start duration, model RAM, CPU utilization, per-frame P50 and P95 time. 1 vCPU capacity must be measured, not presumed.
- Explicit privacy design before any off-device video transfer, including authenticated API, strict upload limits, deletion policy, CSRF/CORS review, no default recording and access controls.
- Legal review of WiLoR + MANO + Ultralytics terms; noncommercial personal usage is not a blanket exception for publishing derivative weights/source.
- Build a GLB-to-MANO proximal-finger anchor and depth prepass, then gated A/B mobile testing.
- Roll back to current client-only MediaPipe engine if speed or accuracy gates fail.

## Status
Architecture and guarded CPU benchmarking harness created. **No model clone, weights download, inference benchmark, mobile QA, EC2 changes, or live integration has been executed.**
