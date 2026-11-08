import React, { useMemo } from "react";
import { AbsoluteFill, useVideoConfig } from "remotion";
import { ThreeCanvas } from "@remotion/three";
import typing from "../data/typing.json";
import { Backdrop } from "../components/Backdrop";
import { Dust } from "../components/Dust";
import { Editor, RING, TERM, TERM_CW, ringCenter } from "../components/Editor";
import { BigTitle, RevealChars, ScrambleText, useTime } from "../components/Text";
import { CameraRig, Post } from "../three/common";
import { CoreGlow, Tunnel } from "./S02Binary";
import { Credits } from "./S23Credits";
import { clamp, ease, invLerp, lerp, mulberry32, smoothstep } from "../lib/anim";
import { C, F } from "../theme";

/* ---------------------------------------------------------------- 170 s · 会是你 */
export const S20You: React.FC<{ offset: number }> = ({ offset }) => {
  const tau = useTime();
  const t = tau + offset;
  const parts = useMemo(() => {
    const r = mulberry32(170);
    return Array.from({ length: 90 }, () => ({ a: r() * Math.PI * 2, v: 120 + r() * 520, s: 1 + r() * 3, d: r() * 0.3 }));
  }, []);
  const fadeOut = ease.inCubic(invLerp(173.95, 174.4, t));
  const burst = Math.max(0, t - 172.0);
  return (
    <AbsoluteFill style={{ background: "#000", opacity: 1 - fadeOut }}>
      <Backdrop name="graduation" t={t} t0={172} t1={174.4} opacity={0.85 * ease.outCubic(invLerp(172.0, 172.6, t))} blur={8} bright={0.6} sat={0.9} zoom={[1.08, 1.14]} drift={[0, 0]} />
      <AbsoluteFill style={{ background: "radial-gradient(ellipse 60% 55% at 50% 50%, rgba(0,0,0,0.42) 0%, rgba(0,0,0,0.78) 100%)" }} />
      <AbsoluteFill
        style={{
          background: `conic-gradient(from ${tau * 12}deg at 50% 50%, rgba(255,193,94,0) 0deg, rgba(255,193,94,0.10) 20deg, rgba(255,193,94,0) 40deg, rgba(62,232,255,0.08) 80deg, rgba(0,0,0,0) 110deg, rgba(255,193,94,0.09) 170deg, rgba(0,0,0,0) 200deg, rgba(62,232,255,0.07) 260deg, rgba(0,0,0,0) 300deg, rgba(255,193,94,0.1) 340deg, rgba(0,0,0,0) 360deg)`,
          opacity: 0.9 * Math.exp(-burst * 0.4),
          maskImage: "radial-gradient(circle at 50% 50%, black 0%, black 25%, transparent 70%)",
          WebkitMaskImage: "radial-gradient(circle at 50% 50%, black 0%, black 25%, transparent 70%)",
        }}
      />
      {parts.map((p, i) => {
        const age = burst - p.d;
        if (age < 0) return null;
        const r = p.v * (1 - Math.exp(-age * 1.6));
        return (
          <div
            key={i}
            style={{
              position: "absolute",
              left: 960 + Math.cos(p.a) * r,
              top: 540 + Math.sin(p.a) * r * 0.6,
              width: p.s,
              height: p.s,
              borderRadius: "50%",
              background: i % 3 ? C.gold : C.cyan,
              boxShadow: `0 0 ${6 * p.s}px ${i % 3 ? C.gold : C.cyan}`,
              opacity: Math.exp(-age * 0.8),
            }}
          />
        );
      })}
      <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
        <RevealChars text="下一个改变世界的人，" t0={172.12 - offset} stagger={0.045} dur={0.6} style={{ fontFamily: F.serif, fontWeight: 600, fontSize: 60, letterSpacing: "0.2em", color: "#fff", textShadow: "0 0 30px rgba(0,0,0,0.9)" }} />
        <div style={{ marginTop: 26 }}>
          <RevealChars
            text="会是你"
            t0={172.7 - offset}
            stagger={0.12}
            dur={0.7}
            blur={26}
            scaleFrom={1.6}
            style={{ fontFamily: F.serif, fontWeight: 900, fontSize: 170, letterSpacing: "0.22em", paddingLeft: "0.22em", color: "#ffe2a8", filter: `drop-shadow(0 0 30px ${C.gold}) drop-shadow(0 0 80px ${C.amber}88)` }}
          />
        </div>
        <ScrambleText text="THE NEXT ONE TO CHANGE THE WORLD COULD BE YOU" t0={173.05 - offset} dur={0.7} style={{ fontFamily: F.display, fontSize: 22, letterSpacing: "0.5em", color: "rgba(255,230,190,0.8)", marginTop: 30 }} />
      </div>
    </AbsoluteFill>
  );
};

/* ---------------------------------------------------------------- 172–178 s · Hello, Future */
const RING_INDEX = 4;

