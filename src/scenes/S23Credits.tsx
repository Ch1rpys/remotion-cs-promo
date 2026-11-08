import React, { useMemo } from "react";
import prompt from "../data/prompt.json";
import spectrum from "../data/spectrum.json";
import { RevealChars, ScrambleText, useTime } from "../components/Text";
import { clamp, ease, invLerp, lerp, mulberry32 } from "../lib/anim";
import { C, F } from "../theme";

const ROLES = [
  { zh: "导演", en: "DIRECTED BY", col: C.gold, t0: 190.0 },
  { zh: "配乐", en: "ORIGINAL SCORE BY", col: C.cyan, t0: 192.0 },
  { zh: "提示词工程", en: "PROMPT ENGINEERING BY", col: C.green, t0: 194.0 },
];
const P2 = 198.0;
const P3 = 200.0;

const RoleLabel: React.FC<{ t: number; o: number }> = ({ t, o }) => (
  <>
    {ROLES.map((r, i) => {
      const next = i < ROLES.length - 1 ? ROLES[i + 1].t0 : P2;
      const inP = ease.outCubic(invLerp(r.t0, r.t0 + 0.45, t));
      const outP = ease.inCubic(invLerp(next, next + 0.35, t));
      if (inP <= 0 || outP >= 1) return null;
      return (
        <div
          key={i}
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            top: 262,
            textAlign: "center",
            opacity: inP * (1 - outP),
            transform: `translateY(${(1 - inP) * 34 - outP * 34}px)`,
            filter: inP < 1 || outP > 0 ? `blur(${(1 - inP) * 10 + outP * 10}px)` : undefined,
          }}
        >
          <div style={{ fontFamily: F.serif, fontWeight: 700, fontSize: 46, letterSpacing: "0.5em", paddingLeft: "0.5em", color: r.col, textShadow: `0 0 26px ${r.col}88` }}>{r.zh}</div>
          <ScrambleText text={r.en} t0={r.t0 + 0.1 - o} dur={0.6} seed={i + 40} style={{ fontFamily: F.tech, fontSize: 16, letterSpacing: "0.6em", color: "rgba(230,240,255,0.7)" }} />
        </div>
      );
    })}
  </>
);

const Viewfinder: React.FC<{ t: number }> = ({ t }) => {
  const a = ease.outCubic(invLerp(190.0, 190.55, t)) * (1 - ease.inCubic(invLerp(192.0, 192.4, t)));
  if (a <= 0.001) return null;
  const s = 1.18 - 0.18 * ease.outQuart(invLerp(190.0, 190.7, t));
  const x0 = 470;
  const x1 = 1450;
  const y0 = 232;
  const y1 = 712;
  const arm = 70;
  const col = "rgba(255,226,168,0.9)";
  const f = Math.floor((t % 1) * 24);
  const tc = `00:${String(Math.floor(t / 60) % 60).padStart(2, "0")}:${String(Math.floor(t) % 60).padStart(2, "0")}:${String(f).padStart(2, "0")}`;
  const corner = (cx: number, cy: number, sx: number, sy: number) => <path d={`M${cx + sx * arm} ${cy} L${cx} ${cy} L${cx} ${cy + sy * arm}`} fill="none" stroke={col} strokeWidth={3} />;
  return (
    <svg width={1920} height={1080} style={{ position: "absolute", inset: 0, opacity: a, transform: `scale(${s})`, transformOrigin: "960px 472px", filter: `drop-shadow(0 0 8px ${C.gold}88)` }}>
      {corner(x0, y0, 1, 1)}
      {corner(x1, y0, -1, 1)}
      {corner(x0, y1, 1, -1)}
      {corner(x1, y1, -1, -1)}
      <circle cx={x0 + 34} cy={y0 + 34} r={8} fill="#ff3b3b" opacity={Math.floor(t * 2) % 2 ? 1 : 0.25} />
      <text x={x0 + 52} y={y0 + 40} fontFamily={F.mono} fontSize={18} letterSpacing={3} fill={col}>
        REC
      </text>
      <text x={x1 - 26} y={y0 + 40} textAnchor="end" fontFamily={F.mono} fontSize={18} letterSpacing={2} fill={col}>
        TC {tc}
      </text>
      <text x={x0 + 26} y={y1 - 22} fontFamily={F.mono} fontSize={14} letterSpacing={3} fill="rgba(255,226,168,0.6)">
        24 mm · f/1.4 · ISO 800
      </text>
      <text x={x1 - 26} y={y1 - 22} textAnchor="end" fontFamily={F.mono} fontSize={14} letterSpacing={3} fill="rgba(255,226,168,0.6)">
        4K · 60P
      </text>
      <path d="M960 460 V484 M948 472 H972" stroke="rgba(255,226,168,0.35)" strokeWidth={1.5} />
    </svg>
  );
};

