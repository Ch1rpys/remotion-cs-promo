import React from "react";
import { AbsoluteFill } from "remotion";
import { Dust } from "../components/Dust";
import { ScrambleText, useTime } from "../components/Text";
import { clamp, ease, hash1, invLerp, lerp } from "../lib/anim";
import { C, F } from "../theme";

const T0 = 156.0;
const STEP = 2.0;

type MS = { year: string; zh: string; en: string; desc: string; col: string; art: (u: number) => React.ReactNode };

const stroke = (u: number, d0 = 0.05, d1 = 0.8) => ({ pathLength: 1, strokeDasharray: 1, strokeDashoffset: 1 - ease.inOutCubic(clamp((u - d0) / (d1 - d0))) });

const Turing = (u: number) => {
  const shift = ease.inOutCubic(clamp((u - 0.6) / 0.35)) + ease.inOutCubic(clamp((u - 1.2) / 0.35));
  const syms = "1011001101110";
  return (
    <g>
      {Array.from({ length: 13 }, (_, i) => {
        const x = 60 + (i - shift) * 62;
        const flip = i === 6 + Math.round(shift) && u > 0.95;
        return (
          <g key={i} opacity={clamp(1 - Math.abs(x - 350) / 330)}>
            <rect x={x} y={300} width={56} height={56} rx={6} fill="rgba(8,18,38,0.9)" stroke={C.cyan} strokeWidth={2} {...stroke(u, 0.05 + i * 0.02, 0.5 + i * 0.02)} />
            <text x={x + 28} y={338} textAnchor="middle" fontFamily={F.mono} fontSize={30} fill={flip ? C.gold : "#dff6ff"}>
              {syms[(i + 3) % syms.length]}
            </text>
          </g>
        );
      })}
      <path d="M350 250 L382 250 L382 272 L366 292 L350 272 Z" transform="translate(-16 0)" fill="rgba(255,193,94,0.15)" stroke={C.gold} strokeWidth={3} {...stroke(u, 0.2, 0.6)} />
      <rect x={300} y={180} width={100} height={52} rx={8} fill="rgba(30,20,4,0.8)" stroke={C.gold} strokeWidth={2} {...stroke(u, 0.25, 0.65)} />
      <text x={350} y={215} textAnchor="middle" fontFamily={F.mono} fontSize={26} fill={C.gold}>
        q₁
      </text>
      <text x={350} y={430} textAnchor="middle" fontFamily={F.mono} fontSize={18} letterSpacing={3} fill="rgba(200,220,255,0.6)">
        δ(q₁, 0) → (q₂, 1, R)
      </text>
    </g>
  );
};

const Eniac = (u: number) => (
  <g>
    {[0, 1, 2, 3, 4].map((p) => (
      <g key={p}>
        <rect x={40 + p * 126} y={150} width={112} height={300} rx={6} fill="rgba(20,14,8,0.8)" stroke={C.amber} strokeWidth={2} {...stroke(u, 0.05 + p * 0.06, 0.55 + p * 0.06)} />
        {Array.from({ length: 18 }, (_, k) => {
          const cx = 40 + p * 126 + 22 + (k % 3) * 34;
          const cy = 180 + Math.floor(k / 3) * 34;
          const fl = 0.55 + 0.45 * Math.sin(u * 30 + k * 1.7 + p * 3) * hash1(k + p * 20);
          return <circle key={k} cx={cx} cy={cy} r={9} fill={`rgba(255,${150 + 60 * fl},60,${0.25 + 0.6 * fl * clamp((u - 0.3) * 3)})`} stroke="rgba(255,190,110,0.6)" strokeWidth={1.2} style={{ filter: "drop-shadow(0 0 6px rgba(255,150,60,0.9))" }} />;
        })}
        <circle cx={40 + p * 126 + 56} cy={410} r={18} fill="none" stroke="rgba(255,200,140,0.7)" strokeWidth={2} {...stroke(u, 0.3, 0.8)} />
        <line x1={40 + p * 126 + 56} y1={410} x2={40 + p * 126 + 56 + 14 * Math.cos(u * 3 + p)} y2={410 - 14 * Math.sin(u * 3 + p)} stroke={C.gold} strokeWidth={2} />
      </g>
    ))}
    {[0, 1, 2, 3].map((k) => (
      <path key={k} d={`M${152 + k * 126} 300 C ${170 + k * 126} 520, ${150 + k * 126} 520, ${166 + k * 126} 300`} fill="none" stroke={k % 2 ? C.cyan : C.magenta} strokeWidth={3} {...stroke(u, 0.5, 1.0)} />
    ))}
    <text x={350} y={500} textAnchor="middle" fontFamily={F.mono} fontSize={18} letterSpacing={3} fill="rgba(255,220,180,0.65)">
      17,468 VACUUM TUBES · 30 TONS
    </text>
  </g>
);

