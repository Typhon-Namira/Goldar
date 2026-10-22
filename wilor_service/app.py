"""Goldar WiLoR inference sidecar. Run from the WiLoR repository root.

The model and YOLO detector load once at startup; one request runs at a time on
the small CPU instance. No raw frames are persisted.
"""
import asyncio
import io
import os
import time
from contextlib import asynccontextmanager

os.environ.setdefault("PYOPENGL_PLATFORM", "egl")
os.environ.setdefault("OMP_NUM_THREADS", "2")

import cv2
import numpy as np
import torch
from fastapi import FastAPI, File, HTTPException, Request, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from wilor.models import load_wilor
from wilor.datasets.vitdet_dataset import ViTDetDataset
from wilor.utils import recursive_to
from wilor.utils.renderer import cam_crop_to_full
from ultralytics import YOLO

MAX_BYTES = int(os.getenv("WILOR_MAX_FRAME_BYTES", "1000000"))
MAX_SIDE = int(os.getenv("WILOR_MAX_FRAME_SIDE", "1280"))
ORIGINS = [x.strip() for x in os.getenv("WILOR_CORS_ORIGINS", "").split(",") if x.strip()]
DEVICE = torch.device("cuda" if torch.cuda.is_available() else "cpu")
lock = asyncio.Lock()
state = {}

@asynccontextmanager
async def lifespan(app):
    torch.set_num_threads(int(os.getenv("WILOR_THREADS", "2")))
    model, cfg = load_wilor(
        checkpoint_path=os.getenv("WILOR_CHECKPOINT", "./pretrained_models/wilor_final.ckpt"),
        cfg_path=os.getenv("WILOR_CONFIG", "./pretrained_models/model_config.yaml"),
    )
    model.to(DEVICE).eval()
    detector = YOLO(os.getenv("WILOR_DETECTOR", "./pretrained_models/detector.pt")).to(DEVICE)
    state.update(model=model, cfg=cfg, detector=detector)
    yield
    state.clear()

app = FastAPI(title="Goldar WiLoR sidecar", lifespan=lifespan)
app.add_middleware(CORSMiddleware, allow_origins=ORIGINS, allow_methods=["GET", "POST"], allow_headers=["Content-Type"])

@app.get("/health")
def health():
    return {"ready": "model" in state, "device": str(DEVICE)}

def _infer(img):
    h, w = img.shape[:2]
    detections = state["detector"](img, conf=0.3, verbose=False)[0]
    candidates = []
    for det in detections:
        box = det.boxes.xyxy[0].detach().cpu().numpy().tolist()
        right = float(det.boxes.cls[0].item())
        score = float(det.boxes.conf[0].item())
        candidates.append((box, right, score))
    if not candidates:
        return {"detected": False, "hands": []}
    # One hand per frame limits CPU latency and memory pressure.
    box, right, score = max(candidates, key=lambda d: d[2])
    dataset = ViTDetDataset(state["cfg"], img, np.array([box]), np.array([right]), rescale_factor=2.0, fp16=False)
    batch = recursive_to(next(iter(torch.utils.data.DataLoader(dataset, batch_size=1, num_workers=0))), DEVICE)
    with torch.inference_mode():
        out = state["model"](batch)
    pred_cam = out["pred_cam"].clone()
    pred_cam[:, 1] *= 2 * batch["right"] - 1
    center, size, image_size = batch["box_center"].float(), batch["box_size"].float(), batch["img_size"].float()
    focal = state["cfg"].EXTRA.FOCAL_LENGTH / state["cfg"].MODEL.IMAGE_SIZE * image_size.max()
    camera_t = cam_crop_to_full(pred_cam, center, size, image_size, focal)[0].detach().cpu().numpy()
    joints = out["pred_keypoints_3d"][0].detach().cpu().numpy()
    joints[:, 0] *= (2 * right - 1)
    camera_joints = joints + camera_t[None, :]
    depth = np.maximum(camera_joints[:, 2], 1e-5)
    px = focal.item() * camera_joints[:, 0] / depth + w / 2
    py = focal.item() * camera_joints[:, 1] / depth + h / 2
    if not np.isfinite(camera_joints).all() or len(joints) != 21:
        raise ValueError("Invalid 3D hand joints from WiLoR")
    return {
        "detected": True,
        "hands": [{
            "side": "Right" if right >= 0.5 else "Left",
            "confidence": score,
            "landmarks": [{"x": float(x / w), "y": float(y / h), "z": float(z)} for x, y, z in zip(px, py, camera_joints[:, 2])],
            "worldLandmarks": [{"x": float(x), "y": float(y), "z": float(z)} for x, y, z in joints],
            "cameraTranslation": camera_t.tolist(),
            "focalLengthPx": float(focal.item()),
        }],
        "imageWidth": w, "imageHeight": h,
    }

@app.post("/v1/hand-pose")
async def hand_pose(request: Request, frame: UploadFile = File(...)):
    if frame.content_type not in ("image/jpeg", "image/png", "image/webp"):
        raise HTTPException(415, "JPEG, PNG or WebP required")
    if request.headers.get("content-length") and int(request.headers["content-length"]) > MAX_BYTES + 8192:
        raise HTTPException(413, "Frame too large")
    raw = await frame.read(MAX_BYTES + 1)
    if len(raw) > MAX_BYTES:
        raise HTTPException(413, "Frame too large")
    image = cv2.imdecode(np.frombuffer(raw, np.uint8), cv2.IMREAD_COLOR)
    if image is None or max(image.shape[:2]) > MAX_SIDE:
        raise HTTPException(422, "Invalid frame dimensions")
    if lock.locked():
        raise HTTPException(429, "Inference busy")
    async with lock:
        started = time.perf_counter()
        try:
            result = await asyncio.to_thread(_infer, image)
        except Exception:
            # Do not leak internal paths or checkpoint details to clients.
            raise HTTPException(500, "WiLoR inference failed")
        result["inferenceMs"] = round((time.perf_counter() - started) * 1000, 1)
        return result