export const S21Future: React.FC<{ offset: number }> = ({ offset }) => {
  const tau = useTime();
  const t = tau + offset;
  const o = typing.outro;
  const code0 = typing.intro.code;
  const iW = code0.indexOf("World");
  const n = o.typeTimes.filter((x) => x <= t).length;
  let code = code0;
  let cursorAt = code0.length;
  let selection: [number, number] | undefined;
  if (t >= o.select && t < o.delete) {
    selection = [iW, iW + 5];
    cursorAt = iW + 5;
  } else if (t >= o.delete) {
    code = code0.slice(0, iW) + o.typed.slice(0, n) + code0.slice(iW + 5);
    cursorAt = iW + n;
  }
  const typingNow = t >= o.delete - 0.1 && t <= o.typeTimes[o.typeTimes.length - 1] + 0.1;
  const blink = Math.floor(t / 0.53) % 2 === 0;
  const hasOut = t >= o.output;
  const glow = hasOut ? 1.6 * Math.exp(-(t - o.output) * 1.3) + 0.4 : 0;
  const recalled = t >= o.recall;

  const outC = { x: TERM.x + 7 * TERM_CW, y: TERM.line2 + 23 };
  const ring = ringCenter(RING_INDEX);
  const a = ease.inOutSine(invLerp(174, 178, t));
  let s = lerp(0.9, 1.0, a);
  let rx = lerp(8, 2, a);
  let ry = lerp(10, -3, a);
  let fx = 960;
  let fy = 520;
  const b = ease.inOutCubic(invLerp(178, 179.1, t));
  s = lerp(s, 1.8, b);
  rx = lerp(rx, 0, b);
  ry = lerp(ry, 0, b);
  fx = lerp(fx, outC.x, b);
  fy = lerp(fy, outC.y, b);
  const c = invLerp(179.1, 180, t);
  const cf = ease.inOutCubic(invLerp(179.1, 179.5, t));
  fx = lerp(fx, ring.x, cf);
  fy = lerp(fy, ring.y, cf);
  s = s * Math.pow(340 / 1.8, ease.inCubic(c));
  const toScreen = (x: number, y: number) => ({ x: 960 + s * (x - fx), y: 540 + s * (y - fy) });
  const rc = toScreen(ring.x, ring.y);
  const inRx = (RING.rx - RING.stroke / 2) * s;
  const inRy = (RING.ry - RING.stroke / 2) * s;
  const portal = c > 0 && inRx > 1.5;
  const mask = portal ? `radial-gradient(ellipse ${inRx}px ${inRy}px at ${rc.x}px ${rc.y}px, transparent 0%, transparent 97%, black 100%)` : undefined;
  const fadeIn = ease.outCubic(invLerp(174, 174.6, t));
  const outPos = toScreen(outC.x, outC.y);
  return (
    <AbsoluteFill style={{ WebkitMaskImage: mask, maskImage: mask }}>
      <AbsoluteFill style={{ background: "radial-gradient(ellipse 80% 70% at 50% 45%, #0b1630 0%, #050a16 45%, #010205 100%)" }} />
      <Backdrop name="campus_dusk" t={t} t0={174} t1={180} opacity={0.95 * fadeIn} blur={13} bright={0.66 + 0.3 * (hasOut ? Math.min(1, glow) : 0)} zoom={[1.1, 1.18]} drift={[-26, 26]} push={1 + 0.6 * ease.inCubic(clamp(c))} />
      <AbsoluteFill style={{ background: "radial-gradient(ellipse 70% 60% at 50% 48%, rgba(2,5,14,0.1) 0%, rgba(2,5,14,0.55) 100%)" }} />
      <Dust count={60} seed={4} opacity={0.7 * fadeIn} speed={0.6} color="255,220,170" />
      <AbsoluteFill style={{ transformOrigin: "0 0", transform: `translate(960px, 540px) scale(${s}) translate(${-fx}px, ${-fy}px)`, opacity: fadeIn }}>
        <div style={{ position: "absolute", inset: 0, transformOrigin: "960px 520px", transform: `perspective(2200px) rotateX(${rx}deg) rotateY(${ry}deg)` }}>
          <Editor
            code={code}
            visible={code.length}
            cursorAt={cursorAt}
            cursorOn={typingNow || blink}
            showCursor={t < o.recall - 0.05}
            selection={selection}
            codeBlur={b * 6}
            codeOpacity={1 - b * 0.5}
            term={1}
            cmd={typing.intro.cmd}
            cmdCursorOn={blink}
            showCmdCursor={recalled && t < o.enter}
            afterEnterCursor={t >= o.enter}
            output={hasOut ? "Hello, Future!" : recalled ? undefined : "Hello, World!"}
            outputDim={!hasOut}
            outputGlow={glow}
            outputColor={hasOut ? "#ffd89a" : undefined}
            ringIndex={hasOut ? RING_INDEX : undefined}
            ringGlow={portal ? 1 : 0}
            cmdBlur={b * 2.5}
            windowGlow={hasOut ? Math.exp(-(t - o.output) * 1.5) : 0}
          />
        </div>
      </AbsoluteFill>
      {hasOut ? (
        <AbsoluteFill
          style={{
            background: `radial-gradient(circle 640px at ${outPos.x}px ${outPos.y}px, rgba(255,200,110,${0.34 * Math.min(1, glow)}) 0%, rgba(255,140,60,${0.12 * Math.min(1, glow)}) 35%, rgba(0,0,0,0) 70%)`,
            mixBlendMode: "screen",
          }}
        />
      ) : null}
    </AbsoluteFill>
  );
};

