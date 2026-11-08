#!/usr/bin/env python3
"""
计算机科学与技术 · 宣传片配乐

120 BPM, A minor, 102 bars (204 s). One bar = 2 s, so every visual cut lands on a beat.
Sampled instruments are rendered through FluidSynth; synths, drums and sound design are
synthesised here, then everything is mixed and mastered to public/audio/music.wav.
"""
import json
import math
import subprocess
import sys
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
DATA = ROOT / "src" / "data"
DATA.mkdir(parents=True, exist_ok=True)
SF_GM = str(AUD / "sf" / "MuseScore_General.sf2")
SF_PIANO = str(AUD / "sf" / "SalamanderGrandPiano-SF2-V3+20200602" / "SalamanderGrandPiano-V3+20200602.sf2")

SR = 48000
BPM = 120
BEAT = 60.0 / BPM
BAR = 4 * BEAT
TOTAL = 206.0
N = int(TOTAL * SR)


def T(bar, beat=0.0):
    return bar * BAR + beat * BEAT


PC = {"C": 0, "C#": 1, "Db": 1, "D": 2, "D#": 3, "Eb": 3, "E": 4, "F": 5, "F#": 6,
      "Gb": 6, "G": 7, "G#": 8, "Ab": 8, "A": 9, "A#": 10, "Bb": 10, "B": 11}


def m(s):
    return 12 * (int(s[-1]) + 1) + PC[s[:-1]]


def hz(midi):
    return 440.0 * 2 ** ((midi - 69) / 12)


# ----------------------------------------------------------------------------- harmony
CHORDS = {
    "Am": ("A", (0, 3, 7)),
    "F": ("F", (0, 4, 7)),
    "C": ("C", (0, 4, 7)),
    "G": ("G", (0, 4, 7)),
    "E": ("E", (0, 4, 7)),
    "Em": ("E", (0, 3, 7)),
    "Dm": ("D", (0, 3, 7)),
}

PROG = (["Am", "Am", "F", "F", "C", "C", "G", "G"]      # 0-7   prologue
        + ["Am", "F", "C", "G"] * 3                     # 8-19  chapter 1
        + ["F", "E"]                                    # 20-21 build
        + ["Am", "F", "C", "G"]                         # 22-25 drop 1
        + ["F", "G"]                                    # 26-27 quote
        + ["Am", "F", "C", "G"] * 3                     # 28-39 algorithms
        + ["F", "E"]                                    # 40-41 build
        + ["Am", "F", "C", "G", "Am"]                   # 42-46 globe
        + ["F", "C", "G", "Am"] * 2                     # 47-54 systems
        + ["Dm", "Dm", "E"]                             # 55-57 wind down
        + ["F", "G", "Em", "Am", "F", "G", "Am", "Am"]  # 58-65 interlude
        + ["Dm", "E"]                                   # 66-67
        + ["F", "E"]                                    # 68-69 build
        + ["Am", "F", "C", "G"] * 2                     # 70-77 drop 2
        + ["Am", "F", "C", "G", "Am", "F", "G", "G"]    # 78-85 timeline (1936 … 2026)
        + ["C"]                                         # 86    "会是你"
        + ["Am", "F", "G"]                              # 87-89 hello future
        + ["C", "F", "G", "C", "C"]                     # 90-94 title
        + ["C", "F", "G", "Em", "Am", "F", "C"])        # 95-101 credits
assert len(PROG) == 102, len(PROG)


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


# ----------------------------------------------------------------------------- DSP helpers
rng = np.random.default_rng(20260929)


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


# ----------------------------------------------------------------------------- synth voices
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


def pluck(freq, dur, cutoff=2000.0, bright=3000.0, seed=0, decay=0.2):
    env = adsr(dur, 0.002, decay, 0.0, 0.06)
    n = len(env)
    rs = np.random.default_rng(seed)
    w = 0.65 * saw(freq, n, rs.random()) + 0.35 * square(freq * 1.002, n, rs.random())
    fc = cutoff + bright * np.exp(-tt(n) / 0.08)
    return lp(w, fc, 1.4) * env


def sub_note(freq, dur, drive=1.6):
    env = adsr(dur, 0.006, 0.5, 0.9, 0.06)
    n = len(env)
    y = np.tanh(drive * sine(freq, n)) / np.tanh(drive)
    return y * env


def midbass(freq, dur, seed=0):
    env = adsr(dur, 0.003, 0.12, 0.55, 0.04)
    n = len(env)
    rs = np.random.default_rng(seed)
    w = saw(freq, n, rs.random()) * 0.7 + saw(freq * 1.004, n, rs.random()) * 0.5
    fc = 260 + 900 * np.exp(-tt(n) / 0.07)
    return np.tanh(1.4 * lp(w, fc, 1.1)) * env


def fit(x, n):
    if x.shape[-1] >= n:
        return x[..., :n]
    pad = [(0, 0)] * (x.ndim - 1) + [(0, n - x.shape[-1])]
    return np.pad(x, pad)


def braam(root, dur=3.6, seed=0):
    n = int((dur + 0.5) * SR)
    t = tt(n)
    out = stereo(n)
    for k, iv in enumerate((0, 7, 12, 19)):
        f = hz(root + iv)
        s = supersaw(f, dur, voices=5, detune=0.35, width=0.8, a=0.06, d=1.2, s=0.5, r=0.5,
                     cutoff=180, cutoff_env=0, q=1.1, seed=seed + k)
        out += fit(s, n) * (1.0 if iv < 12 else 0.5)
    fc = 160 + 2600 * (1 - np.exp(-t / 0.07)) * np.exp(-t / 0.9)
    out = lp(out, fc, 1.3)
    out = np.tanh(3.0 * out) * 0.8
    out += 0.7 * fit(sub_note(hz(root - 12), dur), n)
    return fade_edges(out, 0.004, 0.3)


# ----------------------------------------------------------------------------- drums & fx
def kick_s(seed=0, length=0.55, f_end=47.0, punch=1.0, decay=0.28):
    n = int(length * SR)
    t = tt(n)
    f = f_end + 160 * np.exp(-t / 0.026) + 40 * np.exp(-t / 0.12)
    body = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t / decay)
    click = hp(noise(n, seed) * np.exp(-t / 0.004), 1800) * 0.3 * punch
    y = np.tanh(2.0 * (body + click))
    return fade_edges(y, 0.0005, 0.02)


def trailer_kick(seed=0):
    n = int(1.8 * SR)
    t = tt(n)
    f = 36 + 120 * np.exp(-t / 0.05) + 30 * np.exp(-t / 0.3)
    body = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t / 0.75)
    thump = lp(noise(n, seed) * np.exp(-t / 0.06), 900, 0.7) * 0.8
    y = np.tanh(2.4 * (body + thump))
    return fade_edges(y, 0.0005, 0.1)


def snare_s(seed=0):
    n = int(0.5 * SR)
    t = tt(n)
    f1 = 185 + 70 * np.exp(-t / 0.015)
    f2 = 330 + 90 * np.exp(-t / 0.015)
    tone = (0.6 * np.sin(2 * np.pi * np.cumsum(f1) / SR) + 0.3 * np.sin(2 * np.pi * np.cumsum(f2) / SR)) * np.exp(-t / 0.06)
    nz = noise(n, seed)
    crack = bp(nz, 4200, 0.55) * np.exp(-t / 0.15) + hp(nz, 2500) * np.exp(-t / 0.04) * 0.6
    y = np.tanh(1.6 * (0.9 * tone + 1.1 * crack))
    return fade_edges(y, 0.0005, 0.03)


def clap_s(seed=0):
    n = int(0.55 * SR)
    t = tt(n)
    nz = noise(n, seed)
    env = np.zeros(n)
    for k, d in enumerate((0.0, 0.010, 0.021, 0.033)):
        i = int(d * SR)
        env[i:] += np.exp(-(t[: n - i]) / (0.006 if k < 3 else 0.13)) * (0.8 if k < 3 else 1.0)
    y = bp(nz * env, 1300, 0.9) * 2.2
    return fade_edges(np.tanh(y), 0.0005, 0.03)