const Arpanet = (u: number) => {
  const N: Record<string, [number, number]> = { SRI: [170, 170], UCSB: [110, 300], UCLA: [230, 400], UTAH: [540, 230] };
  const L: [string, string][] = [
    ["UCLA", "SRI"],
    ["UCLA", "UCSB"],
    ["SRI", "UCSB"],
    ["SRI", "UTAH"],
  ];
  const pk = ease.inOutCubic(clamp((u - 0.8) / 0.7));
  const a = N.UCLA;
  const b = N.SRI;
  return (
    <g>
      {L.map(([p, q], i) => (
        <line key={i} x1={N[p][0]} y1={N[p][1]} x2={N[q][0]} y2={N[q][1]} stroke={C.cyan} strokeWidth={2.5} {...stroke(u, 0.1 + i * 0.1, 0.5 + i * 0.1)} />
      ))}
      {Object.entries(N).map(([k, [x, y]], i) => (
        <g key={k} opacity={clamp((u - 0.05 - i * 0.08) * 4)}>
          <circle cx={x} cy={y} r={26} fill="rgba(6,16,36,0.95)" stroke={C.cyan} strokeWidth={2.5} style={{ filter: `drop-shadow(0 0 10px ${C.cyan})` }} />
          <text x={x} y={y + 52} textAnchor="middle" fontFamily={F.mono} fontSize={18} fill="#e8f6ff" letterSpacing={2}>
            {k}
          </text>
        </g>
      ))}
      {u > 0.8 ? (
        <g transform={`translate(${lerp(a[0], b[0], pk)} ${lerp(a[1], b[1], pk)})`}>
          <rect x={-30} y={-18} width={60} height={36} rx={8} fill={C.gold} style={{ filter: `drop-shadow(0 0 12px ${C.gold})` }} />
          <text y={9} textAnchor="middle" fontFamily={F.mono} fontSize={22} fontWeight={700} fill="#1a1204">
            LO
          </text>
        </g>
      ) : null}
      <text x={350} y={500} textAnchor="middle" fontFamily={F.mono} fontSize={18} letterSpacing={3} fill="rgba(200,230,255,0.65)">
        1969.10.29 · UCLA → SRI : “LO”
      </text>
    </g>
  );
};