const Spectrum: React.FC<{ t: number }> = ({ t }) => {
  const a = ease.outCubic(invLerp(192.0, 192.4, t)) * (1 - ease.inCubic(invLerp(194.0, 194.35, t)));
  if (a <= 0.001) return null;
  const frames = spectrum.frames as number[][];
  const fi = Math.max(0, Math.min(frames.length - 1, Math.floor((t - spectrum.t0) * spectrum.fps)));
  const f = frames[fi];
  const n = f.length;
  const bw = 11;
  const gap = 3;
  const total = n * 2 * (bw + gap);
  const x0 = 960 - total / 2;
  const base = 790;
  const grow = ease.outCubic(invLerp(192.0, 192.5, t));
  return (
    <svg width={1920} height={1080} style={{ position: "absolute", inset: 0, opacity: a, overflow: "visible" }}>
      <defs>
        <linearGradient id="specg" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor="#bff8ff" />
          <stop offset="0.5" stopColor={C.cyan} />
          <stop offset="1" stopColor={C.blue} />
        </linearGradient>
      </defs>
      {Array.from({ length: n * 2 }, (_, k) => {
        const band = k < n ? n - 1 - k : k - n;
        const v = Math.pow(f[band], 1.35) * grow;
        const h = 4 + v * 120;
        const x = x0 + k * (bw + gap);
        return (
          <g key={k}>
            <rect x={x} y={base - h} width={bw} height={h} rx={3} fill="url(#specg)" style={{ filter: `drop-shadow(0 0 6px ${C.cyan}aa)` }} />
            <rect x={x} y={base + 6} width={bw} height={h * 0.28} rx={3} fill={C.cyan} opacity={0.18} />
          </g>
        );
      })}
      <text x={960} y={base + 64} textAnchor="middle" fontFamily={F.mono} fontSize={15} letterSpacing={5} fill="rgba(190,240,255,0.7)">
        ORIGINAL SCORE · 120 BPM · A MINOR
      </text>
    </svg>
  );
};

/* ---------- the prompt document streaming past (194–198 s) ---------- */
const DOC_T0 = 194.35;
const DOC_T1 = 197.75;
const SEND = 197.8;
const COLS = 38.5;
const paragraphs = (prompt.text as string).split("\n").filter((l) => l.trim().length > 0);
const isHead = (l: string) => l.startsWith("【") || l.startsWith("《");
const miniLines = paragraphs.flatMap((l) => {
  const n = Math.max(1, Math.ceil(l.length / COLS));
  return Array.from({ length: n }, (_, k) => ({ w: k < n - 1 ? 1 : (l.length - COLS * (n - 1)) / COLS, head: isHead(l) }));
});

