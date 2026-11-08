import React from "react";
import { useCurrentFrame, useVideoConfig } from "remotion";
import { C, F } from "../theme";
import { clamp, ease, hash1, invLerp, lerp } from "../lib/anim";

export const useTime = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  return frame / fps;
};

const GLYPHS = "01ABCDEFGHJKLMNPQRSTUVWXYZ#$%&*+=<>/\\{}[]";

export const ScrambleText: React.FC<{
  text: string;
  t0: number;
  dur?: number;
  t1?: number;
  outDur?: number;
  style?: React.CSSProperties;
  seed?: number;
}> = ({ text, t0, dur = 0.8, t1, outDur = 0.4, style, seed = 1 }) => {
  const t = useTime();
  const frame = useCurrentFrame();
  const n = text.length;
  let out = "";
  for (let i = 0; i < n; i++) {
    const ch = text[i];
    const appear = t0 + (i / Math.max(1, n)) * dur * 0.45;
    const resolve = appear + dur * 0.35 + hash1(i * 13 + seed) * dur * 0.3;
    if (ch === " ") {
      out += " ";
    } else if (t < appear) {
      out += "\u2007";
    } else if (t < resolve) {
      out += GLYPHS[Math.floor(hash1(Math.floor(frame / 3) * 7.3 + i * 31 + seed) * GLYPHS.length)];
    } else {
      out += ch;
    }
  }
  let opacity = clamp((t - t0) / 0.15);
  if (t1 !== undefined) opacity *= 1 - ease.inCubic(invLerp(t1, t1 + outDur, t));
  return <span style={{ whiteSpace: "pre", opacity, ...style }}>{out}</span>;
};

export const RevealChars: React.FC<{
  text: string;
  t0: number;
  t1?: number;
  stagger?: number;
  dur?: number;
  outDur?: number;
  blur?: number;
  rise?: number;
  scaleFrom?: number;
  style?: React.CSSProperties;
  charStyle?: (i: number) => React.CSSProperties;
}> = ({ text, t0, t1, stagger = 0.05, dur = 0.8, outDur = 0.5, blur = 14, rise = 22, scaleFrom = 1, style, charStyle }) => {
  const t = useTime();
  const chars = Array.from(text);
  const out = t1 === undefined ? 0 : ease.inCubic(invLerp(t1, t1 + outDur, t));
  if (t < t0 - 0.01 || out >= 1) return <span style={{ ...style, opacity: 0 }}>{text}</span>;
  return (
    <span style={{ display: "inline-block", whiteSpace: "pre", ...style }}>
      {chars.map((ch, i) => {
        const p = ease.outCubic(invLerp(t0 + i * stagger, t0 + i * stagger + dur, t));
        const o = p * (1 - out);
        const b = (1 - p) * blur + out * 10;
        const s = scaleFrom + (1 - scaleFrom) * p;
        return (
          <span
            key={i}
            style={{
              display: "inline-block",
              opacity: o,
              filter: b > 0.05 ? `blur(${b}px)` : undefined,
              transform: `translateY(${(1 - p) * rise - out * 10}px) scale(${s})`,
              ...(charStyle ? charStyle(i) : {}),
            }}
          >
            {ch === " " ? "\u00a0" : ch}
          </span>
        );
      })}
    </span>
  );
};

export const Caption: React.FC<{
  zh: string;
  en?: string;
  start: number;
  end: number;
  y?: number;
  size?: number;
  color?: string;
  accent?: string;
  align?: "center" | "left";
  x?: number;
  backdrop?: number;
}> = ({ zh, en, start, end, y = 820, size = 58, color = C.white, accent = C.cyan, align = "center", x = 0, backdrop = 0 }) => {
  const t = useTime();
  if (t < start - 0.05 || t > end + 0.8) return null;
  const line = ease.inOutCubic(invLerp(start + 0.25, start + 1.1, t)) * (1 - ease.inCubic(invLerp(end, end + 0.5, t)));
  const bd = backdrop * ease.inOutCubic(invLerp(start - 0.05, start + 0.6, t)) * (1 - ease.inCubic(invLerp(end, end + 0.6, t)));
  return (
    <div
      style={{
        position: "absolute",
        left: align === "center" ? 0 : x,
        right: align === "center" ? 0 : undefined,
        top: y,
        display: "flex",
        flexDirection: "column",
        alignItems: align === "center" ? "center" : "flex-start",
        gap: 18,
        pointerEvents: "none",
      }}
    >
      {bd > 0 ? (
        <div
          style={{
            position: "absolute",
            left: align === "center" ? "50%" : -200,
            top: -size * 1.6,
            width: Math.max(900, zh.length * size * 1.5),
            height: size * 5,
            transform: align === "center" ? "translateX(-50%)" : undefined,
            background: "radial-gradient(ellipse at center, rgba(0,3,10,0.9) 0%, rgba(0,3,10,0.6) 40%, rgba(0,0,0,0) 72%)",
            opacity: bd,
          }}
        />
      ) : null}
      <RevealChars
        text={zh}
        t0={start}
        t1={end}
        stagger={0.055}
        dur={0.9}
        style={{
          fontFamily: F.serif,
          fontWeight: 600,
          fontSize: size,
          letterSpacing: "0.14em",
          color,
          textShadow: `0 0 28px rgba(0,0,0,0.9), 0 0 60px rgba(0,0,0,0.6), 0 0 18px ${accent}44`,
        }}
      />
      <div
        style={{
          width: 320 * line,
          height: 1,
          background: `linear-gradient(90deg, transparent, ${accent}, transparent)`,
          opacity: 0.9,
          alignSelf: align === "center" ? "center" : "flex-start",
        }}
      />
      {en ? (
        <ScrambleText
          text={en.toUpperCase()}
          t0={start + 0.45}
          dur={1.0}
          t1={end}
          style={{
            fontFamily: F.display,
            fontWeight: 500,
            fontSize: Math.round(size * 0.32),
            letterSpacing: "0.42em",
            color: "rgba(210,228,255,0.78)",
            textShadow: "0 0 16px rgba(0,0,0,0.9)",
          }}
        />
      ) : null}
    </div>
  );
};