const Intel = (u: number) => (
  <g>
    <rect x={180} y={230} width={340} height={150} rx={10} fill="rgba(14,14,20,0.95)" stroke={C.cyan} strokeWidth={3} {...stroke(u, 0.05, 0.6)} />
    <path d="M180 285 A20 20 0 0 1 180 325" fill="none" stroke={C.cyan} strokeWidth={3} {...stroke(u, 0.3, 0.7)} />
    {Array.from({ length: 8 }, (_, i) => (
      <g key={i} opacity={clamp((u - 0.2 - i * 0.03) * 5)}>
        <rect x={200 + i * 40} y={196} width={16} height={34} fill="rgba(200,210,220,0.85)" />
        <rect x={200 + i * 40} y={380} width={16} height={34} fill="rgba(200,210,220,0.85)" />
      </g>
    ))}
    <rect x={400} y={255} width={90} height={90} fill="rgba(255,193,94,0.08)" stroke={C.gold} strokeWidth={1.5} {...stroke(u, 0.4, 0.9)} />
    {Array.from({ length: 5 }, (_, i) => (
      <line key={i} x1={400} y1={270 + i * 15} x2={490} y2={270 + i * 15} stroke="rgba(255,193,94,0.5)" strokeWidth={1} {...stroke(u, 0.5 + i * 0.05, 0.9 + i * 0.05)} />
    ))}
    <text x={290} y={322} textAnchor="middle" fontFamily={F.tech} fontSize={48} fontWeight={800} fill="#e8f6ff" opacity={clamp((u - 0.35) * 3)}>
      4004
    </text>
    <text x={350} y={480} textAnchor="middle" fontFamily={F.mono} fontSize={18} letterSpacing={3} fill="rgba(200,230,255,0.65)">
      2,300 TRANSISTORS · 740 kHz
    </text>
  </g>
);

const Web = (u: number) => {
  const url = "http://info.cern.ch";
  const n = Math.round(clamp((u - 0.35) / 0.5) * url.length);
  return (
    <g>
      <rect x={70} y={140} width={560} height={360} rx={14} fill="rgba(6,14,30,0.92)" stroke={C.cyan} strokeWidth={2.5} {...stroke(u, 0.05, 0.55)} />
      <line x1={70} y1={186} x2={630} y2={186} stroke="rgba(62,232,255,0.4)" strokeWidth={1.5} {...stroke(u, 0.2, 0.6)} />
      {["#ff5f57", "#febc2e", "#28c840"].map((c, i) => (
        <circle key={c} cx={96 + i * 22} cy={163} r={7} fill={c} opacity={clamp((u - 0.2) * 4)} />
      ))}
      <rect x={170} y={152} width={340} height={24} rx={12} fill="rgba(62,232,255,0.08)" stroke="rgba(62,232,255,0.35)" />
      <text x={186} y={170} fontFamily={F.mono} fontSize={16} fill="#dff6ff">
        {url.slice(0, n)}
      </text>
      <text x={110} y={244} fontFamily={F.serif} fontSize={32} fontWeight={700} fill="#fff" opacity={clamp((u - 0.7) * 4)}>
        World Wide Web
      </text>
      {[0, 1, 2, 3].map((k) => (
        <line key={k} x1={110} y1={284 + k * 34} x2={110 + [420, 360, 440, 260][k]} y2={284 + k * 34} stroke={k === 1 ? C.cyan : "rgba(200,220,255,0.35)"} strokeWidth={k === 1 ? 3 : 8} strokeLinecap="round" {...stroke(u, 0.75 + k * 0.08, 1.1 + k * 0.08)} />
      ))}
      <g transform="translate(560 420)" opacity={clamp((u - 0.5) * 3)}>
        <circle r={44} fill="none" stroke={C.gold} strokeWidth={2.5} />
        <ellipse rx={18} ry={44} fill="none" stroke={C.gold} strokeWidth={2} transform={`scale(${Math.cos(u * 2.2)} 1)`} />
        <line x1={-44} y1={0} x2={44} y2={0} stroke={C.gold} strokeWidth={2} />
        <path d="M-38 -22 Q0 -12 38 -22 M-38 22 Q0 12 38 22" fill="none" stroke={C.gold} strokeWidth={1.5} />
      </g>
    </g>
  );
};

