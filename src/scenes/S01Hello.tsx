import React from "react";
import { AbsoluteFill } from "remotion";
import typing from "../data/typing.json";
import { Backdrop } from "../components/Backdrop";
import { Dust } from "../components/Dust";
import { Editor, RING, TERM, TERM_CW, ringCenter } from "../components/Editor";
import { RevealChars, ScrambleText, useTime } from "../components/Text";
import { clamp, ease, invLerp, lerp } from "../lib/anim";
import { C, F } from "../theme";

const RING_INDEX = 8;

export const S01Hello: React.FC<{ offset: number }> = ({ offset }) => {
  const t = useTime() + offset;
  const it = typing.intro;
  const visible = it.codeTimes.filter((x) => x <= t).length;
  const typingNow = t >= it.codeTimes[0] - 0.15 && t <= it.codeTimes[it.codeTimes.length - 1] + 0.12;
  const blink = Math.floor(t / 0.53) % 2 === 0;
  const term = ease.outCubic(invLerp(it.cmdShow, it.cmdShow + 0.45, t));
  const cmdVisible = it.cmdTimes.filter((x) => x <= t).length;
  const typingCmd = t >= it.cmdTimes[0] - 0.1 && t <= it.cmdTimes[it.cmdTimes.length - 1] + 0.1;
  const hasOut = t >= it.output;
  const glow = hasOut ? 1.5 * Math.exp(-(t - it.output) * 1.3) + 0.35 : 0;

  // ---- camera
  const outC = { x: TERM.x + 6.5 * TERM_CW, y: TERM.line2 + 23 };
  const ring = ringCenter(RING_INDEX);
  const a = ease.inOutSine(invLerp(0, 10.2, t));
  let s = lerp(0.86, 1.0, a);
  let rx = lerp(16, 3, a);
  let ry = lerp(-20, -5, a);
  let fx = 960;
  let fy = lerp(560, 520, a);
  const b = ease.inOutCubic(invLerp(10.0, 13.7, t));
  s = lerp(s, 1.8, b);
  rx = lerp(rx, 0, b);
  ry = lerp(ry, 0, b);
  fx = lerp(fx, outC.x, b);
  fy = lerp(fy, outC.y, b);
  const c = invLerp(13.7, 16.0, t);
  const cf = ease.inOutCubic(invLerp(13.7, 14.6, t));
  fx = lerp(fx, ring.x, cf);
  fy = lerp(fy, ring.y, cf);
  s = s * Math.pow(330 / 1.8, ease.inCubic(c));

  const toScreen = (x: number, y: number) => ({ x: 960 + s * (x - fx), y: 540 + s * (y - fy) });
  const rc = toScreen(ring.x, ring.y);
  const inRx = (RING.rx - RING.stroke / 2) * s;
  const inRy = (RING.ry - RING.stroke / 2) * s;
  const portal = c > 0 && inRx > 1.5;
  const mask = portal
    ? `radial-gradient(ellipse ${inRx}px ${inRy}px at ${rc.x}px ${rc.y}px, transparent 0%, transparent 97%, black 100%)`
    : undefined;

  const intro = ease.outCubic(invLerp(0.7, 1.8, t));
  const dof = ease.inOutCubic(invLerp(10.3, 12.5, t));
  const outPos = toScreen(outC.x, outC.y);

  return (
    <AbsoluteFill style={{ WebkitMaskImage: mask, maskImage: mask }}>
      <AbsoluteFill style={{ background: "radial-gradient(ellipse 80% 70% at 50% 45%, #0b1630 0%, #050a16 45%, #010205 100%)" }} />
      <Backdrop name="late_night_coding" t={t} t0={0} t1={14} opacity={0.95 * ease.inOutSine(invLerp(0.2, 3.0, t))} blur={14 + 10 * dof} bright={0.66 + 0.25 * (hasOut ? Math.min(1, glow) : 0)} sat={0.9} zoom={[1.12, 1.2]} drift={[30, -30]} push={1 + 0.5 * ease.inCubic(clamp(c))} />
      <AbsoluteFill style={{ background: "radial-gradient(ellipse 70% 60% at 50% 48%, rgba(2,5,14,0.12) 0%, rgba(2,5,14,0.6) 100%)" }} />
      <Dust count={70} seed={3} opacity={0.8 * intro} speed={0.6} />
      <AbsoluteFill
        style={{
          transformOrigin: "0 0",
          transform: `translate(960px, 540px) scale(${s}) translate(${-fx}px, ${-fy}px)`,
        }}
      >
        <div
          style={{
            position: "absolute",
            inset: 0,
            transformOrigin: "960px 520px",
            transform: `perspective(2200px) rotateX(${rx}deg) rotateY(${ry}deg) translateY(${(1 - intro) * 40}px)`,
            opacity: intro,
          }}
        >
          <Editor
            code={it.code}
            visible={visible}
            cursorOn={typingNow || blink}
            showCursor={t >= 0.9 && t < it.cmdShow + 0.15}
            codeBlur={dof * 7}
            codeOpacity={1 - dof * 0.55}
            term={term}
            cmd={it.cmd.slice(0, cmdVisible)}
            cmdCursorOn={typingCmd || blink}
            showCmdCursor={t >= it.cmdShow + 0.2 && t < it.enter}
            afterEnterCursor={t >= it.enter}
            output={hasOut ? "Hello, World!" : undefined}
            outputGlow={glow}
            ringIndex={RING_INDEX}
            ringGlow={portal ? 1 : 0}
            cmdBlur={dof * 2.5}
            windowGlow={hasOut ? Math.exp(-(t - it.output) * 1.5) : 0}
          />
        </div>
      </AbsoluteFill>
      {hasOut ? (
        <AbsoluteFill
          style={{
            background: `radial-gradient(circle 620px at ${outPos.x}px ${outPos.y}px, rgba(95,240,255,${0.32 * Math.min(1, glow)}) 0%, rgba(40,120,255,${0.12 * Math.min(1, glow)}) 35%, rgba(0,0,0,0) 70%)`,
            mixBlendMode: "screen",
          }}
        />
      ) : null}
      <div style={{ position: "absolute", left: 0, right: 0, top: 728, display: "flex", flexDirection: "column", alignItems: "center", gap: 14 }}>
        <RevealChars
          text="每一个改变世界的故事"
          t0={10.8}
          t1={13.6}
          stagger={0.07}
          style={{ fontFamily: F.serif, fontWeight: 600, fontSize: 56, letterSpacing: "0.2em", color: C.white, textShadow: "0 0 30px rgba(0,0,0,0.9), 0 0 16px rgba(95,240,255,0.25)" }}
        />
        <RevealChars
          text="都始于一行代码"
          t0={11.6}
          t1={13.6}
          stagger={0.08}
          style={{ fontFamily: F.serif, fontWeight: 600, fontSize: 56, letterSpacing: "0.2em", color: C.white, textShadow: "0 0 30px rgba(0,0,0,0.9), 0 0 16px rgba(95,240,255,0.25)" }}
        />
        <ScrambleText
          text="EVERY STORY THAT CHANGED THE WORLD BEGAN WITH A LINE OF CODE"
          t0={12.0}
          dur={0.9}
          t1={13.6}
          style={{ fontFamily: F.display, fontSize: 19, letterSpacing: "0.36em", color: "rgba(200,220,255,0.75)", marginTop: 10 }}
        />
      </div>
    </AbsoluteFill>
  );
};