METAL = np.array([205.3, 304.4, 369.6, 522.7, 540.0, 800.0])


def hat_s(open_=False, seed=0):
    n = int((0.45 if open_ else 0.09) * SR)
    t = tt(n)
    rs = np.random.default_rng(seed)
    metal = sum(square(f * 1.8 * (1 + rs.uniform(-0.01, 0.01)), n, rs.random()) for f in METAL)
    y = hp(bp(metal * 0.4 + noise(n, seed) * 0.6, 9500, 0.7), 7000)
    y *= np.exp(-t / (0.16 if open_ else 0.022))
    return fade_edges(y, 0.0003, 0.01)


def tom_s(f0=110.0, seed=0, length=0.8):
    n = int(length * SR)
    t = tt(n)
    f = f0 + f0 * 0.6 * np.exp(-t / 0.04)
    y = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t / 0.32)
    y += lp(noise(n, seed) * np.exp(-t / 0.03), 3000) * 0.25
    return fade_edges(np.tanh(1.8 * y), 0.0005, 0.03)


def crash_s(seed=0, length=3.2):
    n = int(length * SR)
    t = tt(n)
    out = []
    for ch in range(2):
        rs = np.random.default_rng(seed * 7 + ch)
        metal = sum(square(f * rs.uniform(2.2, 4.8), n, rs.random()) for f in np.concatenate([METAL, METAL * 1.37]))
        y = hp(metal * 0.12 + noise(n, seed * 13 + ch) * 0.9, 3500)
        y = y * (np.exp(-t / 0.9) * 0.8 + np.exp(-t / 0.08) * 0.6)
        out.append(y)
    return fade_edges(np.vstack(out), 0.0005, 0.2)


def sub_drop(dur=2.4):
    n = int(dur * SR)
    t = tt(n)
    p = t / dur
    f = 26 + 50 * (0.02 ** p)
    y = np.tanh(1.8 * np.sin(2 * np.pi * np.cumsum(f) / SR)) * np.exp(-t / 0.9)
    return fade_edges(y, 0.002, 0.3)


def impact_s(size=1.0, seed=0):
    k = trailer_kick(seed)
    sd = sub_drop(2.6)
    n = max(len(k), len(sd), int(3.2 * SR))
    y = stereo(n)
    add(y, k, 0, 1.0)
    add(y, sd, 0, 0.8 * size)
    t = tt(int(0.9 * SR))
    burst = lp(noise(len(t), seed + 3) * np.exp(-t / 0.18), 1400, 0.8)
    add(y, pan(burst, -0.3), 0, 0.6)
    add(y, pan(lp(noise(len(t), seed + 4) * np.exp(-t / 0.18), 1400, 0.8), 0.3), 0, 0.6)
    add(y, crash_s(seed + 9, 3.2), 0, 0.45 * size)
    return y


def riser_s(dur, seed=0, pitch_root=m("A3")):
    n = int(dur * SR)
    t = tt(n)
    p = t / dur
    fc = 250 * (36 ** p)
    L = bp(noise(n, seed), fc, 2.2)
    R = bp(noise(n, seed + 1), fc * 1.05, 2.2)
    amp = p ** 2.2
    f = hz(pitch_root) * 2 ** (2 * p ** 1.5)
    tone = saw(f, n, 0.1) + 0.6 * saw(f * 1.498, n, 0.4) + 0.5 * saw(f * 2.003, n, 0.7)
    tone = lp(tone, 300 + 7000 * p ** 2, 1.2) * (p ** 3) * 0.25
    out = np.vstack([L * amp + tone, R * amp + tone])
    return fade_edges(out, 0.2, 0.004)


def whoosh_s(dur=0.9, seed=0, direction=1.0):
    n = int(dur * SR)
    t = tt(n)
    p = t / dur
    bell = np.sin(np.pi * p) ** 2.5
    fc = 350 + 3800 * np.sin(np.pi * p) ** 1.5
    y = bp(noise(n, seed), fc, 1.3) * bell
    pp = direction * (p * 1.6 - 0.8)
    a = (pp + 1) * np.pi / 4
    return np.vstack([y * np.cos(a), y * np.sin(a)])


def rev_cymbal(dur=2.2, seed=0):
    c = crash_s(seed, dur)[:, ::-1]
    t = tt(c.shape[1])
    return c * (t / dur) ** 1.5


def downlifter(dur=4.0, seed=0):
    n = int(dur * SR)
    t = tt(n)
    p = t / dur
    fc = 9000 * (0.03 ** p)
    y = np.vstack([bp(noise(n, seed), fc, 1.8), bp(noise(n, seed + 1), fc, 1.8)])
    return fade_edges(y * (1 - p) ** 1.6, 0.01, 0.1)


def key_click(seed=0, heavy=False):
    rs = np.random.default_rng(seed)
    n = int(0.06 * SR)
    t = tt(n)
    nz = bp(noise(n, seed), rs.uniform(2600, 4600), 1.4) * np.exp(-t / 0.0028)
    thock = np.sin(2 * np.pi * rs.uniform(140, 230) * (2.4 if not heavy else 1.0) * t) * np.exp(-t / (0.01 if not heavy else 0.02))
    y = nz * 0.8 + thock * (0.35 if not heavy else 0.9)
    return fade_edges(y * rs.uniform(0.7, 1.0), 0.0002, 0.005)


def bell(freqs, dur=3.0, gains=None):
    n = int(dur * SR)
    t = tt(n)
    y = np.zeros(n)
    gains = gains or [1.0] * len(freqs)
    for f, g in zip(freqs, gains):
        for ratio, pg, tau in ((1.0, 1.0, 1.4), (2.0, 0.35, 0.6), (2.76, 0.2, 0.35), (5.4, 0.08, 0.15)):
            y += g * pg * np.sin(2 * np.pi * f * ratio * t) * np.exp(-t / tau)
    return fade_edges(y * 0.25, 0.001, 0.2)


def blip(f, dur=0.07):
    n = int(dur * SR)
    t = tt(n)
    return fade_edges(np.sin(2 * np.pi * f * t) * np.exp(-t / 0.02), 0.0005, 0.005)


def glitch_s(dur=0.35, seed=0):
    rs = np.random.default_rng(seed)
    n = int(dur * SR)
    y = np.zeros(n)
    i = 0
    while i < n:
        seg = int(rs.uniform(0.012, 0.045) * SR)
        f = rs.choice([180, 360, 720, 1440, 2880, 5760]) * rs.uniform(0.9, 1.1)
        s = square(f, seg, rs.random()) * rs.uniform(0.3, 1.0)
        if rs.random() < 0.3:
            s = noise(seg, rs.integers(1e6)) * 0.5
        y[i:i + seg] = s[: n - i]
        i += seg + int(rs.uniform(0, 0.015) * SR)
    y = np.round(y * 6) / 6
    return fade_edges(hp(y, 300) * 0.5, 0.001, 0.02)


# ----------------------------------------------------------------------------- reverb
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
        for _ in range(10):
            d = int(rs.uniform(0.004, 0.07) * SR)
            acc[d] += rs.choice([-1, 1]) * rs.uniform(0.2, 0.6) * np.sqrt(np.mean(acc[:4000] ** 2)) * 30
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
    # forward-looking moving minimum over [i, i + look] (monotonic deque)
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
    # box average over the past `look` samples keeps gain <= greq and makes the attack a smooth ramp
    avg = np.empty(n)
    acc = 0.0
    for i in range(n):
        acc += mn[i]
        if i >= look:
            acc -= mn[i - look]
            avg[i] = acc / look
        else:
            avg[i] = acc / (i + 1)
        if avg[i] > mn[i]:
            pass
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


