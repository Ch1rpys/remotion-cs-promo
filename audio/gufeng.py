#!/usr/bin/env python3
"""
墨染江南 · 中国古风器乐曲（约 4 分 10 秒）

72 BPM，4/4，74 小节。D 宫五声（D E F# A B），终副歌升全音转 E 宫。
古筝=Koto(GM107)、扬琴=Dulcimer(GM15)、弦乐=GM48、竖琴=GM46 经 FluidSynth 渲染；
竹笛、二胡、琵琶、堂鼓、板鼓、木鱼、小钗、大锣、编钟为 numpy 直接合成
（方法沿用 compose2.py：BLEP 振荡器 + SVF 滤波 + 卷积混响 + 前瞻限幅器）。

整曲无重复旋律：主歌一/二、预副歌一/二、副歌一/二/三、桥段一/二各不相同，
下方 MEL 断言两两互异；相同音高集合仅因共用五声音阶。
"""
import json
import math
import subprocess
from pathlib import Path

import mido
import numpy as np
import pedalboard as pb
import pyloudnorm as pyln
import soundfile as sf
from numba import njit
from scipy import signal

ROOT = Path(__file__).resolve().parent.parent
AUD = ROOT / "audio"
BUILD = AUD / "build"
BUILD.mkdir(exist_ok=True)
SF_GM = str(AUD / "sf" / "MuseScore_General.sf2")

SR = 48000
BPM = 72
BEAT = 60.0 / BPM
BAR = 4 * BEAT
NB = 74
END = NB * BAR          # 246.67 s
TOTAL = 250.0
N = int(TOTAL * SR)


def T(bar, beat=0.0):
    return bar * BAR + beat * BEAT


PC = {"C": 0, "C#": 1, "D": 2, "D#": 3, "E": 4, "F": 5, "F#": 6,
      "G": 7, "G#": 8, "A": 9, "A#": 10, "B": 11}


def m(s):
    return 12 * (int(s[-1]) + 1) + PC[s[:-1]]


def hz(midi):
    return 440.0 * 2 ** ((midi - 69) / 12)


# ----------------------------------------------------------------------------- 和声
CHORDS = {
    "D": ("D", (0, 4, 7)), "Bm": ("B", (0, 3, 7)), "G": ("G", (0, 4, 7)),
    "A": ("A", (0, 4, 7)), "Em": ("E", (0, 3, 7)),
    "E": ("E", (0, 4, 7)), "B": ("B", (0, 4, 7)), "C#m": ("C#", (0, 3, 7)),
}

PROG = (["D", "G", "D", "A"]                                   # 0-3    前奏
        + ["D", "Bm", "G", "A"] * 2                            # 4-11   主歌一
        + ["G", "Em", "A", "A"]                                # 12-15  预副歌一
        + ["D", "A", "Bm", "G", "D", "A", "G", "A"]            # 16-23  副歌一
        + ["D", "A"]                                           # 24-25  刮奏间奏
        + ["Bm", "G", "D", "A", "Bm", "G", "Em", "A"]          # 26-33  主歌二
        + ["G", "D", "Em", "A"]                                # 34-37  预副歌二
        + ["D", "G", "Bm", "A", "G", "D", "Em", "A"]           # 38-45  副歌二
        + ["Bm", "D", "G", "A", "Bm", "D", "Em", "A"]          # 46-53  桥段一 · 二胡
        + ["G", "D", "Em", "Bm", "G", "A", "D", "D"]           # 54-61  桥段二 · 竹笛
        + ["E", "B", "C#m", "A", "E", "B", "A", "B"]           # 62-69  终副歌（转 E 宫）
        + ["C#m", "A", "B", "E"])                              # 70-73  尾声
assert len(PROG) == NB

INTRO, V1, PC1, C1 = range(0, 4), range(4, 12), range(12, 16), range(16, 24)
LINK, V2, PC2, C2 = range(24, 26), range(26, 34), range(34, 38), range(38, 46)
B1, B2, C3, OUT = range(46, 54), range(54, 62), range(62, 70), range(70, 74)


def root_in(ch, lo, hi):
    r = PC[CHORDS[ch][0]]
    for x in range(lo, hi + 1):
        if x % 12 == r:
            return x
    raise ValueError


def tones(ch):
    r, iv = CHORDS[ch]
    return [(PC[r] + i) % 12 for i in iv]


def voicing(ch, center=60, n=4, spread=13):
    pcs = tones(ch)
    cands = [x for x in range(center - spread, center + spread + 1) if x % 12 in pcs]
    cands.sort(key=lambda x: abs(x - center))
    return sorted(cands[:n])


