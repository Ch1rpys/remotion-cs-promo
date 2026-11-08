import React from "react";
import { AbsoluteFill } from "remotion";
import { Backdrop } from "../components/Backdrop";
import { Dust } from "../components/Dust";
import { Caption, CourseTag, ScrambleText, useTime } from "../components/Text";
import { clamp, ease, hash1, invLerp, lerp } from "../lib/anim";
import { C, F } from "../theme";

const STAGE_W = 1100;
const FOCUS = [0.0, 1.2, 2.6, 4.0, 5.4];

const COL = { kw: "#c792ea", id: "#e8eefc", op: "#89ddff", num: "#f78c6c", punct: "#89ddff" };
const TOKENS: { s: string; type: string; c: string }[] = [
  { s: "int", type: "KEYWORD", c: COL.kw },
  { s: "x", type: "IDENT", c: COL.id },
  { s: "=", type: "ASSIGN", c: COL.op },
  { s: "a", type: "IDENT", c: COL.id },
  { s: "+", type: "PLUS", c: COL.op },
  { s: "b", type: "IDENT", c: COL.id },
  { s: "*", type: "STAR", c: COL.op },
  { s: "2", type: "NUMBER", c: COL.num },
  { s: ";", type: "SEMI", c: COL.punct },
];
const ASM: [string, string, string][] = [
  ["lw", "t0, 0(a1)", "# a"],
  ["lw", "t1, 0(a2)", "# b"],
  ["slli", "t1, t1, 1", "# b * 2"],
  ["add", "t0, t0, t1", "# a + b*2"],
  ["sw", "t0, 0(a0)", "# x ="],
];
const HEX = ["0005A283", "00062303", "00131313", "006282B3", "00552023"];

const Header: React.FC<{ n: string; zh: string; en: string; show: number }> = ({ n, zh, en, show }) => (
  <div style={{ position: "absolute", left: 0, right: 0, top: 250, textAlign: "center", opacity: show }}>
    <div style={{ fontFamily: F.tech, fontSize: 18, letterSpacing: "0.5em", color: C.cyan }}>{n}</div>
    <div style={{ fontFamily: F.sans, fontSize: 34, fontWeight: 600, color: "#fff", marginTop: 8, letterSpacing: "0.12em" }}>{zh}</div>
    <div style={{ fontFamily: F.mono, fontSize: 14, letterSpacing: "0.35em", color: "rgba(200,220,255,0.6)", marginTop: 4 }}>{en}</div>
  </div>
);

const Stage: React.FC<{ i: number; panX: number; children: React.ReactNode }> = ({ i, panX, children }) => {
  const x = i * STAGE_W - panX;
  const dist = Math.abs(x) / STAGE_W;
  return (
    <div
      style={{
        position: "absolute",
        left: 960 - STAGE_W / 2 + x,
        top: 0,
        width: STAGE_W,
        height: 1080,
        opacity: clamp(1.25 - dist * 0.8),
        filter: dist > 0.08 ? `blur(${Math.min(8, dist * 7)}px)` : undefined,
        transform: `scale(${1 - Math.min(0.12, dist * 0.1)})`,
      }}
    >
      {children}
    </div>
  );
};

