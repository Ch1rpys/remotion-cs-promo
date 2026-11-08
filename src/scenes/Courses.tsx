import React, { useMemo } from "react";
import { AbsoluteFill } from "remotion";
import { useTime } from "../components/Text";
import { clamp, ease, lerp, mulberry32 } from "../lib/anim";
import { CUTS } from "../lib/beats";
import { C, F } from "../theme";

type Icon = { paths: string[]; dots?: [number, number, number][]; fills?: string[]; texts?: [number, number, string][] };

const I = {
  calculus: { paths: ["M24 172 H186", "M32 182 V16", "M32 150 C 70 40, 104 36, 134 96 S 170 150, 186 118"], fills: ["M70 172 L70 84 C 86 62, 104 56, 122 76 L122 172 Z"] },
  matrix: { paths: ["M46 34 H26 V166 H46", "M154 34 H174 V166 H154", "M60 58 L140 142"], dots: [[62, 58, 7], [100, 58, 7], [138, 58, 7], [62, 100, 7], [100, 100, 7], [138, 100, 7], [62, 142, 7], [100, 142, 7], [138, 142, 7]] },
  code: { paths: ["M72 56 L28 100 L72 144", "M128 56 L172 100 L128 144", "M114 40 L86 160"] },
  graph: { paths: ["M40 60 L100 30 L160 60 L160 140 L100 170 L40 140 Z", "M40 60 L100 100 L160 140", "M160 60 L100 100 L40 140", "M100 30 L100 170"], dots: [[40, 60, 9], [100, 30, 9], [160, 60, 9], [160, 140, 9], [100, 170, 9], [40, 140, 9], [100, 100, 11]] },
  tree: { paths: ["M100 36 L58 92", "M100 36 L142 92", "M58 92 L34 152", "M58 92 L82 152", "M142 92 L118 152", "M142 92 L166 152"], dots: [[100, 36, 12], [58, 92, 11], [142, 92, 11], [34, 152, 10], [82, 152, 10], [118, 152, 10], [166, 152, 10]] },
  gate: { paths: ["M62 50 H102 A50 50 0 0 1 102 150 H62 Z", "M18 76 H62", "M18 124 H62", "M152 100 H186"], dots: [[18, 76, 6], [18, 124, 6], [186, 100, 6]] },
  chip: { paths: ["M56 56 H144 V144 H56 Z", "M80 80 H120 V120 H80 Z", "M72 56 V30 M90 56 V30 M110 56 V30 M128 56 V30", "M72 144 V170 M90 144 V170 M110 144 V170 M128 144 V170", "M56 72 H30 M56 90 H30 M56 110 H30 M56 128 H30", "M144 72 H170 M144 90 H170 M144 110 H170 M144 128 H170"] },
  bell: { paths: ["M18 164 H182", "M20 162 C 70 160, 76 38, 100 38 C 124 38, 130 160, 180 162"], fills: ["M52 164 V142 H68 V164 Z", "M72 164 V96 H88 V164 Z", "M92 164 V52 H108 V164 Z", "M112 164 V96 H128 V164 Z", "M132 164 V142 H148 V164 Z"] },
  gantt: { paths: ["M24 172 H182", "M28 30 V176"], fills: ["M34 42 H86 V62 H34 Z", "M96 42 H136 V62 H96 Z", "M60 84 H122 V104 H60 Z", "M132 84 H176 V104 H132 Z", "M34 126 H72 V146 H34 Z", "M104 126 H170 V146 H104 Z"] },
  globe: { paths: ["M100 30 A70 70 0 1 1 99.9 30", "M100 30 A34 70 0 1 1 99.9 30", "M30 100 H170", "M40 64 Q100 82 160 64", "M40 136 Q100 118 160 136"], dots: [[100, 30, 6], [170, 100, 6], [52, 150, 6]] },
  db: { paths: ["M40 50 A60 18 0 1 0 160 50 A60 18 0 1 0 40 50", "M40 50 V150 M160 50 V150", "M40 150 A60 18 0 0 0 160 150", "M40 84 A60 18 0 0 0 160 84", "M40 117 A60 18 0 0 0 160 117"] },
  compiler: { paths: ["M48 52 Q30 52 30 70 V88 Q30 100 18 100 Q30 100 30 112 V130 Q30 148 48 148", "M70 100 H122", "M108 86 L122 100 L108 114"], texts: [[132, 88, "01"], [132, 128, "10"]] },
  neural: { paths: ["M40 56 L100 40 M40 56 L100 82 M40 56 L100 124 M40 56 L100 166 M40 100 L100 40 M40 100 L100 82 M40 100 L100 124 M40 100 L100 166 M40 144 L100 40 M40 144 L100 82 M40 144 L100 124 M40 144 L100 166", "M100 40 L160 78 M100 82 L160 78 M100 124 L160 78 M100 166 L160 78 M100 40 L160 124 M100 82 L160 124 M100 124 L160 124 M100 166 L160 124"], dots: [[40, 56, 9], [40, 100, 9], [40, 144, 9], [100, 40, 9], [100, 82, 9], [100, 124, 9], [100, 166, 9], [160, 78, 10], [160, 124, 10]] },
  git: { paths: ["M24 150 H180", "M72 150 C 84 96, 96 92, 112 92 H138 C 152 92, 158 120, 164 150"], dots: [[36, 150, 8], [72, 150, 8], [110, 150, 8], [164, 150, 9], [112, 92, 8], [140, 92, 8]] },
  cube: { paths: ["M48 76 H128 V156 H48 Z", "M78 44 H158 V124 H78 Z", "M48 76 L78 44 M128 76 L158 44 M128 156 L158 124 M48 156 L78 124", "M48 156 L128 76"] },
  shield: { paths: ["M100 24 L166 50 V100 C166 140 136 166 100 180 C64 166 34 140 34 100 V50 Z", "M86 96 V82 A14 14 0 0 1 114 82 V96"], fills: ["M76 96 H124 V136 H76 Z"], dots: [[100, 112, 5]] },
} satisfies Record<string, Icon>;