export const ChapterCard: React.FC<{
  label: string;
  zh: string;
  en: string;
  index: string;
  start: number;
  end: number;
  accent?: string;
  y?: number;
}> = ({ label, zh, en, index, start, end, accent = C.cyan, y = 0 }) => {
  const t = useTime();
  if (t < start - 0.05 || t > end + 0.9) return null;
  const inP = ease.outQuart(invLerp(start, start + 1.2, t));
  const outP = ease.inCubic(invLerp(end, end + 0.7, t));
  const lineW = 520 * ease.inOutCubic(invLerp(start + 0.1, start + 1.1, t)) * (1 - outP);
  const zhChars = Array.from(zh);
  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        transform: `translateY(${y}px) scale(${1 + outP * 0.06})`,
        opacity: 1 - outP,
        filter: outP > 0.01 ? `blur(${outP * 12}px)` : undefined,
        pointerEvents: "none",
      }}
    >
      <div
        style={{
          position: "absolute",
          width: 1300,
          height: 640,
          background: "radial-gradient(ellipse at center, rgba(0,2,8,0.82) 0%, rgba(0,2,8,0.55) 38%, rgba(0,0,0,0) 70%)",
          opacity: inP,
        }}
      />
      <ScrambleText
        text={label}
        t0={start}
        dur={0.9}
        style={{ fontFamily: F.tech, fontSize: 22, letterSpacing: "0.7em", color: accent, fontWeight: 600, paddingLeft: "0.7em" }}
      />
      <div style={{ display: "flex", alignItems: "center", gap: 36, marginTop: 26 }}>
        <div style={{ width: lineW / 2, height: 1, background: `linear-gradient(90deg, transparent, ${accent})` }} />
        <div style={{ display: "flex" }}>
          {zhChars.map((ch, i) => {
            const p = ease.outCubic(invLerp(start + 0.25 + i * 0.12, start + 1.25 + i * 0.12, t));
            return (
              <span
                key={i}
                style={{
                  fontFamily: F.serif,
                  fontWeight: 800,
                  fontSize: 150,
                  lineHeight: 1.1,
                  letterSpacing: "0.12em",
                  paddingLeft: i === 0 ? "0.12em" : 0,
                  color: "#fff",
                  opacity: p,
                  filter: `blur(${(1 - p) * 18}px) drop-shadow(0 0 30px ${accent}66)`,
                  transform: `scale(${1.25 - 0.25 * p})`,
                  display: "inline-block",
                }}
              >
                {ch}
              </span>
            );
          })}
        </div>
        <div style={{ width: lineW / 2, height: 1, background: `linear-gradient(270deg, transparent, ${accent})` }} />
      </div>
      <ScrambleText
        text={en}
        t0={start + 0.7}
        dur={1.0}
        style={{ fontFamily: F.display, fontSize: 30, letterSpacing: "0.9em", color: "rgba(230,240,255,0.85)", marginTop: 18, paddingLeft: "0.9em" }}
      />
      <div style={{ marginTop: 30, fontFamily: F.mono, fontSize: 16, letterSpacing: "0.3em", color: "rgba(200,220,255,0.5)", opacity: inP }}>
        {index}
      </div>
    </div>
  );
};