export const S13Compiler: React.FC<{ offset: number }> = () => {
  const tau = useTime();
  let panX = 0;
  for (let k = 1; k < FOCUS.length; k++) panX = lerp(panX, k * STAGE_W, ease.inOutCubic(invLerp(FOCUS[k] - 0.1, FOCUS[k] + 0.45, tau)));
  const fadeIn = ease.outCubic(invLerp(0, 0.35, tau));
  const out = ease.inCubic(invLerp(6.7, 7.3, tau));
  const glitch = tau < 0.35 ? 1 - tau / 0.35 : tau > 6.95 ? (tau - 6.95) / 0.35 : 0;
  const jx = glitch > 0 ? (hash1(Math.floor(tau * 60)) - 0.5) * 60 * glitch : 0;
  const src = "int x = a + b * 2;";
  const typed = Math.round(clamp(invLerp(0.2, 0.75, tau)) * src.length);
  const hdr = (k: number) => ease.outCubic(invLerp(FOCUS[k] - 0.1, FOCUS[k] + 0.3, tau));
  const ast: { k: string; x: number; y: number; p: number; lvl: number; c: string }[] = [
    { k: "=", x: 550, y: 430, p: -1, lvl: 0, c: COL.op },
    { k: "x", x: 400, y: 560, p: 0, lvl: 1, c: COL.id },
    { k: "+", x: 700, y: 560, p: 0, lvl: 1, c: COL.op },
    { k: "a", x: 590, y: 690, p: 2, lvl: 2, c: COL.id },
    { k: "*", x: 810, y: 690, p: 2, lvl: 2, c: COL.op },
    { k: "b", x: 720, y: 820, p: 4, lvl: 3, c: COL.id },
    { k: "2", x: 900, y: 820, p: 4, lvl: 3, c: COL.num },
  ];
  const bits = HEX.map((h) => parseInt(h, 16).toString(2).padStart(32, "0")).join("");
  return (
    <AbsoluteFill style={{ background: "radial-gradient(ellipse 90% 80% at 50% 50%, #0a1328 0%, #040913 60%, #010206 100%)", opacity: fadeIn * (1 - out) }}>
      <Backdrop name="hw_pcb" t={tau} t0={0} t1={7.3} opacity={0.75} blur={8} bright={0.55} zoom={[1.06, 1.16]} drift={[-40, 40]} />
      <AbsoluteFill style={{ background: "radial-gradient(ellipse 70% 60% at 50% 55%, rgba(4,9,19,0.35) 0%, rgba(1,2,6,0.75) 100%)" }} />
      <Dust count={40} seed={13} opacity={0.5} speed={0.4} />
      <AbsoluteFill style={{ transform: `translateX(${jx}px) scale(1.16)`, transformOrigin: "50% 58%" }}>
        <svg width={1920} height={1080} style={{ position: "absolute", inset: 0 }}>
          <line x1={0} y1={600} x2={1920} y2={600} stroke="rgba(90,160,255,0.12)" strokeWidth={1} />
          {[...Array(40)].map((_, k) => {
            const x = ((k * 97 + tau * 420) % 2100) - 90;
            return <circle key={k} cx={x} cy={600} r={2} fill={C.cyan} opacity={0.35} />;
          })}
        </svg>
        <Stage i={0} panX={panX}>
          <Header n="01" zh="源代码" en="SOURCE CODE" show={hdr(0)} />
          <div style={{ position: "absolute", left: 0, right: 0, top: 540, textAlign: "center", fontFamily: F.mono, fontSize: 68, whiteSpace: "pre" }}>
            {Array.from(src.slice(0, typed)).map((ch, i) => {
              const tok = "int".includes(ch) && i < 3 ? COL.kw : /[=+*;]/.test(ch) ? COL.op : /\d/.test(ch) ? COL.num : COL.id;
              return (
                <span key={i} style={{ color: tok, textShadow: `0 0 18px ${tok}66` }}>
                  {ch}
                </span>
              );
            })}
            <span style={{ display: "inline-block", width: 5, height: 70, background: C.cyan, verticalAlign: "middle", opacity: Math.floor(tau * 3) % 2 ? 1 : 0.2, boxShadow: `0 0 12px ${C.cyan}` }} />
          </div>
        </Stage>
        <Stage i={1} panX={panX}>
          <Header n="02" zh="词法分析" en="LEXICAL ANALYSIS" show={hdr(1)} />
          <div style={{ position: "absolute", left: 60, right: 60, top: 470, display: "flex", flexWrap: "wrap", justifyContent: "center", gap: 18 }}>
            {TOKENS.map((tk, i) => {
              const a = ease.outBack(clamp(invLerp(1.3 + i * 0.07, 1.6 + i * 0.07, tau)));
              return (
                <div
                  key={i}
                  style={{
                    opacity: clamp(a),
                    transform: `translateY(${(1 - a) * 40}px) scale(${0.6 + 0.4 * a})`,
                    border: `1.5px solid ${tk.c}`,
                    borderRadius: 14,
                    padding: "12px 20px 10px",
                    background: "rgba(6,14,32,0.85)",
                    boxShadow: `0 0 18px ${tk.c}44`,
                    textAlign: "center",
                    minWidth: 96,
                  }}
                >
                  <div style={{ fontFamily: F.mono, fontSize: 44, color: tk.c, lineHeight: 1.1 }}>{tk.s}</div>
                  <div style={{ fontFamily: F.mono, fontSize: 12, letterSpacing: "0.2em", color: "rgba(200,220,255,0.6)", marginTop: 4 }}>{tk.type}</div>
                </div>
              );
            })}
          </div>
        </Stage>
        <Stage i={2} panX={panX}>
          <Header n="03" zh="语法分析" en="SYNTAX TREE" show={hdr(2)} />
          <svg width={STAGE_W} height={1080} style={{ position: "absolute", inset: 0, overflow: "visible" }}>
            {ast.map((n, i) => {
              if (n.p < 0) return null;
              const p = ast[n.p];
              const e = ease.inOutCubic(invLerp(2.75 + n.lvl * 0.18, 2.95 + n.lvl * 0.18, tau));
              return <line key={`l${i}`} x1={p.x} y1={p.y} x2={lerp(p.x, n.x, e)} y2={lerp(p.y, n.y, e)} stroke={C.cyan} strokeWidth={2.5} opacity={0.8} />;
            })}
            {ast.map((n, i) => {
              const e = ease.outBack(clamp(invLerp(2.7 + n.lvl * 0.18, 2.95 + n.lvl * 0.18, tau)));
              return (
                <g key={i} transform={`translate(${n.x} ${n.y}) scale(${clamp(e, 0, 1.2)})`}>
                  <circle r={40} fill="rgba(6,14,32,0.95)" stroke={n.c} strokeWidth={2.5} style={{ filter: `drop-shadow(0 0 10px ${n.c})` }} />
                  <text y={14} textAnchor="middle" fontFamily={F.mono} fontSize={40} fill={n.c}>
                    {n.k}
                  </text>
                </g>
              );
            })}
          </svg>
        </Stage>
        <Stage i={3} panX={panX}>
          <Header n="04" zh="代码生成" en="CODE GENERATION · RISC-V" show={hdr(3)} />
          <div style={{ position: "absolute", left: 190, top: 430, fontFamily: F.mono, fontSize: 38, lineHeight: 1.75, whiteSpace: "pre" }}>
            {ASM.map((l, i) => {
              const a = ease.outCubic(invLerp(4.1 + i * 0.13, 4.35 + i * 0.13, tau));
              return (
                <div key={i} style={{ opacity: a, transform: `translateX(${(1 - a) * -30}px)` }}>
                  <span style={{ color: COL.kw }}>{l[0].padEnd(6, " ")}</span>
                  <span style={{ color: "#e8eefc" }}>{l[1].padEnd(12, " ")}</span>
                  <span style={{ color: "rgba(140,170,210,0.6)" }}>{" " + l[2]}</span>
                </div>
              );
            })}
          </div>
        </Stage>
        <Stage i={4} panX={panX}>
          <Header n="05" zh="机器码" en="MACHINE CODE" show={hdr(4)} />
          <div style={{ position: "absolute", left: 0, right: 0, top: 430, textAlign: "center", fontFamily: F.mono, fontSize: 44, lineHeight: 1.6 }}>
            {HEX.map((h, i) => (
              <div key={i}>
                <ScrambleText text={`0x${h}`} t0={5.45 + i * 0.1} dur={0.5} seed={i * 5} style={{ color: C.gold, textShadow: `0 0 16px ${C.gold}88`, letterSpacing: "0.12em" }} />
              </div>
            ))}
          </div>
          <div style={{ position: "absolute", left: STAGE_W - 80, top: 470, width: 1400, overflow: "hidden", fontFamily: F.mono, fontSize: 22, lineHeight: 1.5, color: "rgba(95,240,255,0.55)", whiteSpace: "nowrap" }}>
            {[0, 1, 2, 3, 4, 5].map((r) => (
              <div key={r} style={{ transform: `translateX(${-((tau - 5.6) * (380 + r * 60)) % 800}px)`, opacity: clamp((tau - 5.7) * 3) }}>
                {bits.slice(r * 24, r * 24 + 110)}
              </div>
            ))}
          </div>
        </Stage>
      </AbsoluteFill>
      {glitch > 0
        ? [...Array(7)].map((_, k) => {
            const y = hash1(Math.floor(tau * 50) * 3 + k) * 1080;
            return <div key={k} style={{ position: "absolute", left: 0, right: 0, top: y, height: 4 + hash1(k + tau) * 30, background: k % 2 ? "rgba(255,60,200,0.35)" : "rgba(60,240,255,0.35)", mixBlendMode: "screen", transform: `translateX(${(hash1(k * 7 + Math.floor(tau * 40)) - 0.5) * 200}px)`, opacity: glitch }} />;
          })
        : null}
      <CourseTag zh="编译原理" en="Principles of Compilers" start={0.5} end={6.5} y={150} />
      <Caption zh="把人类的思想，翻译成机器的语言" en="Compilers translate human thought into the language of machines" start={1.9} end={6.4} y={860} size={50} backdrop={0.6} />
    </AbsoluteFill>
  );
};
