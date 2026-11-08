export const FPS = 60;
export const BPM = 120;
export const BEAT = 60 / BPM;
export const BAR = BEAT * 4;
export const WIDTH = 1920;
export const HEIGHT = 1080;
export const TOTAL_SECONDS = 224;
export const TOTAL_FRAMES = TOTAL_SECONDS * FPS;

export const s2f = (s: number) => Math.round(s * FPS);
export const bar = (n: number) => n * BAR;