const PromptDoc: React.FC<{ t: number }> = ({ t }) => {
  const inP = ease.outCubic(invLerp(194.0, 194.55, t));
  const outP = ease.inCubic(invLerp(197.75, 198.35, t));
  if (inP <= 0.001 || outP >= 0.999) return null;
  const p = ease.inOutCubic(invLerp(DOC_T0, DOC_T1, t));
  const W = 1260;
  const H = 490;
  const barH = 46;
  const statusH = 38;
  const viewH = H - barH - statusH;
  const miniW = 118;
  const miniH = viewH - 24;
  const lineH = miniH / miniLines.length;
  const boxH = Math.max(18, miniH * 0.16);
  const sent = t >= SEND;
  const flash = sent ? Math.exp(-(t - SEND) * 5) : 0;
  const pct = Math.round(p * 100);
  const cur = Math.min(paragraphs.length, Math.max(1, Math.round(p * paragraphs.length)));
  return (
    <div
      style={{
        position: "absolute",
        left: 960 - W / 2,
        top: 446,
        width: W,
        height: H,
        opacity: inP * (1 - outP),
        transform: `perspective(2400px) translateX(${outP * 430}px) rotateX(${lerp(10, 4, p)}deg) rotateY(${lerp(-5, 5, p) - outP * 18}deg) scale(${(0.94 + 0.06 * inP) * (1 - 0.32 * outP)})`,
        filter: inP < 1 || outP > 0 ? `blur(${(1 - inP) * 8 + outP * 10}px)` : undefined,
        borderRadius: 18,
        overflow: "hidden",
        background: "linear-gradient(160deg, rgba(10,26,22,0.86) 0%, rgba(4,12,12,0.92) 100%)",
        border: `1px solid rgba(61,255,154,${0.3 + 0.5 * flash})`,
        boxShadow: `0 40px 120px rgba(0,0,0,0.75), 0 0 ${50 + 70 * flash}px rgba(61,255,154,${0.14 + 0.35 * flash})`,
      }}
    >
      <div style={{ position: "absolute", left: 0, right: 0, top: 0, height: barH, borderBottom: "1px solid rgba(61,255,154,0.14)", background: "rgba(255,255,255,0.02)" }}>
        {["#ff5f57", "#febc2e", "#28c840"].map((c, i) => (
          <div key={c} style={{ position: "absolute", left: 20 + i * 22, top: 16, width: 13, height: 13, borderRadius: 7, background: c }} />
        ))}
        <div style={{ position: "absolute", left: 0, right: 0, top: 12, textAlign: "center", fontFamily: F.inter, fontSize: 16, color: "rgba(200,240,220,0.7)" }}>
          PROMPT.md <span style={{ color: "rgba(200,240,220,0.4)" }}>— 创作提示词</span>
        </div>
        <div style={{ position: "absolute", right: 22, top: 14, fontFamily: F.mono, fontSize: 13, letterSpacing: "0.12em", color: "rgba(61,255,154,0.65)" }}>UTF-8 · MARKDOWN</div>
      </div>
      <div
        style={{
          position: "absolute",
          left: 0,
          right: miniW + 20,
          top: barH,
          height: viewH,
          overflow: "hidden",
          WebkitMaskImage: "linear-gradient(180deg, transparent 0%, black 10%, black 88%, transparent 100%)",
          maskImage: "linear-gradient(180deg, transparent 0%, black 10%, black 88%, transparent 100%)",
        }}
      >
        <div style={{ position: "absolute", left: 0, right: 0, top: viewH * 0.42, height: 44, background: "linear-gradient(90deg, rgba(61,255,154,0) 0%, rgba(61,255,154,0.09) 30%, rgba(61,255,154,0.09) 70%, rgba(61,255,154,0) 100%)" }} />
        <div style={{ position: "absolute", left: 0, right: 0, top: 0, padding: "34px 0 40px", transform: `translateY(calc(${-100 * p}% + ${p * viewH}px))` }}>
          {paragraphs.map((l, i) => {
            const head = isHead(l);
            return (
              <div key={i} style={{ display: "flex", marginBottom: head ? 6 : 12, marginTop: head && i > 0 ? 14 : 0 }}>
                <div style={{ width: 70, flex: "0 0 70px", textAlign: "right", paddingRight: 18, fontFamily: F.mono, fontSize: 15, lineHeight: "38px", color: "rgba(120,170,150,0.45)" }}>{i + 1}</div>
                <div
                  style={{
                    flex: 1,
                    fontFamily: F.sans,
                    fontSize: head ? 26 : 23.5,
                    fontWeight: head ? 700 : 400,
                    lineHeight: "38px",
                    letterSpacing: "0.02em",
                    color: head ? C.gold : "rgba(226,246,236,0.86)",
                    textShadow: head ? `0 0 16px ${C.gold}66` : undefined,
                    paddingRight: 24,
                  }}
                >
                  {l}
                </div>
              </div>
            );
          })}
        </div>
      </div>
      <div style={{ position: "absolute", right: 18, top: barH + 12, width: miniW, height: miniH, borderLeft: "1px solid rgba(61,255,154,0.12)", paddingLeft: 10 }}>
        {miniLines.map((m, k) => (
          <div key={k} style={{ position: "absolute", left: 10, top: k * lineH, width: Math.max(6, m.w * (miniW - 16)), height: Math.max(1, lineH * 0.62), background: m.head ? "rgba(255,193,94,0.75)" : "rgba(200,240,220,0.3)", borderRadius: 1 }} />
        ))}
        <div style={{ position: "absolute", left: 4, right: -4, top: p * (miniH - boxH), height: boxH, background: "rgba(61,255,154,0.14)", border: "1px solid rgba(61,255,154,0.5)", borderRadius: 3 }} />
      </div>
      <div style={{ position: "absolute", left: 0, right: 0, bottom: 0, height: statusH, borderTop: "1px solid rgba(61,255,154,0.14)", background: "rgba(0,0,0,0.25)", display: "flex", alignItems: "center", padding: "0 22px", fontFamily: F.mono, fontSize: 14, letterSpacing: "0.08em", color: "rgba(200,240,220,0.65)" }}>
        <span>
          Ln {cur}, Col 1 · {prompt.chars.toLocaleString("en-US")} 字 · 19 节
        </span>
        <span style={{ marginLeft: "auto", color: sent ? C.green : "rgba(200,240,220,0.65)", textShadow: sent ? `0 0 12px ${C.green}` : undefined }}>{sent ? "⏎ 已发送给 Claude Opus 5.5" : `已读取 ${pct}%`}</span>
      </div>
      <div style={{ position: "absolute", left: 0, bottom: 0, height: 2, width: `${p * 100}%`, background: C.green, boxShadow: `0 0 10px ${C.green}` }} />
    </div>
  );
};

