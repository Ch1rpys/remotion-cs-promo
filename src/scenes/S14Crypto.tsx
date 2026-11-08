import { Backdrop } from "../components/Backdrop";
import React from "react";
import { AbsoluteFill } from "remotion";
import cues from "../data/cues.json";
import { Caption, CourseTag, RevealChars, ScrambleText, useTime } from "../components/Text";
import { clamp, ease, hash1, invLerp, lerp } from "../lib/anim";
import { C, F } from "../theme";

const PLAIN = [0xe4, 0xbd, 0xa0, 0xe5, 0xa5, 0xbd, 0xef, 0xbc, 0x8c, 0xe4, 0xb8, 0x96, 0xe7, 0x95, 0x8c, 0x01];
const CIPHER = PLAIN.map((_, i) => Math.floor(hash1(i * 7.13 + 2.2) * 256));
const hx = (b: number) => b.toString(16).toUpperCase().padStart(2, "0");
const STEPS = ["SubBytes", "ShiftRows", "MixColumns", "AddRoundKey"];

const R0 = 110.2;
const R1 = 111.8;

const Lock: React.FC<{ closed: number; glow: number }> = ({ closed, glow }) => (
  <svg width={120} height={140} viewBox="0 0 120 140" style={{ overflow: "visible" }}>
    <path d={`M30 ${70 - 26 * (1 - closed)} V${44 - 26 * (1 - closed)} a30 30 0 0 1 60 0 V${70 - 26 * (1 - closed) + 10 * (1 - closed)}`} fill="none" stroke={closed > 0.99 ? C.gold : C.cyan} strokeWidth={9} strokeLinecap="round" />
    <rect x={14} y={66} width={92} height={70} rx={14} fill="rgba(6,14,32,0.95)" stroke={closed > 0.99 ? C.gold : C.cyan} strokeWidth={4} style={{ filter: `drop-shadow(0 0 ${8 + 22 * glow}px ${closed > 0.99 ? C.gold : C.cyan})` }} />
    <circle cx={60} cy={96} r={8} fill={closed > 0.99 ? C.gold : C.cyan} />
    <rect x={56} y={100} width={8} height={18} rx={3} fill={closed > 0.99 ? C.gold : C.cyan} />
  </svg>
);

