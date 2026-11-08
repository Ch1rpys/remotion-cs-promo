import React, { useMemo } from "react";
import { AbsoluteFill, staticFile, useVideoConfig } from "remotion";
import { ThreeCanvas } from "@remotion/three";
import { useLoader } from "@react-three/fiber";
import * as THREE from "three";
import { Dust } from "../components/Dust";
import { Caption, useTime } from "../components/Text";
import { Post } from "../three/common";
import { ease, invLerp, lerp, smoothstep } from "../lib/anim";
import { ACCEPTED } from "../lib/beats";
import { C, F } from "../theme";

const VS = /* glsl */ `
varying vec2 vUv;
void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`;
const FS = /* glsl */ `
uniform sampler2D uImg; uniform sampler2D uDepth;
uniform vec2 uShift; uniform float uZoom; uniform float uDolly; uniform float uFocus; uniform vec2 uCenter;
uniform float uExposure; uniform float uSat;
varying vec2 vUv;
void main(){
  vec2 uv = vUv;
  vec2 p = uv;
  for (int i = 0; i < 6; i++) {
    float d = texture2D(uDepth, p).r;
    float k = d - uFocus;
    vec2 q = uCenter + (uv - uCenter) / (uZoom * (1.0 + uDolly * k));
    p = q - uShift * k;
  }
  p = clamp(p, vec2(0.001), vec2(0.999));
  vec3 col = texture2D(uImg, p).rgb;
  float l = dot(col, vec3(0.2126, 0.7152, 0.0722));
  col = mix(vec3(l), col, uSat) * uExposure;
  gl_FragColor = vec4(col, 1.0);
}`;

export type Motion = { zoom: [number, number]; dolly: number; shift: [[number, number], [number, number]]; focus: number; center?: [number, number] };

export const Photo: React.FC<{ name: string; p: number; m: Motion; exposure: number; extraZoom: number }> = ({ name, p, m, exposure, extraZoom }) => {
  const [img, depth] = useLoader(THREE.TextureLoader, [staticFile(`photos/${name}.jpg`), staticFile(`photos/${name}_depth.png`)]);
  const mat = useMemo(() => {
    img.colorSpace = THREE.SRGBColorSpace;
    img.anisotropy = 8;
    img.needsUpdate = true;
    depth.colorSpace = THREE.NoColorSpace;
    depth.needsUpdate = true;
    return new THREE.ShaderMaterial({
      vertexShader: VS,
      fragmentShader: FS,
      uniforms: {
        uImg: { value: img },
        uDepth: { value: depth },
        uShift: { value: new THREE.Vector2() },
        uZoom: { value: 1 },
        uDolly: { value: 0 },
        uFocus: { value: 0.5 },
        uCenter: { value: new THREE.Vector2(0.5, 0.5) },
        uExposure: { value: 1 },
        uSat: { value: 1.05 },
      },
      depthTest: false,
      depthWrite: false,
    });
  }, [img, depth]);
  const e = ease.inOutSine(p);
  mat.uniforms.uZoom.value = lerp(m.zoom[0], m.zoom[1], e) * extraZoom;
  mat.uniforms.uDolly.value = m.dolly * (1 + (extraZoom - 1) * 2.5);
  mat.uniforms.uShift.value.set(lerp(m.shift[0][0], m.shift[1][0], e), lerp(m.shift[0][1], m.shift[1][1], e));
  mat.uniforms.uFocus.value = m.focus;
  mat.uniforms.uCenter.value.set(...(m.center ?? [0.5, 0.5]));
  mat.uniforms.uExposure.value = exposure;
  return (
    <mesh material={mat} frustumCulled={false}>
      <planeGeometry args={[2, 2]} />
    </mesh>
  );
};

export type PhotoCfg = {
  name: string;
  from: number;
  to: number;
  m: Motion;
  zh: string;
  en: string;
  capFrom: number;
  capTo: number;
  fade?: number;
  push?: [number, number];
  finalCap?: [number, number];
  accepted?: number;
};