# ----------------------------------------------------------------------------- 旋律（每段独立写作）
MEL = {
    # 前奏 · 竹笛自由句（第 2-3 小节进入）
    "intro": [
        [],
        [],
        [(0, .5, "E5"), (.5, .5, "F#5"), (1, 1, "A5"), (2, 2, "F#5")],
        [(0, 2, "D5"), (2, 2, "A4")],
    ],
    # 主歌一 · 平起叙事
    "v1": [
        [(0, 1, "A4"), (1, 1, "B4"), (2, 2, "D5")],
        [(0, 1, "B4"), (1, 1, "A4"), (2, 1, "F#4"), (3, 1, "A4")],
        [(0, 1.5, "B4"), (1.5, .5, "A4"), (2, 2, "G4")],
        [(0, 1, "A4"), (1, 2, "F#4"), (3, 1, "E4")],
        [(0, .5, "E4"), (.5, .5, "F#4"), (1, 1, "A4"), (2, 1, "D5"), (3, 1, "B4")],
        [(0, 1, "B4"), (1, 1, "D5"), (2, 2, "A4")],
        [(0, 1, "A4"), (1, 1, "B4"), (2, 1, "D5"), (3, 1, "E5")],
        [(0, 1.5, "E4"), (1.5, .5, "C#4"), (2, 2, "E4")],
    ],
    # 预副歌一 · 上行推进
    "pc1": [
        [(0, 1, "B4"), (1, 1, "D5"), (2, 1, "E5"), (3, 1, "D5")],
        [(0, 1, "E5"), (1, 1, "B4"), (2, 2, "G4")],
        [(0, .5, "A4"), (.5, .5, "B4"), (1, .5, "C#5"), (1.5, .5, "D5"), (2, 2, "E5")],
        [(0, 2, "E5"), (2, 2, "A4")],
    ],
    # 副歌一 · 明亮齐奏
    "c1": [
        [(0, 1, "D5"), (1, .5, "D5"), (1.5, .5, "E5"), (2, 1, "F#5"), (3, 1, "E5")],
        [(0, 2, "E5"), (2, 1, "D5"), (3, 1, "B4")],
        [(0, 1, "B4"), (1, 1, "D5"), (2, 2, "F#5")],
        [(0, 1, "E5"), (1, 1, "D5"), (2, 1, "B4"), (3, 1, "A4")],
        [(0, 1, "A4"), (1, 1, "B4"), (2, 1, "D5"), (3, 1, "E5")],
        [(0, 2, "E5"), (2, 2, "C#5")],
        [(0, 1, "B4"), (1, 1, "A4"), (2, 2, "G4")],
        [(0, 1, "A4"), (1, 1, "B4"), (2, 1, "C#5"), (3, 1, "E5")],
    ],
    # 间奏 · 古筝刮奏（16 分跑动）
    "link": [
        [(0, .25, "F#4"), (.25, .25, "A4"), (.5, .25, "B4"), (.75, .25, "D5"),
         (1, .25, "E5"), (1.25, .25, "F#5"), (1.5, .5, "A5"), (2, .5, "G5"), (2.5, 1.5, "F#5")],
        [(0, .25, "E5"), (.25, .25, "D5"), (.5, .25, "C#5"), (.75, .25, "B4"),
         (1, .25, "A4"), (1.25, .25, "B4"), (1.5, .5, "C#5"), (2, 2, "E4")],
    ],
    # 主歌二 · 换头换尾，音区整体低于主歌一的走向
    "v2": [
        [(0, 1, "F#4"), (1, 1, "B4"), (2, 2, "A4")],
        [(0, .5, "A4"), (.5, .5, "B4"), (1, 1, "D5"), (2, 1, "B4"), (3, 1, "A4")],
        [(0, 1, "A4"), (1, 1, "F#4"), (2, 2, "E4")],
        [(0, 1, "E4"), (1, 1, "F#4"), (2, 2, "A4")],
        [(0, 1, "D5"), (1, 1, "B4"), (2, 1, "A4"), (3, 1, "F#4")],
        [(0, 1, "E5"), (1, 1, "D5"), (2, 2, "B4")],
        [(0, 1, "B4"), (1, 1, "G4"), (2, 2, "E4")],
        [(0, 2, "A4"), (2, 1, "B4"), (3, 1, "C#5")],
    ],
    # 预副歌二 · 长音悬停后冲刺
    "pc2": [
        [(0, 1.5, "D5"), (1.5, .5, "E5"), (2, 1, "D5"), (3, 1, "B4")],
        [(0, 1, "A4"), (1, 1, "B4"), (2, 2, "A4")],
        [(0, 1, "G4"), (1, 1, "A4"), (2, 1, "B4"), (3, 1, "D5")],
        [(0, .5, "E5"), (.5, .5, "D5"), (1, .5, "C#5"), (1.5, .5, "D5"), (2, 2, "E5")],
    ],
    # 副歌二 · 高起下行，句尾花腔
    "c2": [
        [(0, 1.5, "F#5"), (1.5, .5, "E5"), (2, 1, "D5"), (3, 1, "E5")],
        [(0, 1, "D5"), (1, 1, "B4"), (2, 2, "A4")],
        [(0, .5, "B4"), (.5, .5, "A4"), (1, .5, "B4"), (1.5, .5, "D5"), (2, 2, "F#5")],
        [(0, 1, "E5"), (1, 1, "C#5"), (2, 2, "A4")],
        [(0, 1, "B4"), (1, 1, "D5"), (2, 1, "E5"), (3, 1, "G5")],
        [(0, 2, "F#5"), (2, 1, "E5"), (3, 1, "D5")],
        [(0, 1, "E5"), (1, 1, "B4"), (2, 2, "G4")],
        [(0, 1, "A4"), (1, 1, "B4"), (2, 1, "C#5"), (3, 1, "E5")],
    ],
    # 桥段一 · 二胡独奏，装饰音与长弓
    "b1": [
        [(0, 1, "D5"), (1, .5, "D5"), (1.5, .5, "E5"), (2, 1, "F#5"), (3, 1, "E5")],
        [(0, 1, "F#5"), (1, 1, "A5"), (2, 2, "F#5")],
        [(0, .5, "G5"), (.5, .5, "F#5"), (1, .5, "E5"), (1.5, .5, "D5"), (2, 1, "E5"), (3, 1, "D5")],
        [(0, 2, "E5"), (2, 2, "C#5")],
        [(0, 1, "F#5"), (1, 1, "E5"), (2, 1, "D5"), (3, 1, "B4")],
        [(0, 1, "A4"), (1, 1, "B4"), (2, 2, "D5")],
        [(0, 1, "E5"), (1, 1, "D5"), (2, 1, "B4"), (3, 1, "G4")],
        [(0, 3, "A4"), (3, 1, "B4")],
    ],
    # 桥段二 · 竹笛应答，冲最高音后回落蓄力
    "b2": [
        [(0, 1, "B4"), (1, 1, "D5"), (2, 1, "G5"), (3, 1, "F#5")],
        [(0, 2, "F#5"), (2, 1, "E5"), (3, 1, "D5")],
        [(0, .5, "E5"), (.5, .5, "F#5"), (1, 1, "G5"), (2, 2, "B5")],
        [(0, 1, "A5"), (1, 1, "F#5"), (2, 2, "D5")],
        [(0, 1, "D5"), (1, 1, "E5"), (2, 1, "G5"), (3, 1, "A5")],
        [(0, 2, "A5"), (2, 2, "E5")],
        [(0, 1, "F#5"), (1, 1, "E5"), (2, 2, "D5")],
        [(0, 2, "D5"), (2, 1, "E5"), (3, 1, "F#5")],
    ],
    # 终副歌 · E 宫，全曲最高潮
    "c3": [
        [(0, 1, "G#5"), (1, 1, "B5"), (2, 1.5, "C#6"), (3.5, .5, "B5")],
        [(0, 2, "F#5"), (2, 1, "B5"), (3, 1, "A5")],
        [(0, 1, "G#5"), (1, 1, "E5"), (2, 2, "C#5")],
        [(0, 1, "A5"), (1, 1, "C#6"), (2, 2, "E5")],
        [(0, 1, "E5"), (1, 1, "F#5"), (2, 1, "G#5"), (3, 1, "B5")],
        [(0, 3, "B5"), (3, 1, "A5")],
        [(0, 1, "C#6"), (1, 1, "B5"), (2, 2, "A5")],
        [(0, 1, "G#5"), (1, 1, "F#5"), (2, 2, "E5")],
    ],
    # 尾声 · 远笛回声（第 71-73 小节）
    "outro": [
        [],
        [(0, 2, "B4"), (2, 2, "G#4")],
        [(0, 1.5, "C#5"), (1.5, .5, "B4"), (2, 2, "A4")],
        [(0, 1, "F#4"), (1, 1, "G#4"), (2, 2, "B4")],
        [(0, 4, "E4")],
    ][:4],
}

# 整曲旋律两两互异（核心要求：主歌/副歌/桥段各遍不复用）
_seen = {}
for _k, _bars in MEL.items():
    _sig = tuple(tuple(x) for x in _bars)
    assert _sig not in _seen.values(), f"旋律重复: {_k}"
    _seen[_k] = _sig


def mel_events(b0, bars, octave=0):
    out = []
    for k, bar in enumerate(bars):
        for bt, du, nn in bar:
            out.append((T(b0) + (k * 4 + bt) * BEAT, du * BEAT, m(nn) + 12 * octave))
    return out


rng = np.random.default_rng(20261004)


def vel(base, spread=5):
    return int(np.clip(base + rng.integers(-spread, spread + 1), 1, 127))


# ----------------------------------------------------------------------------- DSP（沿用 compose2）
def stereo(n=N):
    return np.zeros((2, n), dtype=np.float64)


def add(dst, src, t0, gain=1.0):
    i0 = int(round(t0 * SR))
    if src.ndim == 1:
        src = np.vstack([src, src])
    if i0 < 0:
        src = src[:, -i0:]
        i0 = 0
    if i0 >= dst.shape[1]:
        return
    n = min(src.shape[1], dst.shape[1] - i0)
    dst[:, i0:i0 + n] += gain * src[:, :n]


def pan(mono, p):
    a = (np.clip(p, -1, 1) + 1) * np.pi / 4
    return np.vstack([mono * np.cos(a), mono * np.sin(a)])


def phase_acc(freq, n, ph0=0.0):
    f = np.broadcast_to(np.asarray(freq, dtype=np.float64), (n,))
    return (ph0 + np.cumsum(f) / SR) % 1.0, f / SR


def _blep(ph, dt):
    y = np.zeros_like(ph)
    m1 = ph < dt
    t = ph[m1] / dt[m1]
    y[m1] = t + t - t * t - 1.0
    m2 = ph > 1.0 - dt
    t = (ph[m2] - 1.0) / dt[m2]
    y[m2] = t * t + t + t + 1.0
    return y