const Go = (u: number) => {
  const G = 13;
  const S = 32;
  const ox = 150;
  const oy = 110;
  const moves: [number, number, number][] = [
    [3, 3, 1], [9, 9, 0], [3, 9, 1], [9, 3, 0], [6, 2, 1], [2, 6, 0], [10, 6, 1], [6, 10, 0], [5, 5, 1], [7, 7, 0], [4, 7, 1], [8, 5, 0], [7, 4, 1], [5, 8, 0], [10, 4, 1],
  ];
  return (
    <g>
      <rect x={ox - 26} y={oy - 26} width={(G - 1) * S + 52} height={(G - 1) * S + 52} rx={10} fill="rgba(60,40,14,0.35)" stroke="rgba(255,193,94,0.5)" strokeWidth={2} {...stroke(u, 0.02, 0.4)} />
      {Array.from({ length: G }, (_, i) => (
        <g key={i}>
          <line x1={ox} y1={oy + i * S} x2={ox + (G - 1) * S} y2={oy + i * S} stroke="rgba(255,210,150,0.4)" strokeWidth={1.2} {...stroke(u, 0.05 + i * 0.015, 0.45 + i * 0.015)} />
          <line x1={ox + i * S} y1={oy} x2={ox + i * S} y2={oy + (G - 1) * S} stroke="rgba(255,210,150,0.4)" strokeWidth={1.2} {...stroke(u, 0.05 + i * 0.015, 0.45 + i * 0.015)} />
        </g>
      ))}
      {moves.map(([x, y, b], i) => {
        const at = 0.35 + i * 0.07;
        const a = ease.outBack(clamp((u - at) / 0.18));
        if (u < at) return null;
        const last = i === moves.length - 1;
        return (
          <g key={i} transform={`translate(${ox + x * S} ${oy + y * S}) scale(${a})`}>
            <circle r={14} fill={b ? "#0c0c10" : "#f2f2f5"} stroke={b ? "rgba(120,140,200,0.6)" : "rgba(255,255,255,0.8)"} strokeWidth={1.5} />
            {last ? <circle r={22} fill="none" stroke={C.gold} strokeWidth={3} style={{ filter: `drop-shadow(0 0 10px ${C.gold})` }} /> : null}
          </g>
        );
      })}
      <text x={350} y={560} textAnchor="middle" fontFamily={F.mono} fontSize={18} letterSpacing={3} fill="rgba(255,220,180,0.65)">
        GAME 2 · MOVE 37
      </text>
    </g>
  );
};

const LLM = (u: number) => {
  const blocks = ["Embedding", "Multi-Head Attention", "Feed Forward", "× 96 Layers", "Softmax"];
  return (
    <g>
      {blocks.map((b, i) => (
        <g key={i}>
          <rect x={60} y={430 - i * 68} width={290} height={50} rx={12} fill={i === 1 ? "rgba(180,70,255,0.18)" : "rgba(8,16,36,0.9)"} stroke={i === 1 ? C.magenta : C.cyan} strokeWidth={2} {...stroke(u, 0.05 + i * 0.08, 0.45 + i * 0.08)} />
          <text x={205} y={462 - i * 68} textAnchor="middle" fontFamily={F.mono} fontSize={18} fill="#e8f0ff" opacity={clamp((u - 0.3 - i * 0.08) * 4)}>
            {b}
          </text>
        </g>
      ))}
      <rect x={400} y={170} width={260} height={64} rx={20} fill="rgba(60,90,255,0.85)" opacity={clamp((u - 0.5) * 4)} />
      <text x={530} y={210} textAnchor="middle" fontFamily={F.sans} fontSize={22} fill="#fff" opacity={clamp((u - 0.55) * 4)}>
        你好，AI
      </text>
      <rect x={390} y={260} width={280} height={150} rx={20} fill="rgba(120,60,220,0.25)" stroke={C.magenta} strokeWidth={2} opacity={clamp((u - 0.75) * 4)} />
      {[0, 1, 2].map((k) => (
        <line key={k} x1={416} y1={300 + k * 36} x2={416 + [220, 190, 120][k] * clamp((u - 0.85 - k * 0.12) * 3)} y2={300 + k * 36} stroke="rgba(230,210,255,0.8)" strokeWidth={10} strokeLinecap="round" />
      ))}
    </g>
  );
};