const YEARS = [
  { zh: "大一", en: "FRESHMAN · YEAR 1", col: C.cyan },
  { zh: "大二", en: "SOPHOMORE · YEAR 2", col: C.gold },
  { zh: "大三", en: "JUNIOR · YEAR 3", col: C.green },
  { zh: "大四", en: "SENIOR · YEAR 4", col: C.magenta },
];

const COURSES: { zh: string; en: string; icon: Icon }[] = [
  { zh: "高等数学", en: "ADVANCED CALCULUS", icon: I.calculus },
  { zh: "线性代数", en: "LINEAR ALGEBRA", icon: I.matrix },
  { zh: "程序设计", en: "PROGRAMMING", icon: I.code },
  { zh: "离散数学", en: "DISCRETE MATHEMATICS", icon: I.graph },
  { zh: "数据结构", en: "DATA STRUCTURES", icon: I.tree },
  { zh: "数字逻辑", en: "DIGITAL LOGIC", icon: I.gate },
  { zh: "计算机组成", en: "COMPUTER ORGANIZATION", icon: I.chip },
  { zh: "概率统计", en: "PROBABILITY & STATISTICS", icon: I.bell },
  { zh: "操作系统", en: "OPERATING SYSTEMS", icon: I.gantt },
  { zh: "计算机网络", en: "COMPUTER NETWORKS", icon: I.globe },
  { zh: "数据库", en: "DATABASE SYSTEMS", icon: I.db },
  { zh: "编译原理", en: "COMPILERS", icon: I.compiler },
  { zh: "人工智能", en: "ARTIFICIAL INTELLIGENCE", icon: I.neural },
  { zh: "软件工程", en: "SOFTWARE ENGINEERING", icon: I.git },
  { zh: "计算机图形学", en: "COMPUTER GRAPHICS", icon: I.cube },
  { zh: "信息安全", en: "INFORMATION SECURITY", icon: I.shield },
];

const GLYPH_POOL = ["∑", "∫", "λ", "∀", "∃", "⊕", "→", "∞", "π", "{ }", "0x1F", "O(n log n)", "f(x)", "∂", "≡", "SELECT", "fork()", "TCP", "<T>", "√2", "A*", "∇"];