def saw(freq, n, ph0=0.0):
    ph, dt = phase_acc(freq, n, ph0)
    return 2.0 * ph - 1.0 - _blep(ph, dt)


def square(freq, n, ph0=0.0):
    ph, dt = phase_acc(freq, n, ph0)
    ph2 = (ph + 0.5) % 1.0
    return (2 * ph - 1 - _blep(ph, dt)) - (2 * ph2 - 1 - _blep(ph2, dt))


def sine(freq, n, ph0=0.0):
    ph, _ = phase_acc(freq, n, ph0)
    return np.sin(2 * np.pi * ph)


def noise(n, seed=None):
    return np.random.default_rng(seed).standard_normal(n)


def tt(n):
    return np.arange(n) / SR


def adsr(dur, a=0.005, d=0.1, s=0.8, r=0.2):
    n_on = max(2, int(dur * SR))
    n_r = max(2, int(r * SR))
    t = tt(n_on)
    a = max(a, 1e-4)
    att = np.sin(np.clip(t / a, 0, 1) * np.pi / 2) ** 2
    dec = s + (1 - s) * np.exp(-np.maximum(t - a, 0) / max(d, 1e-4) * 3)
    env_on = np.where(t < a, att, dec)
    env_r = env_on[-1] * np.exp(-tt(n_r) / r * 5)
    return np.concatenate([env_on, env_r])


@njit(cache=True)
def _svf(x, fc, q, mode, sr):
    n = x.shape[0]
    y = np.empty(n)
    ic1 = 0.0
    ic2 = 0.0
    k = 1.0 / q
    for i in range(n):
        f = fc[i]
        if f > 0.45 * sr:
            f = 0.45 * sr
        if f < 12.0:
            f = 12.0
        g = math.tan(math.pi * f / sr)
        a1 = 1.0 / (1.0 + g * (g + k))
        a2 = g * a1
        a3 = g * a2
        v3 = x[i] - ic2
        v1 = a1 * ic1 + a2 * v3
        v2 = ic2 + a2 * ic1 + a3 * v3
        ic1 = 2.0 * v1 - ic1
        ic2 = 2.0 * v2 - ic2
        if mode == 0:
            y[i] = v2
        elif mode == 1:
            y[i] = v1
        else:
            y[i] = x[i] - k * v1 - v2
    return y


def _filt(x, fc, q, mode):
    x = np.ascontiguousarray(x, dtype=np.float64)
    fcs = np.ascontiguousarray(np.broadcast_to(np.asarray(fc, dtype=np.float64), x.shape[-1:]))
    if x.ndim == 2:
        return np.vstack([_svf(x[0], fcs, q, mode, float(SR)), _svf(x[1], fcs, q, mode, float(SR))])
    return _svf(x, fcs, q, mode, float(SR))


def lp(x, fc, q=0.707):
    return _filt(x, fc, q, 0)


def bp(x, fc, q=1.0):
    return _filt(x, fc, q, 1)


def hp(x, fc, q=0.707):
    return _filt(x, fc, q, 2)


def butter(x, fc, kind="high", order=2):
    sos = signal.butter(order, fc, btype=kind, fs=SR, output="sos")
    return signal.sosfilt(sos, x, axis=-1)


def fade_edges(y, fi=0.002, fo=0.01):
    n = y.shape[-1]
    a = min(int(fi * SR), n // 2)
    b = min(int(fo * SR), n // 2)
    w = np.ones(n)
    if a > 0:
        w[:a] = np.linspace(0, 1, a)
    if b > 0:
        w[-b:] = np.linspace(1, 0, b)
    return y * w


def fit(x, n):
    if x.shape[-1] >= n:
        return x[..., :n]
    pad = [(0, 0)] * (x.ndim - 1) + [(0, n - x.shape[-1])]
    return np.pad(x, pad)


def sub_note(freq, dur, drive=1.3):
    env = adsr(dur, 0.02, 0.5, 0.9, 0.12)
    n = len(env)
    y = np.tanh(drive * sine(freq, n)) / np.tanh(drive)
    return y * env


def pluck(freq, dur, cutoff=2000.0, bright=3000.0, seed=0, decay=0.2):
    env = adsr(dur, 0.002, decay, 0.0, 0.06)
    n = len(env)
    rs = np.random.default_rng(seed)
    w = 0.65 * saw(freq, n, rs.random()) + 0.35 * square(freq * 1.002, n, rs.random())
    fc = cutoff + bright * np.exp(-tt(n) / 0.08)
    return lp(w, fc, 1.4) * env


def supersaw(freq, dur, voices=7, detune=0.2, width=0.9, a=0.01, d=0.3, s=0.8, r=0.4,
             cutoff=4000.0, cutoff_env=0.0, env_tau=0.25, q=0.8, seed=0):
    env = adsr(dur, a, d, s, r)
    n = len(env)
    rs = np.random.default_rng(seed)
    L = np.zeros(n)
    R = np.zeros(n)
    half = max(1, (voices - 1) / 2)
    for v in range(voices):
        x = (v - (voices - 1) / 2) / half
        f = freq * 2 ** (x * detune / 12)
        w = saw(f, n, rs.random())
        g = 1.0 if abs(x) < 1e-6 else 0.6
        ang = (x * width + 1) * np.pi / 4
        L += w * g * np.cos(ang)
        R += w * g * np.sin(ang)
    norm = 1.0 / math.sqrt(voices)
    t = tt(n)
    fc = cutoff + cutoff_env * np.exp(-t / env_tau)
    out = lp(np.vstack([L * norm, R * norm]), fc, q)
    return out * env


# ----------------------------------------------------------------------------- 民族乐器合成
def erhu_note(freq, dur, seed=0):
    """二胡：双锯齿 + 琴筒共振峰 + 延迟揉弦 + 上滑音起音。"""
    env = adsr(dur, 0.09, 0.3, 0.9, 0.28)
    n = len(env)
    t = tt(n)
    rs = np.random.default_rng(seed)
    vib = 1 + 0.013 * np.sin(2 * np.pi * 5.7 * t + rs.random() * 6.28) * np.clip(t / 0.28, 0, 1)
    slide = 0.9 if dur > 0.4 else 0.35
    f = freq * vib * 2 ** (-slide * np.exp(-t / 0.05))
    ph, _ = phase_acc(f, n, rs.random())
    src = saw(f, n, rs.random()) + 0.55 * saw(f * 1.0045, n, rs.random())
    body = (bp(src, 950, 3.2) + 0.55 * bp(src, 1550, 4.0) + 0.28 * bp(src, 2800, 5.0)
            + 0.35 * lp(src, 900, 0.8))
    bow = bp(noise(n, seed + 1), 3200, 1.2) * np.exp(-t / 0.03) * 0.05
    y = np.tanh(2.0 * body + bow)
    return fade_edges(lp(y, 3400, 0.85) * env, 0.002, 0.02)


def dizi_note(freq, dur, seed=0):
    """竹笛：泛音列 + 气声 + 吐音起振 + 轻揉弦。"""
    env = adsr(dur, 0.045, 0.15, 0.85, 0.22)
    n = len(env)
    t = tt(n)
    rs = np.random.default_rng(seed)
    vib = 1 + 0.006 * np.sin(2 * np.pi * 5.3 * t + rs.random() * 6.28) * np.clip(t / 0.22, 0, 1)
    f = freq * vib * 2 ** (-0.35 * np.exp(-t / 0.035))
    ph, _ = phase_acc(f, n, rs.random())
    y = (np.sin(2 * np.pi * ph) + 0.42 * np.sin(4 * np.pi * ph + 0.15)
         + 0.16 * np.sin(6 * np.pi * ph) + 0.06 * np.sin(8 * np.pi * ph))
    breath = bp(noise(n, seed + 2), np.clip(freq * 3.0, 800, 3800), 1.1) * 0.07
    chiff = bp(noise(n, seed + 3), 2600, 1.4) * np.exp(-t / 0.018) * 0.16
    return fade_edges(lp(y + breath + chiff, 5200, 0.8) * env, 0.002, 0.015)


def pipa_note(freq, dur, seed=0):
    """琵琶：明亮拨弦 + 指板敲击感。"""
    env = adsr(dur, 0.002, 0.28, 0.0, 0.08)
    n = len(env)
    rs = np.random.default_rng(seed)
    w = 0.7 * saw(freq, n, rs.random()) + 0.4 * square(freq * 1.003, n, rs.random())
    fc = 1400 + 4200 * np.exp(-tt(n) / 0.045)
    click = hp(noise(n, seed + 1), 3000) * np.exp(-tt(n) / 0.004) * 0.3
    return fade_edges(lp(w, fc, 1.3) * env + click * env[:n], 0.001, 0.01)


# ----------------------------------------------------------------------------- 打击乐合成
def tanggu(seed=0, f0=92.0):
    """堂鼓（大鼓）。"""
    n = int(0.75 * SR)
    t = tt(n)
    f = f0 - 26 * np.exp(-t / 0.03)
    body = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t / 0.26)
    skin = bp(noise(n, seed), 750, 0.9) * np.exp(-t / 0.014) * 0.45
    return fade_edges(np.tanh(1.9 * (body + skin)), 0.0005, 0.03)


def bangu(seed=0):
    """板鼓（高音小鼓）。"""
    n = int(0.22 * SR)
    t = tt(n)
    f = 235 - 60 * np.exp(-t / 0.02)
    body = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t / 0.07)
    knock = bp(noise(n, seed), 1900, 1.2) * np.exp(-t / 0.008) * 0.5
    return fade_edges(np.tanh(1.7 * (body + knock)), 0.0005, 0.02)