const Agent = (u: number) => {
  const code = [
    { w: 250, c: C.cyan, who: 0 },
    { w: 320, c: "#c792ea", who: 0 },
    { w: 210, c: "#82aaff", who: 1 },
    { w: 290, c: "#c3e88d", who: 1 },
    { w: 180, c: "#f78c6c", who: 1 },
    { w: 260, c: "#82aaff", who: 1 },
  ];
  const prog = (i: number) => (i < 2 ? clamp((u - 0.1 - i * 0.22) / 0.26) : clamp((u - 0.6 - (i - 2) * 0.17) / 0.15));
  const agentLine = Math.max(2, code.findIndex((_, i) => i >= 2 && prog(i) < 1) === -1 ? 5 : code.findIndex((_, i) => i >= 2 && prog(i) < 1));
  const steps = ["计划 Plan", "编码 Code", "测试 Test", "交付 Ship"];
  const cursor = (x: number, y: number, col: string, label: string) => (
    <g transform={`translate(${x} ${y})`}>
      <rect x={0} y={-12} width={3} height={24} fill={col} style={{ filter: `drop-shadow(0 0 6px ${col})` }} />
      <rect x={-2} y={-36} width={label.length * 11 + 14} height={20} rx={5} fill={col} />
      <text x={5} y={-21} fontFamily={F.mono} fontSize={13} fontWeight={700} fill="#04110a">
        {label}
      </text>
    </g>
  );
  return (
    <g>
      <rect x={40} y={120} width={430} height={400} rx={16} fill="rgba(6,14,30,0.92)" stroke={C.green} strokeWidth={2.5} {...stroke(u, 0.02, 0.4)} />
      <line x1={40} y1={164} x2={470} y2={164} stroke="rgba(61,255,154,0.35)" strokeWidth={1.5} {...stroke(u, 0.1, 0.45)} />
      {["#ff5f57", "#febc2e", "#28c840"].map((c, i) => (
        <circle key={c} cx={66 + i * 22} cy={142} r={7} fill={c} opacity={clamp((u - 0.1) * 4)} />
      ))}
      <text x={255} y={148} textAnchor="middle" fontFamily={F.mono} fontSize={15} fill="rgba(200,240,220,0.6)" opacity={clamp((u - 0.15) * 4)}>
        future.py
      </text>
      {code.map((l, i) => {
        const y = 206 + i * 48;
        return (
          <g key={i} opacity={clamp((u - 0.05) * 5)}>
            <text x={62} y={y + 5} fontFamily={F.mono} fontSize={14} fill="rgba(140,170,200,0.45)">
              {i + 1}
            </text>
            <rect x={92 + l.who * 24} y={y - 7} width={Math.max(0.1, l.w * prog(i))} height={14} rx={7} fill={l.c} opacity={0.85} />
          </g>
        );
      })}
      {u > 0.1 && u < 1.2 ? cursor(92 + code[1].w * prog(1) + 6, 206 + 48, C.cyan, "YOU") : null}
      {u > 0.55 ? cursor(92 + 24 + code[agentLine].w * prog(agentLine) + 6, 206 + agentLine * 48, C.magenta, "AGENT") : null}
      {steps.map((st, i) => {
        const on = u > 0.62 + i * 0.27;
        return (
          <g key={i} transform={`translate(512 ${196 + i * 74})`} opacity={clamp((u - 0.3 - i * 0.08) * 4)}>
            <circle r={18} fill={on ? "rgba(61,255,154,0.2)" : "rgba(10,20,30,0.9)"} stroke={on ? C.green : "rgba(120,160,200,0.5)"} strokeWidth={2.5} style={on ? { filter: `drop-shadow(0 0 8px ${C.green})` } : undefined} />
            {on ? <path d="M-8 0 L-2 7 L9 -6" fill="none" stroke={C.green} strokeWidth={3.5} strokeLinecap="round" strokeLinejoin="round" /> : null}
            <text x={32} y={7} fontFamily={F.sans} fontSize={20} fill={on ? "#e8fff2" : "rgba(200,220,240,0.6)"}>
              {st}
            </text>
          </g>
        );
      })}
      <text x={350} y={580} textAnchor="middle" fontFamily={F.mono} fontSize={18} letterSpacing={3} fill="rgba(190,255,220,0.65)">
        HUMAN + AI · CO-CREATION
      </text>
    </g>
  );
};

