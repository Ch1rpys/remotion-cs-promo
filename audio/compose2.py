#!/usr/bin/env python3
"""
计算机科学与技术 · 宣传片配乐

v2 · melodic electronic score. 120 BPM, A minor, 112 bars (224 s); one bar = 2 s, so every
visual cut lands on a beat. Piano (Salamander) and strings are rendered through FluidSynth;
synths, drums and sound design are synthesised here, then mixed and mastered to
public/audio/music.wav. Beat/hit times are exported to src/data/beats.json for the visuals.
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
TOTAL = 226.0
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


# ============================================================================= SCORE v2
# Melodic electronic score: piano-led intro and breakdown, three drops built on one hook.
END = 224.0
NB = 112

PROG = (["Am", "Am", "F", "F", "C", "C", "G", "G"]              # 0-7    intro · Hello, World
        + ["Am", "F", "C", "G"] * 2                             # 8-15   verse 1 · binary, gates
        + ["F", "G", "Em", "Am", "F", "E"]                      # 16-21  pre-chorus + build · chip, wafer
        + ["Am", "F", "C", "G"] * 2                             # 22-29  DROP 1 · CPU, hardware montage
        + ["Am", "F", "C", "G"] * 2 + ["F", "G", "Em", "Am"]    # 30-41  verse 2 · quote, sort, tree, city
        + ["F", "E"]                                            # 42-43  build 2
        + ["Am", "F", "C", "G"] * 2                             # 44-51  DROP 2 · globe, data centre
        + ["Dm", "Am", "F", "E"] * 2                            # 52-59  bridge · compiler, crypto
        + ["Am", "F", "C", "G"]                                 # 60-63  course montage
        + ["Am", "Am", "F", "F", "C", "C", "G", "G"]            # 64-71  breakdown · campus photos
        + ["F", "G", "Em", "E"]                                 # 72-75  build 3
        + ["Am", "F", "C", "G"] * 3                             # 76-87  DROP 3 · AI, future montage
        + ["Am", "F", "C", "G", "Am", "F", "G", "G"]            # 88-95  final chorus · timeline
        + ["C"]                                                 # 96     "会是你"
        + ["Am", "F", "G"]                                      # 97-99  Hello, Future
        + ["C", "F", "G", "C", "C"]                             # 100-104 title
        + ["C", "F", "G", "Em", "Am", "F", "C"])                # 105-111 credits
assert len(PROG) == NB, len(PROG)

DROPS = set(range(22, 30)) | set(range(44, 52)) | set(range(76, 88))
FULL = DROPS | set(range(60, 64)) | set(range(88, 96))
GAPS = [(43.75, 44.0), (87.75, 88.0), (119.75, 120.0), (151.75, 152.0), (191.8, 192.0), (199.8, 200.0)]

# scene time shifts (original scene timebase -> this edit)
SH_QUOTE = 8.0      # quote, sort, tree
SH_CITY = 4.0       # city, globe, data centre, compiler, crypto
SH_AI = 12.0        # neural, vision, LLM, graphics
SH_END = 20.0       # timeline, "会是你", Hello Future, title, credits

HW_CUTS = [52.0, 53.0, 54.0, 55.0, 56.0, 57.0, 58.0, 58.5, 59.0, 59.5]
FT_CUTS = [168.0, 169.0, 170.0, 171.0] + [172.0 + 0.5 * k for k in range(8)]
COURSE_CUTS = [120.0 + 0.5 * k for k in range(16)]
PHOTO_CUTS = [128.0, 131.0, 134.0, 137.0, 140.0, 143.0, 146.0, 149.0]
ACCEPTED = 140.9


def energy(b):
    if b in FULL:
        return 1.0
    if 12 <= b <= 21 or 32 <= b <= 43 or 52 <= b <= 59 or 72 <= b <= 75:
        return 0.45
    if 8 <= b <= 11 or 30 <= b <= 31 or 100 <= b <= 103:
        return 0.25
    return 0.0


def vel(base, spread=6):
    return int(np.clip(base + rng.integers(-spread, spread + 1), 1, 127))


# ----------------------------------------------------------------------------- melodies
HOOK = [
    [(0, .75, "E5"), (.75, .75, "E5"), (1.5, .5, "D5"), (2, .75, "C5"), (2.75, .75, "D5"), (3.5, .5, "E5")],   # Am
    [(0, .75, "C5"), (.75, .75, "C5"), (1.5, .5, "A4"), (2, 1.5, "A4"), (3.5, .5, "G4")],                       # F
    [(0, .75, "G4"), (.75, .75, "C5"), (1.5, .5, "E5"), (2, .75, "G5"), (2.75, .75, "E5"), (3.5, .5, "D5")],   # C
    [(0, 1.5, "D5"), (1.5, .5, "B4"), (2, .75, "G4"), (2.75, .75, "B4"), (3.5, .5, "D5")],                      # G
]
HOOK_C2 = [(0, .75, "G4"), (.75, .75, "C5"), (1.5, .5, "E5"), (2, .75, "G5"), (2.75, .75, "A5"), (3.5, .5, "G5")]
HOOK_D2 = [(0, 1.5, "E5"), (1.5, .5, "D5"), (2, 2.0, "D5")]
PRE = [
    [(0, 1, "A4"), (1, 1, "C5"), (2, 1.5, "F5"), (3.5, .5, "E5")],   # F
    [(0, 1, "D5"), (1, 1, "B4"), (2, 2, "G4")],                      # G
    [(0, 1, "G4"), (1, 1, "B4"), (2, 1.5, "E5"), (3.5, .5, "D5")],   # Em
    [(0, 1, "C5"), (1, 1, "E5"), (2, 2, "A5")],                      # Am
]
PRE_E = [(0, 1, "B4"), (1, 1, "E5"), (2, 1, "G#5"), (3, .5, "B5"), (3.5, .25, "B5")]


def hook8():
    return HOOK + [HOOK[0], HOOK[1], HOOK_C2, HOOK_D2]


def mel(b0, bars, stretch=1.0):
    out = []
    for k, bar in enumerate(bars):
        for bt, du, nn in bar:
            out.append((T(b0) + (k * 4 + bt) * BEAT * stretch, du * BEAT * stretch, m(nn)))
    return out


SCALE = (0, 2, 4, 5, 7, 9, 11)


def dia(n, steps):
    x, d, k = n, (1 if steps > 0 else -1), abs(steps)
    while k:
        x += d
        if x % 12 in SCALE:
            k -= 1
    return x


# ----------------------------------------------------------------------------- extra voices
def lead_note(f, dur, seed, bright=1.0):
    s = supersaw(f, dur, voices=7, detune=0.16, width=0.75, a=0.006, d=0.35, s=0.8, r=0.22,
                 cutoff=3000 * bright, cutoff_env=3800 * bright, env_tau=0.16, q=0.9, seed=seed)
    n = s.shape[1]
    s += 0.32 * np.vstack([sine(f * 2, n) * fit(adsr(dur, 0.005, 0.3, 0.5, 0.22), n)] * 2)
    pl = pluck(f, dur, cutoff=2400 * bright, bright=5200, seed=seed + 1, decay=0.16)
    k = min(n, len(pl))
    s[:, :k] += 0.5 * pl[:k]
    return s


def vox_note(f, dur, seed, vowel="a"):
    env = adsr(dur, 0.012, 0.2, 0.85, 0.18)
    n = len(env)
    t = tt(n)
    vib = 1 + 0.007 * np.sin(2 * np.pi * 5.4 * t + seed) * np.clip(t / 0.3, 0, 1)
    src = saw(f * vib, n, 0.3) + 0.6 * saw(f * 1.004 * vib, n, 0.7)
    forms = {"a": ((820, 7.0, 1.0), (1180, 8.0, 0.55), (2850, 10.0, 0.28)),
             "o": ((480, 6.0, 1.0), (820, 7.0, 0.6), (2800, 10.0, 0.2))}[vowel]
    y = sum(g * bp(src, fc, q) for fc, q, g in forms)
    return np.tanh(2.2 * y) * env


def shaker_s(seed=0):
    n = int(0.08 * SR)
    t = tt(n)
    y = bp(noise(n, seed), 7200, 0.8) * np.minimum(1, t / 0.006) * np.exp(-t / 0.028)
    return fade_edges(y, 0.0003, 0.005)


def snap_s(seed=0):
    n = int(0.14 * SR)
    t = tt(n)
    nz = hp(noise(n, seed), 2600) * np.exp(-t / 0.011)
    thump = np.sin(2 * np.pi * (70 + 90 * np.exp(-t / 0.02)) * t) * np.exp(-t / 0.035)
    return fade_edges(nz * 0.8 + thump * 0.6, 0.0003, 0.01)


# ----------------------------------------------------------------------------- piano
def build_piano():
    notes, ped = [], []

    def pn(t, du, p, v, spread=4):
        notes.append((t, du, p, vel(v, spread)))

    def pedal(b0, b1, every=1):
        for b in range(b0, b1, every):
            ped.extend([(T(b), 127), (T(b + every) - 0.02, 0)])

    def run(b, seq, v=55, step=0.5):
        for i, nn in enumerate(seq):
            if nn is not None:
                pn(T(b, i * step), step * 1.8, m(nn), v)

    # intro: the hook in half time
    for t, du, p in mel(0, HOOK, stretch=2):
        pn(t, du * 0.95 + 0.35, p, 60 if t < T(4) else 66)
    for b in range(0, 8, 2):
        r = root_in(PROG[b], 33, 44)
        pn(T(b), BAR * 2, r, 50)
        pn(T(b), BAR * 2, r + 7, 44)
        for q in voicing(PROG[b], 57, 2):
            pn(T(b, 2), BAR * 1.4, q, 36)
    for nn in ("C4", "E4"):
        pn(T(5), BAR, m(nn), 44)                       # "Hello, World!" lands on the hook's top note
    pedal(0, 8, 2)

    # verse 2: the hook echoes softly on the chapter card, pre-chorus melody over the city
    for t, du, p in mel(30, [HOOK[0], HOOK[1]]):
        pn(t, du + 0.25, p, 54)
    for b in (30, 31):
        r = root_in(PROG[b], 33, 44)
        pn(T(b), BAR, r, 46)
        pn(T(b), BAR, r + 12, 40)
        for q in voicing(PROG[b], 60, 3):
            pn(T(b), BAR, q, 36)
    pedal(30, 32)
    for t, du, p in mel(38, PRE):
        pn(t, du + 0.15, p, 58)
        pn(t, du + 0.15, p - 12, 44)
    pedal(38, 42)

    # breakdown: the hook returns in half time over broken chords
    for t, du, p in mel(64, HOOK, stretch=2):
        v = 66 if t < T(68) else 76
        pn(t, du * 0.95 + 0.45, p, v)
        if t >= T(68):
            pn(t, du * 0.95 + 0.45, p - 12, v - 18)
    for b in range(64, 76):
        ch = PROG[b]
        r = root_in(ch, 36, 47)
        iv = CHORDS[ch][1]
        pattern = [r, r + 7, r + 12, r + 12 + iv[1], r + 19, r + 12, r + 7, r + 12 + iv[1]]
        for i, p in enumerate(pattern):
            pn(T(b, i * 0.5), 0.9, p, 44 if b < 68 else 52)
    for t, du, p in mel(72, PRE[:3] + [PRE_E]):
        pn(t, du + 0.1, p, 74)
        pn(t, du + 0.1, p + 12, 56)
    pedal(64, 76)

    # "会是你"
    for nn in ("C2", "C3", "G3", "C4", "E4", "G4", "C5", "E5"):
        pn(T(96), BAR * 1.5, m(nn), 92, 2)
    ped += [(T(96), 127), (T(97) - 0.02, 0)]
    # Hello, Future
    run(97, ["A3", "E4", "A4", "B4", "C5", "B4", "A4", "E4"], 48)
    pn(T(97), BAR, m("A2"), 46)
    run(98, ["F3", "C4", "F4", "G4", "A4", "G4", "F4", "C4"], 50)
    pn(T(98), BAR, m("F2"), 46)
    pn(T(99), BAR, m("G2"), 50)
    for nn in ("G3", "D4", "B4", "D5", "G5"):
        pn(T(99), BAR, m(nn), 66, 2)                   # "Hello, Future!" at 198 s
    pedal(97, 100)
    # title
    for nn in ("C2", "C3", "G3", "C4", "E4", "G4", "C5", "E5"):
        pn(T(100), BAR * 2, m(nn), 96, 2)
    sparkle = {101: ["F5", "A5", "C6", "F6", "C6", "A5", "F5", "C6"], 102: ["G5", "B5", "D6", "G6", "D6", "B5", "G5", "D6"],
               103: ["C6", "E6", "G6", "C7", None, None, None, None]}
    for b, seq in sparkle.items():
        run(b, seq, 44)
        lh = {101: "F2", 102: "G2", 103: "C2"}[b]
        pn(T(b), BAR * (2.5 if b == 103 else 1), m(lh), 60)
        pn(T(b), BAR * (2.5 if b == 103 else 1), m(lh) + 12, 52)
    for nn in ("C4", "E4", "G4", "C5"):
        pn(T(103), BAR * 2.5, m(nn), 56)
    ped += [(T(100), 127), (T(101) - 0.02, 0), (T(101), 127), (T(102) - 0.02, 0), (T(102), 127), (T(103) - 0.02, 0), (T(103), 127), (T(105) - 0.02, 0)]
    # credits coda: the opening motif, very softly
    coda = {
        105: ("C3", ["C4", "G4", "C5", "D5", "E5", "D5", "C5", "G4"]),
        106: ("F2", ["F3", "C4", "F4", "G4", "A4", "G4", "F4", "C4"]),
        107: ("G2", ["G3", "D4", "G4", "A4", "B4", "A4", "G4", "D4"]),
        108: ("E2", ["E3", "B3", "E4", "G4", "B4", "G4", "E4", "B3"]),
        109: ("A2", ["A3", "E4", "A4", "B4", "C5", "B4", "A4", "E4"]),
        110: ("F2", ["F3", "C4", "F4", "G4", "A4", "C5", "A4", "G4"]),
    }
    for b, (lh, seq) in coda.items():
        pn(T(b), BAR, m(lh), 44)
        run(b, seq, 42 if b < 109 else 46)
        ped += [(T(b), 127), (T(b + 1) - 0.02, 0)]
    for nn in ("C3", "G3", "C4", "E4", "G4", "C5"):
        pn(T(111), BAR * 1.2, m(nn), 50, 2)
    ped += [(T(111), 127), (T(112.2), 0)]
    return render_sf("piano2", notes, 0, 0, SF_PIANO, gain=0.6, pedal=ped)


def build_strings():
    slow, cc = [], []

    def chord_bar(b, center, v, n=4, dur_bars=1.0):
        for p in voicing(PROG[b], center, n):
            slow.append((T(b), BAR * dur_bars + 0.05, p, vel(v, 3)))

    for b in range(64, 76):
        chord_bar(b, 55 if b < 70 else 60, 66)
    cc += cc_ramp(T(64), T(70), 40, 82) + cc_ramp(T(70), T(75.8), 82, 118)
    for b in range(88, 96):
        chord_bar(b, 62, 92, 5)
    cc += cc_ramp(T(88), T(96), 96, 122)
    chord_bar(96, 64, 105, 6, 1.2)
    for b in range(100, 105):
        chord_bar(b, 62, 88, 5)
    cc += cc_ramp(T(100), T(103), 112, 90) + cc_ramp(T(103), T(105), 90, 25)
    for b in range(105, 112):
        chord_bar(b, 60, 58, 4)
    cc += cc_ramp(T(105), T(109), 42, 60) + cc_ramp(T(109), T(112), 60, 18)
    return render_sf("strings2", slow, 49, 0, cc=cc, gain=0.5)


# ----------------------------------------------------------------------------- synth parts
def build_pad():
    out = stereo()
    spans = [(0, 8, 500, 1300, 0.35), (8, 16, 900, 2200, 0.45), (52, 60, 700, 1500, 0.5),
             (64, 76, 900, 2600, 0.5), (97, 100, 900, 1400, 0.4), (104, 112, 1200, 2200, 0.45)]
    for b0, b1, c0, c1, g in spans:
        for b in range(b0, b1):
            p = (b - b0) / max(1, b1 - b0 - 1)
            for k, pitch in enumerate(voicing(PROG[b], 57, 4)):
                s = supersaw(hz(pitch), BAR + 0.1, voices=5, detune=0.14, width=1.0, a=0.6, d=1.0, s=0.9, r=1.6,
                             cutoff=c0 + (c1 - c0) * p, q=0.7, seed=b * 10 + k)
                add(out, s, T(b), g)
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

    for b in range(8, 16):
        p = (b - 8) / 7
        arp_bar(b, 1200 + 3200 * p ** 1.3, 0.45 + 0.15 * p)
    for b in range(16, 22):
        arp_bar(b, 4400 + 3000 * (b - 16) / 5, 0.55)
    for b in range(32, 42):
        arp_bar(b, 3800, 0.6)
    for b in sorted(DROPS):
        arp_bar(b, 5200, 0.3)
    for b in range(52, 60):
        arp_bar(b, 2400, 0.45, step=0.5, pattern=[0, 2, 3, 4, 3, 2, 1, 2])
    for b in range(60, 64):
        arp_bar(b, 6200, 0.4)
    for b in range(88, 96):
        arp_bar(b, 6200, 0.35)
    for b in range(100, 104):
        arp_bar(b, 6000, 0.22, step=0.5, octave_shift=12, pattern=[0, 2, 3, 5, 4, 3, 2, 1])
    L = pb.Pedalboard([pb.Delay(delay_seconds=0.375, feedback=0.32, mix=0.26)])(out[0:1].astype(np.float32), SR)
    R = pb.Pedalboard([pb.Delay(delay_seconds=0.25, feedback=0.3, mix=0.26)])(out[1:2].astype(np.float32), SR)
    return hp(np.vstack([L[0], R[0]]).astype(np.float64), 180)


def build_chords():
    out = stereo()
    stabs = stereo()

    def pad_chord(b, g, cutoff=2600.0, env=3000.0, dur=BAR, center=62):
        for k, p in enumerate(voicing(PROG[b], center, 4) + [voicing(PROG[b], center + 12, 1)[0]]):
            s = supersaw(hz(p), dur, voices=7, detune=0.22, width=0.95, a=0.01, d=0.6, s=0.75, r=0.25,
                         cutoff=cutoff, cutoff_env=env, env_tau=0.4, q=0.8, seed=b * 17 + k)
            add(out, s, T(b), g)

    for b in sorted(DROPS | set(range(88, 96))):
        pad_chord(b, 0.8)
    for b in range(16, 22):
        pad_chord(b, 0.5, cutoff=700 + 2800 * (b - 16) / 5, env=900)
    for b, c in ((42, 1200), (43, 2600), (74, 1200), (75, 2600)):
        pad_chord(b, 0.5, cutoff=c, env=900)
    pad_chord(96, 1.0, cutoff=2400, env=5200, dur=BAR * 1.5)
    for b in range(100, 104):
        pad_chord(b, 0.7, cutoff=2200, env=3000, dur=BAR * (2.2 if b == 103 else 1.0))

    def stab(b, bt, g, cutoff=1800.0):
        for k, p in enumerate(voicing(PROG[b], 64, 4)):
            s = supersaw(hz(p), BEAT * 0.38, voices=5, detune=0.18, width=0.9, a=0.003, d=0.12, s=0.4, r=0.08,
                         cutoff=cutoff, cutoff_env=2600, env_tau=0.07, q=0.9, seed=b * 97 + int(bt * 8) + k)
            add(stabs, s, T(b, bt), g)

    for b in range(60, 64):
        for i in range(4):
            stab(b, i, 0.95, 2800)
    for b in range(32, 42):
        for i in range(4):
            stab(b, i + 0.5, 0.7)
    return hp(out, 160), hp(stabs, 180)


def build_lead():
    lead, lead2, vox = stereo(), stereo(), stereo()

    def L(events, g=0.6, dst=None, bright=1.0, seed0=0):
        for i, (t, du, p) in enumerate(events):
            add(lead if dst is None else dst, lead_note(hz(p), du * 0.96, seed0 + i, bright), t, g)

    L(mel(16, PRE), 0.42, bright=0.7, seed0=800)
    L(mel(21, [PRE_E]), 0.46, bright=0.9, seed0=850)
    L(mel(22, hook8()), 0.6, seed0=100)
    L(mel(44, hook8()), 0.6, seed0=200)
    L([(t, du, dia(p, -2)) for t, du, p in mel(48, hook8()[4:])], 0.32, lead2, 0.8, 300)
    L(mel(60, HOOK), 0.6, seed0=400)
    L(mel(76, hook8()), 0.62, seed0=500)
    L([(t, du, dia(p, -2)) for t, du, p in mel(76, hook8())], 0.28, lead2, 0.8, 700)
    tag = HOOK[:3] + [HOOK_D2]
    L(mel(84, tag), 0.62, seed0=600)
    L([(t, du, p + 12) for t, du, p in mel(84, tag)], 0.3, lead2, 1.0, 650)
    for i, (t, du, p) in enumerate(mel(76, hook8())):
        add(vox, vox_note(hz(p), du * 0.95, i), t, 0.5)
    for i, (t, du, p) in enumerate(mel(48, hook8()[4:])):
        add(vox, vox_note(hz(p), du * 0.95, 100 + i, "o"), t, 0.4)
    rise = [(88, 0, 4, "E5"), (89, 0, 4, "F5"), (90, 0, 4, "G5"), (91, 0, 4, "G5"), (92, 0, 4, "A5"), (93, 0, 4, "A5"),
            (94, 0, 4, "B5"), (95, 0, 2, "B5"), (95, 2, 2, "D6"), (96, 0, 6, "C6")]
    for i, (b, bt, du, nn) in enumerate(rise):
        add(lead, lead_note(hz(m(nn)), du * BEAT * 0.97, 900 + i), T(b, bt), 0.62)
    title = [(100, 0, 2, "E5"), (100, 2, 2, "G5"), (101, 0, 2, "A5"), (101, 2, 2, "C6"), (102, 0, 2, "B5"), (102, 2, 2, "D6"), (103, 0, 8, "C6")]
    for i, (b, bt, du, nn) in enumerate(title):
        add(lead, lead_note(hz(m(nn)), du * BEAT * 0.97, 950 + i, 0.85), T(b, bt), 0.5)

    def echo(x, dl, dr, fb, mix):
        a = pb.Pedalboard([pb.Delay(delay_seconds=dl, feedback=fb, mix=mix)])(x[0:1].astype(np.float32), SR)
        c = pb.Pedalboard([pb.Delay(delay_seconds=dr, feedback=fb, mix=mix)])(x[1:2].astype(np.float32), SR)
        return np.vstack([a[0], c[0]]).astype(np.float64)

    return hp(echo(lead, 0.375, 0.5, 0.25, 0.2), 220), hp(echo(lead2, 0.5, 0.375, 0.2, 0.18), 260), hp(echo(vox, 0.375, 0.25, 0.3, 0.22), 300)


def build_bass():
    sub, mid, reese = stereo(), stereo(), stereo()

    def SUB(b, g=0.9, dur=BAR - 0.02, drive=1.6):
        add(sub, sub_note(hz(root_in(PROG[b], 28, 39)), dur, drive), T(b), g)

    for b in range(8, 12):
        SUB(b, 0.45, drive=1.0)
    for b in list(range(12, 52)) + list(range(60, 64)) + list(range(72, 96)):
        SUB(b, 0.9)
    for b in range(66, 72):
        SUB(b, 0.4, drive=1.0)
    for b in (96, 100, 101, 102, 103):
        SUB(b, 1.0, BAR * (1.4 if b == 96 else 1.0) - 0.02)
    for b in range(105, 111):
        SUB(b, 0.35, drive=1.0)
    for b in range(NB):
        r = root_in(PROG[b], 40, 51)
        if b in FULL or 16 <= b <= 19 or 72 <= b <= 73:
            pat = [(i + 0.5, r + (12 if i == 3 else 0)) for i in range(4)]
        elif 12 <= b <= 15 or 32 <= b <= 41:
            pat = [(i * 0.5, r) for i in range(8)]
        else:
            continue
        for bt, p in pat:
            add(mid, midbass(hz(p), 0.22, seed=b * 50 + int(bt * 2)), T(b, bt), 0.7)
    for b in range(52, 60):
        f = hz(root_in(PROG[b], 28, 39) + 12)
        s = supersaw(f, BAR - 0.02, voices=3, detune=0.25, width=0.4, a=0.02, d=0.5, s=0.9, r=0.1,
                     cutoff=380, cutoff_env=500, env_tau=0.3, q=1.2, seed=b)
        add(reese, np.tanh(2.0 * s), T(b), 0.6)
        SUB(b, 0.85)
    return sub, mid, reese


# ----------------------------------------------------------------------------- drums
def build_drums():
    kick, clap, snare, hats, ohat, shaker, toms, cymb = (stereo() for _ in range(8))
    ev = {"kick": [], "snare": [], "crash": []}
    kicks = [kick_s(i) for i in range(4)]
    snares = [snare_s(i) for i in range(4)]
    claps = [clap_s(i) for i in range(3)]
    hcl = [hat_s(False, i) for i in range(6)]
    hop = [hat_s(True, i) for i in range(3)]
    shk = [shaker_s(i) for i in range(4)]

    def K(t, g=1.0, big=False):
        add(kick, trailer_kick(int(t * 10)) if big else kicks[int(t * 7) % 4], t, g)
        ev["kick"].append((round(t, 4), round(g, 2)))

    def CL(t, g=1.0):
        add(clap, claps[int(t * 5) % 3], t, g)
        ev["snare"].append((round(t, 4), round(g, 2)))

    def SN(t, g=1.0):
        add(snare, snares[int(t * 3) % 4], t, g)

    def H(t, g=1.0):
        add(hats, pan(hcl[int(t * 11) % 6], 0.2), t, g)

    def OH(t, g=1.0):
        add(ohat, pan(hop[int(t * 3) % 3], -0.15), t, g)

    def SHK(t, g=1.0):
        add(shaker, pan(shk[int(t * 17) % 4], 0.35), t, g)

    def TOM(t, f=110.0, g=1.0, p=0.0):
        add(toms, pan(tom_s(f, int(t * 13)), p), t, g)

    def CR(t, g=0.6):
        add(cymb, crash_s(int(t * 3)), t, g)
        ev["crash"].append((round(t, 4), round(g, 2)))

    def st(b, i):
        return T(b) + i * BEAT / 4

    def four(b, g=1.0, big_first=False):
        for i in (0, 4, 8, 12):
            K(st(b, i), g, big=(big_first and i == 0))

    def backbeat(b, g=1.0, sn=0.5):
        for i in (4, 12):
            CL(st(b, i), g)
            SN(st(b, i), sn * g)

    def hats16(b, g=0.22, acc=0.4):
        for i in range(16):
            H(st(b, i), acc if i % 4 == 2 else (g if i % 2 == 0 else g * 0.7))

    def offhats(b, g=0.5):
        for i in (2, 6, 10, 14):
            OH(st(b, i), g)

    def fill(b, beat0=3, g0=0.4, g1=0.8):
        n = int((4 - beat0) * 4)
        for j in range(n):
            SN(st(b, beat0 * 4 + j), g0 + (g1 - g0) * j / max(1, n - 1))

    def roll(b):
        for i in range(0, 16, 2):
            SN(st(b, i), 0.25 + 0.3 * i / 16)
        for i in range(8):
            SN(st(b + 1, i), 0.5 + 0.03 * i)
        for i in range(16, 28):
            SN(T(b + 1) + i * BEAT / 8, 0.62 + 0.025 * (i - 16))

    def toms_fill(b):
        for j, i in enumerate((12, 13, 14, 15)):
            TOM(st(b, i), 150 - j * 18, 0.65, -0.4 + j * 0.25)

    for b in range(NB):
        if 8 <= b <= 11:
            K(st(b, 0), 0.55)
            K(st(b, 8), 0.5)
            for i in range(0, 16, 2):
                H(st(b, i), 0.14 if i % 4 else 0.22)
        elif 12 <= b <= 15:
            four(b, 0.8)
            backbeat(b, 0.55, 0.3)
            hats16(b, 0.18, 0.3)
            if b == 15:
                fill(b, 3, 0.3, 0.6)
        elif 16 <= b <= 19:
            four(b, 0.9)
            backbeat(b, 0.7, 0.4)
            hats16(b, 0.2, 0.35)
            offhats(b, 0.3)
            if b == 19:
                toms_fill(b)
        elif b in (20, 42, 74):
            four(b, 0.9)
            roll(b)
        elif b in (21, 43, 75):
            K(st(b, 0), 0.8)
        elif b in DROPS:
            first = b in (22, 44, 76)
            four(b, 1.0, big_first=first)
            backbeat(b, 1.0, 0.5)
            hats16(b, 0.22, 0.4)
            offhats(b, 0.55)
            start = 22 if b < 30 else 44 if b < 52 else 76
            if (b - start) % 4 == 3:
                fill(b, 3, 0.35, 0.75)
            if (b - start) % 4 == 0:
                CR(T(b), 0.8 if first else 0.55)
            if b >= 84:
                for i in range(1, 16, 2):
                    SHK(st(b, i), 0.5)
                if b >= 86:
                    for i in (0, 8):
                        CL(st(b, i), 0.45)
        elif b in (30, 31):
            if b == 30:
                CR(T(b), 0.5)
            K(st(b, 0), 0.7)
            K(st(b, 8), 0.55)
            for i in range(0, 16, 2):
                H(st(b, i), 0.16)
        elif 32 <= b <= 41:
            four(b, 0.85)
            backbeat(b, 0.6, 0.3)
            hats16(b, 0.18, 0.32)
            if b >= 38:
                offhats(b, 0.35)
            if b in (32, 38):
                CR(T(b), 0.45)
            if b == 41:
                toms_fill(b)
        elif 52 <= b <= 59:
            if b == 52:
                CR(T(b), 0.5)
            if b == 59:
                four(b, 0.85)
                fill(b, 0, 0.25, 0.8)
                continue
            K(st(b, 0), 0.95, big=(b == 58))
            K(st(b, 10), 0.7)
            CL(st(b, 8), 0.85)
            SN(st(b, 8), 0.45)
            SN(st(b, 14), 0.18)
            for i in range(0, 16, 2):
                H(st(b, i), 0.22 if i % 4 else 0.3)
            if b == 58:
                CR(T(b), 0.6)
        elif 60 <= b <= 63:
            four(b, 1.0, big_first=(b == 60))
            backbeat(b, 1.0, 0.5)
            hats16(b, 0.24, 0.42)
            offhats(b, 0.5)
            if b == 60:
                CR(T(b), 0.8)
            if b == 63:
                fill(b, 2, 0.35, 0.85)
        elif b in (70, 71):
            K(st(b, 0), 0.5)
            K(st(b, 8), 0.45)
            for i in range(0, 16, 2):
                H(st(b, i), 0.12)
        elif b in (72, 73):
            four(b, 0.75)
            backbeat(b, 0.5, 0.2)
            hats16(b, 0.15, 0.25)
            if b == 72:
                CR(T(b), 0.4)
        elif 88 <= b <= 95:
            four(b, 1.0, big_first=True)
            backbeat(b, 1.0, 0.5)
            hats16(b, 0.24, 0.42)
            offhats(b, 0.55)
            CR(T(b), 0.75 if b == 88 else 0.6)
            if b == 95:
                fill(b, 2, 0.4, 0.95)
            elif b % 2 == 1:
                toms_fill(b)
        elif b == 96:
            K(T(b), 1.0, big=True)
            CR(T(b), 0.9)
        elif 100 <= b <= 103:
            K(T(b), 1.0, big=True)
            if b == 100:
                CR(T(b), 0.9)
            K(T(b, 2), 0.6)
            for i in range(0, 16, 2):
                H(st(b, i), 0.12)
            if b == 103:
                toms_fill(b)
        elif 105 <= b <= 110:
            K(st(b, 0), 0.4)
            K(st(b, 8), 0.34)
            CL(st(b, 8), 0.22)
            for i in range(0, 16, 2):
                H(st(b, i), 0.1 if i % 4 else 0.14)
            if b == 105:
                CR(T(b), 0.35)
    ev = {k: sorted(v) for k, v in ev.items()}
    return (kick, clap, snare, hats, ohat, shaker, toms, cymb), ev


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

    # typing (scene timebase is kept in typing.json; the outro scene sits SH_END later in this edit)
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
    outro_output = 178.0
    assert outro_enter < outro_output - 0.3
    typing = {
        "intro": {"code": code, "codeTimes": ctimes, "cmd": cmd, "cmdTimes": mtimes, "cmdShow": round(cmd_t0 - 0.35, 3),
                  "enter": round(enter, 3), "output": output},
        "outro": {"select": outro_select, "delete": outro_delete, "typed": "Future", "typeTimes": ftimes,
                  "recall": round(outro_recall, 3), "enter": round(outro_enter, 3), "output": outro_output},
    }
    (DATA / "typing.json").write_text(json.dumps(typing, ensure_ascii=False, indent=1))
    for i, (t, ch) in enumerate(ckeys + mkeys):
        heavy = ch in "\n "
        add(ui, pan(key_click(i, heavy), rng.uniform(-0.15, 0.15)), t, 0.55 if not heavy else 0.7)
    for i, (t, ch) in enumerate(fkeys):
        add(ui, pan(key_click(300 + i, ch == " "), rng.uniform(-0.15, 0.15)), t + SH_END, 0.55)
    add(ui, key_click(777, True), enter, 0.9)
    for t in (outro_enter, outro_delete, outro_recall):
        add(ui, key_click(777 + int(t), True), t + SH_END, 0.9)
    add(ui, key_click(991, False), outro_select + SH_END, 0.4)
    add(ui, bell([hz(m("C6")), hz(m("G6"))], 3.0), output, 0.5)
    add(ui, bell([hz(m("D6")), hz(m("G6")), hz(m("B6"))], 3.0), outro_output + SH_END, 0.55)

    # scene cues (scene timebase, read by the scenes) — the audio is placed at edit time
    cues = json.loads((DATA / "cues.json").read_text())
    for i in range(16):
        add(ui, pan(blip(hz(m("A6")) * (1.5 if i % 4 == 0 else 1.0)), -0.5 + (i % 4) * 0.33), 24.5 + i * 0.5, 0.12)
    for i, t in enumerate(cues["sortStages"]):
        add(ui, pan(blip(hz(m("A5") + (i % 7) * 2), 0.05), math.sin(i)), t + SH_QUOTE, 0.1)
    for i in range(12):
        add(ui, pan(blip(hz(m("E7")) * (1 + i * 0.03), 0.04), -0.6 + i * 0.1), cues["sortDone"] + SH_QUOTE + i * 0.05, 0.08)
    add(ui, bell([hz(m("E6")), hz(m("B6"))], 2.0), cues["pathFound"] + SH_CITY, 0.3)
    add(ui, key_click(4242, True), cues["lock"] + SH_CITY, 1.0)
    add(ui, bell([hz(m("A5"))], 1.0), cues["lock"] + SH_CITY + 0.05, 0.2)
    for i, t in enumerate(cues["detections"]):
        add(ui, pan(blip(1800 + 200 * i, 0.06), -0.5 + 0.2 * i), t + SH_AI, 0.14)
    for i in range(24):
        add(ui, pan(blip(3200 + (i % 5) * 150, 0.03), 0.2), cues["llmStart"] + SH_AI + i * 0.05, 0.05)
    for k, nn in enumerate(("C6", "E6", "G6", "C7")):
        add(ui, bell([hz(m(nn))], 1.6), ACCEPTED + k * 0.07, 0.35)

    # impacts, risers, whooshes, cut snaps
    big = [44.0, 88.0, 120.0, 152.0, 192.0, 200.0]
    med = [16.0, 52.0, 60.0, 98.0, 116.0] + [176.0 + 2 * k for k in range(8)]
    soft = [output, 128.0, outro_output + SH_END]
    for t in big:
        add(fx, impact_s(1.0, int(t)), t, 1.0)
    for t in med:
        add(fx, impact_s(0.6, int(t)), t, 0.5)
    for t in soft:
        add(fx, sub_drop(2.0), t, 0.35)
    for t0, t1 in ((13.0, 16.0), (40.0, 43.75), (84.0, 87.75), (118.0, 119.75), (147.0, 151.75), (190.0, 191.8), (197.0, 199.8)):
        add(fx, riser_s(t1 - t0, int(t0)), t0, 0.5)
    whooshes = [16.0, 24.45, 32.0, 38.0, 60.0, 64.0, 72.0, 78.0, 106.0, 113.0, 157.0, 160.0, 163.0, 194.0]
    for k, t in enumerate(whooshes):
        add(fx, whoosh_s(0.9, k, 1 if k % 2 == 0 else -1), t - 0.5, 0.55)
    for t in (60.0, 98.0):
        add(fx, rev_cymbal(2.0, int(t)), t - 2.0, 0.45)
    add(fx, downlifter(4.0, 5), 128.0, 0.4)
    for t in (106.0, 113.0, 117.2):
        add(fx, pan(glitch_s(0.35, int(t * 3)), 0.0), t, 0.35)
    for k, t in enumerate(HW_CUTS + FT_CUTS):
        add(fx, pan(snap_s(k), 0.3 * math.sin(k * 1.7)), t, 0.45)
        add(fx, whoosh_s(0.32, 40 + k, 1 if k % 2 else -1), t - 0.24, 0.3)
    for k, t in enumerate(COURSE_CUTS):
        add(ui, pan(blip(hz(m("E6")) * (1.5 if k % 4 == 0 else 1.0), 0.05), -0.4 + 0.8 * ((k * 5) % 7) / 6), t, 0.18)
    for k, t in enumerate(PHOTO_CUTS[1:]):
        add(fx, whoosh_s(0.8, 60 + k, 1 if k % 2 else -1), t - 0.45, 0.28)

    # prologue drone & air
    n = int(18 * SR)
    t = tt(n)
    env = np.minimum(1, t / 3.0) * np.clip((17.5 - t) / 2.5, 0, 1)
    drone = (sine(hz(m("A1")), n) * 0.5 + sine(hz(m("E2")), n) * 0.25) * env
    air = np.vstack([bp(noise(n, 1), 1800, 0.5), bp(noise(n, 2), 2000, 0.5)]) * 0.06 * env
    add(fx, np.vstack([drone * 0.4, drone * 0.4]) + air, 0.0, 0.4)

    # credits (scene timebase + SH_END)
    add(ui, bell([hz(m("G5")), hz(m("D6"))], 2.4), 192.0 + SH_END, 0.22)
    add(ui, bell([hz(m("A5")), hz(m("E6"))], 2.4), 194.0 + SH_END, 0.22)
    drs = np.random.default_rng(194)
    for k in range(150):
        tk = 194.3 + k * 0.0235 + drs.uniform(0, 0.02)
        p = (tk - 194.3) / 3.55
        add(ui, pan(blip(drs.uniform(2600, 6800), 0.035), drs.uniform(-0.7, 0.7)), tk + SH_END, 0.055 * math.sin(math.pi * min(1.0, p)) + 0.01)
    add(fx, riser_s(1.5, 196), 196.45 + SH_END, 0.22)
    add(ui, key_click(4999, True), 197.85 + SH_END, 0.6)
    add(fx, whoosh_s(0.8, 197, 1.0), 197.6 + SH_END, 0.35)
    for k, nn in enumerate(("E6", "G6", "B6", "E7")):
        add(ui, bell([hz(m(nn))], 1.8), 198.0 + SH_END + k * 0.06, 0.16)
    add(ui, bell([hz(m("C6")), hz(m("G6")), hz(m("E7"))], 3.5), 200.0 + SH_END, 0.28)
    add(fx, sub_drop(2.4), 200.0 + SH_END, 0.25)
    return fx, ui, {"big": big, "med": med}


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
    stems["strings"] = build_strings()
    print("synths…", flush=True)
    stems["pad"] = build_pad()
    stems["arp"] = build_arp()
    stems["chords"], stems["stabs"] = build_chords()
    stems["lead"], stems["lead2"], stems["vox"] = build_lead()
    stems["sub"], stems["midbass"], stems["reese"] = build_bass()
    print("drums & fx…", flush=True)
    (kick, clap, snare, hats, ohat, shaker, toms, cymb), ev = build_drums()
    stems.update(kick=kick, clap=clap, snare=snare, hats=hats, ohat=ohat, shaker=shaker, toms=toms, cymb=cymb)
    br = stereo()
    for b, root in ((22, "A1"), (44, "A1"), (76, "A1"), (96, "C2"), (100, "C2")):
        add(br, braam(m(root), 3.6, b), T(b), 1.0)
    stems["braam"] = br
    stems["fx"], stems["ui"], hits = build_sfx()

    LEVEL = {
        "kick": -3.5, "clap": -7.0, "snare": -9.5, "hats": -18.0, "ohat": -20.0, "shaker": -23.0, "toms": -10.0, "cymb": -14.5,
        "sub": -9.0, "midbass": -12.5, "reese": -13.0, "chords": -9.5, "stabs": -10.0, "lead": -8.0, "lead2": -14.0, "vox": -14.5,
        "arp": -12.5, "pad": -14.0, "piano": -6.5, "strings": -12.0, "braam": -9.0, "fx": -5.5, "ui": -12.0,
    }
    SEND_HALL = {"piano": 0.35, "strings": 0.35, "pad": 0.4, "arp": 0.25, "lead": 0.22, "lead2": 0.3, "vox": 0.35, "chords": 0.16,
                 "stabs": 0.2, "fx": 0.25, "ui": 0.3, "braam": 0.2, "clap": 0.15}
    SEND_PLATE = {"snare": 0.25, "clap": 0.22, "toms": 0.3, "kick": 0.04, "hats": 0.1, "ohat": 0.12, "cymb": 0.1}
    SC = {"sub": 0.8, "midbass": 0.6, "reese": 0.5, "chords": 0.6, "stabs": 0.25, "pad": 0.5, "arp": 0.35, "lead": 0.18,
          "lead2": 0.3, "vox": 0.25, "strings": 0.2}
    kick_times = [t for t, g in ev["kick"]]

    print("mixing…", flush=True)
    hall_ir = make_ir(3.2, 0.025, 1)
    plate_ir = make_ir(1.3, 0.008, 2, bright=1.4)
    gap = np.ones(N)
    for a, b in GAPS:
        i, j = int(a * SR), int(b * SR)
        r = int(0.006 * SR)
        gap[i:j] = 0.0
        gap[i:i + r] = np.linspace(1, 0, r)
    dry, hall_in, plate_in = stereo(), stereo(), stereo()
    report = {}
    for name, x in stems.items():
        r = active_rms(x)
        y = x * (10 ** (LEVEL[name] / 20) / max(r, 1e-9) * 0.1)
        if name in SC:
            y = y * sidechain(kick_times, SC[name])
        if name in ("piano", "strings", "pad", "lead", "lead2", "vox"):
            y = butter(y, 90, "high", 2)
        if name in ("hats", "ohat", "shaker", "cymb"):
            y = butter(y, 400, "high", 2)
        if name not in ("fx",):
            y = y * gap
        dry += y
        hall_in += y * SEND_HALL.get(name, 0.0)
        plate_in += y * SEND_PLATE.get(name, 0.0)
        report[name] = round(20 * math.log10(max(r, 1e-9)), 1)
    hall_in = butter(hall_in, 180, "high", 2)
    wet = convolve(hall_in, hall_ir) * 0.85 + convolve(plate_in, plate_ir) * 0.8
    mix = butter(dry + wet, 24, "high", 2)

    meter = pyln.Meter(SR)
    mix = mix * 10 ** ((-20.0 - meter.integrated_loudness(mix.T)) / 20)
    glue = pb.Pedalboard([
        pb.LowShelfFilter(cutoff_frequency_hz=60, gain_db=-1.0, q=0.7),
        pb.PeakFilter(cutoff_frequency_hz=300, gain_db=-2.0, q=0.8),
        pb.PeakFilter(cutoff_frequency_hz=3200, gain_db=1.0, q=0.9),
        pb.HighShelfFilter(cutoff_frequency_hz=9000, gain_db=2.0, q=0.7),
        pb.Compressor(threshold_db=-18, ratio=2.0, attack_ms=20, release_ms=200),
    ])
    out = glue(mix.astype(np.float32), SR).astype(np.float64)
    target = -13.5
    for _ in range(3):
        lufs = meter.integrated_loudness(out.T)
        out = out * 10 ** ((target - lufs) / 20)
        out, g = limit(out, -1.0, 5.0, 120.0)
    gr = 20 * np.log10(np.maximum(g, 1e-6))
    print(f"limiter: max GR {gr.min():.1f} dB, samples >3dB GR: {np.mean(gr < -3) * 100:.2f}%")
    fade = int(1.4 * SR)
    end = int(END * SR)
    out[:, end - fade:end] *= np.linspace(1, 0, fade) ** 2
    out = out[:, :end]
    lufs2 = meter.integrated_loudness(out.T.astype(np.float64))
    dst = ROOT / "public" / "audio" / "music.wav"
    sf.write(str(dst), out.T, SR, subtype="PCM_24")
    print("stem raw rms dB:", report)
    print(f"integrated LUFS {lufs2:.2f}, peak {20 * np.log10(np.max(np.abs(out)) + 1e-9):.2f} dBFS")
    secs = [(0, 16), (16, 44), (44, 60), (60, 88), (88, 104), (104, 120), (120, 128), (128, 152), (152, 176), (176, 192), (192, 210), (210, 224)]
    for a, b in secs:
        seg = out[:, int(a * SR):int(b * SR)].T.astype(np.float64)
        print(f"  {a:5.0f}-{b:5.0f}s  {meter.integrated_loudness(seg):6.1f} LUFS")

    # credits spectrum (indexed in the credits scene's own timebase)
    win = 4096
    mono = np.pad(out.mean(axis=0).astype(np.float64), (0, win))
    freqs = np.fft.rfftfreq(win, 1 / SR)
    edges = np.geomspace(55, 9000, 41)
    lo = np.searchsorted(freqs, edges[:-1])
    hi = np.maximum(np.searchsorted(freqs, edges[1:]), lo + 1)
    hann = np.hanning(win)
    spec = []
    for k in range(int(14.0 * 60)):
        c = int((190.0 + SH_END + k / 60) * SR)
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

    beats = {
        "bpm": BPM, "bars": NB, "end": END,
        "kicks": ev["kick"], "snares": ev["snare"], "crashes": ev["crash"],
        "big": hits["big"], "med": hits["med"],
        "energy": [energy(b) for b in range(NB)],
        "gaps": GAPS,
        "cuts": {"hardware": HW_CUTS, "future": FT_CUTS, "courses": COURSE_CUTS, "photos": PHOTO_CUTS},
        "accepted": ACCEPTED,
    }
    (DATA / "beats.json").write_text(json.dumps(beats))
    for name in ("kick", "sub", "chords", "lead", "piano", "fx"):
        sf.write(str(BUILD / f"stem2_{name}.wav"), (stems[name] / (np.max(np.abs(stems[name])) + 1e-9) * 0.8).T.astype(np.float32), SR)
    print("wrote", dst)


if __name__ == "__main__":
    main()