const NameMark: React.FC<{ t: number; o: number }> = ({ t, o }) => {
  const wipe = ease.inOutCubic(invLerp(190.0, 190.85, t));
  const band = lerp(-40, 140, ((t - 190.0) * 0.32) % 1);
  return (
    <div style={{ position: "absolute", left: 0, right: 0, top: 360, textAlign: "center" }}>
      <div
        style={{
          display: "inline-block",
          fontFamily: F.tech,
          fontWeight: 900,
          fontSize: 158,
          letterSpacing: "0.06em",
          lineHeight: 1.05,
          backgroundImage: `linear-gradient(100deg, #e9c27a 0%, #ffe7b8 ${band - 12}%, #ffffff ${band}%, #ffe7b8 ${band + 12}%, #d9a95a 100%)`,
          WebkitBackgroundClip: "text",
          backgroundClip: "text",
          color: "transparent",
          clipPath: `inset(-20% ${100 - wipe * 100}% -20% -5%)`,
          filter: `drop-shadow(0 0 22px ${C.gold}99) drop-shadow(0 8px 30px rgba(0,0,0,0.85)) blur(${(1 - wipe) * 6}px)`,
        }}
      >
        Ch1rpy
      </div>
      <div style={{ marginTop: 18 }}>
        <RevealChars text="万炯鸣" t0={190.4 - o} stagger={0.12} dur={0.7} style={{ fontFamily: F.serif, fontWeight: 600, fontSize: 60, letterSpacing: "0.7em", paddingLeft: "0.7em", color: "#fff", textShadow: "0 0 24px rgba(0,0,0,0.9)" }} />
      </div>
    </div>
  );
};