const MILESTONES: MS[] = [
  { year: "1936", zh: "图灵机", en: "TURING MACHINE", desc: "图灵提出“图灵机”，为计算划定理论的边界", col: C.cyan, art: Turing },
  { year: "1946", zh: "ENIAC", en: "FIRST ELECTRONIC COMPUTER", desc: "世界上第一台通用电子计算机诞生", col: C.amber, art: Eniac },
  { year: "1969", zh: "阿帕网", en: "ARPANET", desc: "互联网的前身，传出第一条消息 “LO”", col: C.cyan, art: Arpanet },
  { year: "1971", zh: "微处理器", en: "INTEL 4004", desc: "第一块商用微处理器，集成 2300 个晶体管", col: C.gold, art: Intel },
  { year: "1991", zh: "万维网", en: "WORLD WIDE WEB", desc: "第一个网站上线，信息从此连接世界", col: C.cyan, art: Web },
  { year: "2016", zh: "AlphaGo", en: "DEEP LEARNING", desc: "人工智能在围棋上战胜人类顶尖棋手", col: C.gold, art: Go },
  { year: "2022", zh: "大语言模型", en: "LARGE LANGUAGE MODELS", desc: "大模型走进千家万户，智能时代全面到来", col: C.magenta, art: LLM },
  { year: "2026", zh: "智能体", en: "AI AGENTS", desc: "人与 AI 智能体并肩，一起写下未来的代码", col: C.green, art: Agent },
];

const Digit: React.FC<{ d: number; u: number; k: number; col: string }> = ({ d, u, k, col }) => {
  const e = ease.outQuart(clamp((u - 0.02 - k * 0.06) / 0.55));
  const spins = 2 + k;
  const pos = (spins * 10 + d) * e;
  const h = 230;
  return (
    <div style={{ height: h, overflow: "hidden", display: "inline-block", width: 158 }}>
      <div style={{ transform: `translateY(${-pos * h}px)`, filter: e < 0.98 ? `blur(${(1 - e) * 6}px)` : undefined }}>
        {Array.from({ length: spins * 10 + 10 }, (_, i) => (
          <div key={i} style={{ height: h, lineHeight: `${h}px`, textAlign: "center", fontFamily: F.tech, fontWeight: 800, fontSize: 210, color: "transparent", WebkitTextStroke: `2px ${col}`, textShadow: `0 0 30px ${col}55` }}>
            {i % 10}
          </div>
        ))}
      </div>
    </div>
  );
};