# ----------------------------------------------------------------------------- FluidSynth
def render_sf(name, notes, program, bank=0, sfont=SF_GM, cc=None, gain=0.5, channel=0, pedal=None):
    path_mid = BUILD / f"{name}.mid"
    path_wav = BUILD / f"{name}.wav"
    mid = mido.MidiFile(ticks_per_beat=960)
    tr = mido.MidiTrack()
    mid.tracks.append(tr)
    tr.append(mido.MetaMessage("set_tempo", tempo=int(60e6 / BPM), time=0))

    def tick(s):
        return max(0, int(round(s / BEAT * 960)))

    ev = [
        (0, 0, mido.Message("control_change", control=0, value=bank, channel=channel)),
        (0, 1, mido.Message("control_change", control=32, value=0, channel=channel)),
        (0, 2, mido.Message("program_change", program=program, channel=channel)),
        (0, 3, mido.Message("control_change", control=7, value=110, channel=channel)),
        (0, 4, mido.Message("control_change", control=11, value=127, channel=channel)),
        (0, 5, mido.Message("control_change", control=91, value=0, channel=channel)),
        (0, 6, mido.Message("control_change", control=93, value=0, channel=channel)),
    ]
    last = 0
    for st, du, p, v in notes:
        a, b = tick(st), tick(st + du)
        ev.append((a, 20, mido.Message("note_on", note=int(p), velocity=int(np.clip(v, 1, 127)), channel=channel)))
        ev.append((b, 10, mido.Message("note_off", note=int(p), velocity=0, channel=channel)))
        last = max(last, b)
    for st, c, val in cc or []:
        ev.append((tick(st), 15, mido.Message("control_change", control=c, value=int(np.clip(val, 0, 127)), channel=channel)))
    for st, val in pedal or []:
        ev.append((tick(st), 5 if val == 0 else 16, mido.Message("control_change", control=64, value=val, channel=channel)))
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


def cc_ramp(t0, t1, v0, v1, ccs=(11, 2), steps=None):
    steps = steps or max(2, int((t1 - t0) * 8))
    out = []
    for i in range(steps + 1):
        x = i / steps
        for c in ccs:
            out.append((t0 + (t1 - t0) * x, c, v0 + (v1 - v0) * x))
    return out


# ============================================================================= SCORE
def vel(base, spread=6):
    return int(np.clip(base + rng.integers(-spread, spread + 1), 1, 127))


def section(b, lo, hi):
    return lo <= b <= hi


def build_piano():
    notes, ped = [], []

    def run(b, seq, v=55, step=0.5):
        for i, nn in enumerate(seq):
            if nn is None:
                continue
            notes.append((T(b, i * step), step * 1.8, m(nn), vel(v)))

    # prologue motif
    notes.append((T(0, 2), 3.0, m("A2"), 48))
    notes.append((T(0, 2), 3.0, m("E3"), 44))
    run(1, ["A3", "E4", "A4", "B4", "C5", "B4", "A4", "E4"], 52)
    for b, lh in ((2, "F2"), (3, "F2")):
        notes.append((T(b), BAR, m(lh), 50))
    run(2, ["F3", "C4", "F4", "G4", "A4", "G4", "F4", "C4"], 54)
    run(3, ["F3", "C4", "F4", "G4", "A4", "C5", "A4", "G4"], 56)
    notes.append((T(4), BAR, m("C3"), 52))
    run(4, ["C4", "G4", "C5", "D5", "E5", "D5", "C5", "G4"], 58)
    # bar 5 = "Hello, World!" appears (10 s)
    for nn in ("C3", "G3", "C5", "E5", "G5"):
        notes.append((T(5), BAR * 1.2, m(nn), 72 if nn[-1] == "5" else 58))
    run(5, [None, None, None, None, "G5", "E5", "D5", "C5"], 50)
    notes.append((T(6), BAR, m("G2"), 52))
    run(6, ["G3", "D4", "G4", "A4", "B4", "A4", "G4", "D4"], 56)
    run(7, ["B4", "D5", "G5", None, None, None, None, None], 50, 0.5)
    for b in range(0, 8):
        ped += [(T(b), 127), (T(b + 1) - 0.02, 0)]

    # interlude (bars 58-67): broken chords + melody
    mel = {
        58: [(0, 2, "A4"), (2, 1, "C5"), (3, 1, "E5")],
        59: [(0, 3, "D5"), (3, 1, "B4")],
        60: [(0, 2, "G4"), (2, 1, "B4"), (3, 1, "E5")],
        61: [(0, 4, "C5")],
        62: [(0, 1, "A4"), (1, 1, "C5"), (2, 1, "F5"), (3, 1, "E5")],
        63: [(0, 2, "D5"), (2, 2, "G5")],
        64: [(0, 3, "E5"), (3, 0.5, "D5"), (3.5, 0.5, "C5")],
        65: [(0, 4, "A4")],
        66: [(0, 2, "F5"), (2, 1, "E5"), (3, 1, "D5")],
        67: [(0, 2, "E5"), (2, 2, "G#4")],
    }
    for b in range(58, 68):
        ch = PROG[b]
        r = root_in(ch, 36, 47)
        iv = CHORDS[ch][1]
        pattern = [r, r + 7, r + 12, r + 12 + iv[1], r + 12 + 7, r + 12, r + 7, r + 12 + iv[1]]
        for i, p in enumerate(pattern):
            notes.append((T(b, i * 0.5), 0.9, p, vel(46 if b < 62 else 52)))
        for (bt, du, nn) in mel[b]:
            v = 70 if b < 62 else 78
            notes.append((T(b, bt), du * BEAT * 0.98, m(nn), vel(v, 4)))
            if b >= 62:
                notes.append((T(b, bt), du * BEAT * 0.98, m(nn) - 12, vel(v - 18, 4)))
        ped += [(T(b), 127), (T(b + 1) - 0.02, 0)]

    # epilogue (87-89) and title (90-94) sit one bar later than the numbers below
    TT = lambda bar, beat=0.0: T(bar + 1, beat)
    run1 = lambda bar, seq, v=55, step=0.5: run(bar + 1, seq, v, step)
    # epilogue: motif reprise, softer
    run1(86, ["A3", "E4", "A4", "B4", "C5", "B4", "A4", "E4"], 48)
    notes.append((TT(86), BAR, m("A2"), 46))
    run1(87, ["F3", "C4", "F4", "G4", "A4", "G4", "F4", "C4"], 50)
    notes.append((TT(87), BAR, m("F2"), 46))
    notes.append((TT(88), BAR, m("G2"), 50))
    for nn in ("G3", "D4", "B4", "D5", "G5"):
        notes.append((TT(88), BAR, m(nn), 66))  # "Hello, Future!" at 178 s
    for b in range(86, 89):
        ped += [(TT(b), 127), (TT(b + 1) - 0.02, 0)]

    # title (89-93)
    for nn in ("C2", "C3", "G3", "C4", "E4", "G4", "C5", "E5"):
        notes.append((TT(89), BAR * 2, m(nn), 96))
    sparkle = {90: ["F5", "A5", "C6", "F6", "C6", "A5", "F5", "C6"], 91: ["G5", "B5", "D6", "G6", "D6", "B5", "G5", "D6"],
               92: ["C6", "E6", "G6", "C7", None, None, None, None]}
    for b, seq in sparkle.items():
        run1(b, seq, 44)
        lh = {90: "F2", 91: "G2", 92: "C2"}[b]
        notes.append((TT(b), BAR * (2.5 if b == 92 else 1), m(lh), 60))
        notes.append((TT(b), BAR * (2.5 if b == 92 else 1), m(lh) + 12, 52))
    for nn in ("C4", "E4", "G4", "C5"):
        notes.append((TT(92), BAR * 2.5, m(nn), 56))
    ped += [(TT(89), 127), (TT(90) - 0.02, 0), (TT(90), 127), (TT(91) - 0.02, 0), (TT(91), 127), (TT(92) - 0.02, 0), (TT(92), 127), (TT(94) - 0.02, 0)]
    # credits coda (95-101): the opening motif returns, very softly
    coda = {
        95: ("C3", ["C4", "G4", "C5", "D5", "E5", "D5", "C5", "G4"]),
        96: ("F2", ["F3", "C4", "F4", "G4", "A4", "G4", "F4", "C4"]),
        97: ("G2", ["G3", "D4", "G4", "A4", "B4", "A4", "G4", "D4"]),
        98: ("E2", ["E3", "B3", "E4", "G4", "B4", "G4", "E4", "B3"]),
        99: ("A2", ["A3", "E4", "A4", "B4", "C5", "B4", "A4", "E4"]),
        100: ("F2", ["F3", "C4", "F4", "G4", "A4", "C5", "A4", "G4"]),
    }
    for b, (lh, seq) in coda.items():
        notes.append((T(b), BAR, m(lh), 44))
        run(b, seq, 42 if b < 99 else 46)
        ped += [(T(b), 127), (T(b + 1) - 0.02, 0)]
    for nn in ("C3", "G3", "C4", "E4", "G4", "C5"):
        notes.append((T(101), BAR * 1.2, m(nn), 50))
    ped += [(T(101), 127), (T(102.2), 0)]
    return render_sf("piano", notes, 0, 0, SF_PIANO, gain=0.6, pedal=ped)


