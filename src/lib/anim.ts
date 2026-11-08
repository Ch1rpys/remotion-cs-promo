export const clamp = (x: number, a = 0, b = 1) => Math.min(b, Math.max(a, x));
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const invLerp = (a: number, b: number, x: number) => clamp((x - a) / (b - a));
export const smoothstep = (a: number, b: number, x: number) => {
  const t = invLerp(a, b, x);
  return t * t * (3 - 2 * t);
};
export const mix = lerp;

export const ease = {
  linear: (t: number) => t,
  inQuad: (t: number) => t * t,
  outQuad: (t: number) => 1 - (1 - t) * (1 - t),
  inOutQuad: (t: number) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2),
  inCubic: (t: number) => t * t * t,
  outCubic: (t: number) => 1 - Math.pow(1 - t, 3),
  inOutCubic: (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
  outQuart: (t: number) => 1 - Math.pow(1 - t, 4),
  inOutQuart: (t: number) => (t < 0.5 ? 8 * t * t * t * t : 1 - Math.pow(-2 * t + 2, 4) / 2),
  inQuart: (t: number) => t * t * t * t,
  outQuint: (t: number) => 1 - Math.pow(1 - t, 5),
  inOutQuint: (t: number) => (t < 0.5 ? 16 * t * t * t * t * t : 1 - Math.pow(-2 * t + 2, 5) / 2),
  inExpo: (t: number) => (t === 0 ? 0 : Math.pow(2, 10 * t - 10)),
  outExpo: (t: number) => (t === 1 ? 1 : 1 - Math.pow(2, -10 * t)),
  inOutExpo: (t: number) =>
    t === 0 ? 0 : t === 1 ? 1 : t < 0.5 ? Math.pow(2, 20 * t - 10) / 2 : (2 - Math.pow(2, -20 * t + 10)) / 2,
  outBack: (t: number) => {
    const c1 = 1.70158;
    const c3 = c1 + 1;
    return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
  },
  inOutSine: (t: number) => -(Math.cos(Math.PI * t) - 1) / 2,
  outSine: (t: number) => Math.sin((t * Math.PI) / 2),
  inSine: (t: number) => 1 - Math.cos((t * Math.PI) / 2),
};

/** progress of t through [a,b], eased */
export const prog = (t: number, a: number, b: number, e: (x: number) => number = ease.linear) => e(invLerp(a, b, t));

/** 0→1 over [inA,inB], hold, 1→0 over [outA,outB] */
export const envelope = (t: number, inA: number, inB: number, outA: number, outB: number, e = ease.inOutCubic) => {
  if (t < inA || t > outB) return 0;
  if (t < inB) return e(invLerp(inA, inB, t));
  if (t > outA) return 1 - e(invLerp(outA, outB, t));
  return 1;
};

export function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const hash1 = (n: number) => {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453123;
  return x - Math.floor(x);
};

const fade = (t: number) => t * t * t * (t * (t * 6 - 15) + 10);
/** smooth 1D value noise in [-1,1] */
export const noise1 = (x: number, seed = 0) => {
  const i = Math.floor(x);
  const f = x - i;
  const a = hash1(i + seed * 1013) * 2 - 1;
  const b = hash1(i + 1 + seed * 1013) * 2 - 1;
  return lerp(a, b, fade(f));
};

/** fractal 1D noise, handy for camera shake / drift */
export const fbm1 = (x: number, seed = 0, oct = 3) => {
  let v = 0;
  let amp = 0.5;
  let freq = 1;
  for (let i = 0; i < oct; i++) {
    v += amp * noise1(x * freq, seed + i * 17);
    amp *= 0.5;
    freq *= 2.03;
  }
  return v;
};