export const CourseTag: React.FC<{
  zh: string;
  en: string;
  start: number;
  end: number;
  x?: number;
  y?: number;
  label?: string;
  accent?: string;
  right?: boolean;
}> = ({ zh, en, start, end, x = 96, y = 150, label = "核心课程 · CORE COURSE", accent = C.cyan, right = false }) => {
  const t = useTime();
  if (t < start - 0.05 || t > end + 0.6) return null;
  const p = ease.outCubic(invLerp(start, start + 0.6, t));
  const out = ease.inCubic(invLerp(end, end + 0.5, t));
  const h = 96 * ease.inOutCubic(invLerp(start, start + 0.5, t));
  return (
    <div
      style={{
        position: "absolute",
        top: y,
        left: right ? undefined : x,
        right: right ? x : undefined,
        opacity: 1 - out,
        display: "flex",
        gap: 18,
        flexDirection: right ? "row-reverse" : "row",
        textAlign: right ? "right" : "left",
        pointerEvents: "none",
      }}
    >
      <div style={{ width: 3, height: h, background: `linear-gradient(180deg, ${accent}, ${accent}00)`, boxShadow: `0 0 12px ${accent}` }} />
      <div style={{ display: "flex", flexDirection: "column", gap: 6, transform: `translateX(${(1 - p) * (right ? 20 : -20)}px)` }}>
        <ScrambleText text={label} t0={start + 0.05} dur={0.6} style={{ fontFamily: F.sans, fontSize: 15, letterSpacing: "0.3em", color: accent, fontWeight: 500 }} />
        <ScrambleText text={zh} t0={start + 0.15} dur={0.7} style={{ fontFamily: F.sans, fontSize: 34, fontWeight: 600, color: "#fff", letterSpacing: "0.12em", textShadow: "0 0 20px rgba(0,0,0,0.8)" }} />
        <ScrambleText text={en.toUpperCase()} t0={start + 0.3} dur={0.8} style={{ fontFamily: F.mono, fontSize: 15, letterSpacing: "0.25em", color: "rgba(210,225,255,0.7)" }} />
      </div>
    </div>
  );
};

export const BigTitle: React.FC<{
  zh: string;
  en?: string;
  start: number;
  end: number;
  size?: number;
  y?: number;
  accent?: string;
  spacing?: number;
}> = ({ zh, en, start, end, size = 170, y = 0, accent = C.cyan, spacing = 0.16 }) => {
  const t = useTime();
  if (t < start - 0.05 || t > end + 0.8) return null;
  const chars = Array.from(zh);
  const out = ease.inCubic(invLerp(end, end + 0.6, t));
  const cw = size * (1 + spacing);
  const total = cw * chars.length;
  const bandX = lerp(-0.4 * total, 1.4 * total, ((t - start) * 0.28) % 1);
  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        transform: `translateY(${y}px)`,
        opacity: 1 - out,
        filter: out > 0.01 ? `blur(${out * 14}px)` : undefined,
        pointerEvents: "none",
      }}
    >
      <div style={{ display: "flex" }}>
        {chars.map((ch, i) => {
          const p = ease.outQuart(invLerp(start + i * 0.07, start + 0.9 + i * 0.07, t));
          const bgX = bandX - 1.5 * total - i * cw;
          return (
            <span
              key={i}
              style={{
                display: "inline-block",
                width: cw,
                textAlign: "center",
                fontFamily: F.serif,
                fontWeight: 900,
                fontSize: size,
                lineHeight: 1.15,
                backgroundImage: `linear-gradient(100deg, #c3dcf2 0%, #d4e8f8 40%, #ffffff 47%, #ffffff 50%, #bfeaff 54%, #c3dcf2 60%, #c3dcf2 100%)`,
                backgroundSize: `${total * 3}px 100%`,
                backgroundRepeat: "no-repeat",
                backgroundPosition: `${bgX}px 0`,
                WebkitBackgroundClip: "text",
                backgroundClip: "text",
                color: "transparent",
                opacity: p,
                transform: `scale(${1.35 - 0.35 * p}) translateY(${(1 - p) * 20}px)`,
                filter: `blur(${(1 - p) * 22}px) drop-shadow(0 0 26px ${accent}88) drop-shadow(0 6px 30px rgba(0,0,0,0.8))`,
              }}
            >
              {ch}
            </span>
          );
        })}
      </div>
      {en ? (
        <ScrambleText
          text={en}
          t0={start + 0.6}
          dur={1.1}
          t1={end}
          style={{ fontFamily: F.display, fontWeight: 500, fontSize: 30, letterSpacing: "0.75em", color: "rgba(220,235,255,0.85)", marginTop: 26, paddingLeft: "0.75em", textShadow: "0 0 20px rgba(0,0,0,0.9)" }}
        />
      ) : null}
    </div>
  );
};

export const Hud: React.FC<{ x: number; y: number; lines: string[]; start: number; end?: number; accent?: string; size?: number; right?: boolean }> = ({
  x,
  y,
  lines,
  start,
  end,
  accent = C.cyan,
  size = 15,
  right,
}) => {
  const t = useTime();
  if (t < start - 0.05) return null;
  const out = end === undefined ? 0 : ease.inCubic(invLerp(end, end + 0.4, t));
  if (out >= 1) return null;
  return (
    <div
      style={{
        position: "absolute",
        left: right ? undefined : x,
        right: right ? x : undefined,
        top: y,
        fontFamily: F.mono,
        fontSize: size,
        lineHeight: 1.7,
        letterSpacing: "0.12em",
        color: "rgba(200,225,255,0.75)",
        opacity: 1 - out,
        textAlign: right ? "right" : "left",
        pointerEvents: "none",
      }}
    >
      {lines.map((l, i) => (
        <div key={i}>
          <span style={{ color: accent }}>{i === 0 ? "▍" : " "}</span>
          <ScrambleText text={l} t0={start + i * 0.12} dur={0.6} seed={i + 3} />
        </div>
      ))}
    </div>
  );
};