def build_strings():
    slow, fast, low, trem = [], [], [], []
    cc_slow, cc_fast, cc_trem = [], [], []

    def chord_bar(lst, b, center, v, n=4, dur_bars=1.0):
        for p in voicing(PROG[b], center, n):
            lst.append((T(b), BAR * dur_bars + 0.05, p, vel(v, 3)))

    for b in range(16, 20):
        chord_bar(slow, b, 57, 70)
    cc_slow += cc_ramp(T(16), T(20), 45, 85)
    for b in range(20, 22):
        for p in voicing(PROG[b], 57, 4):
            trem.append((T(b), BAR + 0.02, p, 90))
    cc_trem += cc_ramp(T(20), T(22) - 0.1, 50, 127)
    for b in range(22, 26):
        chord_bar(slow, b, 60, 96, 5)
        low.append((T(b), BAR, root_in(PROG[b], 33, 44), 90))
    cc_slow += cc_ramp(T(22), T(22) + 0.3, 115, 115, steps=2)
    cc_slow += cc_ramp(T(26), T(28), 70, 60)
    for b in (26, 27):
        chord_bar(slow, b, 57, 60)
    # ostinato (city + systems + drop 2)
    for b in list(range(36, 40)) + list(range(47, 55)) + list(range(70, 86)):
        r = root_in(PROG[b], 45, 56)
        iv = CHORDS[PROG[b]][1]
        pat = [r, r, r + 7, r, r + 12, r, r + 7, r + iv[1]]
        for i, p in enumerate(pat):
            fast.append((T(b, i * 0.5), 0.22, p, vel(88 if i % 2 == 0 else 72)))
        low.append((T(b), BAR, root_in(PROG[b], 33, 44), 80))
    cc_fast += cc_ramp(T(36), T(40), 80, 105)
    cc_fast += cc_ramp(T(47), T(47) + 0.1, 100, 100, steps=1)
    cc_fast += cc_ramp(T(70), T(86), 105, 127)
    for b in range(40, 42):
        for p in voicing(PROG[b], 57, 4):
            trem.append((T(b), BAR + 0.02, p, 90))
    cc_trem += cc_ramp(T(40), T(42) - 0.1, 50, 127)
    for b in range(42, 47):
        chord_bar(slow, b, 60, 100, 5)
        low.append((T(b), BAR, root_in(PROG[b], 33, 44), 96))
    cc_slow += cc_ramp(T(42), T(42) + 0.2, 120, 120, steps=1)
    for b in range(55, 58):
        chord_bar(slow, b, 57, 70)
    cc_slow += cc_ramp(T(55), T(58), 100, 40)
    for b in range(58, 68):
        chord_bar(slow, b, 55 if b < 64 else 62, 64, 4)
    cc_slow += cc_ramp(T(58), T(64), 40, 80) + cc_ramp(T(64), T(68), 80, 100)
    for b in range(68, 70):
        for p in voicing(PROG[b], 60, 5):
            trem.append((T(b), BAR + 0.02, p, 96))
    cc_trem += cc_ramp(T(68), T(70) - 0.1, 45, 127)
    for b in range(70, 86):
        chord_bar(slow, b, 64, 100, 5)
    cc_slow += cc_ramp(T(70), T(70) + 0.2, 118, 118, steps=1)
    for p in voicing("C", 64, 6):
        slow.append((T(86), BAR * 1.2, p, 110))
    low.append((T(86), BAR, m("C2"), 110))
    cc_slow += cc_ramp(T(87), T(87) + 0.1, 70, 70, steps=1)
    for b in range(90, 95):
        chord_bar(slow, b, 62, 90, 5)
        low.append((T(b), BAR, root_in(PROG[b], 33, 44), 85))
    cc_slow += cc_ramp(T(90), T(93), 110, 90) + cc_ramp(T(93), T(95), 90, 20)
    for b in range(95, 102):
        chord_bar(slow, b, 60, 58, 4)
    cc_slow += cc_ramp(T(95), T(95) + 0.1, 42, 42, steps=1) + cc_ramp(T(95), T(99), 42, 60) + cc_ramp(T(99), T(102), 60, 18)
    s1 = render_sf("strings_slow", slow, 49, 0, cc=cc_slow, gain=0.5)
    s2 = render_sf("strings_fast", fast, 48, 0, cc=cc_fast, gain=0.5)
    s3 = render_sf("strings_low", low, 49, 50, cc=cc_slow, gain=0.5)
    s4 = render_sf("strings_trem", trem, 44, 0, cc=cc_trem, gain=0.5)
    return s1, s2, s3, s4


def build_choir():
    notes = []
    cc = []
    for b in range(42, 47):
        for p in voicing(PROG[b], 64, 4):
            notes.append((T(b), BAR + 0.05, p, 96))
    cc += cc_ramp(T(42), T(47), 100, 110)
    for b in range(74, 86):
        for p in voicing(PROG[b], 66, 4):
            notes.append((T(b), BAR + 0.05, p, 100))
    cc += cc_ramp(T(74), T(86), 95, 127)
    for p in voicing("C", 67, 5):
        notes.append((T(86), BAR * 1.1, p, 112))
    for b in range(90, 95):
        for p in voicing(PROG[b], 64, 4):
            notes.append((T(b), BAR + 0.05, p, 90))
    cc += cc_ramp(T(90), T(93), 110, 80) + cc_ramp(T(93), T(95), 80, 10)
    return render_sf("choir", notes, 52, 0, cc=cc, gain=0.5)


def build_brass():
    br, horn = [], []
    for b, root in ((22, "A1"), (42, "A1"), (70, "A1"), (86, "C2"), (90, "C2")):
        r = m(root)
        for iv in (0, 7, 12):
            br.append((T(b), 3.2, r + iv, 127))
    line = [(42, 0, 2, "A3"), (42, 2, 1, "C4"), (42, 3, 1, "E4"), (43, 0, 3, "F4"), (43, 3, 1, "E4"),
            (44, 0, 2, "E4"), (44, 2, 2, "G4"), (45, 0, 4, "D4"), (46, 0, 4, "E4")]
    top = [(74, 0, 2, "A4"), (74, 2, 1, "G4"), (74, 3, 1, "E4"), (75, 0, 3, "F4"), (75, 3, 1, "E4"),
           (76, 0, 2, "E4"), (76, 2, 2, "G4"), (77, 0, 4, "D4")]
    for b, bt, du, nn in line + top:
        horn.append((T(b, bt), du * BEAT, m(nn), 105))
        horn.append((T(b, bt), du * BEAT, m(nn) - 12, 92))
    a = render_sf("brass", br, 61, 0, gain=0.5)
    h = render_sf("horns", horn, 60, 0, gain=0.5)
    return a, h


def build_timpani():
    notes = []
    for b0 in (20, 40, 68):
        n = int(2 * BAR / (BEAT / 4))
        for i in range(n):
            t = T(b0) + i * BEAT / 4
            v = 40 + 87 * (i / n) ** 1.5
            notes.append((t, 0.12, m("E2"), int(v)))
    for b, nn in ((22, "A2"), (42, "A2"), (70, "A2"), (86, "C3"), (90, "C3")):
        notes.append((T(b), 1.5, m(nn), 127))
    return render_sf("timpani", notes, 47, 0, gain=0.5)


