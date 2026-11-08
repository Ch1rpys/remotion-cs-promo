import React, { useMemo } from "react";
import { AbsoluteFill } from "remotion";
import { Caption, CourseTag, useTime } from "../components/Text";
import { clamp, ease, invLerp, lerp, mulberry32 } from "../lib/anim";
import { C, F } from "../theme";

type Pt = [number, number];
const poly = (pts: Pt[]) => pts.map((p, i) => `${i ? "L" : "M"}${p[0]},${p[1]}`).join(" ");
const plen = (pts: Pt[]) => pts.slice(1).reduce((s, p, i) => s + Math.hypot(p[0] - pts[i][0], p[1] - pts[i][1]), 0);

type Wire = { id: string; pts: Pt[]; src: "A" | "B" | "C" | "X1" | "X2" | "A1" | "A2" | "O"; level: number; order: number };

const WIRES: Wire[] = [
  { id: "a1", src: "A", level: 0, order: 0, pts: [[110, 200], [400, 200], [400, 225], [512, 225]] },
  { id: "a2", src: "A", level: 0, order: 1, pts: [[300, 200], [300, 595], [952, 595]] },
  { id: "b1", src: "B", level: 0, order: 0, pts: [[110, 300], [440, 300], [440, 275], [512, 275]] },
  { id: "b2", src: "B", level: 0, order: 1, pts: [[340, 300], [340, 645], [952, 645]] },
  { id: "c1", src: "C", level: 0, order: 0, pts: [[110, 520], [840, 520], [840, 325], [952, 325]] },
  { id: "c2", src: "C", level: 0, order: 1, pts: [[880, 520], [880, 495], [952, 495]] },
  { id: "x1", src: "X1", level: 1, order: 2, pts: [[620, 250], [760, 250], [760, 275], [952, 275]] },
  { id: "x1b", src: "X1", level: 1, order: 3, pts: [[720, 250], [720, 445], [952, 445]] },
  { id: "x2", src: "X2", level: 2, order: 4, pts: [[1060, 300], [1400, 300]] },
  { id: "and2", src: "A2", level: 2, order: 4, pts: [[1052, 470], [1140, 470], [1140, 520], [1212, 520]] },
  { id: "and1", src: "A1", level: 1, order: 4, pts: [[1052, 620], [1170, 620], [1170, 570], [1212, 570]] },
  { id: "or", src: "O", level: 3, order: 5, pts: [[1320, 545], [1400, 545]] },
];

const JUNCTIONS: Pt[] = [[300, 200], [340, 300], [720, 250], [880, 520]];

type Gate = { kind: "AND" | "OR" | "XOR"; cx: number; cy: number; out: Wire["src"]; order: number };
const GATES: Gate[] = [
  { kind: "XOR", cx: 570, cy: 250, out: "X1", order: 1.5 },
  { kind: "XOR", cx: 1010, cy: 300, out: "X2", order: 3.5 },
  { kind: "AND", cx: 1002, cy: 470, out: "A2", order: 3.5 },
  { kind: "AND", cx: 1002, cy: 620, out: "A1", order: 3.2 },
  { kind: "OR", cx: 1270, cy: 545, out: "O", order: 4.6 },
];

const gatePath = (g: Gate) => {
  const x0 = g.cx - 50;
  const y0 = g.cy - 42;
  const h = 84;
  if (g.kind === "AND") return `M${x0},${y0} H${x0 + 50} A42,42 0 0 1 ${x0 + 50},${y0 + h} H${x0} Z`;
  const or = `M${x0},${y0} Q${x0 + 28},${g.cy} ${x0},${y0 + h} Q${x0 + 72},${y0 + h} ${x0 + 104},${g.cy} Q${x0 + 72},${y0} ${x0},${y0} Z`;
  if (g.kind === "OR") return or;
  return `${or} M${x0 - 14},${y0} Q${x0 + 14},${g.cy} ${x0 - 14},${y0 + h}`;
};

const VECTORS: [number, number, number][] = [
  [0, 0, 0],
  [1, 0, 0],
  [1, 1, 0],
  [1, 1, 1],
  [0, 1, 1],
  [1, 0, 1],
  [1, 1, 1],
];
const V0 = 2.0;

const evalAdder = (a: number, b: number, c: number) => {
  const X1 = a ^ b;
  const X2 = X1 ^ c;
  const A1 = a & b;
  const A2 = X1 & c;
  const O = A1 | A2;
  return { A: a, B: b, C: c, X1, X2, A1, A2, O };
};

const stateAt = (tau: number, level: number) => {
  const tt = tau - level * 0.14;
  const k = clamp(Math.floor((tt - V0) / 1.0) + 1, 0, VECTORS.length - 1);
  const v = tt < V0 ? VECTORS[0] : VECTORS[k];
  return evalAdder(v[0], v[1], v[2]);
};