const LLMBlock: React.FC<{ t: number; o: number }> = ({ t, o }) => {
  const a = ease.outCubic(invLerp(P2, P2 + 0.6, t));
  const parts = useMemo(() => {
    const r = mulberry32(55);
    return Array.from({ length: 34 }, () => ({ ph: r() * Math.PI * 2, sp: 0.4 + r() * 0.9, rx: 300 + r() * 120, ry: 90 + r() * 60, s: 1.5 + r() * 2.5 }));
  }, []);
  if (a <= 0.001) return null;
  const settle = ease.inOutCubic(invLerp(P3, P3 + 0.8, t));
  const sc = lerp(1.0, 0.86, settle);
  return (
    <div style={{ position: "absolute", left: 1370 - 480, top: 255, width: 960, height: 360, opacity: a, transform: `scale(${sc}) translateY(${(1 - a) * 24}px)`, transformOrigin: "50% 50%" }}>
      <div style={{ position: "absolute", left: 80, top: 20, width: 800, height: 320, background: "radial-gradient(ellipse at center, rgba(209,75,255,0.28) 0%, rgba(123,92,255,0.12) 40%, rgba(0,0,0,0) 70%)" }} />
      {parts.map((p, i) => {
        const ang = p.ph + (t - P2) * p.sp;
        return (
          <div
            key={i}
            style={{
              position: "absolute",
              left: 480 + Math.cos(ang) * p.rx * (0.6 + 0.4 * a),
              top: 190 + Math.sin(ang) * p.ry,
              width: p.s,
              height: p.s,
              borderRadius: "50%",
              background: i % 4 ? C.magenta : C.gold,
              boxShadow: `0 0 ${p.s * 4}px ${i % 4 ? C.magenta : C.gold}`,
              opacity: 0.8,
            }}
          />
        );
      })}
      <div style={{ position: "absolute", left: 0, right: 0, top: 36, textAlign: "center" }}>
        <div style={{ fontFamily: F.serif, fontWeight: 700, fontSize: 40, letterSpacing: "0.45em", paddingLeft: "0.45em", color: "#f0b8ff", textShadow: `0 0 24px ${C.magenta}` }}>大语言模型</div>
        <ScrambleText text="LARGE LANGUAGE MODEL" t0={P2 + 0.1 - o} dur={0.6} seed={77} style={{ fontFamily: F.tech, fontSize: 15, letterSpacing: "0.6em", color: "rgba(240,220,255,0.7)" }} />
      </div>
      <div style={{ position: "absolute", left: 0, right: 0, top: 150, textAlign: "center" }}>
        <ScrambleText
          text="Claude Opus 5.5"
          t0={P2 + 0.2 - o}
          dur={1.0}
          seed={5}
          style={{
            fontFamily: F.display,
            fontWeight: 700,
            fontSize: 96,
            letterSpacing: "0.02em",
            backgroundImage: "linear-gradient(95deg, #c7a6ff 0%, #f3b0ff 45%, #ffd9a0 100%)",
            WebkitBackgroundClip: "text",
            backgroundClip: "text",
            color: "transparent",
            filter: `drop-shadow(0 0 24px ${C.magenta}aa) drop-shadow(0 8px 26px rgba(0,0,0,0.85))`,
          }}
        />
      </div>
    </div>
  );
};

/** Mirrors the "万炯鸣" and roles lines of the left block so the final card is balanced. */
const LLMCredits: React.FC<{ t: number; o: number }> = ({ t, o }) => {
  const a = ease.outCubic(invLerp(P3 + 0.2, P3 + 0.9, t));
  if (a <= 0.001) return null;
  return (
    <div style={{ position: "absolute", left: 1370 - 480, width: 960, top: 0, height: 1080, opacity: a, textAlign: "center" }}>
      <div style={{ position: "absolute", left: 0, right: 0, top: 517, transform: `translateY(${(1 - a) * 14}px)` }}>
        <RevealChars text="Anthropic" t0={P3 + 0.2 - o} stagger={0.04} dur={0.6} style={{ fontFamily: F.display, fontWeight: 500, fontSize: 36, letterSpacing: "0.42em", paddingLeft: "0.42em", color: "#ecd8ff", textShadow: `0 0 20px ${C.magenta}88, 0 0 20px rgba(0,0,0,0.9)` }} />
      </div>
      <div style={{ position: "absolute", left: 0, right: 0, top: 604 }}>
        <span style={{ fontFamily: F.sans, fontSize: 20.5, letterSpacing: "0.35em", paddingLeft: "0.35em", color: "rgba(240,215,255,0.9)", textShadow: "0 0 18px rgba(0,0,0,0.9)" }}>代码实现 · 实时渲染</span>
      </div>
    </div>
  );
};

