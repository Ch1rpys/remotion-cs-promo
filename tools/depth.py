"""Resize upscaled photos to 2560x1440 and estimate depth maps with Depth Anything V2."""
import sys
from pathlib import Path

import numpy as np
import torch
from PIL import Image, ImageFilter
from transformers import pipeline

ROOT = Path(__file__).resolve().parent.parent
UP = ROOT / "tools" / "up"
OUT = ROOT / "public" / "photos"
OUT.mkdir(parents=True, exist_ok=True)

names = sys.argv[1:] or [p.stem for p in sorted(UP.glob("*.png"))]
device = "mps" if torch.backends.mps.is_available() else "cpu"
print("device", device)
pipe = pipeline("depth-estimation", model="depth-anything/Depth-Anything-V2-Large-hf", device=device)

for n in names:
    img = Image.open(UP / f"{n}.png").convert("RGB")
    big = img.resize((2560, 1440), Image.LANCZOS)
    big.save(OUT / f"{n}.jpg", quality=93, subsampling=0)

    small = img.resize((1280, 720), Image.LANCZOS)
    res = pipe(small)
    d = np.array(res["predicted_depth"].squeeze().cpu().numpy(), dtype=np.float32)
    # Depth Anything outputs relative inverse depth (bigger = closer)
    lo, hi = np.percentile(d, 1), np.percentile(d, 99.5)
    d = np.clip((d - lo) / (hi - lo + 1e-6), 0, 1)
    dm = Image.fromarray((d * 255).astype(np.uint8)).resize((1280, 720), Image.BICUBIC)
    dm = dm.filter(ImageFilter.GaussianBlur(radius=2.5))
    dm.save(OUT / f"{n}_depth.png")
    print("done", n, d.shape)