const Bit: React.FC<{ x: number; y: number; v: number; label: string; right?: boolean; show: number }> = ({ x, y, v, label, right, show }) => {
  const col = v ? C.gold : "rgba(120,160,220,0.6)";
  return (
    <g opacity={show}>
      <circle cx={x} cy={y} r={22} fill="rgba(4,10,24,0.95)" stroke={col} strokeWidth={2.5} style={{ filter: v ? `drop-shadow(0 0 10px ${C.gold})` : undefined }} />
      <text x={x} y={y + 9} textAnchor="middle" fontFamily={F.mono} fontSize={26} fontWeight={700} fill={v ? "#fff4d6" : "rgba(170,200,240,0.8)"}>
        {v}
      </text>
      <text x={right ? x + 38 : x - 36} y={y + 9} textAnchor={right ? "start" : "end"} fontFamily={F.mono} fontSize={26} fill="rgba(210,230,255,0.9)">
        {label}
      </text>
    </g>
  );
};

export const S03Gates: React.FC<{ offset: number }> = ({ offset }) => {
  const tau = useTime();
  const bgTraces = useMemo(() => {
    const r = mulberry32(5);
    const out: string[] = [];
    for (let i = 0; i < 90; i++) {
      let x = Math.round(r() * 60) * 40 - 400;
      let y = Math.round(r() * 40) * 40 - 400;
      const pts: Pt[] = [[x, y]];
      for (let k = 0; k < 4; k++) {
        if (k % 2 === 0) x += (r() < 0.5 ? -1 : 1) * Math.round(2 + r() * 8) * 40;
        else y += (r() < 0.5 ? -1 : 1) * Math.round(1 + r() * 5) * 40;
        pts.push([x, y]);
      }
      out.push(poly(pts));
    }
    return out;
  }, []);

  const drawP = (order: number) => ease.inOutCubic(invLerp(0.25 + order * 0.33, 0.95 + order * 0.33, tau));
  const tilt = lerp(30, 10, ease.inOutSine(invLerp(0, 7.5, tau)));
  const rotZ = lerp(-5, 1, ease.inOutSine(invLerp(0, 7.5, tau)));
  const zoomOut = ease.inCubic(invLerp(7.2, 8.1, tau));
  const s = lerp(0.92, 1.04, ease.inOutSine(invLerp(0, 7.3, tau))) * lerp(1, 0.06, zoomOut);
  const fadeIn = ease.outCubic(invLerp(0, 0.6, tau));
  const flowPhase = tau * 90;

  const cur = stateAt(tau, 0);
  const vecIdx = tau < V0 ? -1 : clamp(Math.floor((tau - V0) / 1.0) + 1, 0, VECTORS.length - 1);
  const outState = stateAt(tau, 3);
  const bitShow = ease.outCubic(invLerp(1.4, 2.0, tau));

  return (
    <AbsoluteFill style={{ background: "radial-gradient(ellipse 90% 80% at 50% 50%, #07142a 0%, #030815 55%, #010207 100%)" }}>
      <AbsoluteFill
        style={{
          transform: `perspective(1800px) rotateX(${tilt}deg) rotateZ(${rotZ}deg) scale(${s})`,
          transformOrigin: "50% 52%",
        }}
      >
        <svg width={1920} height={1080} viewBox="-130 -175 2100 1181" style={{ position: "absolute", inset: 0, overflow: "visible" }}>
          <defs>
            <pattern id="dots" width="40" height="40" patternUnits="userSpaceOnUse">
              <circle cx="1" cy="1" r="1.4" fill="rgba(90,150,255,0.22)" />
            </pattern>
            <filter id="glow" x="-50%" y="-50%" width="200%" height="200%">
              <feGaussianBlur stdDeviation="5" result="b" />
              <feMerge>
                <feMergeNode in="b" />
                <feMergeNode in="b" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
            <filter id="softglow" x="-50%" y="-50%" width="200%" height="200%">
              <feGaussianBlur stdDeviation="9" />
            </filter>
          </defs>
          <rect x={-1400} y={-1200} width={4800} height={3400} fill="url(#dots)" />
          <g opacity={0.2 * fadeIn} stroke="rgba(80,140,255,0.8)" strokeWidth={2} fill="none">
            {bgTraces.map((d, i) => (
              <path key={i} d={d} />
            ))}
          </g>
          {/* wires */}
          {WIRES.map((w) => {
            const st = stateAt(tau, w.level);
            const on = st[w.src] === 1 && tau > V0 - 0.3;
            const len = plen(w.pts);
            const p = drawP(w.order);
            const d = poly(w.pts);
            const col = on ? C.gold : C.cyan;
            return (
              <g key={w.id}>
                <path d={d} stroke={col} strokeOpacity={on ? 0.5 : 0.35} strokeWidth={on ? 7 : 4} fill="none" filter="url(#softglow)" strokeDasharray={len} strokeDashoffset={len * (1 - p)} />
                <path d={d} stroke={on ? "#ffe2a8" : "rgba(110,210,255,0.85)"} strokeWidth={on ? 3.2 : 2.2} fill="none" strokeLinejoin="round" strokeDasharray={len} strokeDashoffset={len * (1 - p)} />
                {on && p > 0.99 ? (
                  <path d={d} stroke="#fff" strokeWidth={4} fill="none" strokeLinecap="round" strokeDasharray="10 34" strokeDashoffset={-flowPhase} style={{ filter: `drop-shadow(0 0 6px ${C.gold})` }} />
                ) : null}
              </g>
            );
          })}
          {JUNCTIONS.map((j, i) => (
            <circle key={i} cx={j[0]} cy={j[1]} r={6} fill={C.cyan} opacity={drawP(1)} style={{ filter: `drop-shadow(0 0 6px ${C.cyan})` }} />
          ))}
          {/* gates */}
          {GATES.map((g, i) => {
            const p = drawP(g.order);
            const st = stateAt(tau, g.out === "O" ? 3 : g.out === "X2" || g.out === "A2" ? 2 : 1);
            const on = st[g.out] === 1 && tau > V0;
            return (
              <g key={i} opacity={p > 0 ? 1 : 0}>
                <path d={gatePath(g)} fill={`rgba(8,20,44,${0.92 * p})`} stroke={on ? C.gold : C.cyan} strokeWidth={3} pathLength={1} strokeDasharray={1} strokeDashoffset={1 - p} filter="url(#glow)" />
                <text x={g.cx + (g.kind === "AND" ? -8 : 4)} y={g.cy + 8} textAnchor="middle" fontFamily={F.tech} fontSize={20} fontWeight={700} fill={on ? "#ffe9b8" : "rgba(170,225,255,0.95)"} opacity={p}>
                  {g.kind}
                </text>
              </g>
            );
          })}
          <Bit x={60} y={200} v={cur.A} label="A" show={bitShow} />
          <Bit x={60} y={300} v={cur.B} label="B" show={bitShow} />
          <Bit x={60} y={520} v={cur.C} label="Cin" show={bitShow} />
          <Bit x={1450} y={300} v={outState.X2} label="SUM" right show={bitShow} />
          <Bit x={1450} y={545} v={outState.O} label="Cout" right show={bitShow} />
          <text x={700} y={-8} textAnchor="middle" fontFamily={F.tech} fontSize={26} letterSpacing={10} fill="rgba(150,210,255,0.8)" opacity={drawP(0.5)}>
            FULL ADDER · 全加器
          </text>
        </svg>
      </AbsoluteFill>
      {/* truth table */}
      <div
        style={{
          position: "absolute",
          right: 48,
          top: 280,
          fontFamily: F.mono,
          fontSize: 20,
          color: "rgba(190,215,255,0.8)",
          opacity: ease.outCubic(invLerp(2.0, 2.6, tau)) * (1 - zoomOut),
          background: "rgba(3,8,20,0.7)",
          border: "1px solid rgba(90,170,255,0.25)",
          borderRadius: 10,
          padding: "14px 18px",
          backdropFilter: "blur(4px)",
        }}
      >
        <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 46px)", gap: "4px 0", textAlign: "center" }}>
          {["A", "B", "Cin", "S", "Co"].map((h) => (
            <div key={h} style={{ color: C.cyan, fontSize: 16, letterSpacing: "0.1em", paddingBottom: 6, borderBottom: "1px solid rgba(90,170,255,0.3)" }}>
              {h}
            </div>
          ))}
          {new Array(8).fill(0).map((_, r) => {
            const a = (r >> 2) & 1;
            const b = (r >> 1) & 1;
            const c = r & 1;
            const e = evalAdder(a, b, c);
            const v = vecIdx >= 0 ? VECTORS[vecIdx] : [-1, -1, -1];
            const active = v[0] === a && v[1] === b && v[2] === c;
            return [a, b, c, e.X2, e.O].map((x, k) => (
              <div
                key={`${r}-${k}`}
                style={{
                  padding: "3px 0",
                  background: active ? "rgba(255,193,94,0.22)" : undefined,
                  color: active ? "#fff1cf" : undefined,
                  boxShadow: active && k === 0 ? `inset 3px 0 0 ${C.gold}` : undefined,
                }}
              >
                {x}
              </div>
            ));
          })}
        </div>
      </div>
      <CourseTag zh="数字逻辑" en="Digital Logic Design" start={1.0} end={7.2} y={150} />
      <Caption zh="用开与关，构建逻辑" en="Building logic out of on and off" start={3.0} end={7.1} y={835} size={52} backdrop={0.8} />
      <AbsoluteFill style={{ background: "#dff8ff", opacity: 0.85 * (1 - ease.outCubic(invLerp(0, 0.6, tau))), mixBlendMode: "screen" }} />
    </AbsoluteFill>
  );
};
