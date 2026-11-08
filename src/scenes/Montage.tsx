import React from "react";
import { AbsoluteFill, Sequence, useVideoConfig } from "remotion";
import { ThreeCanvas } from "@remotion/three";
import { Motion, Photo } from "./S15Photos";
import { Post } from "../three/common";
import { useTime } from "../components/Text";
import { clamp, ease } from "../lib/anim";
import { CUTS } from "../lib/beats";
import { C, F } from "../theme";

type MShot = { name: string; zh: string; en: string; tag: string };
type MSet = { title: string; en: string; accent: string; cuts: number[]; end: number; shots: MShot[] };

const SETS: Record<"hardware" | "future", MSet> = {
  hardware: {
    title: "硬件 · 算力的基石",
    en: "HARDWARE · THE FOUNDATION OF COMPUTING",
    accent: C.cyan,
    cuts: CUTS.hardware,
    end: 60.0,
    shots: [
      { name: "hw_gpu", zh: "GPU · 并行计算", en: "GPU · PARALLEL COMPUTING", tag: "计算机体系结构" },
      { name: "hw_memory", zh: "内存 · 存储层次", en: "MEMORY HIERARCHY", tag: "计算机组成原理" },
      { name: "hw_pcb", zh: "电路板 · 硬件设计", en: "HARDWARE DESIGN", tag: "数字逻辑与电路" },
      { name: "hw_fiber", zh: "光纤 · 数据通信", en: "OPTICAL COMMUNICATION", tag: "计算机网络" },
      { name: "hw_supercomputer", zh: "超级计算机", en: "HIGH-PERFORMANCE COMPUTING", tag: "并行与分布式计算" },
      { name: "hw_cleanroom", zh: "光刻 · 芯片制造", en: "LITHOGRAPHY", tag: "集成电路" },
      { name: "hw_wafer_robot", zh: "晶圆 · 半导体", en: "SEMICONDUCTORS", tag: "微电子" },
      { name: "hw_quantum", zh: "量子计算", en: "QUANTUM COMPUTING", tag: "前沿计算" },
      { name: "hw_soc", zh: "SoC · 嵌入式", en: "SYSTEM ON CHIP", tag: "嵌入式系统" },
      { name: "hw_ssd", zh: "NVMe · 存储系统", en: "SOLID-STATE STORAGE", tag: "操作系统 · 文件系统" },
    ],
  },
  future: {
    title: "前沿 · 改变世界的方向",
    en: "FRONTIERS · WHERE COMPUTING GOES NEXT",
    accent: C.magenta,
    cuts: CUTS.future,
    end: 176.0,
    shots: [
      { name: "ft_autonomous", zh: "自动驾驶", en: "AUTONOMOUS DRIVING", tag: "计算机视觉 · 决策规划" },
      { name: "ft_robot", zh: "具身智能", en: "EMBODIED AI · ROBOTICS", tag: "机器人学" },
      { name: "ft_vr", zh: "虚拟现实", en: "VR · HUMAN–COMPUTER INTERACTION", tag: "人机交互" },
      { name: "ft_satellite", zh: "卫星互联网", en: "SATELLITE INTERNET", tag: "空天信息网络" },
      { name: "ft_drones", zh: "无人机集群", en: "SWARM INTELLIGENCE", tag: "多智能体系统" },
      { name: "ft_medical", zh: "智慧医疗", en: "AI FOR HEALTHCARE", tag: "医学影像分析" },
      { name: "ft_factory", zh: "智能制造", en: "SMART MANUFACTURING", tag: "工业互联网" },
      { name: "ft_esports", zh: "游戏引擎", en: "GAME ENGINES · ESPORTS", tag: "计算机图形学" },
      { name: "ft_bigdata", zh: "智慧城市", en: "BIG DATA · SMART CITY", tag: "数据科学" },
      { name: "ft_science", zh: "AI for Science", en: "AI FOR SCIENCE", tag: "科学计算" },
      { name: "ft_rocket", zh: "航天软件", en: "AEROSPACE SOFTWARE", tag: "实时嵌入式系统" },
      { name: "ft_telescope", zh: "射电天文", en: "RADIO ASTRONOMY · BIG DATA", tag: "高性能计算" },
    ],
  },
};

const motionFor = (i: number, dur: number): Motion => {
  const k = dur < 0.75 ? 1.6 : 1.0;
  const dir = i % 2 ? 1 : -1;
  const zoom: [number, number] = i % 3 === 1 ? [1.13, 1.04] : [1.03, 1.03 + 0.09 * k];
  return { zoom, dolly: 0.22, shift: [[0.014 * dir * k, 0.004], [-0.014 * dir * k, -0.004]], focus: 0.5 };
};