const IconArt: React.FC<{ icon: Icon; p: number; col: string; size: number }> = ({ icon, p, col, size }) => {
  const d = ease.outCubic(clamp(p / 0.6));
  const f = ease.outCubic(clamp((p - 0.35) / 0.5));
  return (
    <svg width={size} height={size} viewBox="0 0 200 200" style={{ overflow: "visible", filter: `drop-shadow(0 0 10px ${col}) drop-shadow(0 0 24px ${col}66)` }}>
      {(icon.fills ?? []).map((pd, k) => (
        <path key={`f${k}`} d={pd} fill={col} opacity={0.28 * f} />
      ))}
      {icon.paths.map((pd, k) => (
        <path key={`p${k}`} d={pd} fill="none" stroke={col} strokeWidth={4} strokeLinecap="round" strokeLinejoin="round" pathLength={1} strokeDasharray={1} strokeDashoffset={1 - d} />
      ))}
      {(icon.dots ?? []).map(([x, y, r], k) => (
        <circle key={`d${k}`} cx={x} cy={y} r={r * ease.outBack(clamp(f * 1.2 - k * 0.04))} fill="#060a14" stroke={col} strokeWidth={3.5} />
      ))}
      {(icon.texts ?? []).map(([x, y, s], k) => (
        <text key={`t${k}`} x={x} y={y} fontFamily={F.mono} fontSize={30} fontWeight={700} fill={col} opacity={f}>
          {s}
        </text>
      ))}
    </svg>
  );
};

