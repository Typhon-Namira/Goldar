# WiLoR inference sidecar (experimental)

Runs **alongside** the existing Goldar FastAPI API. Do not install the multi-GB
WiLoR/PyTorch dependencies into Goldar's lightweight backend environment.

On the EC2 host with the WiLoR repository already installed:

```bash
source "$HOME/miniforge3/etc/profile.d/conda.sh"
conda activate wilor
python -m pip install "fastapi>=0.115,<1" "uvicorn[standard]>=0.30,<1" "python-multipart>=0.0.12,<1"
cd ~/goldar-ai/WiLoR
export WILOR_CORS_ORIGINS="https://YOUR_FRONTEND_DOMAIN"
export OMP_NUM_THREADS=2
# Copy Goldar/wilor_service/app.py to this directory as goldar_wilor_api.py
# Do not expose port 8001 directly to the public internet.
uvicorn goldar_wilor_api:app --host 127.0.0.1 --port 8001 --workers 1
```

Publish `/v1/hand-pose` and `/health` through an HTTPS reverse proxy on a
**separate, protected origin**. Set frontend
`NEXT_PUBLIC_WILOR_API_URL=https://YOUR_WILOR_ORIGIN` at build time. Use
origin allowlisting, reverse-proxy authentication/rate limiting, frame size
limits and request timeouts. Do not expose unauthenticated inference publicly.

This sidecar loads WiLoR and YOLO once, then accepts one compressed frame per
request. It returns one hand's 21 2D projected and 3D keypoints, plus camera
translation, focal length and inference time. Projection follows upstream
WiLoR demo. The client keeps the original Three.js ring renderer.

**Limitations:** CPU-only inference is not guaranteed real-time; network
latency and joint order/coordinate conventions require on-device validation.
The 2D projection assumes a pinhole camera with WiLoR's estimated focal
length. Real ring sizing requires calibration. No frames are stored.

Check WiLoR and MANO licensing before commercial deployment.