const Shot: React.FC<{ s: MShot; i: number; n: number; dur: number; accent: string }> = ({ s, i, n, dur, accent }) => {
  const tau = useTime();
  const { width, height } = useVideoConfig();
  const punch = Math.exp(-tau / 0.11);
  const flash = Math.exp(-tau / 0.055);
  const a = ease.outCubic(clamp(tau / 0.16));
  const b = ease.outCubic(clamp((tau - 0.05) / 0.2));
  return (
    <AbsoluteFill>
      <ThreeCanvas width={width} height={height} gl={{ antialias: false }} camera={{ position: [0, 0, 1] }}>
        <Photo name={s.name} p={clamp(tau / dur)} m={motionFor(i, dur)} exposure={1.0 + 0.4 * flash} extraZoom={1 + 0.06 * punch} />
        <Post bloom={0.55 + 0.9 * flash} threshold={0.62} radius={0.8} ca={0.0008 + 0.007 * punch} />
      </ThreeCanvas>
      <AbsoluteFill style={{ background: "linear-gradient(180deg, rgba(0,0,0,0.35) 0%, rgba(0,0,0,0) 22%, rgba(0,0,0,0) 55%, rgba(0,0,0,0.78) 100%)" }} />
      <div style={{ position: "absolute", left: 118, bottom: 128, opacity: a, transform: `translateX(${(1 - a) * -46}px)`, filter: a < 1 ? `blur(${(1 - a) * 8}px)` : undefined }}>
        <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 14 }}>
          <span style={{ fontFamily: F.mono, fontSize: 18, letterSpacing: "0.2em", color: accent, textShadow: `0 0 12px ${accent}` }}>
            {String(i + 1).padStart(2, "0")} / {String(n).padStart(2, "0")}
          </span>
          <span style={{ width: 70 * b, height: 2, background: accent, boxShadow: `0 0 8px ${accent}` }} />
          <span style={{ fontFamily: F.sans, fontSize: 19, letterSpacing: "0.2em", color: "rgba(235,245,255,0.85)", opacity: b }}>核心课程 · {s.tag}</span>
        </div>
        <div style={{ fontFamily: F.sans, fontWeight: 900, fontSize: 88, lineHeight: 1.05, letterSpacing: "0.04em", color: "#fff", textShadow: `0 0 30px ${accent}88, 0 6px 30px rgba(0,0,0,0.9)` }}>{s.zh}</div>
        <div style={{ fontFamily: F.tech, fontSize: 20, letterSpacing: "0.42em", color: "rgba(230,240,255,0.78)", marginTop: 12, opacity: b }}>{s.en}</div>
      </div>
      <AbsoluteFill style={{ background: "#fff", opacity: 0.2 * flash, mixBlendMode: "screen" }} />
    </AbsoluteFill>
  );
};

const Chrome: React.FC<{ t: number; idx: number; set: MSet; t0: number }> = ({ t, idx, set, t0 }) => {
  const a = ease.outCubic(clamp((t - t0) / 0.3));
  const col = set.accent;
  const arm = 46;
  const m = 56;
  const corner = (x: number, y: number, sx: number, sy: number) => <path d={`M${x + sx * arm} ${y} L${x} ${y} L${x} ${y + sy * arm}`} fill="none" stroke={col} strokeWidth={2.5} opacity={0.85} />;
  return (
    <AbsoluteFill style={{ opacity: a, pointerEvents: "none" }}>
      <svg width={1920} height={1080} style={{ position: "absolute", inset: 0, filter: `drop-shadow(0 0 6px ${col})` }}>
        {corner(m, m, 1, 1)}
        {corner(1920 - m, m, -1, 1)}
        {corner(m, 1080 - m, 1, -1)}
        {corner(1920 - m, 1080 - m, -1, -1)}
      </svg>
      <div style={{ position: "absolute", right: 110, top: 92, textAlign: "right" }}>
        <div style={{ fontFamily: F.serif, fontWeight: 700, fontSize: 34, letterSpacing: "0.18em", color: "#fff", textShadow: "0 2px 18px rgba(0,0,0,0.9)" }}>{set.title}</div>
        <div style={{ fontFamily: F.tech, fontSize: 13, letterSpacing: "0.45em", color: col, marginTop: 8 }}>{set.en}</div>
        <div style={{ display: "flex", gap: 6, justifyContent: "flex-end", marginTop: 16 }}>
          {set.shots.map((_, k) => (
            <div key={k} style={{ width: 26, height: 4, borderRadius: 2, background: k <= idx ? col : "rgba(255,255,255,0.2)", boxShadow: k === idx ? `0 0 10px ${col}` : undefined }} />
          ))}
        </div>
      </div>
    </AbsoluteFill>
  );
};

export const PhotoMontage: React.FC<{ set: "hardware" | "future"; offset: number }> = ({ set, offset }) => {
  const cfg = SETS[set];
  const { fps } = useVideoConfig();
  const t = useTime() + offset;
  let idx = 0;
  for (let k = 0; k < cfg.cuts.length; k++) if (cfg.cuts[k] <= t + 1e-6) idx = k;
  return (
    <AbsoluteFill style={{ background: "#000" }}>
      {cfg.shots.map((s, i) => {
        const a = cfg.cuts[i];
        const b = i + 1 < cfg.cuts.length ? cfg.cuts[i + 1] : cfg.end;
        return (
          <Sequence key={s.name} from={Math.round((a - offset) * fps)} durationInFrames={Math.round((b - a) * fps)} layout="none">
            <Shot s={s} i={i} n={cfg.shots.length} dur={b - a} accent={cfg.accent} />
          </Sequence>
        );
      })}
      <Chrome t={t} idx={idx} set={cfg} t0={cfg.cuts[0]} />
    </AbsoluteFill>
  );
};
