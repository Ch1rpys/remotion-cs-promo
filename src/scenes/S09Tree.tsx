import React, { useMemo } from "react";
import { AbsoluteFill } from "remotion";
import { Caption, CourseTag, Hud, useTime } from "../components/Text";
import { clamp, ease, invLerp, lerp } from "../lib/anim";
import { C, F } from "../theme";

type Node = { key: number; level: number; idx: number; parent: number; x: number; y: number; appear: number };

const buildTree = () => {
  const levels: number[][] = [[50], [30, 70], [20, 40, 60, 80], [10, 25, 35, 45, 55, 65, 75, 90]];
  levels.push(levels[3].flatMap((v) => [v - 3, v + 3]));
  const nodes: Node[] = [];
  const W = 1720;
  let order = 0;
  levels.forEach((row, L) => {
    row.forEach((key, k) => {
      const parent = L === 0 ? -1 : nodes.findIndex((n) => n.level === L - 1 && n.idx === Math.floor(k / 2));
      let appear: number;
      if (order < 7) appear = 0.45 + order * 0.3;
      else if (L === 3) appear = 2.55 + k * 0.09;
      else appear = 3.35 + k * 0.045;
      nodes.push({ key, level: L, idx: k, parent, x: 960 - W / 2 + ((k + 0.5) / row.length) * W, y: 160 + L * 148, appear });
      order++;
    });
  });
  return nodes;
};

const SEARCH = [50, 70, 60, 65, 62];
const S0 = 4.35;
const SDT = 0.26;

export const S09Tree: React.FC<{ offset: number }> = ({ offset }) => {
  const tau = useTime();
  const nodes = useMemo(buildTree, []);
  const fadeIn = ease.outCubic(invLerp(0, 0.5, tau));
  const out = ease.inCubic(invLerp(5.6, 6.3, tau));
  const tilt = lerp(24, 10, ease.inOutSine(invLerp(0, 6.3, tau)));
  const s = lerp(0.9, 1.0, ease.inOutSine(invLerp(0, 6.3, tau))) * (1 + out * 0.15);
  const searchStep = tau < S0 ? -1 : Math.floor((tau - S0) / SDT);
  const pathNodes = SEARCH.map((k) => nodes.findIndex((n) => n.key === k));
  const onPath = (i: number) => {
    const pi = pathNodes.indexOf(i);
    return pi >= 0 && pi <= searchStep ? pi : -1;
  };
  return (
    <AbsoluteFill style={{ background: "radial-gradient(ellipse 90% 80% at 50% 45%, #0a1530 0%, #040914 55%, #010207 100%)", opacity: fadeIn * (1 - out) }}>
      <AbsoluteFill style={{ transform: `perspective(1900px) rotateX(${tilt}deg) scale(${s})`, transformOrigin: "50% 45%" }}>
        <svg width={1920} height={1080} style={{ position: "absolute", inset: 0, overflow: "visible" }}>
          <defs>
            <pattern id="tgrid" width="60" height="60" patternUnits="userSpaceOnUse">
              <path d="M60 0 H0 V60" fill="none" stroke="rgba(80,140,255,0.08)" strokeWidth="1" />
            </pattern>
            <filter id="tglow" x="-50%" y="-50%" width="200%" height="200%">
              <feGaussianBlur stdDeviation="6" result="b" />
              <feMerge>
                <feMergeNode in="b" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>
          <rect x={-800} y={-600} width={3600} height={2400} fill="url(#tgrid)" />
          {nodes.map((n, i) => {
            if (n.parent < 0) return null;
            const p = nodes[n.parent];
            const e = ease.inOutCubic(invLerp(n.appear - 0.05, n.appear + 0.3, tau));
            if (e <= 0) return null;
            const d = `M${p.x},${p.y} C${p.x},${(p.y + n.y) / 2} ${n.x},${(p.y + n.y) / 2} ${n.x},${n.y}`;
            const hot = onPath(i) >= 1;
            return (
              <g key={`e${i}`}>
                <path d={d} fill="none" stroke={hot ? C.gold : C.cyan} strokeOpacity={hot ? 1 : 0.55} strokeWidth={hot ? 4 : 2} pathLength={1} strokeDasharray={1} strokeDashoffset={1 - e} filter={hot ? "url(#tglow)" : undefined} />
              </g>
            );
          })}
          {nodes.map((n, i) => {
            if (i >= 7) return null;
            const travel = invLerp(n.appear - 0.28, n.appear, tau);
            if (travel <= 0 || travel >= 1 || n.parent < 0) return null;
            const chain: Node[] = [];
            let c: number = i;
            while (c >= 0) {
              chain.unshift(nodes[c]);
              c = nodes[c].parent;
            }
            const f = travel * (chain.length - 1);
            const k = Math.min(chain.length - 2, Math.floor(f));
            const a = chain[k];
            const b = chain[k + 1];
            const u = f - k;
            return <circle key={`b${i}`} cx={lerp(a.x, b.x, u)} cy={lerp(a.y, b.y, u)} r={9} fill="#fff" style={{ filter: `drop-shadow(0 0 10px ${C.cyan})` }} />;
          })}
          {nodes.map((n, i) => {
            const e = ease.outBack(clamp(invLerp(n.appear, n.appear + 0.35, tau)));
            if (e <= 0) return null;
            const pi = onPath(i);
            const hot = pi >= 0;
            const found = hot && pi === SEARCH.length - 1;
            const r = (n.level === 4 ? 21 : 26) * e;
            const col = hot ? C.gold : C.cyan;
            const pulse = hot ? Math.exp(-(tau - (S0 + pi * SDT)) * 5) : 0;
            return (
              <g key={`n${i}`} filter="url(#tglow)">
                {found ? <circle cx={n.x} cy={n.y} r={r + 14 + 20 * (1 - Math.exp(-(tau - (S0 + pi * SDT)) * 3))} fill="none" stroke={C.gold} strokeOpacity={Math.exp(-(tau - (S0 + pi * SDT)) * 2)} strokeWidth={3} /> : null}
                <circle cx={n.x} cy={n.y} r={r + pulse * 8} fill={hot ? "rgba(60,40,5,0.95)" : "rgba(5,14,32,0.95)"} stroke={col} strokeWidth={hot ? 3.5 : 2.5} />
                <text x={n.x} y={n.y + 8} textAnchor="middle" fontFamily={F.mono} fontSize={n.level === 4 ? 18 : 22} fontWeight={700} fill={hot ? "#fff3d6" : "rgba(210,240,255,0.95)"} opacity={e}>
                  {n.key}
                </text>
              </g>
            );
          })}
        </svg>
      </AbsoluteFill>
      <CourseTag zh="数据结构" en="Data Structures" start={0.4} end={5.5} y={150} />
      <Hud
        right
        x={96}
        y={150}
        start={S0 - 0.1}
        end={5.5}
        accent={C.gold}
        lines={["BINARY SEARCH TREE · 二叉搜索树", "search(62)", `steps = ${clamp(searchStep, 0, 4)}`, "O(log n)"]}
      />
      <Caption zh="数据结构 · 组织信息的艺术" en="Data structures: the art of organizing information" start={1.0} end={5.4} y={860} size={50} backdrop={0.7} />
    </AbsoluteFill>
  );
};