export const S19Timeline: React.FC<{ offset: number }> = () => {
  const tau = useTime();
  const t = tau + T0;
  const idx = clamp(Math.floor((t - T0) / STEP), 0, MILESTONES.length - 1);
  const fadeIn = ease.outCubic(invLerp(T0, T0 + 0.25, t));
  const fadeOut = ease.inCubic(invLerp(171.75, 172.0, t));
  const px = (i: number) => 200 + i * 205;
  const head = lerp(px(0), px(MILESTONES.length - 1), clamp((t - T0 - 0.2) / (STEP * (MILESTONES.length - 1))));
  const snap = px(idx);
  const headX = lerp(head, snap, 0.7);
  return (
    <AbsoluteFill style={{ background: "radial-gradient(ellipse 90% 80% at 40% 45%, #0b1430 0%, #050914 55%, #010206 100%)", opacity: fadeIn * (1 - fadeOut) }}>
      <Dust count={50} seed={19} opacity={0.6} speed={0.9} />
      <div style={{ position: "absolute", left: 150, top: 150, fontFamily: F.tech, fontSize: 16, letterSpacing: "0.6em", color: "rgba(200,220,255,0.55)" }}>
        A BRIEF HISTORY OF COMPUTING · 计算简史
      </div>
      {MILESTONES.map((m, i) => {
        const u = t - (T0 + i * STEP);
        if (u < -0.3 || u > STEP + 0.3) return null;
        const inE = ease.outQuart(clamp((u + 0.25) / 0.5));
        const outE = ease.inQuart(clamp((u - (STEP - 0.25)) / 0.4));
        const dx = (1 - inE) * 420 - outE * 520;
        const blur = (1 - inE) * 14 + outE * 18;
        const op = clamp(inE * 1.4) * (1 - outE);
        return (
          <div key={i} style={{ position: "absolute", inset: 0, transform: `translateX(${dx}px)`, filter: blur > 0.3 ? `blur(${blur}px)` : undefined, opacity: op }}>
            <div style={{ position: "absolute", left: 130, top: 230 }}>
              {Array.from(m.year).map((ch, k) => (
                <Digit key={k} d={Number(ch)} u={u} k={k} col={m.col} />
              ))}
            </div>
            <div style={{ position: "absolute", left: 150, top: 490, width: 820 }}>
              <div style={{ fontFamily: F.serif, fontWeight: 800, fontSize: 76, color: "#fff", letterSpacing: "0.08em", textShadow: `0 0 30px ${m.col}55` }}>{m.zh}</div>
              <ScrambleText text={m.en} t0={T0 + i * STEP + 0.1 - T0} dur={0.6} seed={i} style={{ display: "block", fontFamily: F.tech, fontSize: 22, letterSpacing: "0.5em", color: m.col, marginTop: 10 }} />
              <div style={{ fontFamily: F.sans, fontSize: 30, color: "rgba(225,235,255,0.88)", marginTop: 26, letterSpacing: "0.06em", opacity: clamp((u - 0.25) * 3) }}>{m.desc}</div>
            </div>
            <svg width={700} height={600} viewBox="0 0 700 600" style={{ position: "absolute", left: 1060, top: 190, overflow: "visible" }}>
              {m.art(u)}
            </svg>
          </div>
        );
      })}
      <svg width={1920} height={1080} style={{ position: "absolute", inset: 0 }}>
        <line x1={150} y1={880} x2={1790} y2={880} stroke="rgba(120,170,255,0.25)" strokeWidth={2} />
        <line x1={150} y1={880} x2={headX} y2={880} stroke={C.cyan} strokeWidth={3} style={{ filter: `drop-shadow(0 0 8px ${C.cyan})` }} />
        {MILESTONES.map((m, i) => {
          const on = i <= idx;
          return (
            <g key={i}>
              <circle cx={px(i)} cy={880} r={i === idx ? 9 : 6} fill={on ? (i === idx ? C.gold : C.cyan) : "rgba(120,170,255,0.3)"} style={{ filter: i === idx ? `drop-shadow(0 0 10px ${C.gold})` : undefined }} />
              <text x={px(i)} y={918} textAnchor="middle" fontFamily={F.mono} fontSize={17} fill={i === idx ? C.gold : on ? "rgba(220,235,255,0.85)" : "rgba(150,170,210,0.4)"} letterSpacing={2}>
                {m.year}
              </text>
            </g>
          );
        })}
        <text x={1790} y={918} textAnchor="end" fontFamily={F.mono} fontSize={17} fill="rgba(255,193,94,0.8)" letterSpacing={2}>
          20XX ?
        </text>
        <circle cx={headX} cy={880} r={5} fill="#fff" style={{ filter: `drop-shadow(0 0 12px #fff)` }} />
      </svg>
    </AbsoluteFill>
  );
};
