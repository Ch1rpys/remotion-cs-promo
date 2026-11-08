import React from "react";
import { AbsoluteFill } from "remotion";
import { Backdrop } from "../components/Backdrop";
import { Dust } from "../components/Dust";
import { RevealChars, ScrambleText, useTime } from "../components/Text";
import { ease, invLerp } from "../lib/anim";
import { C, F } from "../theme";

const SNIPPETS = [
  "void quickSort(int a[], int l, int r) {",
  "    if (l >= r) return;",
  "    int p = partition(a, l, r);",
  "    quickSort(a, l, p - 1);",
  "    quickSort(a, p + 1, r);",
  "}",
  "while (!pq.empty()) {",
  "    auto [d, u] = pq.top(); pq.pop();",
  "    for (auto [v, w] : g[u])",
  "        if (dist[v] > d + w) {",
  "            dist[v] = d + w;",
  "            pq.push({dist[v], v});",
  "        }",
  "}",
  "dp[i][j] = max(dp[i-1][j], dp[i-1][j-w[i]] + v[i]);",
  "node* insert(node* t, int k) {",
  "    if (!t) return new node(k);",
  "    if (k < t->key) t->l = insert(t->l, k);",
  "    else t->r = insert(t->r, k);",
  "    return t;",
  "}",
  "int find(int x) { return p[x] == x ? x : p[x] = find(p[x]); }",
  "for (int k = 0; k < n; k++)",
  "  for (int i = 0; i < n; i++)",
  "    for (int j = 0; j < n; j++)",
  "      d[i][j] = min(d[i][j], d[i][k] + d[k][j]);",
];

const CodeLayer: React.FC<{ t: number; depth: number; x: number; speed: number; start: number }> = ({ t, depth, x, speed, start }) => {
  const blur = depth * 3.2;
  const size = 26 - depth * 7;
  return (
    <div
      style={{
        position: "absolute",
        left: x,
        top: 1100 - ((t * speed + start) % 1800),
        fontFamily: F.mono,
        fontSize: size,
        lineHeight: 1.7,
        whiteSpace: "pre",
        color: `rgba(110,170,255,${0.2 - depth * 0.05})`,
        filter: `blur(${blur}px)`,
      }}
    >
      {SNIPPETS.map((l, i) => (
        <div key={i}>{l}</div>
      ))}
    </div>
  );
};

export const S07Quote: React.FC<{ offset: number }> = ({ offset }) => {
  const tau = useTime();
  const t = tau + offset;
  const out = ease.inCubic(invLerp(55.55, 56.25, t));
  const push = 1 + 0.05 * ease.inOutSine(invLerp(52, 56, t)) + out * 0.6;
  const inA = ease.outCubic(invLerp(52.0, 52.6, t));
  const line = 560 * ease.inOutCubic(invLerp(52.7, 53.6, t));
  return (
    <AbsoluteFill style={{ background: "radial-gradient(ellipse 80% 70% at 50% 50%, #081226 0%, #03060f 60%, #000 100%)", opacity: inA }}>
      <Backdrop name="library" t={tau} t0={0} t1={4.3} opacity={0.8 * (1 - out)} blur={10} bright={0.58} sat={0.85} zoom={[1.06, 1.12]} />
      <AbsoluteFill style={{ background: "radial-gradient(ellipse 60% 55% at 50% 50%, rgba(3,6,15,0.3) 0%, rgba(3,6,15,0.72) 100%)" }} />
      <AbsoluteFill style={{ transform: `scale(${1 + 0.03 * tau})`, opacity: 1 - out }}>
        <CodeLayer t={tau} depth={2} x={80} speed={30} start={300} />
        <CodeLayer t={tau} depth={1} x={1180} speed={45} start={700} />
        <CodeLayer t={tau} depth={0.2} x={-120} speed={60} start={1300} />
        <Dust count={40} seed={21} opacity={0.6} speed={0.5} />
      </AbsoluteFill>
      <AbsoluteFill
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          transform: `scale(${push})`,
          opacity: 1 - out,
          filter: out > 0.01 ? `blur(${out * 16}px)` : undefined,
        }}
      >
        <div style={{ position: "absolute", width: 1400, height: 700, background: "radial-gradient(ellipse at center, rgba(0,3,10,0.85) 0%, rgba(0,3,10,0.5) 45%, rgba(0,0,0,0) 72%)" }} />
        <ScrambleText text="CHAPTER  II" t0={52.05 - offset} dur={0.9} style={{ fontFamily: F.tech, fontSize: 22, letterSpacing: "0.7em", color: C.gold, fontWeight: 600, paddingLeft: "0.7em", position: "relative" }} />
        <RevealChars
          text="算法"
          t0={52.25 - offset}
          stagger={0.14}
          dur={1.0}
          blur={20}
          scaleFrom={1.25}
          style={{ fontFamily: F.serif, fontWeight: 800, fontSize: 150, letterSpacing: "0.12em", paddingLeft: "0.12em", color: "#fff", marginTop: 20, filter: `drop-shadow(0 0 30px ${C.gold}66)`, position: "relative" }}
        />
        <ScrambleText text="ALGORITHM" t0={52.7 - offset} dur={0.9} style={{ fontFamily: F.display, fontSize: 30, letterSpacing: "0.9em", paddingLeft: "0.9em", color: "rgba(230,240,255,0.85)", marginTop: 14, position: "relative" }} />
        <div style={{ width: line, height: 1, marginTop: 34, background: `linear-gradient(90deg, transparent, ${C.gold}, transparent)`, position: "relative" }} />
        <div style={{ display: "flex", gap: 22, marginTop: 30, fontFamily: F.serif, fontSize: 46, fontWeight: 600, letterSpacing: "0.1em", position: "relative" }}>
          <RevealChars text="程序" t0={53.25 - offset} style={{ color: "#fff" }} />
          <RevealChars text="=" t0={53.5 - offset} style={{ color: "rgba(200,220,255,0.7)" }} />
          <RevealChars text="算法" t0={53.75 - offset} style={{ color: C.gold, textShadow: `0 0 20px ${C.gold}88` }} />
          <RevealChars text="+" t0={54.0 - offset} style={{ color: "rgba(200,220,255,0.7)" }} />
          <RevealChars text="数据结构" t0={54.25 - offset} style={{ color: C.cyan, textShadow: `0 0 20px ${C.cyan}88` }} />
        </div>
        <ScrambleText
          text="“ALGORITHMS + DATA STRUCTURES = PROGRAMS.”  — NIKLAUS WIRTH"
          t0={54.5 - offset}
          dur={0.8}
          style={{ fontFamily: F.display, fontSize: 18, letterSpacing: "0.3em", color: "rgba(200,220,255,0.65)", marginTop: 26, position: "relative" }}
        />
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
