import React from "react";
import { AbsoluteFill, Img, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import { clamp, ease, hash1, invLerp } from "../lib/anim";

export const Grain: React.FC<{ opacity?: number }> = ({ opacity = 0.062 }) => {
  const frame = useCurrentFrame();
  const idx = Math.floor(frame / 2) % 6;
  const ox = Math.floor(hash1(frame * 3.1) * 384);
  const oy = Math.floor(hash1(frame * 7.7) * 384);
  return (
    <AbsoluteFill
      style={{
        backgroundImage: `url(${staticFile(`textures/grain${idx}.png`)})`,
        backgroundPosition: `${ox}px ${oy}px`,
        backgroundSize: "384px 384px",
        mixBlendMode: "overlay",
        opacity,
        pointerEvents: "none",
      }}
    />
  );
};

export const Vignette: React.FC<{ strength?: number }> = ({ strength = 0.62 }) => (
  <AbsoluteFill
    style={{
      background: `radial-gradient(ellipse 75% 70% at 50% 50%, rgba(0,0,0,0) 55%, rgba(0,0,0,${strength}) 100%)`,
      pointerEvents: "none",
    }}
  />
);

/** Letterbox bar height as a function of global time (seconds). */
const LB = 118;
const segments: [number, number, number][] = [
  // [time, height, transitionSeconds] – height reached at `time` after ramp of transitionSeconds
  [0, LB, 0],
  [44.0, 0, 0.5],
  [128.6, LB, 1.0],
  [152.0, 0, 0.5],
  [194.4, LB, 1.0],
];

export const letterboxAt = (t: number) => {
  let h = segments[0][1];
  for (let i = 1; i < segments.length; i++) {
    const [time, target, dur] = segments[i];
    if (t >= time) {
      h = target;
      continue;
    }
    if (t > time - dur) {
      return h + (target - h) * ease.inOutCubic(invLerp(time - dur, time, t));
    }
    return h;
  }
  return h;
};

export const Letterbox: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const h = letterboxAt(frame / fps);
  if (h < 0.5) return null;
  return (
    <AbsoluteFill style={{ pointerEvents: "none" }}>
      <div style={{ position: "absolute", left: 0, right: 0, top: 0, height: h, background: "#000" }} />
      <div style={{ position: "absolute", left: 0, right: 0, bottom: 0, height: h, background: "#000" }} />
    </AbsoluteFill>
  );
};

/** Short flashes on musical hits. */
export const Flashes: React.FC<{ hits: { t: number; strength: number; color?: string; dur?: number }[] }> = ({ hits }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = frame / fps;
  let a = 0;
  let color = "255,255,255";
  for (const h of hits) {
    const d = h.dur ?? 0.45;
    if (t >= h.t - 0.03 && t < h.t + d) {
      const p = clamp((t - h.t) / d);
      const v = h.strength * Math.pow(1 - p, 2.2) * (t < h.t ? 0.4 : 1);
      if (v > a) {
        a = v;
        color = h.color ?? "255,255,255";
      }
    }
  }
  if (a <= 0.001) return null;
  return <AbsoluteFill style={{ background: `rgba(${color},${a})`, mixBlendMode: "screen", pointerEvents: "none" }} />;
};

export const FadeFromBlack: React.FC<{ start: number; end: number; invert?: boolean }> = ({ start, end, invert }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = frame / fps;
  let o = 1 - ease.inOutQuad(invLerp(start, end, t));
  if (invert) o = 1 - o;
  if (o <= 0.001) return null;
  return <AbsoluteFill style={{ background: "#000", opacity: o, pointerEvents: "none" }} />;
};

export const PhotoImg: React.FC<{ src: string; style?: React.CSSProperties }> = ({ src, style }) => (
  <Img src={staticFile(src)} style={{ width: "100%", height: "100%", objectFit: "cover", ...style }} />
);
