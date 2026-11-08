"""usage: python tools/sheet.py prefix [cols] [tile_width] -> out/stills/<prefix>_sheet.jpg"""
import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

prefix = sys.argv[1]
cols = int(sys.argv[2]) if len(sys.argv) > 2 else 3
tw = int(sys.argv[3]) if len(sys.argv) > 3 else 640
files = [f for f in Path("out/stills").glob(f"{prefix}_*.jpg") if not f.stem.endswith("sheet")]
files = sorted(files, key=lambda p: float(p.stem.split("_")[-1]))
ims = [Image.open(f) for f in files]
th = int(tw * 9 / 16)
rows = (len(ims) + cols - 1) // cols
sheet = Image.new("RGB", (cols * tw + (cols - 1) * 6, rows * th + (rows - 1) * 6), (40, 40, 40))
try:
    font = ImageFont.truetype("/System/Library/Fonts/Menlo.ttc", 20)
except Exception:
    font = ImageFont.load_default()
for i, (f, im) in enumerate(zip(files, ims)):
    im = im.resize((tw, th), Image.LANCZOS)
    x = (i % cols) * (tw + 6)
    y = (i // cols) * (th + 6)
    sheet.paste(im, (x, y))
    d = ImageDraw.Draw(sheet)
    label = f.stem.split("_")[-1] + "s"
    d.rectangle([x, y, x + 90, y + 28], fill=(0, 0, 0))
    d.text((x + 6, y + 3), label, fill=(255, 220, 90), font=font)
out = Path("out/stills") / f"{prefix}_sheet.jpg"
sheet.save(out, quality=85)
print(out)