export const PHOTOS: PhotoCfg[] = [
  { name: "campus_dusk", from: 128.0, to: 131.35, fade: 0.2, m: { zoom: [1.03, 1.12], dolly: 0.16, shift: [[-0.014, 0.0], [0.014, 0.004]], focus: 0.45 }, zh: "四年，一千四百六十个日夜", en: "Four years · 1,460 days and nights", capFrom: 128.45, capTo: 130.7 },
  { name: "lecture_hall", from: 130.8, to: 134.35, m: { zoom: [1.04, 1.14], dolly: 0.2, shift: [[0.0, -0.006], [0.0, 0.01]], focus: 0.35, center: [0.5, 0.56] }, zh: "在公式与证明里，看见计算的本质", en: "In proofs and formulas, we see the essence of computing", capFrom: 131.3, capTo: 133.7 },
  { name: "library", from: 133.8, to: 137.35, m: { zoom: [1.04, 1.13], dolly: 0.2, shift: [[0.012, 0.0], [-0.01, 0.0]], focus: 0.5 }, zh: "在书页之间，与前人的智慧对话", en: "Between the pages, a dialogue with great minds", capFrom: 134.3, capTo: 136.7 },
  { name: "late_night_coding", from: 136.8, to: 140.35, m: { zoom: [1.05, 1.13], dolly: 0.2, shift: [[0.018, 0.0], [-0.012, 0.0]], focus: 0.55 }, zh: "在无数个深夜，与每一个 Bug 较量", en: "Countless late nights, wrestling with every bug", capFrom: 137.3, capTo: 139.7 },
  { name: "icpc_contest", from: 139.8, to: 143.35, m: { zoom: [1.04, 1.13], dolly: 0.22, shift: [[0.0, 0.012], [0.0, -0.01]], focus: 0.5 }, zh: "为每一次 Accepted 而欢呼", en: "Cheering for every Accepted", capFrom: 140.3, capTo: 142.7, accepted: ACCEPTED },
  { name: "hackathon", from: 142.8, to: 146.35, m: { zoom: [1.05, 1.14], dolly: 0.22, shift: [[-0.01, 0.004], [0.012, -0.002]], focus: 0.55 }, zh: "四十八小时，把灵感变成作品", en: "48 hours to turn a spark into a product", capFrom: 143.3, capTo: 145.7 },
  { name: "team_lab", from: 145.8, to: 149.35, m: { zoom: [1.04, 1.12], dolly: 0.2, shift: [[-0.012, 0.0], [0.01, -0.004]], focus: 0.5 }, zh: "和志同道合的伙伴，把想法变成现实", en: "With kindred spirits, we turn ideas into reality", capFrom: 146.3, capTo: 148.7 },
  { name: "graduation", from: 148.8, to: 152.1, m: { zoom: [1.03, 1.1], dolly: 0.2, shift: [[0.0, 0.01], [0.0, -0.008]], focus: 0.5 }, zh: "", en: "", capFrom: 0, capTo: 0, push: [150.0, 152.05], finalCap: [150.2, 151.75] },
];