def build_taiko():
    notes = []
    for b in range(42, 47):
        for bt, v in ((0, 127), (1.5, 96), (2, 110), (3, 100), (3.5, 90)):
            notes.append((T(b, bt), 0.5, 60, v))
    for b in range(70, 86, 2):
        for bt, v in ((0, 127), (2.5, 100), (3, 110)):
            notes.append((T(b, bt), 0.5, 60, v))
    return render_sf("taiko", notes, 116, 0, gain=0.5)


# ----------------------------------------------------------------------------- synth parts
def build_pad():
    out = stereo()
    spans = [(0, 22, 800, 2200), (26, 28, 1400, 1400), (55, 70, 900, 1600), (87, 102, 1200, 2600)]
    for b0, b1, c0, c1 in spans:
        for b in range(b0, b1):
            p = (b - b0) / max(1, b1 - b0 - 1)
            cutoff = c0 + (c1 - c0) * p
            for k, pitch in enumerate(voicing(PROG[b], 57, 4)):
                s = supersaw(hz(pitch), BAR + 0.1, voices=5, detune=0.14, width=1.0, a=0.6, d=1.0, s=0.9, r=1.6,
                             cutoff=cutoff, q=0.7, seed=b * 10 + k)
                add(out, s, T(b), 0.5)
    out = pb.Pedalboard([pb.Chorus(rate_hz=0.3, depth=0.35, centre_delay_ms=8, feedback=0.1, mix=0.5)])(out.astype(np.float32), SR).astype(np.float64)
    return out


def build_arp():
    out = stereo()

    def arp_bar(b, cutoff, v=0.5, step=0.25, octave_shift=0, pattern=None):
        ch = PROG[b]
        r = root_in(ch, 52, 63) + octave_shift
        iv = CHORDS[ch][1]
        tn = [r, r + iv[1], r + 7, r + 12, r + 12 + iv[1], r + 19]
        pat = pattern or [0, 1, 2, 3, 4, 5, 4, 3, 1, 2, 3, 4, 5, 4, 3, 2]
        steps = int(4 / step)
        for i in range(steps):
            p = tn[pat[i % len(pat)]]
            acc = 1.0 if i % 4 == 0 else 0.75
            s = pluck(hz(p), step * BEAT * 0.9, cutoff=cutoff * 0.5, bright=cutoff, seed=b * 100 + i)
            add(out, pan(s, 0.35 * math.sin(i * 0.9)), T(b, i * step), v * acc)

    for b in range(8, 22):
        p = (b - 8) / 13
        arp_bar(b, 1500 + 4000 * p ** 1.4, 0.45 + 0.2 * p)
    for b in range(22, 26):
        arp_bar(b, 5200, 0.55)
    for b in (26, 27):
        arp_bar(b, 1500, 0.35, step=0.5, pattern=[0, 2, 3, 4, 3, 2, 1, 2])
    for b in range(28, 42):
        c = 3600 if b < 40 else 3600 + 4000 * (b - 39) / 2
        arp_bar(b, c, 0.65)
    for b in range(47, 55):
        arp_bar(b, 4200, 0.65)
    for b in range(70, 86):
        arp_bar(b, 5200, 0.5)
    for b in range(90, 94):
        arp_bar(b, 6000, 0.25, step=0.5, octave_shift=12, pattern=[0, 2, 3, 5, 4, 3, 2, 1])
    L = pb.Pedalboard([pb.Delay(delay_seconds=0.375, feedback=0.32, mix=0.28)])(out[0:1].astype(np.float32), SR)
    R = pb.Pedalboard([pb.Delay(delay_seconds=0.25, feedback=0.3, mix=0.28)])(out[1:2].astype(np.float32), SR)
    return hp(np.vstack([L[0], R[0]]).astype(np.float64), 180)


def build_chords():
    out = stereo()
    bars = list(range(22, 26)) + list(range(42, 47)) + list(range(70, 86))
    for b in bars:
        g = 0.55 if 42 <= b <= 46 else 0.8
        for k, pitch in enumerate(voicing(PROG[b], 62, 4) + [voicing(PROG[b], 74, 1)[0]]):
            s = supersaw(hz(pitch), BAR, voices=7, detune=0.22, width=0.95, a=0.01, d=0.6, s=0.75, r=0.25,
                         cutoff=2600, cutoff_env=3000, env_tau=0.4, q=0.8, seed=b * 17 + k)
            add(out, s, T(b), g)
    for b in list(range(28, 40)) + list(range(47, 55)):
        for i in range(4):
            for k, pitch in enumerate(voicing(PROG[b], 64, 4)):
                s = supersaw(hz(pitch), BEAT * 0.38, voices=5, detune=0.18, width=0.9, a=0.003, d=0.12, s=0.4, r=0.08,
                             cutoff=1800, cutoff_env=2600, env_tau=0.07, q=0.9, seed=b * 97 + i * 7 + k)
                add(out, s, T(b, i + 0.5), 0.85)
    for b in (86, 90):
        for k, pitch in enumerate(voicing("C", 62, 5) + [72, 76]):
            s = supersaw(hz(pitch), BAR * 1.5, voices=7, detune=0.25, a=0.005, d=1.4, s=0.3, r=1.2,
                         cutoff=2000, cutoff_env=5000, env_tau=0.6, seed=b * 31 + k)
            add(out, s, T(b), 0.8)
    return hp(out, 160)


def build_lead():
    out = stereo()
    line1 = [(22, 0, 3, "E5"), (22, 3, 0.5, "D5"), (22, 3.5, 0.5, "C5"), (23, 0, 3, "C5"), (23, 3, 1, "A4"),
             (24, 0, 2, "G4"), (24, 2, 1, "C5"), (24, 3, 1, "E5"), (25, 0, 4, "D5")]
    line2 = [(b + 48, bt, du, nn) for (b, bt, du, nn) in line1]
    line3 = [(74, 0, 2, "A5"), (74, 2, 1, "G5"), (74, 3, 1, "E5"), (75, 0, 3, "F5"), (75, 3, 1, "E5"),
             (76, 0, 2, "E5"), (76, 2, 2, "G5"), (77, 0, 4, "D5")]
    rise = [(78, 0, 4, "E5"), (79, 0, 4, "F5"), (80, 0, 4, "G5"), (81, 0, 4, "G5"), (82, 0, 4, "A5"),
            (83, 0, 4, "A5"), (84, 0, 4, "B5"), (85, 0, 2, "B5"), (85, 2, 2, "D6"), (86, 0, 6, "C6")]
    for i, (b, bt, du, nn) in enumerate(line1 + line2 + line3 + rise):
        f = hz(m(nn))
        s = supersaw(f, du * BEAT * 0.97, voices=7, detune=0.16, width=0.7, a=0.012, d=0.4, s=0.85, r=0.3,
                     cutoff=3800, cutoff_env=2500, env_tau=0.2, q=0.9, seed=900 + i)
        s += 0.5 * np.vstack([sine(f * 2, s.shape[1]) * fit(adsr(du * BEAT * 0.97, 0.01, 0.4, 0.6, 0.3), s.shape[1])] * 2)
        add(out, s, T(b, bt), 0.6)
    L = pb.Pedalboard([pb.Delay(delay_seconds=0.375, feedback=0.25, mix=0.2)])(out[0:1].astype(np.float32), SR)
    R = pb.Pedalboard([pb.Delay(delay_seconds=0.5, feedback=0.25, mix=0.2)])(out[1:2].astype(np.float32), SR)
    return hp(np.vstack([L[0], R[0]]).astype(np.float64), 250)


