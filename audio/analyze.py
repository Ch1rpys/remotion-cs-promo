import sys
from pathlib import Path

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import numpy as np
import pyloudnorm as pyln
import soundfile as sf
from scipy import signal

ROOT = Path(__file__).resolve().parent.parent
path = sys.argv[1] if len(sys.argv) > 1 else str(ROOT / "public" / "audio" / "music.wav")
x, sr = sf.read(path, always_2d=True)
mono = x.mean(axis=1)
meter = pyln.Meter(sr)
print(f"duration {len(mono) / sr:.2f}s  LUFS {meter.integrated_loudness(x):.2f}  peak {20 * np.log10(np.abs(x).max()):.2f} dBFS")
bands = [(20, 60), (60, 250), (250, 1000), (1000, 4000), (4000, 16000)]
secs = [(0, 16), (16, 32), (32, 44), (44, 52), (52, 70), (70, 84), (84, 94), (94, 116), (116, 136), (136, 140), (140, 156), (156, 170), (170, 178), (178, 188)]
print("section      LUFS   " + "  ".join(f"{a}-{b}Hz".rjust(10) for a, b in bands))
for a, b in secs:
    seg = mono[int(a * sr):int(b * sr)]
    f, p = signal.welch(seg, sr, nperseg=8192)
    tot = p.sum()
    parts = [p[(f >= lo) & (f < hi)].sum() / tot for lo, hi in bands]
    l = meter.integrated_loudness(x[int(a * sr):int(b * sr)])
    print(f"{a:4d}-{b:4d}s  {l:6.1f}  " + "  ".join(f"{100 * q:9.1f}%" for q in parts))

f, t, S = signal.spectrogram(mono[::2], sr / 2, nperseg=2048, noverlap=1024)
plt.figure(figsize=(20, 6))
plt.pcolormesh(t, f, 10 * np.log10(S + 1e-12), shading="auto", vmin=-110, vmax=-30, cmap="magma")
plt.yscale("symlog", linthresh=200)
plt.ylim(20, 12000)
for s in range(0, 190, 4):
    plt.axvline(s, color="w", alpha=0.08)
plt.xlabel("s")
plt.tight_layout()
plt.savefig(ROOT / "audio" / "build" / "spectrogram.png", dpi=60)
env = np.sqrt(signal.convolve(mono ** 2, np.ones(2400) / 2400, mode="same"))[::480]
plt.figure(figsize=(20, 3))
plt.plot(np.arange(len(env)) * 480 / sr, 20 * np.log10(env + 1e-6))
plt.ylim(-60, 0)
for s in range(0, 190, 4):
    plt.axvline(s, color="k", alpha=0.1)
plt.tight_layout()
plt.savefig(ROOT / "audio" / "build" / "envelope.png", dpi=60)