export const CourseMontage: React.FC<{ offset: number }> = ({ offset }) => {
  const t = useTime() + offset;
  const cuts = CUTS.courses;
  const t0 = cuts[0];
  let k = 0;
  for (let i = 0; i < cuts.length; i++) if (cuts[i] <= t + 1e-6) k = i;
  const lt = t - cuts[k];
  const year = Math.floor(k / 4);
  const Y = YEARS[year];
  const course = COURSES[k];
  const inA = ease.outCubic(clamp((t - t0 + 0.05) / 0.35));
  const end = ease.inCubic(clamp((t - (cuts[15] + 0.3)) / 0.25));
  const slam = ease.outCubic(clamp(lt / 0.18));
  const flash = Math.exp(-lt / 0.07);
  const yearIn = ease.outBack(clamp((t - cuts[year * 4]) / 0.3));
  const glyphs = useMemo(() => {
    const r = mulberry32(120);
    return Array.from({ length: 34 }, (_, i) => ({ s: GLYPH_POOL[i % GLYPH_POOL.length], x: r() * 1920, y: r() * 1080, z: 0.3 + r() * 0.7, sp: 20 + r() * 60 }));
  }, []);
  return (
    <AbsoluteFill style={{ background: "radial-gradient(ellipse 90% 80% at 60% 40%, #0c1830 0%, #050a16 55%, #020409 100%)", opacity: inA }}>
      <svg width={1920} height={1080} style={{ position: "absolute", inset: 0 }}>
        <g opacity={0.5}>
          {Array.from({ length: 23 }, (_, i) => {
            const x = -400 + i * 120 + ((t * 60) % 120);
            return <line key={`v${i}`} x1={960 + (x - 960) * 0.25} y1={560} x2={x} y2={1080} stroke={Y.col} strokeOpacity={0.16} strokeWidth={1} />;
          })}
          {Array.from({ length: 10 }, (_, i) => {
            const u = ((i + (t * 1.6) % 1) / 10) ** 2;
            const y = 560 + u * 520;
            return <line key={`h${i}`} x1={0} y1={y} x2={1920} y2={y} stroke={Y.col} strokeOpacity={0.05 + 0.16 * u} strokeWidth={1} />;
          })}
        </g>
      </svg>
      {glyphs.map((g, i) => (
        <div key={i} style={{ position: "absolute", left: g.x, top: ((g.y - (t - t0) * g.sp) % 1080 + 1080) % 1080, fontFamily: F.mono, fontSize: 16 + 26 * g.z, color: `rgba(170,210,255,${0.05 + 0.1 * g.z})` }}>
          {g.s}
        </div>
      ))}

      <div style={{ position: "absolute", left: 120, top: 92 }}>
        <div style={{ fontFamily: F.serif, fontWeight: 700, fontSize: 38, letterSpacing: "0.3em", color: "#fff" }}>四年 · 你将学习</div>
        <div style={{ fontFamily: F.tech, fontSize: 14, letterSpacing: "0.5em", color: "rgba(220,235,255,0.6)", marginTop: 10 }}>FOUR YEARS · WHAT YOU WILL LEARN</div>
      </div>
      <div style={{ position: "absolute", right: 120, top: 80, textAlign: "right", transform: `scale(${lerp(1.3, 1, yearIn)})`, transformOrigin: "100% 0%" }}>
        <div style={{ fontFamily: F.serif, fontWeight: 900, fontSize: 76, letterSpacing: "0.12em", color: Y.col, textShadow: `0 0 30px ${Y.col}aa` }}>{Y.zh}</div>
        <div style={{ fontFamily: F.tech, fontSize: 14, letterSpacing: "0.45em", color: "rgba(230,240,255,0.7)" }}>{Y.en}</div>
      </div>

      <div style={{ position: "absolute", left: 120, top: 300, transform: `scale(${lerp(1.16, 1, slam)})`, transformOrigin: "0% 50%", opacity: slam, filter: slam < 1 ? `blur(${(1 - slam) * 10}px)` : undefined }}>
        <div style={{ fontFamily: F.mono, fontSize: 20, letterSpacing: "0.3em", color: Y.col }}>COURSE {String(k + 1).padStart(2, "0")} / 16</div>
        <div style={{ fontFamily: F.serif, fontWeight: 900, fontSize: 170, lineHeight: 1.12, letterSpacing: "0.06em", color: "#fff", textShadow: `0 0 40px ${Y.col}77, 0 10px 40px rgba(0,0,0,0.8)`, marginTop: 6, whiteSpace: "nowrap" }}>{course.zh}</div>
        <div style={{ fontFamily: F.tech, fontSize: 26, letterSpacing: "0.38em", color: "rgba(230,240,255,0.8)", marginTop: 8 }}>{course.en}</div>
      </div>

      <div style={{ position: "absolute", left: 1250, top: 200, width: 460, height: 460 }}>
        <svg width={460} height={460} style={{ position: "absolute", inset: 0, overflow: "visible" }}>
          <circle cx={230} cy={230} r={214} fill="none" stroke={Y.col} strokeOpacity={0.35} strokeWidth={1.5} strokeDasharray="4 10" transform={`rotate(${t * 30} 230 230)`} />
          <circle cx={230} cy={230} r={186} fill="none" stroke={Y.col} strokeOpacity={0.18 + 0.4 * flash} strokeWidth={1} />
        </svg>
        <div style={{ position: "absolute", left: 30, top: 30 }}>
          <IconArt key={k} icon={course.icon} p={clamp(lt / 0.42)} col={Y.col} size={400} />
        </div>
      </div>

      <div style={{ position: "absolute", left: 120, right: 120, top: 760, display: "grid", gridTemplateColumns: "repeat(4, 1fr)", columnGap: 26, rowGap: 10 }}>
        {YEARS.map((y, yi) => (
          <div key={y.zh} style={{ fontFamily: F.sans, fontWeight: 700, fontSize: 18, letterSpacing: "0.3em", color: yi <= year ? y.col : "rgba(255,255,255,0.3)", borderBottom: `1px solid ${yi <= year ? y.col : "rgba(255,255,255,0.15)"}`, paddingBottom: 6 }}>
            {y.zh} <span style={{ fontFamily: F.tech, fontSize: 11, letterSpacing: "0.3em", opacity: 0.7 }}>{y.en.split(" · ")[0]}</span>
          </div>
        ))}
        {Array.from({ length: 16 }, (_, cell) => {
          const row = Math.floor(cell / 4);
          const col = cell % 4;
          const ci = col * 4 + row;
          const on = ci <= k;
          const now = ci === k;
          const yc = YEARS[col].col;
          const pop = now ? ease.outBack(clamp(lt / 0.25)) : 1;
          return (
            <div
              key={cell}
              style={{
                fontFamily: F.sans,
                fontSize: 23,
                fontWeight: now ? 700 : 500,
                letterSpacing: "0.12em",
                padding: "8px 14px",
                borderRadius: 8,
                color: on ? "#fff" : "rgba(255,255,255,0.22)",
                background: now ? `${yc}44` : on ? `${yc}18` : "rgba(255,255,255,0.03)",
                border: `1px solid ${on ? yc : "rgba(255,255,255,0.1)"}`,
                boxShadow: now ? `0 0 24px ${yc}88` : undefined,
                transform: `scale(${now ? lerp(1.12, 1, pop) : 1})`,
              }}
            >
              <span style={{ fontFamily: F.mono, fontSize: 14, color: on ? yc : "rgba(255,255,255,0.2)", marginRight: 12 }}>{String(ci + 1).padStart(2, "0")}</span>
              {COURSES[ci].zh}
            </div>
          );
        })}
      </div>
      <AbsoluteFill style={{ background: "#fff", opacity: 0.9 * end, mixBlendMode: "screen" }} />
    </AbsoluteFill>
  );
};