def build_bass():
    sub = stereo()
    mid = stereo()
    sub_bars = list(range(12, 26)) + list(range(28, 47)) + list(range(47, 55)) + list(range(70, 86))
    for b in sub_bars:
        r = root_in(PROG[b], 28, 39)
        s = sub_note(hz(r), BAR - 0.02)
        add(sub, s, T(b), 0.9)
    for b in range(8, 12):
        add(sub, sub_note(hz(root_in(PROG[b], 28, 39)), BAR - 0.02, drive=1.0), T(b), 0.45)
    for b in (86, 90):
        add(sub, sub_note(hz(m("C2")), BAR * 1.4), T(b), 1.0)
    mid_bars = list(range(12, 20)) + list(range(22, 26)) + list(range(28, 42)) + list(range(47, 55)) + list(range(70, 86))
    for b in mid_bars:
        r = root_in(PROG[b], 40, 51)
        if b < 16:
            pat = [(i * 0.5, r) for i in range(8)]
        elif b < 20:
            pat = [(i + 0.5, r) for i in range(4)]
        else:
            pat = [(i * 0.5, r + (12 if i == 6 else 0)) for i in range(8)]
        for bt, p in pat:
            add(mid, midbass(hz(p), 0.2, seed=b * 50 + int(bt * 2)), T(b, bt), 0.7)
    return sub, mid


# ----------------------------------------------------------------------------- drums
def build_drums():
    kick = stereo()
    snare = stereo()
    hats = stereo()
    toms = stereo()
    cymb = stereo()
    kick_times = []
    kicks = [kick_s(i) for i in range(4)]
    snares = [snare_s(i) for i in range(4)]
    claps = [clap_s(i) for i in range(3)]
    hcl = [hat_s(False, i) for i in range(6)]
    hop = [hat_s(True, i) for i in range(3)]

    def K(t, g=1.0, big=False):
        add(kick, trailer_kick(int(t * 10)) if big else kicks[int(t * 7) % 4], t, g)
        kick_times.append(t)

    def S(t, g=1.0, clap=False):
        add(snare, pan(claps[int(t * 5) % 3], 0.0) if clap else snares[int(t * 3) % 4], t, g)

    def H(t, g=1.0, op=False):
        s = hop[int(t * 3) % 3] if op else hcl[int(t * 11) % 6]
        add(hats, pan(s, 0.25), t, g)

    def TOM(t, f=110, g=1.0, p=0.0):
        add(toms, pan(tom_s(f, int(t * 13)), p), t, g)

    for b in range(95):
        t0 = T(b)
        st = lambda i: t0 + i * BEAT / 4
        if 8 <= b <= 11:
            for i in range(16):
                H(st(i), 0.18 if i % 4 else 0.3)
        elif 12 <= b <= 15:
            K(st(0), 0.8)
            K(st(8), 0.7)
            for i in range(0, 16, 2):
                H(st(i + 1) if i + 1 < 16 else st(i), 0.3)
        elif 16 <= b <= 19:
            for i in (0, 4, 8, 12):
                K(st(i), 0.95)
            for i in (4, 12):
                S(st(i), 0.7, clap=True)
            for i in range(16):
                H(st(i), 0.45 if i % 4 == 2 else 0.18)
            if b == 19:
                for i in (12, 13, 14, 15):
                    TOM(st(i), 140 - i * 5, 0.5)
        elif b == 20:
            for i in (0, 4, 8, 12):
                K(st(i), 0.9)
            for i in range(0, 16, 2):
                S(st(i), 0.25 + 0.3 * i / 16)
        elif b == 21:
            for i in range(0, 8):
                S(st(i), 0.45 + 0.02 * i)
            for i in range(16, 28):
                S(t0 + i * BEAT / 8, 0.55 + 0.02 * (i - 16))
        elif 22 <= b <= 25 or 28 <= b <= 39 or 47 <= b <= 54 or 70 <= b <= 85:
            big = b in (22, 28, 70)
            for i in (0, 4, 8, 12):
                K(st(i), 1.0, big=(big and i == 0))
            for i in (4, 12):
                S(st(i), 0.9)
                S(st(i), 0.45, clap=True)
            for i in range(16):
                if i % 4 == 2:
                    H(st(i), 0.5, op=(i == 14 and b % 2 == 1))
                else:
                    H(st(i), 0.2 if i % 2 else 0.28)
            if b % 4 == 3:
                for j, i in enumerate((12, 13, 14, 15)):
                    TOM(st(i), 150 - j * 18, 0.7, -0.4 + j * 0.25)
            if b in (40, 41):
                pass
        elif b in (40, 41):
            if b == 40:
                for i in (0, 4, 8, 12):
                    K(st(i), 0.9)
                for i in range(0, 16, 2):
                    S(st(i), 0.3 + 0.3 * i / 16)
                for i in (2, 6, 10, 14):
                    TOM(st(i), 90, 0.5)
            else:
                for i in range(16):
                    S(st(i), 0.5 + 0.02 * i)
                    if i < 14 and i % 2 == 0:
                        TOM(st(i), 120 - i * 3, 0.55, -0.3 + 0.05 * i)
        elif 42 <= b <= 46:
            K(st(0), 1.0, big=True)
            K(st(6), 0.8)
            K(st(10), 0.85)
            S(st(8), 1.0)
            S(st(8), 0.5, clap=True)
            for i in range(0, 16, 2):
                H(st(i), 0.22)
            TOM(st(12), 100, 0.8, -0.3)
            TOM(st(14), 80, 0.8, 0.3)
            if b == 45:
                for i in range(8, 16):
                    TOM(st(i), 130 - (i - 8) * 8, 0.75, -0.4 + (i - 8) * 0.1)
        elif b == 55:
            for i in (0, 4, 8, 12):
                K(st(i), 0.8)
            for i in (4, 12):
                S(st(i), 0.6, clap=True)
        elif b == 56:
            K(st(0), 0.8)
        elif 64 <= b <= 67:
            K(st(0), 0.45)
            K(st(3), 0.3)
        elif b == 68:
            for i in (0, 4, 8, 12):
                K(st(i), 0.7)
            for i in range(0, 16, 4):
                S(st(i), 0.3 + 0.2 * i / 16)
        elif b == 69:
            for i in range(0, 8, 2):
                S(st(i), 0.45 + 0.03 * i)
            for i in range(8, 14):
                S(st(i), 0.55 + 0.03 * i)
            for i in range(28, 30):
                S(t0 + i * BEAT / 8, 0.8)
    # crashes on phrase starts
    for b in (8, 16, 22, 24, 28, 32, 36, 42, 44, 47, 51, 70, 74, 78, 80, 82, 84):
        add(cymb, crash_s(b), T(b), 0.55 if b not in (22, 42, 70) else 0.8)
    for b in range(78, 86):
        TOM(T(b), 70, 0.9, 0.0)
    return kick, snare, hats, toms, cymb, sorted(kick_times)


# ----------------------------------------------------------------------------- sound design
def typing_schedule(text, t0, base, jitter, seed, pause_nl=0.2):
    rs = np.random.default_rng(seed)
    times, keys = [], []
    t = t0
    line_start = 0
    for i, ch in enumerate(text):
        if ch == "\n":
            line_start = i + 1
        is_indent = ch == " " and all(c == " " for c in text[line_start:i + 1]) and ch != "\n"
        if is_indent:
            times.append(round(t, 4))
            continue
        dt = base + rs.uniform(-jitter, jitter)
        if i > 0 and text[i - 1] == "\n":
            dt += pause_nl
        if i > 0 and text[i - 1] in ",;{(":
            dt += 0.05
        t += dt
        times.append(round(t, 4))
        keys.append((round(t, 4), ch))
    return times, keys, t


