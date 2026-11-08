"""Run a real object detector on the street photo and save boxes (normalised) for the CV shot."""
import json
from pathlib import Path

import torch
from PIL import Image
from transformers import pipeline

ROOT = Path(__file__).resolve().parent.parent
img = Image.open(ROOT / "public" / "photos" / "city_street.jpg").convert("RGB")
W, H = img.size
device = "mps" if torch.backends.mps.is_available() else "cpu"
det = pipeline("object-detection", model="facebook/detr-resnet-101", device=device)
res = det(img.resize((1280, 720)), threshold=0.7)
out = []
for r in res:
    b = r["box"]
    out.append({
        "label": r["label"],
        "score": round(float(r["score"]), 3),
        "x0": b["xmin"] / 1280, "y0": b["ymin"] / 720, "x1": b["xmax"] / 1280, "y1": b["ymax"] / 720,
    })
out.sort(key=lambda d: -(d["x1"] - d["x0"]) * (d["y1"] - d["y0"]))
(ROOT / "src" / "data" / "detections.json").write_text(json.dumps(out, indent=1))
for d in out:
    print(d["label"], d["score"], round(d["x0"], 3), round(d["y0"], 3), round(d["x1"], 3), round(d["y1"], 3))