export const S14Crypto: React.FC<{ offset: number }> = ({ offset }) => {
  const tau = useTime();
  const t = tau + offset;
  const lockT = cues.lock;
  const fadeIn = ease.outCubic(invLerp(109.0, 109.4, t));
  const out = ease.inOutCubic(invLerp(114.3, 116.3, t));
  const glitch = t < 109.3 ? 1 - (t - 109.0) / 0.3 : 0;
  const cards = ease.outCubic(invLerp(109.15, 109.6, t));
  const round = clamp(Math.floor(((t - R0) / (R1 - R0)) * 10) + 1, 1, 10);
  const stepIdx = Math.floor((((t - R0) / (R1 - R0)) * 40) % 4);
  const closed = ease.inCubic(invLerp(lockT - 0.18, lockT, t));
  const lockGlow = t >= lockT ? Math.exp(-(t - lockT) * 3) : 0;
  const cells = PLAIN.map((p, i) => {
    let v = p;
    if (t >= R0 && t < R1) v = Math.floor(hash1(i * 13.1 + Math.floor((t - R0) / 0.04) * 3.7) * 256);
    if (t >= R1) v = CIPHER[i];
    return v;
  });
  const gridX = 960 - 2 * 74;
  const gridY = 430;
  const plainX = 360;
  const cipherX = 1560;
  return (
    <AbsoluteFill style={{ background: "radial-gradient(ellipse 90% 80% at 50% 50%, #0b1026 0%, #050815 60%, #010206 100%)", opacity: fadeIn * (1 - out), transform: `scale(${1 - out * 0.05})` }}>
      <Backdrop name="ft_bigdata" t={t} t0={109} t1={116.3} opacity={0.75} blur={8} bright={0.55} zoom={[1.06, 1.14]} drift={[30, -30]} />
      <AbsoluteFill style={{ background: "radial-gradient(ellipse 70% 60% at 50% 50%, rgba(5,8,21,0.35) 0%, rgba(1,2,6,0.75) 100%)" }} />
      <svg width={1920} height={1080} style={{ position: "absolute", inset: 0 }}>
        <defs>
          <pattern id="hex" width="56" height="97" patternUnits="userSpaceOnUse" patternTransform="scale(0.8)">
            <path d="M28 0 L56 16 L56 48 L28 64 L0 48 L0 16 Z M28 64 L28 97" fill="none" stroke="rgba(120,90,255,0.10)" strokeWidth="1.5" />
          </pattern>
          <linearGradient id="scan" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0" stopColor="rgba(60,220,255,0)" />
            <stop offset="0.5" stopColor="rgba(60,220,255,0.18)" />
            <stop offset="1" stopColor="rgba(60,220,255,0)" />
          </linearGradient>
        </defs>
        <rect width={1920} height={1080} fill="url(#hex)" />
        <rect x={0} y={((tau * 380) % 1300) - 150} width={1920} height={120} fill="url(#scan)" />
        {[0, 1].map((k) => {
          const x1 = k === 0 ? plainX + 230 : gridX + 4 * 74 + 20;
          const x2 = k === 0 ? gridX - 20 : cipherX - 230;
          const act = k === 0 ? ease.inOutCubic(invLerp(109.6, 110.2, t)) : ease.inOutCubic(invLerp(111.75, 112.1, t));
          return (
            <g key={k} opacity={cards}>
              <line x1={x1} y1={560} x2={x2} y2={560} stroke="rgba(95,240,255,0.3)" strokeWidth={2} strokeDasharray="6 10" strokeDashoffset={-tau * 60} />
              {act > 0 && act < 1 ? <circle cx={lerp(x1, x2, act)} cy={560} r={8} fill="#fff" style={{ filter: `drop-shadow(0 0 12px ${C.cyan})` }} /> : null}
            </g>
          );
        })}
      </svg>
      {/* plaintext card */}
      <div style={{ position: "absolute", left: plainX - 230, top: 390, width: 460, opacity: cards, transform: `translateY(${(1 - cards) * 30}px)`, textAlign: "center" }}>
        <div style={{ fontFamily: F.sans, fontSize: 18, letterSpacing: "0.4em", color: C.cyan }}>明文 · PLAINTEXT</div>
        <div style={{ marginTop: 24, border: "1px solid rgba(95,240,255,0.35)", borderRadius: 16, padding: "30px 10px", background: "rgba(5,12,28,0.8)" }}>
          <RevealChars text="你好，世界" t0={109.3 - offset} stagger={0.07} dur={0.5} style={{ fontFamily: F.serif, fontSize: 58, fontWeight: 700, color: "#fff", letterSpacing: "0.1em" }} />
          <div style={{ fontFamily: F.mono, fontSize: 15, color: "rgba(200,220,255,0.6)", marginTop: 18, letterSpacing: "0.12em", lineHeight: 1.6 }}>
            <ScrambleText text={PLAIN.slice(0, 8).map(hx).join(" ")} t0={109.6 - offset} dur={0.5} />
            <br />
            <ScrambleText text={PLAIN.slice(8, 15).map(hx).join(" ")} t0={109.7 - offset} dur={0.5} />
          </div>
        </div>
      </div>
      {/* AES core */}
      <div style={{ position: "absolute", left: 960 - 60, top: 240, opacity: cards }}>
        <Lock closed={closed} glow={lockGlow} />
      </div>
      {lockGlow > 0.01 ? (
        <div style={{ position: "absolute", left: 960 - 150 - 120 * (1 - lockGlow), top: 330 - 150 - 120 * (1 - lockGlow), width: 300 + 240 * (1 - lockGlow), height: 300 + 240 * (1 - lockGlow), borderRadius: "50%", border: `2px solid ${C.gold}`, opacity: lockGlow }} />
      ) : null}
      <div style={{ position: "absolute", left: gridX, top: gridY, display: "grid", gridTemplateColumns: "repeat(4, 70px)", gap: 4, opacity: cards }}>
        {cells.map((v, i) => {
          const fly = ease.outCubic(invLerp(109.7 + i * 0.02, 110.1 + i * 0.02, t));
          const dx = (plainX - (gridX + (i % 4) * 74 + 35)) * (1 - fly);
          const inRound = t >= R0 && t < R1;
          return (
            <div
              key={i}
              style={{
                height: 64,
                borderRadius: 8,
                border: `1.5px solid ${t >= R1 ? C.gold : inRound ? C.purple : C.cyan}`,
                background: inRound ? "rgba(60,30,120,0.5)" : "rgba(6,14,32,0.9)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontFamily: F.mono,
                fontSize: 26,
                fontWeight: 600,
                color: t >= R1 ? "#fff1cf" : "#e8eefc",
                transform: `translateX(${dx}px)`,
                opacity: clamp(fly * 1.5),
                boxShadow: t >= R1 ? `0 0 14px ${C.gold}55` : undefined,
              }}
            >
              {hx(v)}
            </div>
          );
        })}
      </div>
      <div style={{ position: "absolute", left: 0, right: 0, top: gridY + 290, textAlign: "center", fontFamily: F.mono, fontSize: 18, letterSpacing: "0.22em", color: "rgba(200,220,255,0.75)", opacity: cards }}>
        AES-128 · ROUND {String(t < R0 ? 0 : round).padStart(2, "0")}/10 ·{" "}
        <span style={{ color: C.magenta }}>{t < R0 ? "KeyExpansion" : t >= R1 ? "Done" : STEPS[stepIdx]}</span>
      </div>
      <div style={{ position: "absolute", left: 0, right: 0, top: gridY + 322, textAlign: "center", fontFamily: F.mono, fontSize: 14, letterSpacing: "0.18em", color: "rgba(160,190,240,0.5)", opacity: cards }}>
        KEY 2B7E1516 28AED2A6 ABF71588 09CF4F3C
      </div>
      {/* ciphertext card */}
      <div style={{ position: "absolute", left: cipherX - 230, top: 390, width: 460, opacity: cards, transform: `translateY(${(1 - cards) * 30}px)`, textAlign: "center" }}>
        <div style={{ fontFamily: F.sans, fontSize: 18, letterSpacing: "0.4em", color: C.gold }}>密文 · CIPHERTEXT</div>
        <div style={{ marginTop: 24, border: `1px solid ${C.gold}66`, borderRadius: 16, padding: "30px 18px", background: "rgba(20,14,4,0.55)", minHeight: 150 }}>
          {t >= R1 + 0.1 ? (
            <div style={{ fontFamily: F.mono, fontSize: 24, color: "#fff1cf", lineHeight: 1.6, letterSpacing: "0.06em", whiteSpace: "nowrap", textShadow: `0 0 14px ${C.gold}88` }}>
              <ScrambleText text={CIPHER.slice(0, 8).map(hx).join(" ")} t0={R1 + 0.1 - offset} dur={0.4} />
              <br />
              <ScrambleText text={CIPHER.slice(8).map(hx).join(" ")} t0={R1 + 0.15 - offset} dur={0.4} />
            </div>
          ) : (
            <div style={{ fontFamily: F.mono, fontSize: 24, color: "rgba(255,210,140,0.25)", lineHeight: 1.6, letterSpacing: "0.06em", whiteSpace: "nowrap" }}>
              ·· ·· ·· ·· ·· ·· ·· ··
              <br />
              ·· ·· ·· ·· ·· ·· ·· ··
            </div>
          )}
          <div style={{ fontFamily: F.mono, fontSize: 14, letterSpacing: "0.25em", color: C.green, marginTop: 16, opacity: ease.outCubic(invLerp(112.3, 112.6, t)) }}>✓ TLS 1.3 · 端到端加密</div>
        </div>
      </div>
      {glitch > 0
        ? [...Array(8)].map((_, k) => {
            const y = hash1(Math.floor(tau * 50) * 3 + k) * 1080;
            return <div key={k} style={{ position: "absolute", left: 0, right: 0, top: y, height: 4 + hash1(k + tau) * 34, background: k % 2 ? "rgba(255,60,200,0.35)" : "rgba(60,240,255,0.35)", mixBlendMode: "screen", transform: `translateX(${(hash1(k * 7 + Math.floor(tau * 40)) - 0.5) * 240}px)`, opacity: glitch }} />;
          })
        : null}
      <CourseTag zh="密码学 · 网络安全" en="Cryptography · Cybersecurity" start={109.5 - offset} end={114.4 - offset} y={150} accent={C.gold} />
      <Caption zh="网络安全 · 守护每一个比特" en="Cybersecurity guards every single bit" start={110.4 - offset} end={114.5 - offset} y={860} size={50} accent={C.gold} backdrop={0.6} />
    </AbsoluteFill>
  );
};