const AcceptedCard: React.FC<{ t: number; at: number; outAt: number }> = ({ t, at, outAt }) => {
  const a = ease.outBack(Math.min(1, Math.max(0, (t - at + 0.05) / 0.45)));
  const out = smoothstep(outAt, outAt + 0.4, t);
  if (t < at - 0.1) return null;
  return (
    <div
      style={{
        position: "absolute",
        right: 100,
        top: 170,
        width: 500,
        padding: "22px 26px",
        borderRadius: 18,
        background: "rgba(6,16,12,0.82)",
        border: "1.5px solid rgba(61,255,154,0.55)",
        boxShadow: "0 0 40px rgba(61,255,154,0.25), 0 20px 60px rgba(0,0,0,0.6)",
        transform: `translateX(${(1 - a) * 80}px) scale(${0.9 + 0.1 * a})`,
        opacity: Math.min(1, a) * (1 - out),
        display: "flex",
        gap: 20,
        alignItems: "center",
      }}
    >
      <svg width={64} height={64} viewBox="0 0 64 64">
        <circle cx={32} cy={32} r={29} fill="none" stroke={C.green} strokeWidth={4} style={{ filter: `drop-shadow(0 0 8px ${C.green})` }} />
        <path d="M18 33 L28 43 L47 22" fill="none" stroke={C.green} strokeWidth={5} strokeLinecap="round" strokeLinejoin="round" pathLength={1} strokeDasharray={1} strokeDashoffset={1 - Math.min(1, Math.max(0, (t - at) / 0.35))} />
      </svg>
      <div style={{ flex: 1 }}>
        <div style={{ fontFamily: F.inter, fontWeight: 800, fontSize: 40, color: C.green, letterSpacing: "0.02em", textShadow: `0 0 18px ${C.green}88` }}>Accepted</div>
        <div style={{ fontFamily: F.mono, fontSize: 15, color: "rgba(210,240,225,0.75)", marginTop: 4, letterSpacing: "0.06em", whiteSpace: "nowrap" }}>Problem K · 124 ms · 4.1 MB</div>
      </div>
      <svg width={46} height={70} viewBox="0 0 46 70" style={{ transform: `translateY(${Math.sin(t * 2.4) * 3}px)` }}>
        <ellipse cx={23} cy={24} rx={19} ry={23} fill="#ffd23c" />
        <ellipse cx={16} cy={16} rx={5} ry={8} fill="rgba(255,255,255,0.45)" />
        <path d="M20 47 L26 47 L23 52 Z" fill="#e0b020" />
        <path d="M23 52 Q18 60 24 70" stroke="rgba(255,255,255,0.6)" strokeWidth={1.5} fill="none" />
      </svg>
    </div>
  );
};

export const PhotoShot: React.FC<{ cfg: PhotoCfg; offset: number }> = ({ cfg, offset }) => {
  const tau = useTime();
  const t = tau + offset;
  const { width, height } = useVideoConfig();
  const dur = cfg.to - cfg.from;
  const p = tau / dur;
  const fadeIn = ease.inOutSine(invLerp(cfg.from, cfg.from + (cfg.fade ?? 0.45), t));
  const fadeOut = 0;
  const push = cfg.push ? ease.inQuart(invLerp(cfg.push[0], cfg.push[1], t)) : 0;
  const extraZoom = 1 + push * 0.55;
  const exposure = 1.0 + push * 1.6;
  const leak = Math.max(smoothstep(cfg.from, cfg.from + 0.5, t) * (1 - smoothstep(cfg.from + 0.5, cfg.from + 1.4, t)), 0);
  return (
    <AbsoluteFill style={{ opacity: fadeIn * (1 - fadeOut) }}>
      <ThreeCanvas width={width} height={height} gl={{ antialias: false }} camera={{ position: [0, 0, 1] }}>
        <Photo name={cfg.name} p={p} m={cfg.m} exposure={exposure} extraZoom={extraZoom} />
        <Post bloom={0.45 + push * 1.2} threshold={0.7 - push * 0.4} radius={0.8} ca={0.0006 + push * 0.004} />
      </ThreeCanvas>
      <AbsoluteFill style={{ background: "linear-gradient(180deg, rgba(0,0,0,0.25) 0%, rgba(0,0,0,0) 30%, rgba(0,0,0,0) 62%, rgba(0,0,0,0.55) 100%)" }} />
      <AbsoluteFill
        style={{
          background: `radial-gradient(ellipse 60% 50% at ${20 + 60 * p}% 20%, rgba(255,160,80,${0.35 * leak}) 0%, rgba(255,90,60,${0.12 * leak}) 40%, rgba(0,0,0,0) 70%)`,
          mixBlendMode: "screen",
        }}
      />
      <Dust count={26} seed={cfg.name.length * 7} opacity={0.45} speed={0.3} color="255,220,170" maxSize={7} />
      {cfg.accepted !== undefined ? <AcceptedCard t={t} at={cfg.accepted} outAt={cfg.to - 0.9} /> : null}
      {cfg.zh ? <Caption zh={cfg.zh} en={cfg.en} start={cfg.capFrom - offset} end={cfg.capTo - offset} y={815} size={52} accent={C.gold} backdrop={0.35} /> : null}
      {cfg.finalCap ? (
        <Caption zh="而这，仅仅是开始" en="And this is only the beginning" start={cfg.finalCap[0] - offset} end={cfg.finalCap[1] - offset} y={440} size={78} accent={C.gold} backdrop={0.5} />
      ) : null}
    </AbsoluteFill>
  );
};