def build_sfx():
    fx = stereo()
    ui = stereo()
    cues = {}

    code = '#include <stdio.h>\n\nint main(void) {\n    printf("Hello, World!\\n");\n    return 0;\n}'
    ctimes, ckeys, cend = typing_schedule(code, 1.7, 0.056, 0.022, 3)
    cmd = "gcc hello.c -o hello && ./hello"
    cmd_t0 = cend + 0.5
    mtimes, mkeys, mend = typing_schedule(cmd, cmd_t0, 0.036, 0.012, 5)
    enter = mend + 0.18
    output = T(5)
    assert enter < output - 0.3, (enter, output)
    outro_select = 174.9
    outro_delete = 175.35
    ftimes, fkeys, fend = typing_schedule("Future", 175.55, 0.085, 0.02, 9)
    outro_recall = fend + 0.45
    outro_enter = outro_recall + 0.4
    outro_output = T(89)
    assert outro_enter < outro_output - 0.3
    typing = {
        "intro": {"code": code, "codeTimes": ctimes, "cmd": cmd, "cmdTimes": mtimes, "cmdShow": round(cmd_t0 - 0.35, 3),
                  "enter": round(enter, 3), "output": output},
        "outro": {"select": outro_select, "delete": outro_delete, "typed": "Future", "typeTimes": ftimes,
                  "recall": round(outro_recall, 3), "enter": round(outro_enter, 3), "output": outro_output},
    }
    (DATA / "typing.json").write_text(json.dumps(typing, ensure_ascii=False, indent=1))

    add(ui, bell([hz(m("G5")), hz(m("D6"))], 2.4), 192.0, 0.22)
    add(ui, bell([hz(m("A5")), hz(m("E6"))], 2.4), 194.0, 0.22)
    # the prompt document streaming past: a soft rain of data blips
    drs = np.random.default_rng(194)
    for k in range(150):
        t = 194.3 + k * 0.0235 + drs.uniform(0, 0.02)
        p = (t - 194.3) / 3.55
        add(ui, pan(blip(drs.uniform(2600, 6800), 0.035), drs.uniform(-0.7, 0.7)), t, 0.055 * math.sin(math.pi * min(1.0, p)) + 0.01)
    add(fx, riser_s(1.5, 196), 196.45, 0.22)
    add(ui, key_click(4999, True), 197.85, 0.6)
    add(fx, whoosh_s(0.8, 197, 1.0), 197.6, 0.35)
    for k, nn in enumerate(("E6", "G6", "B6", "E7")):
        add(ui, bell([hz(m(nn))], 1.8), 198.0 + k * 0.06, 0.16)
    add(ui, bell([hz(m("C6")), hz(m("G6")), hz(m("E7"))], 3.5), 200.0, 0.28)
    add(fx, sub_drop(2.4), 200.0, 0.25)
    for i, (t, ch) in enumerate(ckeys + mkeys + fkeys):
        heavy = ch in "\n "
        add(ui, pan(key_click(i, heavy), rng.uniform(-0.15, 0.15)), t, 0.55 if not heavy else 0.7)
    for t in (enter, outro_enter, outro_delete, outro_recall):
        add(ui, key_click(777 + int(t), True), t, 0.9)
    add(ui, key_click(991, False), outro_select, 0.4)

    # chimes
    add(ui, bell([hz(m("C6")), hz(m("G6"))], 3.0), output, 0.5)
    add(ui, bell([hz(m("D6")), hz(m("G6")), hz(m("B6"))], 3.0), outro_output, 0.55)
    accepted = 132.0
    for k, nn in enumerate(("C6", "E6", "G6", "C7")):
        add(ui, bell([hz(m(nn))], 1.6), accepted + k * 0.07, 0.35)
    cues["accepted"] = accepted

    # impacts / risers / whooshes
    big = [44.0, 84.0, 140.0, 172.0, 180.0]
    med = [16.0, 52.0, 94.0, 156.0, 158.0, 160.0, 162.0, 164.0, 166.0, 168.0, 170.0]
    soft = [output, 116.0, outro_output]
    for t in big:
        add(fx, impact_s(1.0, int(t)), t, 1.0)
    for t in med:
        add(fx, impact_s(0.6, int(t)), t, 0.55)
    for t in soft:
        add(fx, sub_drop(2.0), t, 0.35)
    for t0, t1 in ((13.0, 16.0), (40.0, 43.75), (80.0, 83.75), (136.0, 139.75), (170.0, 171.9), (177.0, 179.9)):
        add(fx, riser_s(t1 - t0, int(t0)), t0, 0.5)
    whooshes = [16.0, 24.45, 32.0, 38.0, 56.0, 64.0, 70.0, 102.0, 109.0, 145.0, 148.0, 151.0, 174.0]
    for k, t in enumerate(whooshes):
        d = 0.9
        add(fx, whoosh_s(d, k, 1 if k % 2 == 0 else -1), t - d * 0.55, 0.55)
    for t in (56.0, 94.0):
        add(fx, rev_cymbal(2.0, int(t)), t - 2.0, 0.5)
    add(fx, downlifter(4.0, 5), 112.0, 0.45)
    for t in (102.0, 109.0, 113.2):
        add(fx, pan(glitch_s(0.35, int(t * 3)), 0.0), t, 0.35)

    # data blips (logic gates, sorting network, pathfinding, detection, LLM tokens)
    for i in range(16):
        t = 24.5 + i * 0.5
        add(ui, pan(blip(hz(m("A6")) * (1.5 if i % 4 == 0 else 1.0)), -0.5 + (i % 4) * 0.33), t, 0.12)
    sort_stages = [57.0 + i * 0.25 for i in range(21)]
    for i, t in enumerate(sort_stages):
        add(ui, pan(blip(hz(m("A5") + (i % 7) * 2), 0.05), math.sin(i)), t, 0.1)
    cues["sortStages"] = sort_stages
    cues["sortDone"] = 62.5
    for i in range(12):
        add(ui, pan(blip(hz(m("E7")) * (1 + i * 0.03), 0.04), -0.6 + i * 0.1), 62.5 + i * 0.05, 0.08)
    cues["pathFound"] = 79.0
    add(ui, bell([hz(m("E6")), hz(m("B6"))], 2.0), 79.0, 0.3)
    cues["lock"] = 112.0
    add(ui, key_click(4242, True), 112.0, 1.0)
    add(ui, bell([hz(m("A5"))], 1.0), 112.05, 0.2)
    det = [145.5, 145.8, 146.1, 146.4, 146.7, 147.0]
    for i, t in enumerate(det):
        add(ui, pan(blip(1800 + 200 * i, 0.06), -0.5 + 0.2 * i), t, 0.14)
    cues["detections"] = det
    llm0 = 148.8
    for i in range(24):
        add(ui, pan(blip(3200 + (i % 5) * 150, 0.03), 0.2), llm0 + i * 0.05, 0.05)
    cues["llmStart"] = llm0

    # prologue drone & air
    n = int(18 * SR)
    t = tt(n)
    env = np.minimum(1, t / 3.0) * np.clip((17.5 - t) / 2.5, 0, 1)
    drone = (sine(hz(m("A1")), n) * 0.5 + sine(hz(m("E2")), n) * 0.25) * env
    air = np.vstack([bp(noise(n, 1), 1800, 0.5), bp(noise(n, 2), 2000, 0.5)]) * 0.06 * env
    shimmer = (sine(hz(m("A5")), n) * (0.5 + 0.5 * np.sin(2 * np.pi * 0.3 * t)) + sine(hz(m("E6")), n) * (0.5 + 0.5 * np.sin(2 * np.pi * 0.23 * t + 1))) * 0.05 * env
    add(fx, np.vstack([drone * 0.45 + shimmer, drone * 0.45 + shimmer]) + air, 0.0, 0.5)
    cues.update({"big": big, "med": med, "whooshes": whooshes})
    (DATA / "cues.json").write_text(json.dumps(cues, indent=1))
    return fx, ui


# ============================================================================= MIX
def active_rms(x):
    mono = np.mean(x, axis=0)
    blk = 4800
    nb = len(mono) // blk
    r = np.sqrt(np.mean(mono[: nb * blk].reshape(nb, blk) ** 2, axis=1) + 1e-12)
    act = r[r > r.max() * 0.05]
    return float(np.sqrt(np.mean(act ** 2))) if len(act) else 1e-9


def sidechain(kick_times, depth=0.6, release=0.2):
    env = np.ones(N)
    n = int(0.45 * SR)
    t = tt(n)
    att = int(0.004 * SR)
    shape = 1 - depth * np.exp(-t / release * 2.5)
    shape[:att] = np.linspace(1, shape[att], att)
    for k in kick_times:
        i = int(k * SR)
        j = min(N, i + n)
        env[i:j] = np.minimum(env[i:j], shape[: j - i])
    return env