def woodblock(seed=0):
    n = int(0.1 * SR)
    t = tt(n)
    tone = np.sin(2 * np.pi * 1080 * t) * np.exp(-t / 0.018)
    tk = bp(noise(n, seed), 2400, 1.5) * np.exp(-t / 0.006) * 0.6
    return fade_edges(tone * 0.8 + tk, 0.0003, 0.006)


def chabo(seed=0):
    """小钗。"""
    n = int(0.16 * SR)
    t = tt(n)
    rs = np.random.default_rng(seed)
    metal = sum(square(f * (1 + rs.uniform(-0.01, 0.01)), n, rs.random())
                for f in (205.3, 369.6, 540.0, 800.0))
    y = hp(metal * 0.35 + noise(n, seed) * 0.65, 6800) * np.exp(-t / 0.07)
    return fade_edges(np.tanh(1.4 * y) * 0.7, 0.0003, 0.008)


def gong(seed=0):
    """大锣：非谐分音 + 拍频晃动。"""
    n = int(4.5 * SR)
    t = tt(n)
    y = np.zeros(n)
    rs = np.random.default_rng(seed)
    parts = [(72, 1.0, 3.8), (108, 0.6, 3.0), (161, 0.42, 2.4), (222, 0.3, 1.8),
             (297, 0.2, 1.3), (389, 0.12, 0.9)]
    for f, g, tau in parts:
        w = 1 + 0.0025 * np.sin(2 * np.pi * rs.uniform(3.5, 5.5) * t)
        y += g * np.sin(2 * np.pi * f * w * t + rs.random() * 6.28) * np.exp(-t / tau)
    strike = bp(noise(n, seed + 1), 600, 0.8) * np.exp(-t / 0.05) * 0.4
    return fade_edges(lp(y + strike, 2400, 0.85) * 0.5, 0.002, 0.3)


def bell(freqs, dur=3.0, gains=None):
    """编钟。"""
    n = int(dur * SR)
    t = tt(n)
    y = np.zeros(n)
    gains = gains or [1.0] * len(freqs)
    for f, g in zip(freqs, gains):
        for ratio, pg, tau in ((1.0, 1.0, 1.6), (2.0, 0.32, 0.7), (2.76, 0.18, 0.4), (5.4, 0.07, 0.18)):
            y += g * pg * np.sin(2 * np.pi * f * ratio * t) * np.exp(-t / tau)
    return fade_edges(y * 0.22, 0.001, 0.2)


# ----------------------------------------------------------------------------- 音效
def riser_s(dur, seed=0):
    n = int(dur * SR)
    t = tt(n)
    p = t / dur
    fc = 250 * (36 ** p)
    L = bp(noise(n, seed), fc, 2.0)
    R = bp(noise(n, seed + 1), fc * 1.05, 2.0)
    out = np.vstack([L, R]) * (p ** 2.0)
    return fade_edges(out, 0.15, 0.004)


def whoosh_s(dur=0.9, seed=0, direction=1.0):
    n = int(dur * SR)
    t = tt(n)
    p = t / dur
    bell = np.sin(np.pi * p) ** 2.5
    fc = 350 + 3200 * np.sin(np.pi * p) ** 1.5
    y = bp(noise(n, seed), fc, 1.3) * bell
    pp = direction * (p * 1.6 - 0.8)
    a = (pp + 1) * np.pi / 4
    return np.vstack([y * np.cos(a), y * np.sin(a)])


def sub_drop(dur=2.2):
    n = int(dur * SR)
    t = tt(n)
    p = t / dur
    f = 40 + 44 * (0.02 ** p)
    y = np.tanh(1.6 * np.sin(2 * np.pi * np.cumsum(f) / SR)) * np.exp(-t / 0.9)
    return fade_edges(y, 0.002, 0.25)


def crash_soft(seed=0, length=2.8):
    """柔化钹。"""
    n = int(length * SR)
    t = tt(n)
    out = []
    for ch in range(2):
        rs = np.random.default_rng(seed * 7 + ch)
        metal = sum(square(f * rs.uniform(2.2, 4.6), n, rs.random())
                    for f in (205.3, 304.4, 522.7, 800.0))
        y = hp(metal * 0.1 + noise(n, seed * 13 + ch) * 0.8, 4200)
        y = y * (np.exp(-t / 1.1) * 0.7 + np.exp(-t / 0.09) * 0.5)
        out.append(y)
    return fade_edges(np.vstack(out) * 0.4, 0.0005, 0.2)


def rev_cymbal(dur=2.0, seed=0):
    c = crash_soft(seed, dur)[:, ::-1]
    t = tt(c.shape[1])
    return c * (t / dur) ** 1.4


def wind(dur, seed=0, cutoff=650.0):
    n = int(dur * SR)
    t = tt(n)
    L = bp(noise(n, seed), cutoff * np.clip(1 + 0.35 * np.sin(2 * np.pi * 0.07 * t), 0.4, 1.6), 0.6)
    R = bp(noise(n, seed + 1), cutoff * np.clip(1 + 0.35 * np.sin(2 * np.pi * 0.05 * t + 1.7), 0.4, 1.6), 0.6)
    swell = 0.5 + 0.5 * np.sin(2 * np.pi * 0.11 * t + 0.9)
    return np.vstack([L, R]) * (0.4 + 0.6 * swell)


