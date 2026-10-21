"""Isolated, consent-only WiLoR still-image CPU benchmark.

Run only on a trusted workstation/EC2 in a private WiLoR checkout after
obtaining required weights and MANO files under their respective licenses.
No files are transmitted or stored by this script.
"""
from __future__ import annotations

import argparse
import json
import os
import sys
import time
from pathlib import Path


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--wilor-dir", type=Path, required=True)
    parser.add_argument("--image", type=Path, required=True)
    parser.add_argument("--iterations", type=int, default=5)
    args = parser.parse_args()
    if not 1 <= args.iterations <= 100:
        parser.error("iterations must be between 1 and 100")
    root = args.wilor_dir.resolve(strict=True)
    img = args.image.resolve(strict=True)
    for rel in ("pretrained_models/detector.pt",
                "pretrained_models/wilor_final.ckpt",
                "pretrained_models/model_config.yaml",
                "mano_data/MANO_RIGHT.pkl"):
        if not (root / rel).is_file():
            parser.error(f"missing required private dependency: {rel}")
    if img.suffix.lower() not in (".jpg", ".jpeg", ".png"):
        parser.error("image must be JPG or PNG")

    import cv2
    import numpy as np
    import torch

    torch.set_num_threads(1)
    device = torch.device("cpu")
    sys.path.insert(0, str(root))
    os.chdir(root)  # reference code expects weight paths relative to WiLoR
    from ultralytics import YOLO
    from wilor.models import load_wilor
    from wilor.datasets.vitdet_dataset import ViTDetDataset
    from wilor.utils import recursive_to

    start = time.perf_counter()
    model, cfg = load_wilor(checkpoint_path=str(root / "pretrained_models/wilor_final.ckpt"),
                            cfg_path=str(root / "pretrained_models/model_config.yaml"))
    model = model.to(device).eval()
    detector = YOLO(str(root / "pretrained_models/detector.pt")).to(device)
    loading_s = time.perf_counter() - start
    image = cv2.imread(str(img), cv2.IMREAD_COLOR)
    if image is None:
        parser.error("could not decode image")
    timings_ms = []
    detected_hands = []
    with torch.inference_mode():
        for _ in range(args.iterations):
            t0 = time.perf_counter()
            result = detector(image, conf=0.3, verbose=False)[0]
            boxes = []
            sides = []
            for det in result:
                data = det.boxes.xyxy[0].detach().cpu().numpy()
                boxes.append(data.tolist())
                sides.append(float(det.boxes.cls[0].detach().cpu().item()))
            if boxes:
                dataset = ViTDetDataset(cfg, image, np.asarray(boxes),
                                        np.asarray(sides), rescale_factor=2.0)
                loader = torch.utils.data.DataLoader(dataset, batch_size=1,
                                                      shuffle=False, num_workers=0)
                for batch in loader:
                    _ = model(recursive_to(batch, device))
            timings_ms.append((time.perf_counter()-t0)*1000)
            detected_hands.append(len(boxes))
    ordered = sorted(timings_ms)
    p95 = ordered[max(0, int(0.95 * (len(ordered)-1)))]
    print(json.dumps({
        "device": "cpu", "threads": 1,
        "image_px": [int(image.shape[1]), int(image.shape[0])],
        "model_load_s": round(loading_s,3),
        "sample_count": len(timings_ms),
        "p50_ms": round(ordered[len(ordered)//2],2),
        "p95_ms": round(p95,2),
        "min_ms": round(ordered[0],2),
        "max_ms": round(ordered[-1],2),
        "detected_hands_each_iteration": detected_hands,
        "note": "Measured local still-image detector+WiLoR inference, not video FPS."
    }, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