def main():
    stems = {}
    print("rendering sampled instruments…", flush=True)
    stems["piano"] = build_piano()
    s1, s2, s3, s4 = build_strings()
    stems["str_slow"], stems["str_fast"], stems["str_low"], stems["str_trem"] = s1, s2, s3, s4
    stems["choir"] = build_choir()
    stems["brass"], stems["horns"] = build_brass()
    stems["timpani"] = build_timpani()
    stems["taiko"] = build_taiko()
    print("synths…", flush=True)
    stems["pad"] = build_pad()
    stems["arp"] = build_arp()
    stems["chords"] = build_chords()
    stems["lead"] = build_lead()
    stems["sub"], stems["midbass"] = build_bass()
    print("drums & fx…", flush=True)
    kick, snare, hats, toms, cymb, kick_times = build_drums()
    stems.update(kick=kick, snare=snare, hats=hats, toms=toms, cymb=cymb)
    br = stereo()
    for b, root in ((22, "A1"), (42, "A1"), (70, "A1"), (86, "C2"), (90, "C2")):
        add(br, braam(m(root), 3.6, b), T(b), 1.0)
    stems["braam"] = br
    stems["fx"], stems["ui"] = build_sfx()

    # level (dB relative to kick-ish reference) after normalising each stem's active RMS
    LEVEL = {
        "kick": -4.0, "snare": -5.5, "hats": -18.0, "toms": -9.0, "cymb": -14.0,
        "sub": -9.5, "midbass": -12.5, "chords": -9.0, "lead": -8.5, "arp": -12.0, "pad": -14.0,
        "piano": -6.0, "str_slow": -9.0, "str_fast": -10.5, "str_low": -13.0, "str_trem": -10.5,
        "choir": -10.0, "brass": -8.0, "horns": -10.0, "timpani": -9.0, "taiko": -9.0,
        "braam": -6.5, "fx": -5.0, "ui": -12.0,
    }
    SEND_HALL = {"piano": 0.35, "str_slow": 0.35, "str_fast": 0.2, "str_low": 0.2, "str_trem": 0.3, "choir": 0.45, "horns": 0.35,
                 "brass": 0.25, "pad": 0.4, "arp": 0.25, "lead": 0.25, "chords": 0.18, "timpani": 0.3, "taiko": 0.3, "fx": 0.25, "ui": 0.3,
                 "braam": 0.2}
    SEND_PLATE = {"snare": 0.25, "toms": 0.3, "kick": 0.05, "hats": 0.1, "cymb": 0.1}
    SC = {"sub": 0.75, "midbass": 0.6, "chords": 0.55, "pad": 0.45, "arp": 0.35, "lead": 0.25, "str_fast": 0.2, "choir": 0.2}
    sc_env_base = kick_times

    print("mixing…", flush=True)
    hall_ir = make_ir(3.4, 0.025, 1)
    plate_ir = make_ir(1.4, 0.008, 2, bright=1.4)
    gap = np.ones(N)
    for a, b in ((43.75, 44.0), (83.75, 84.0), (139.75, 140.0), (171.8, 172.0), (179.8, 180.0)):
        i, j = int(a * SR), int(b * SR)
        r = int(0.006 * SR)
        gap[i:j] = 0.0
        gap[i:i + r] = np.linspace(1, 0, r)
    dry = stereo()
    hall_in = stereo()
    plate_in = stereo()
    report = {}
    for name, x in stems.items():
        r = active_rms(x)
        g = 10 ** (LEVEL[name] / 20) / max(r, 1e-9) * 0.1
        y = x * g
        if name in SC:
            y = y * sidechain(sc_env_base, SC[name])
        if name in ("piano", "str_slow", "choir", "horns", "pad"):
            y = butter(y, 90, "high", 2)
        if name in ("hats", "cymb"):
            y = butter(y, 400, "high", 2)
        y = y * gap
        dry += y
        hall_in += y * SEND_HALL.get(name, 0.0)
        plate_in += y * SEND_PLATE.get(name, 0.0)
        report[name] = round(20 * math.log10(max(r, 1e-9)), 1)
    hall_in = butter(hall_in, 180, "high", 2)
    wet = convolve(hall_in, hall_ir) * 0.9 + convolve(plate_in, plate_ir) * 0.8
    mix = dry + wet
    mix = butter(mix, 24, "high", 2)

    meter = pyln.Meter(SR)
    mix = mix * 10 ** ((-20.0 - meter.integrated_loudness(mix.T)) / 20)
    glue = pb.Pedalboard([
        pb.LowShelfFilter(cutoff_frequency_hz=70, gain_db=-2.0, q=0.7),
        pb.PeakFilter(cutoff_frequency_hz=320, gain_db=-1.5, q=0.8),
        pb.HighShelfFilter(cutoff_frequency_hz=5500, gain_db=2.5, q=0.7),
        pb.Compressor(threshold_db=-20, ratio=1.8, attack_ms=25, release_ms=250),
    ])
    out = glue(mix.astype(np.float32), SR).astype(np.float64)
    target = -13.5
    for _ in range(3):
        lufs = meter.integrated_loudness(out.T)
        out = out * 10 ** ((target - lufs) / 20)
        out, g = limit(out, -1.0, 5.0, 140.0)
    gr = 20 * np.log10(np.maximum(g, 1e-6))
    print(f"limiter: max GR {gr.min():.1f} dB, samples >3dB GR: {np.mean(gr < -3) * 100:.2f}%")
    fade = int(1.5 * SR)
    end = int(204.0 * SR)
    out[:, end - fade:end] *= np.linspace(1, 0, fade) ** 2
    out[:, end:] = 0
    out = out[:, : int(204.0 * SR)]
    lufs2 = meter.integrated_loudness(out.T.astype(np.float64))
    dst = ROOT / "public" / "audio" / "music.wav"
    sf.write(str(dst), out.T, SR, subtype="PCM_24")
    print("stem raw rms dB:", report)
    print(f"integrated LUFS {lufs2:.2f}, peak {20 * np.log10(np.max(np.abs(out)) + 1e-9):.2f} dBFS")
    # per-section loudness
    secs = [(0, 16), (16, 44), (44, 52), (52, 84), (84, 116), (116, 140), (140, 172), (172, 190), (190, 204)]
    for a, b in secs:
        seg = out[:, int(a * SR):int(b * SR)].T.astype(np.float64)
        print(f"  {a:5.0f}-{b:5.0f}s  {meter.integrated_loudness(seg):6.1f} LUFS")
    win = 4096
    mono = np.pad(out.mean(axis=0).astype(np.float64), (0, win))
    freqs = np.fft.rfftfreq(win, 1 / SR)
    edges = np.geomspace(55, 9000, 41)
    lo = np.searchsorted(freqs, edges[:-1])
    hi = np.maximum(np.searchsorted(freqs, edges[1:]), lo + 1)
    hann = np.hanning(win)
    spec = []
    for k in range(int(14.0 * 60)):
        c = int((190.0 + k / 60) * SR)
        seg = mono[c - win // 2:c + win // 2] * hann
        mag = np.abs(np.fft.rfft(seg))
        spec.append([20 * np.log10(mag[lo[i]:hi[i]].mean() + 1e-9) for i in range(40)])
    spec = np.array(spec)
    ref = np.percentile(spec, 97, axis=0)
    norm = np.clip((spec - (ref - 34)) / 34, 0, 1)
    sm = np.zeros_like(norm)
    for k in range(len(norm)):
        prev = sm[k - 1] if k else norm[0]
        sm[k] = np.where(norm[k] > prev, norm[k], prev * 0.86 + norm[k] * 0.14)
    (DATA / "spectrum.json").write_text(json.dumps({"t0": 190.0, "fps": 60, "frames": np.round(sm, 3).tolist()}))
    np.save(BUILD / "stems_names.npy", np.array(list(stems.keys())))
    for name in ("kick", "sub", "chords", "piano", "str_slow", "fx"):
        sf.write(str(BUILD / f"stem_{name}.wav"), (stems[name] / (np.max(np.abs(stems[name])) + 1e-9) * 0.8).T.astype(np.float32), SR)
    print("wrote", dst)


if __name__ == "__main__":
    main()