# ----------------------------------------------------------------------------- 混响 / 限幅（沿用 compose2）
def make_ir(rt60=3.0, predelay=0.02, seed=0, bright=1.0):
    length = rt60 * 1.3
    n = int(length * SR)
    t = tt(n)
    rs = np.random.default_rng(seed)
    out = np.zeros((2, n))
    bands = [(20, 350, rt60 * 1.15), (350, 1800, rt60), (1800, 6000, rt60 * 0.7 * bright), (6000, 20000, rt60 * 0.38 * bright)]
    for ch in range(2):
        nz = rs.standard_normal(n)
        acc = np.zeros(n)
        for lo, hi, rt in bands:
            sos = signal.butter(3, [lo, min(hi, SR / 2 * 0.95)], btype="band", fs=SR, output="sos")
            acc += signal.sosfilt(sos, nz) * np.exp(-6.9078 * t / rt)
        acc *= np.minimum(1, t / 0.04)
        out[ch] = acc
    pd = int(predelay * SR)
    out = np.pad(out, ((0, 0), (pd, 0)))[:, :n]
    out /= np.sqrt(np.sum(out ** 2) / 2)
    return out


def convolve(x, ir):
    return np.vstack([signal.fftconvolve(x[c], ir[c])[: x.shape[1]] for c in range(2)])


@njit(cache=True)
def _limiter_gain(peak, ceiling, look, rel_coef):
    n = peak.shape[0]
    greq = np.empty(n)
    for i in range(n):
        p = peak[i]
        greq[i] = 1.0 if p <= ceiling else ceiling / p
    mn = np.empty(n)
    dq = np.empty(n, dtype=np.int64)
    head = 0
    tail = 0
    j = 0
    for i in range(n):
        lim = min(n - 1, i + look)
        while j <= lim:
            while tail > head and greq[dq[tail - 1]] >= greq[j]:
                tail -= 1
            dq[tail] = j
            tail += 1
            j += 1
        while dq[head] < i:
            head += 1
        mn[i] = greq[dq[head]]
    avg = np.empty(n)
    acc = 0.0
    for i in range(n):
        acc += mn[i]
        if i >= look:
            acc -= mn[i - look]
            avg[i] = acc / look
        else:
            avg[i] = acc / (i + 1)
    out = np.empty(n)
    g = 1.0
    for i in range(n):
        target = avg[i]
        if target < g:
            g = target
        else:
            g = g + (target - g) * (1.0 - rel_coef)
        out[i] = g
    return out


def limit(x, ceiling_db=-1.0, look_ms=5.0, release_ms=120.0):
    ceiling = 10 ** (ceiling_db / 20)
    peak = np.max(np.abs(x), axis=0).astype(np.float64)
    look = int(look_ms * 1e-3 * SR)
    rel = math.exp(-1.0 / (release_ms * 1e-3 * SR))
    g = _limiter_gain(peak, ceiling, look, rel)
    return x * g, g