/* ---------------------------------------------------------------- 178–188 s · Title */
const Logo: React.FC<{ p: number }> = ({ p }) => {
  const d = (k: number) => ({ pathLength: 1, strokeDasharray: 1, strokeDashoffset: 1 - ease.inOutCubic(clamp((p - k * 0.12) / 0.6)) });
  return (
    <svg width={200} height={110} viewBox="0 0 200 110" style={{ overflow: "visible", filter: `drop-shadow(0 0 14px ${C.gold}) drop-shadow(0 0 40px ${C.amber}66)` }}>
      <path d="M58 20 L18 55 L58 90" fill="none" stroke="#ffe2a8" strokeWidth={9} strokeLinecap="round" strokeLinejoin="round" {...d(0)} />
      <path d="M118 12 L84 98" fill="none" stroke="#ffe2a8" strokeWidth={9} strokeLinecap="round" {...d(1)} />
      <path d="M142 20 L182 55 L142 90" fill="none" stroke="#ffe2a8" strokeWidth={9} strokeLinecap="round" strokeLinejoin="round" {...d(2)} />
    </svg>
  );
};

export const S22Title: React.FC<{ offset: number }> = ({ offset }) => {
  const tau = useTime();
  const t = tau + offset;
  const { width, height } = useVideoConfig();
  const camZ = -(tau * 2.6 + 10 * (1 - Math.exp(-tau * 1.2)));
  const endFade = ease.inOutSine(invLerp(202.6, 204.0, t));
  const titleOut = ease.inCubic(invLerp(189.3, 190.1, t));
  const credDim = ease.inOutSine(invLerp(189.4, 190.4, t));
  const logoP = invLerp(180.15, 181.2, t);
  const line = 560 * ease.inOutCubic(invLerp(181.2, 182.2, t));
  return (
    <AbsoluteFill style={{ background: "#01030a" }}>
      <AbsoluteFill style={{ opacity: 1 - endFade }}>
        <ThreeCanvas width={width} height={height} gl={{ antialias: true }} camera={{ fov: 70, position: [0, 0, 0] }}>
          <color attach="background" args={["#01030a"]} />
          <CameraRig pos={[0, 0, camZ]} look={[0, 0, camZ - 10]} roll={tau * 0.03} fov={70} />
          <Tunnel t={tau + 30} camZ={camZ} gain={0.55} />
          <CoreGlow camZ={camZ} intensity={0.25} />
          <Post bloom={1.2} threshold={0.12} radius={0.8} ca={0.001} />
        </ThreeCanvas>
        <AbsoluteFill style={{ background: "radial-gradient(ellipse 55% 45% at 50% 50%, rgba(1,3,10,0.9) 0%, rgba(1,3,10,0.6) 50%, rgba(1,3,10,0.15) 100%)" }} />
        <AbsoluteFill style={{ background: "rgba(1,3,10,1)", opacity: 0.42 * credDim }} />
        <div style={{ position: "absolute", left: 0, right: 0, top: 205, display: "flex", justifyContent: "center", opacity: smoothstep(180.1, 180.3, t) * (1 - titleOut) }}>
          <Logo p={logoP} />
        </div>
        <BigTitle zh="计算机科学与技术" en="COMPUTER SCIENCE AND TECHNOLOGY" start={180.25 - offset} end={189.3 - offset} size={118} y={-40} spacing={0.14} accent={C.gold} />
        <div style={{ position: "absolute", left: 0, right: 0, top: 690, display: "flex", flexDirection: "column", alignItems: "center", opacity: 1 - titleOut }}>
          <div style={{ width: line, height: 1, background: `linear-gradient(90deg, transparent, ${C.gold}, transparent)` }} />
          <RevealChars text="以代码之名，定义未来" t0={182.3 - offset} stagger={0.07} dur={0.8} style={{ fontFamily: F.serif, fontWeight: 600, fontSize: 46, letterSpacing: "0.28em", color: "#ffe2a8", marginTop: 34, textShadow: `0 0 24px ${C.gold}88` }} />
          <ScrambleText text="DEFINE THE FUTURE, IN CODE" t0={182.9 - offset} dur={0.8} style={{ fontFamily: F.display, fontSize: 20, letterSpacing: "0.6em", color: "rgba(255,230,190,0.75)", marginTop: 18 }} />
        </div>
        <div style={{ position: "absolute", left: 0, right: 0, top: 905, textAlign: "center", opacity: ease.outCubic(invLerp(184.6, 185.4, t)) * (1 - titleOut) }}>
          <span style={{ fontFamily: F.sans, fontSize: 24, letterSpacing: "0.5em", color: "rgba(230,240,255,0.85)" }}>期待你的加入</span>
          <span style={{ fontFamily: F.mono, fontSize: 15, letterSpacing: "0.4em", color: C.cyan, marginLeft: 26 }}>JOIN US</span>
        </div>
        <Credits offset={offset} />
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