const Bridge: React.FC<{ t: number; o: number }> = ({ t, o }) => {
  const a = ease.outCubic(invLerp(P3, P3 + 0.7, t));
  if (a <= 0.001) return null;
  const x0 = 850;
  const x1 = 990;
  return (
    <>
      <svg width={1920} height={1080} style={{ position: "absolute", inset: 0, opacity: a, overflow: "visible" }}>
        <defs>
          <linearGradient id="bridge" x1="0" x2="1" y1="0" y2="0">
            <stop offset="0" stopColor={C.gold} />
            <stop offset="1" stopColor={C.magenta} />
          </linearGradient>
        </defs>
        <line x1={x0 - 30} y1={472} x2={lerp(x0 - 30, x1 + 30, a)} y2={472} stroke="url(#bridge)" strokeWidth={3} strokeLinecap="round" style={{ filter: `drop-shadow(0 0 10px ${C.gold})` }} />
        {Array.from({ length: 10 }, (_, k) => {
          const dir = k % 2 ? 1 : -1;
          const u = ((((t - P3) * 0.9 + k / 10) % 1) + 1) % 1;
          const x = dir > 0 ? lerp(x0 - 30, x1 + 30, u) : lerp(x1 + 30, x0 - 30, u);
          return <circle key={k} cx={x} cy={472 + ((k % 3) - 1) * 5} r={3.2} fill={dir > 0 ? C.gold : C.magenta} style={{ filter: `drop-shadow(0 0 6px ${dir > 0 ? C.gold : C.magenta})` }} opacity={Math.sin(Math.PI * u)} />;
        })}
        <g transform={`translate(920 472) rotate(${(t - P3) * 40}) scale(${0.6 + 0.4 * a})`}>
          <circle r={27} fill="rgba(4,6,16,0.85)" stroke="url(#bridge)" strokeWidth={2} strokeDasharray="6 5" style={{ filter: `drop-shadow(0 0 8px ${C.magenta})` }} />
        </g>
        <g transform={`translate(920 472) scale(${0.6 + 0.4 * a})`} style={{ filter: "drop-shadow(0 0 10px #fff)" }}>
          <path d="M-10 -10 L10 10 M10 -10 L-10 10" stroke="#fff" strokeWidth={4} strokeLinecap="round" />
        </g>
      </svg>
      <div style={{ position: "absolute", left: 0, right: 0, top: 700, textAlign: "center", opacity: ease.outCubic(invLerp(P3 + 0.3, P3 + 1.0, t)) }}>
        <RevealChars text="人机共创" t0={P3 + 0.3 - o} stagger={0.1} dur={0.7} style={{ fontFamily: F.serif, fontWeight: 700, fontSize: 50, letterSpacing: "0.6em", paddingLeft: "0.6em", color: "#ffe2a8", textShadow: `0 0 26px ${C.gold}99` }} />
        <div style={{ fontFamily: F.tech, fontSize: 16, letterSpacing: "0.7em", color: "rgba(255,230,190,0.7)", marginTop: 14 }}>HUMAN × AI · 2026</div>
      </div>
      <div style={{ position: "absolute", left: 0, right: 0, top: 895, textAlign: "center", opacity: ease.outCubic(invLerp(P3 + 0.9, P3 + 1.6, t)) }}>
        <span style={{ fontFamily: F.sans, fontSize: 20, letterSpacing: "0.6em", color: "rgba(230,240,255,0.8)" }}>感谢观看</span>
        <span style={{ fontFamily: F.mono, fontSize: 14, letterSpacing: "0.45em", color: "rgba(200,220,255,0.55)", marginLeft: 24 }}>THANKS FOR WATCHING</span>
      </div>
    </>
  );
};

export const Credits: React.FC<{ offset: number }> = ({ offset }) => {
  const tau = useTime();
  const t = tau + offset;
  if (t < 189.9) return null;
  // human block: centred → lifted while the prompt streams → left slot of the final card
  const lift = ease.inOutCubic(invLerp(194.0, 194.6, t));
  const move = ease.inOutCubic(invLerp(P2, P2 + 0.8, t));
  const dx = lerp(0, -400, move);
  const dy = lerp(lerp(0, -168, lift), 0, move);
  const sc = lerp(lerp(1, 0.72, lift), 0.6, move);
  const dim = lerp(1, 0.55, move) + 0.45 * ease.inOutCubic(invLerp(P3, P3 + 0.8, t));
  const rolesLine = ease.outCubic(invLerp(P3 + 0.2, P3 + 0.9, t));
  return (
    <div style={{ position: "absolute", inset: 0 }}>
      <div style={{ position: "absolute", inset: 0, transformOrigin: "960px 472px", transform: `translate(${dx}px, ${dy}px) scale(${sc})`, opacity: clamp(dim) }}>
        <RoleLabel t={t} o={offset} />
        <NameMark t={t} o={offset} />
        <div style={{ position: "absolute", left: 0, right: 0, top: 690, textAlign: "center", opacity: rolesLine }}>
          <span style={{ fontFamily: F.sans, fontSize: 34, letterSpacing: "0.35em", color: "rgba(255,226,168,0.9)", textShadow: "0 0 18px rgba(0,0,0,0.9)" }}>导演 · 配乐 · 提示词工程</span>
        </div>
      </div>
      <Viewfinder t={t} />
      <Spectrum t={t} />
      <PromptDoc t={t} />
      <LLMBlock t={t} o={offset} />
      <LLMCredits t={t} o={offset} />
      <Bridge t={t} o={offset} />
    </div>
  );
};