# ----------------------------------------------------------------------------- FluidSynth 渲染
def render_sf(name, notes, program, bank=0, sfont=SF_GM, cc=None, gain=0.5, pedal=None):
    path_mid = BUILD / f"{name}.mid"
    path_wav = BUILD / f"{name}.wav"
    mid = mido.MidiFile(ticks_per_beat=960)
    tr = mido.MidiTrack()
    mid.tracks.append(tr)
    tr.append(mido.MetaMessage("set_tempo", tempo=int(60e6 / BPM), time=0))

    def tick(s):
        return max(0, int(round(s / BEAT * 960)))

    ev = [
        (0, 0, mido.Message("control_change", control=0, value=bank, channel=0)),
        (0, 1, mido.Message("control_change", control=32, value=0, channel=0)),
        (0, 2, mido.Message("program_change", program=program, channel=0)),
        (0, 3, mido.Message("control_change", control=7, value=110, channel=0)),
        (0, 4, mido.Message("control_change", control=11, value=127, channel=0)),
        (0, 5, mido.Message("control_change", control=91, value=0, channel=0)),
        (0, 6, mido.Message("control_change", control=93, value=0, channel=0)),
    ]
    last = 0
    for st, du, p, v in notes:
        a, b = tick(st), tick(st + du)
        ev.append((a, 20, mido.Message("note_on", note=int(p), velocity=int(np.clip(v, 1, 127)), channel=0)))
        ev.append((b, 10, mido.Message("note_off", note=int(p), velocity=0, channel=0)))
        last = max(last, b)
    for st, c, val in cc or []:
        ev.append((tick(st), 15, mido.Message("control_change", control=c, value=int(np.clip(val, 0, 127)), channel=0)))
    for st, val in pedal or []:
        ev.append((tick(st), 5 if val == 0 else 16, mido.Message("control_change", control=64, value=val, channel=0)))
    ev.sort(key=lambda e: (e[0], e[1]))
    cur = 0
    for tk, _, msg in ev:
        msg.time = tk - cur
        cur = tk
        tr.append(msg)
    tr.append(mido.MetaMessage("end_of_track", time=tick(3.0)))
    mid.save(path_mid)
    subprocess.run(["fluidsynth", "-ni", "-q", "-g", str(gain), "-r", str(SR), "-R", "0", "-C", "0",
                    "-o", "synth.polyphony=1024", "-T", "wav", "-O", "float", "-F", str(path_wav), sfont, str(path_mid)],
                   check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    data, sr = sf.read(str(path_wav), always_2d=True)
    assert sr == SR
    data = data.T.astype(np.float64)
    out = stereo()
    n = min(N, data.shape[1])
    out[:, :n] = data[:, :n]
    return out


def cc_ramp(t0, t1, v0, v1, steps=None):
    steps = steps or max(2, int((t1 - t0) * 4))
    return [(t0 + (t1 - t0) * i / steps, 11, v0 + (v1 - v0) * i / steps) for i in range(steps + 1)]


# ----------------------------------------------------------------------------- 五声音阶工具
PENT = {"D": (2, 4, 6, 9, 11), "E": (4, 6, 8, 11, 1)}
SC_D, SC_E = set(PENT["D"]), set(PENT["E"])


def pent_notes(lo, hi, key="D"):
    sc = PENT[key]
    return [x for x in range(lo, hi + 1) if x % 12 in sc]


def gliss_events(t0, lo, hi, key="D", step=0.125, dur_scale=1.6, vel_base=70):
    """刮奏：沿五声音阶快速上行。"""
    seq = pent_notes(lo, hi, key)
    return [(t0 + i * step * BEAT, step * BEAT * dur_scale, p, vel_base + int(40 * i / max(1, len(seq) - 1)))
            for i, p in enumerate(seq)]


# ============================================================================= 各声部
def build_guzheng():
    """GM Koto + 合成拨弦层。"""
    notes = []
    out = stereo()

    def n(t, du, p, v):
        notes.append((t, du, p, v))

    for b in range(NB):
        ch = PROG[b]
        r = root_in(ch, 50, 61)
        third = CHORDS[ch][1][1]
        if b in INTRO or b in V1:
            pat = [0, 7, 12, 12 + third, 19, 12 + third, 12, 7]
            for i, iv in enumerate(pat):
                n(T(b, i * 0.5), 0.9, r + iv, vel(62 if b in INTRO else 66, 4))
        elif b in V2:
            pat = [12, 7, 12, 19, 12, 7, 12, 12 + third]
            for i, iv in enumerate(pat):
                n(T(b, i * 0.5), 0.85, r + iv, vel(64, 4))
        elif b in PC1 or b in PC2:
            for i, iv in enumerate([12, 19, 24, 19] * 2):
                n(T(b, i * 0.5), 0.8, r + iv, vel(64, 4))
        elif b in C1 or b in C2:
            for i, iv in enumerate([12, 12, 19, 24] * 2):
                n(T(b, i * 0.5), 0.7, r + iv, vel(72, 4))
            if b % 2 == 1:
                seq = pent_notes(r + 12, r + 31, "D")[:6]
                for i, p in enumerate(seq):
                    n(T(b, 3 + i * 0.25 * 0.5), 0.4, p, vel(64, 4))
        elif b in B1:
            for i, iv in enumerate([0, 7, 12]):
                n(T(b, i * 1.2), 1.4, r + iv, vel(52, 3))
        elif b in B2:
            for i, iv in enumerate([12, 19, 24, 19, 12, 19, 12, 7]):
                n(T(b, i * 0.5), 0.8, r + iv, vel(58 + int((b - 54) * 1.8), 4))
        elif b in C3:
            for i, iv in enumerate([12, 12, 19, 24] * 2):
                n(T(b, i * 0.5), 0.7, r + iv, vel(76, 4))
        elif b in OUT:
            for i, iv in enumerate([0, 7, 12, 19]):
                n(T(b, i * 1.0), 1.6, r + iv, vel(50, 3))

    # 刮奏：进副歌一 / 间奏本体 / 进桥段一 / 进终副歌
    for b, lo, hi, key in ((15, 50, 78, "D"), (24, 50, 81, "D"), (45, 52, 80, "D"), (61, 52, 82, "E")):
        for t, du, p, v in gliss_events(T(b, 2.0), lo, hi, key):
            n(t, du, p, v)
    # 间奏旋律（16 分跑动）由古筝演奏
    for t, du, p in mel_events(24, MEL["link"]):
        n(t, du, p, vel(74, 4))
    # 合成拨弦层：加强颗粒感
    for t, du, p, v in notes:
        if rng.random() < 0.55:
            add(out, pan(pluck(hz(p), du * 0.9, cutoff=1500, bright=2600, seed=int(t * 7) % 9999, decay=0.18),
                         rng.uniform(-0.25, 0.25)), t, 0.16)
    gzm = render_sf("gz_koto", notes, 107, 0, gain=0.62)
    return gzm + out * 0.9


def build_yangqin():
    notes = []

    def n(t, du, p, v):
        notes.append((t, du, p, v))

    for b in INTRO:
        if b in (0, 2):
            for t, du, p, v in gliss_events(T(b, 2.0), 62, 86, "D", step=0.25, vel_base=44):
                n(t, du, p, v)
    for b in list(PC1) + list(PC2) + list(C1) + list(C2):
        ch = PROG[b]
        r = root_in(ch, 50, 61)
        third = CHORDS[ch][1][1]
        pat = [19, 19 + third, 24, 19 + third] * 2
        v = 50 if b in PC1 or b in PC2 else 58
        for i, iv in enumerate(pat):
            n(T(b, i * 0.5), 0.6, r + iv, vel(v, 4))
    for b in B2:
        ch = PROG[b]
        r = root_in(ch, 50, 61)
        for i, p in enumerate(pent_notes(r + 12, r + 24, "D")[:4]):
            n(T(b, i * 1.0), 0.9, p, vel(46, 3))
    # 终副歌：扬琴加八度华彩
    for b in C3:
        ch = PROG[b]
        r = root_in(ch, 50, 61)
        for i, p in enumerate([r + 24, r + 28, r + 31, r + 28] * 2):
            n(T(b, i * 0.5), 0.55, p, vel(60, 4))
    for b in OUT:
        if b == 70:
            for t, du, p, v in gliss_events(T(b, 1.0), 74, 50, "E", step=0.2, vel_base=40):
                n(t, du, p, v)
    return render_sf("yq_dulcimer", notes, 15, 0, gain=0.5)


def build_strings():
    notes, cc = [], []

    def chord_bar(b, center, v, n=4, dur_bars=1.0):
        for p in voicing(PROG[b], center, n):
            notes.append((T(b), BAR * dur_bars + 0.05, p, vel(v, 3)))

    for b in PC1:
        chord_bar(b, 57, 62)
    cc += cc_ramp(T(12), T(15.6), 48, 78)
    for b in C1:
        chord_bar(b, 60, 74, 4)
    cc += cc_ramp(T(16), T(23.6), 80, 88)
    for b in PC2:
        chord_bar(b, 58, 66)
    cc += cc_ramp(T(34), T(37.6), 50, 84)
    for b in C2:
        chord_bar(b, 60, 76, 5)
    cc += cc_ramp(T(38), T(45.6), 82, 88)
    for b in B1:
        chord_bar(b, 55 if b < 50 else 57, 58)
    cc += cc_ramp(T(46), T(52), 44, 66)
    for b in B2:
        chord_bar(b, 57 if b < 58 else 60, 64, 5)
    cc += cc_ramp(T(54), T(61.6), 46, 96)
    for b in C3:
        chord_bar(b, 61, 86, 5)
    cc += cc_ramp(T(62), T(69.5), 92, 104)
    for b in OUT:
        chord_bar(b, 59, 40)
    cc += cc_ramp(T(70), T(73.9), 42, 16)
    return render_sf("strings_gf", notes, 48, 0, cc=cc, gain=0.5)


def build_harp():
    notes = []
    for t, du, p, v in gliss_events(T(3, 2.0), 50, 74, "D", step=0.15, vel_base=48):
        notes.append((t, du, p, v))
    for b in OUT:
        ch = PROG[b]
        r = root_in(ch, 50, 61)
        for i, p in enumerate([r, r + 7, r + 12, r + 19]):
            notes.append((T(b, i * 0.5), 1.6, p, vel(44, 3)))
    for b in (62,):
        for t, du, p, v in gliss_events(T(61, 3.0), 52, 80, "E", step=0.1, vel_base=52):
            notes.append((t, du, p, v))
    return render_sf("harp_gf", notes, 46, 0, gain=0.5)


def build_leads():
    dizi, erhu = stereo(), stereo()

    def play(dst, events, fn, g, base_seed, oct=0):
        for i, (t, du, p) in enumerate(events):
            add(dst, pan(fn(hz(p + 12 * oct), du * 0.96, base_seed + i), rng.uniform(-0.12, 0.12)), t, g)

    # 前奏 · 远笛
    play(dizi, mel_events(2, MEL["intro"][2:]), dizi_note, 0.34, 10)
    # 主歌一 · 竹笛低回
    play(dizi, mel_events(4, MEL["v1"]), dizi_note, 0.46, 100)
    # 预副歌一 · 二胡接唱
    play(erhu, mel_events(12, MEL["pc1"]), erhu_note, 0.5, 200)
    # 副歌一 · 笛主奏 + 二胡低八度
    play(dizi, mel_events(16, MEL["c1"]), dizi_note, 0.58, 300)
    play(erhu, mel_events(16, MEL["c1"]), erhu_note, 0.4, 350, oct=-1)
    # 主歌二 · 二胡主奏
    play(erhu, mel_events(26, MEL["v2"]), erhu_note, 0.64, 400)
    # 预副歌二 · 竹笛
    play(dizi, mel_events(34, MEL["pc2"]), dizi_note, 0.5, 500)
    # 副歌二 · 二胡主奏 + 笛子花腔应答
    play(erhu, mel_events(38, MEL["c2"]), erhu_note, 0.58, 600)
    for k, (bar, start) in enumerate(((39, 3.0), (41, 3.0), (43, 3.0))):
        seq = pent_notes(m("A4"), m("E5"), "D")[:4]
        for i, p in enumerate(seq):
            add(dizi, pan(dizi_note(hz(p), 0.22, 700 + k * 10 + i), 0.3), T(bar, start + i * 0.25), 0.3)
    # 桥段一 · 二胡独奏
    play(erhu, mel_events(46, MEL["b1"]), erhu_note, 0.56, 800)
    # 桥段二 · 竹笛独奏
    play(dizi, mel_events(54, MEL["b2"]), dizi_note, 0.58, 900)
    # 终副歌 · 笛 + 二胡同度，扬琴在 build_yangqin 加八度
    play(dizi, mel_events(62, MEL["c3"]), dizi_note, 0.6, 1000)
    play(erhu, mel_events(62, MEL["c3"]), erhu_note, 0.5, 1050)
    play(erhu, mel_events(62, MEL["c3"]), erhu_note, 0.3, 1100, oct=-1)
    # 尾声 · 远笛回声
    play(dizi, mel_events(71, MEL["outro"][1:]), dizi_note, 0.3, 1200)
    return dizi, erhu


def build_pipa():
    out = stereo()
    for b in V2:
        ch = PROG[b]
        r = root_in(ch, 50, 61)
        if b % 2 == 1:
            for i in range(5):  # 轮指
                add(out, pan(pipa_note(hz(r + 19), 0.14, b * 13 + i), 0.2), T(b, 2.5 + i * 0.125), 0.4)
        add(out, pan(pipa_note(hz(r + 12), 0.3, b * 7), -0.15), T(b, 0.5), 0.42)
        add(out, pan(pipa_note(hz(r + 19), 0.3, b * 7 + 1), -0.15), T(b, 2.5), 0.36)
    for b in B1:
        ch = PROG[b]
        r = root_in(ch, 50, 61)
        add(out, pan(pipa_note(hz(r + 12), 0.5, b * 11), 0.1), T(b), 0.3)
    for b in C3:
        ch = PROG[b]
        r = root_in(ch, 50, 61)
        for bt in (1.5, 3.5):
            add(out, pan(pipa_note(hz(r + 19), 0.24, b * 17 + int(bt * 8)), -0.2), T(b, bt), 0.4)
    return out


def build_bass():
    out = stereo()
    for b in range(NB):
        ch = PROG[b]
        r = root_in(ch, 26, 37)
        if b in PC1 or b in PC2:
            add(out, sub_note(hz(r), BAR - 0.02, 1.0), T(b), 0.4)
        elif b in C1 or b in C2 or b in LINK:
            add(out, sub_note(hz(r), BAR - 0.02, 1.2), T(b), 0.55)
        elif b in B1:
            if b % 2 == 0:
                add(out, sub_note(hz(r), BAR * 2 - 0.02, 0.9), T(b), 0.3)
        elif b in B2:
            add(out, sub_note(hz(r), BAR - 0.02, 1.1), T(b), 0.35 + 0.1 * (b - 54) / 8)
        elif b in C3:
            add(out, sub_note(hz(r), BAR - 0.02, 1.4), T(b), 0.6)
        elif b in OUT and b < 73:
            add(out, sub_note(hz(r), BAR - 0.02, 0.8), T(b), 0.25)
    return out


def build_perc():
    tang, ban, wood, chb, gong_s, bells = (stereo() for _ in range(6))
    TG = [tanggu(i) for i in range(3)]
    BG = [bangu(i) for i in range(3)]
    WB = [woodblock(i) for i in range(4)]
    CB = [chabo(i) for i in range(3)]

    def TG_(t, g=1.0):
        add(tang, pan(TG[int(t * 7) % 3], -0.1), t, g)

    def BG_(t, g=1.0):
        add(ban, pan(BG[int(t * 5) % 3], 0.12), t, g)

    def WB_(t, g=1.0):
        add(wood, pan(WB[int(t * 11) % 4], 0.28), t, g)

    def CB_(t, g=1.0):
        add(chb, pan(CB[int(t * 3) % 3], -0.3), t, g)

    for b in range(NB):
        if b in V1:
            TG_(T(b), 0.42)
            if b % 2 == 1:
                TG_(T(b, 3.5), 0.26)
        elif b in V2:
            TG_(T(b), 0.4)
            for bt in (0.5, 1.5, 2.5, 3.5):
                WB_(T(b, bt), 0.3)
        elif b in PC1 or b in PC2:
            TG_(T(b), 0.6)
            TG_(T(b, 2), 0.5)
            for bt in (0.5, 1.5, 2.5, 3.5):
                WB_(T(b, bt), 0.4)
            if b in (15, 37):
                for i in range(4):
                    TG_(T(b, 3 + i * 0.25), 0.4 + 0.14 * i)
        elif b in C1 or b in C2:
            TG_(T(b), 0.85)
            TG_(T(b, 1.5), 0.5)
            TG_(T(b, 2.5), 0.62)
            if b % 4 == 3:
                TG_(T(b, 3.5), 0.5)
            BG_(T(b, 1), 0.5)
            BG_(T(b, 3), 0.5)
            for bt in (0.5, 1.5, 2.5, 3.5):
                CB_(T(b, bt), 0.3)
            for bt in (1.5, 3.5):
                WB_(T(b, bt), 0.5)
        elif b in LINK:
            TG_(T(b), 0.6)
            TG_(T(b, 2), 0.55)
        elif b in B1:
            if b % 2 == 0:
                TG_(T(b), 0.3)
        elif b in B2:
            if b < 58:
                TG_(T(b), 0.42)
            elif b < 60:
                TG_(T(b), 0.6)
                TG_(T(b, 2), 0.5)
            elif b == 60:
                for bt in (0, 1, 2, 3):
                    TG_(T(b, bt), 0.6)
            else:
                for i in range(16):
                    TG_(T(b) + i * BEAT / 4, 0.4 + 0.4 * i / 15)
                BG_(T(b, 1), 0.6)
                BG_(T(b, 3), 0.6)
        elif b in C3:
            TG_(T(b), 0.95)
            TG_(T(b, 1.5), 0.55)
            TG_(T(b, 2.5), 0.7)
            if b % 2 == 1:
                TG_(T(b, 3.5), 0.55)
            BG_(T(b, 1), 0.58)
            BG_(T(b, 3), 0.58)
            for i in range(16):
                WB_(T(b) + i * BEAT / 4, 0.3 if i % 2 else 0.46)
            for bt in (0.5, 1.5, 2.5, 3.5):
                CB_(T(b, bt), 0.34)
        elif b in OUT:
            if b == 70:
                TG_(T(b), 0.35)

    # 大锣：副歌起句
    for t in (T(16), T(38), T(62)):
        add(gong_s, pan(gong(int(t) % 97), 0.05), t, 0.8)
    # 编钟：句尾点缀
    for t, ns in ((T(23, 2), ["D5", "A5", "D6"]), (T(45, 2), ["D5", "F#5", "A5"]),
                  (T(69, 2), ["E5", "B5", "E6"]), (T(0), ["A3", "E4"]), (T(73), ["E4", "B4", "E5"])):
        for k, nn in enumerate(ns):
            add(bells, pan(bell([hz(m(nn))], 2.8), -0.15 + 0.15 * k), t + k * 0.06, 0.5)
    return tang, ban, wood, chb, gong_s, bells


def build_fx():
    fx = stereo()
    # 风声：前奏与尾声
    add(fx, wind(18.0, 1, 520), 0.0, 0.5)
    add(fx, wind(14.0, 9, 480), T(71) - 3.0, 0.45)
    # 推进 riser
    for t0, dur in ((T(14), BAR * 2), (T(36), BAR * 2), (T(59), BAR * 3)):
        add(fx, riser_s(dur, int(t0)), t0, 0.42)
    add(fx, rev_cymbal(2.0, 5), T(60), 0.4)
    # 段落 whoosh
    for k, t in enumerate((T(16), T(26), T(38), T(46), T(54), T(62))):
        add(fx, whoosh_s(0.8, k, 1 if k % 2 == 0 else -1), t - 0.45, 0.4)
    # 副歌起句冲击（锣鼓之外的低频落点）
    for t in (T(16), T(38), T(62)):
        add(fx, pan(sub_drop(2.0), 0.0), t, 0.4)
    # 副歌一后收拢
    add(fx, whoosh_s(1.2, 21, -1), T(24) - 0.6, 0.35)
    # 终副歌钹
    add(fx, crash_soft(3, 31), T(62), 0.45)
    add(fx, crash_soft(3, 32), T(64), 0.3)
    return fx


# ============================================================================= 混音
def active_rms(x):
    mono = np.mean(x, axis=0)
    blk = 4800
    nb = len(mono) // blk
    r = np.sqrt(np.mean(mono[: nb * blk].reshape(nb, blk) ** 2, axis=1) + 1e-12)
    act = r[r > r.max() * 0.05]
    return float(np.sqrt(np.mean(act ** 2))) if len(act) else 1e-9


def main():
    stems = {}
    print("渲染音源（FluidSynth）…", flush=True)
    stems["guzheng"] = build_guzheng()
    stems["yangqin"] = build_yangqin()
    stems["strings"] = build_strings()
    stems["harp"] = build_harp()
    print("合成声部…", flush=True)
    stems["dizi"], stems["erhu"] = build_leads()
    stems["pipa"] = build_pipa()
    stems["sub"] = build_bass()
    tang, ban, wood, chb, gon, bells = build_perc()
    stems.update(tanggu=tang, bangu=ban, wood=wood, chabo=chb, gong=gon, bells=bells)
    stems["fx"] = build_fx()

    LEVEL = {
        "tanggu": -5.0, "bangu": -9.0, "wood": -16.5, "chabo": -17.0, "gong": -9.5, "bells": -13.0,
        "sub": -11.0, "guzheng": -8.0, "yangqin": -14.5, "strings": -11.5, "harp": -16.0,
        "dizi": -7.0, "erhu": -7.5, "pipa": -13.5, "fx": -9.0,
    }
    SEND_HALL = {"dizi": 0.42, "erhu": 0.4, "guzheng": 0.3, "pipa": 0.26, "yangqin": 0.3, "strings": 0.38,
                 "harp": 0.32, "bells": 0.38, "gong": 0.42, "wood": 0.14, "chabo": 0.2, "bangu": 0.2,
                 "tanggu": 0.12, "fx": 0.3, "sub": 0.04}
    SEND_PLATE = {"bells": 0.2, "chabo": 0.16, "bangu": 0.14, "wood": 0.12}

    print("混音…", flush=True)
    hall_ir = make_ir(2.8, 0.03, 1)
    plate_ir = make_ir(1.2, 0.01, 2, bright=1.3)
    dry, hall_in, plate_in = stereo(), stereo(), stereo()
    for name, x in stems.items():
        r = active_rms(x)
        y = x * (10 ** (LEVEL[name] / 20) / max(r, 1e-9) * 0.1)
        if name in ("dizi", "erhu", "guzheng", "strings", "harp"):
            y = butter(y, 90, "high", 2)
        if name in ("wood", "chabo", "bells"):
            y = butter(y, 350, "high", 2)
        dry += y
        hall_in += y * SEND_HALL.get(name, 0.0)
        plate_in += y * SEND_PLATE.get(name, 0.0)
    hall_in = butter(hall_in, 170, "high", 2)
    wet = convolve(hall_in, hall_ir) * 0.85 + convolve(plate_in, plate_ir) * 0.7
    mix = butter(dry + wet, 24, "high", 2)

    meter = pyln.Meter(SR)
    mix = mix * 10 ** ((-20.0 - meter.integrated_loudness(mix.T)) / 20)
    glue = pb.Pedalboard([
        pb.LowShelfFilter(cutoff_frequency_hz=70, gain_db=-1.0, q=0.7),
        pb.PeakFilter(cutoff_frequency_hz=300, gain_db=-1.5, q=0.8),
        pb.PeakFilter(cutoff_frequency_hz=3000, gain_db=0.8, q=0.9),
        pb.HighShelfFilter(cutoff_frequency_hz=10000, gain_db=1.5, q=0.7),
        pb.Compressor(threshold_db=-16, ratio=1.8, attack_ms=30, release_ms=250),
    ])
    out = glue(mix.astype(np.float32), SR).astype(np.float64)
    target = -14.0
    for _ in range(3):
        lufs = meter.integrated_loudness(out.T)
        out = out * 10 ** ((target - lufs) / 20)
        out, g = limit(out, -1.0, 5.0, 140.0)
    gr = 20 * np.log10(np.maximum(g, 1e-6))
    print(f"limiter: max GR {gr.min():.1f} dB, >3dB GR {np.mean(gr < -3) * 100:.2f}%")

    fade = int(3.0 * SR)
    end = int((END + 2.8) * SR)
    out[:, end - fade:end] *= np.linspace(1, 0, fade) ** 2
    out = out[:, :end]
    dst = BUILD / "gufeng.wav"
    sf.write(str(dst), out.T, SR, subtype="PCM_24")
    lufs2 = meter.integrated_loudness(out.T.astype(np.float64))
    print(f"时长 {out.shape[1] / SR:.1f}s（{out.shape[1] / SR / 60:.0f}分{out.shape[1] / SR % 60:.0f}秒）  "
          f"integrated {lufs2:.2f} LUFS  peak {20 * np.log10(np.max(np.abs(out)) + 1e-9):.2f} dBFS")

    secs = [("前奏", 0, 4), ("主歌一", 4, 12), ("预副歌一", 12, 16), ("副歌一", 16, 24), ("间奏", 24, 26),
            ("主歌二", 26, 34), ("预副歌二", 34, 38), ("副歌二", 38, 46), ("桥一·二胡", 46, 54),
            ("桥二·竹笛", 54, 62), ("终副歌·E调", 62, 70), ("尾声", 70, 74)]
    meta = {"title": "墨染江南", "bpm": BPM, "bars": NB, "sr": SR, "sections": []}
    for nm, b0, b1 in secs:
        seg = out[:, int(T(b0) * SR):int(T(b1) * SR)].T.astype(np.float64)
        l = meter.integrated_loudness(seg)
        print(f"  {nm:　<6} {T(b0):6.1f}-{T(b1):6.1f}s  {l:6.1f} LUFS")
        meta["sections"].append({"name": nm, "bar": [b0, b1], "sec": [round(T(b0), 2), round(T(b1), 2)]})
    (BUILD / "gufeng_meta.json").write_text(json.dumps(meta, ensure_ascii=False, indent=1))

    try:
        import matplotlib
        matplotlib.use("Agg")
        import matplotlib.pyplot as plt
        mono = out.mean(axis=0)
        f, t, S = signal.spectrogram(mono[::2], SR / 2, nperseg=2048, noverlap=1024)
        plt.figure(figsize=(20, 6))
        plt.pcolormesh(t, f, 10 * np.log10(S + 1e-12), shading="auto", vmin=-110, vmax=-30, cmap="magma")
        plt.yscale("symlog", linthresh=200)
        plt.ylim(20, 12000)
        for nm, b0, b1 in secs:
            plt.axvline(T(b0), color="w", alpha=0.25)
        plt.xlabel("s")
        plt.tight_layout()
        plt.savefig(BUILD / "gufeng_spectrogram.png", dpi=60)
        env = np.sqrt(signal.convolve(mono ** 2, np.ones(2400) / 2400, mode="same"))[::480]
        plt.figure(figsize=(20, 3))
        plt.plot(np.arange(len(env)) * 480 / SR, 20 * np.log10(env + 1e-6))
        plt.ylim(-60, 0)
        for nm, b0, b1 in secs:
            plt.axvline(T(b0), color="k", alpha=0.2)
        plt.tight_layout()
        plt.savefig(BUILD / "gufeng_envelope.png", dpi=60)
    except Exception as e:  # noqa: BLE001
        print("绘图跳过:", e)
    print("wrote", dst)


if __name__ == "__main__":
    main()
