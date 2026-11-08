import React, { useMemo } from "react";
import { AbsoluteFill, useVideoConfig } from "remotion";
import { ThreeCanvas } from "@remotion/three";
import * as THREE from "three";
import { Caption, ChapterCard, CourseTag, useTime } from "../components/Text";
import { CameraRig, Post } from "../three/common";
import { ease, fbm1, invLerp, lerp, mulberry32, smoothstep } from "../lib/anim";
import { C, F } from "../theme";

const LAYERS: [number, number][] = [
  [4, 4],
  [8, 4],
  [8, 6],
  [8, 6],
  [8, 4],
  [10, 1],
];
const DZ = 3.2;
const SP = 0.5;
const W0 = 140.0;
const WAVE = 0.5;
const LDT = 0.17;
const LAYER_COL = ["#3ee8ff", "#4aa8ff", "#7b5cff", "#b44cff", "#e04cff", "#ffc15e"].map((c) => new THREE.Color(c));

const nodePos = () => {
  const out: THREE.Vector3[][] = [];
  LAYERS.forEach(([cx, cy], l) => {
    const arr: THREE.Vector3[] = [];
    for (let j = 0; j < cy; j++) for (let i = 0; i < cx; i++) arr.push(new THREE.Vector3((i - (cx - 1) / 2) * SP * (l === 5 ? 0.9 : 1), (j - (cy - 1) / 2) * SP, -l * DZ));
    out.push(arr);
  });
  return out;
};

const lineVS = /* glsl */ `
attribute float aLayer; attribute float aT; attribute float aW; attribute vec3 aCol;
varying float vLayer; varying float vT; varying float vW; varying vec3 vCol;
void main(){ vLayer = aLayer; vT = aT; vW = aW; vCol = aCol; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
const lineFS = /* glsl */ `
uniform float uTime; uniform float uW0; uniform float uWave; uniform float uLdt; uniform float uGain;
varying float vLayer; varying float vT; varying float vW; varying vec3 vCol;
void main(){
  float b = 0.035;
  for (int k = 0; k < 3; k++) {
    float n = floor((uTime - uW0) / uWave) - float(k);
    if (n < 0.0) continue;
    float start = uW0 + n * uWave + vLayer * uLdt;
    float ph = (uTime - start) / uLdt;
    if (ph < -0.2 || ph > 1.4) continue;
    float d = vT - ph;
    b += exp(-d * d / 0.012) * pow(vW, 3.0) * 2.6;
  }
  gl_FragColor = vec4(vCol * b * uGain, 1.0);
}`;

const Net: React.FC<{ t: number; gain: number }> = ({ t, gain }) => {
  const data = useMemo(() => {
    const r = mulberry32(140);
    const P = nodePos();
    const pos: number[] = [];
    const layer: number[] = [];
    const tt: number[] = [];
    const w: number[] = [];
    const col: number[] = [];
    for (let l = 0; l < P.length - 1; l++) {
      for (const a of P[l])
        for (const b of P[l + 1]) {
          const ww = r();
          if (ww < 0.35 && l < 3) continue;
          pos.push(a.x, a.y, a.z, b.x, b.y, b.z);
          layer.push(l, l);
          tt.push(0, 1);
          w.push(ww, ww);
          const c = LAYER_COL[l].clone().lerp(LAYER_COL[l + 1], 0.5);
          col.push(c.r, c.g, c.b, c.r, c.g, c.b);
        }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute("aLayer", new THREE.Float32BufferAttribute(layer, 1));
    g.setAttribute("aT", new THREE.Float32BufferAttribute(tt, 1));
    g.setAttribute("aW", new THREE.Float32BufferAttribute(w, 1));
    g.setAttribute("aCol", new THREE.Float32BufferAttribute(col, 3));
    const m = new THREE.ShaderMaterial({
      vertexShader: lineVS,
      fragmentShader: lineFS,
      uniforms: { uTime: { value: 0 }, uW0: { value: W0 }, uWave: { value: WAVE }, uLdt: { value: LDT }, uGain: { value: 1 } },
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const flat = P.flat();
    const nodeLayer = P.flatMap((arr, l) => arr.map(() => l));
    const act = flat.map(() => 0.3 + r() * 0.7);
    const pg = new THREE.BufferGeometry();
    pg.setAttribute("position", new THREE.Float32BufferAttribute(flat.flatMap((v) => [v.x, v.y, v.z]), 3));
    pg.setAttribute("aCol", new THREE.Float32BufferAttribute(new Array(flat.length * 3).fill(0), 3));
    const pm = new THREE.ShaderMaterial({
      vertexShader: `attribute vec3 aCol; varying vec3 vCol; varying float vNear;
        void main(){ vec4 mv = modelViewMatrix * vec4(position, 1.0); float d = -mv.z; vCol = aCol; vNear = smoothstep(0.8, 3.0, d);
        gl_PointSize = clamp(95.0 / d, 2.0, 30.0); gl_Position = projectionMatrix * mv; }`,
      fragmentShader: `varying vec3 vCol; varying float vNear;
        void main(){ vec2 q = gl_PointCoord - 0.5; float r = length(q); float core = smoothstep(0.5, 0.18, r); float halo = exp(-r * r * 18.0) * 0.6;
        gl_FragColor = vec4(vCol * (core + halo) * vNear, 1.0); }`,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const mesh = new THREE.Points(pg, pm);
    mesh.frustumCulled = false;
    return { g, m, mesh, nodeLayer, act };
  }, []);
  data.m.uniforms.uTime.value = t;
  data.m.uniforms.uGain.value = gain;
  const colAttr = data.mesh.geometry.getAttribute("aCol") as THREE.BufferAttribute;
  data.nodeLayer.forEach((l, i) => {
    let b = 0.55;
    const n = Math.floor((t - W0) / WAVE);
    for (let k = 0; k < 2; k++) {
      const s = W0 + (n - k) * WAVE + l * LDT + (l > 0 ? LDT : 0);
      if (n - k >= 0 && t >= s) b += 3.2 * Math.exp(-(t - s) * 7) * data.act[i];
    }
    const c = LAYER_COL[l];
    colAttr.setXYZ(i, c.r * b * gain, c.g * b * gain, c.b * b * gain);
  });
  colAttr.needsUpdate = true;
  return (
    <>
      <lineSegments geometry={data.g} material={data.m} frustumCulled={false} />
      <primitive object={data.mesh} />
    </>
  );
};

const PROBS = [0.001, 0.002, 0.004, 0.003, 0.001, 0.0, 0.0, 0.987, 0.001, 0.001];

export const S16Neural: React.FC<{ offset: number }> = ({ offset }) => {
  const tau = useTime();
  const t = tau + offset;
  const { width, height } = useVideoConfig();
  const p = ease.inOutSine(invLerp(140.0, 145.4, t));
  const z = lerp(5.0, -12.5, p);
  const x = lerp(1.6, 4.6, ease.outCubic(invLerp(140.0, 141.8, t))) + Math.sin(tau * 0.5) * 0.3;
  const y = lerp(1.6, 0.7, p) + Math.cos(tau * 0.4) * 0.25;
  const cam: [number, number, number] = [x + fbm1(tau, 4) * 0.05, y, z];
  const look: [number, number, number] = [0, 0, Math.max(-16, z - 3.2)];
  const roll = 0.18 * Math.sin(tau * 0.35);
  const gain = 1 + 1.2 * Math.exp(-tau * 3);
  const fadeOut = ease.inCubic(invLerp(144.9, 145.4, t));
  const hud = smoothstep(142.9, 143.3, t) * (1 - smoothstep(144.8, 145.2, t));
  const bars = ease.outCubic(invLerp(143.1, 143.9, t));
  return (
    <AbsoluteFill style={{ background: "#03020a", opacity: 1 - fadeOut }}>
      <ThreeCanvas width={width} height={height} gl={{ antialias: true }} camera={{ fov: 60, position: [0, 0, 8], near: 0.05, far: 200 }}>
        <color attach="background" args={["#03020a"]} />
        <fog attach="fog" args={["#03020a", 6, 26]} />
        <CameraRig pos={cam} look={look} roll={roll} fov={62} near={0.05} far={200} />
        <Net t={t} gain={gain} />
        <Post bloom={1.35} threshold={0.18} radius={0.8} ca={0.0012 + 0.004 * Math.exp(-tau * 3)} />
      </ThreeCanvas>
      <div style={{ position: "absolute", left: 110, top: 360, opacity: hud, fontFamily: F.mono }}>
        <div style={{ fontSize: 14, letterSpacing: "0.3em", color: C.cyan }}>INPUT · 28×28</div>
        <svg width={170} height={170} viewBox="0 0 28 28" style={{ marginTop: 10, background: "rgba(10,10,30,0.8)", border: "1px solid rgba(62,232,255,0.4)", borderRadius: 8 }}>
          {Array.from({ length: 28 * 28 }, (_, i) => {
            const cx = i % 28;
            const cy = Math.floor(i / 28);
            const onTop = cy >= 6 && cy <= 8 && cx >= 7 && cx <= 21;
            const diag = Math.abs(cx - (21 - (cy - 8) * 0.55)) < 1.6 && cy > 8 && cy <= 23;
            const v = onTop || diag ? 1 : 0;
            return v ? <rect key={i} x={cx} y={cy} width={1} height={1} fill="#e8f7ff" opacity={0.85} /> : null;
          })}
        </svg>
      </div>
      <div style={{ position: "absolute", right: 110, top: 330, opacity: hud, fontFamily: F.mono, width: 300 }}>
        <div style={{ fontSize: 14, letterSpacing: "0.3em", color: C.gold, textAlign: "right" }}>OUTPUT · SOFTMAX</div>
        {PROBS.map((pr, d) => (
          <div key={d} style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 7 }}>
            <span style={{ width: 16, fontSize: 18, color: d === 7 ? C.gold : "rgba(200,210,255,0.6)" }}>{d}</span>
            <div style={{ flex: 1, height: 12, background: "rgba(120,100,255,0.12)", borderRadius: 6, overflow: "hidden" }}>
              <div style={{ width: `${Math.max(2, pr * 100) * bars}%`, height: "100%", background: d === 7 ? `linear-gradient(90deg, ${C.magenta}, ${C.gold})` : "rgba(160,150,255,0.5)", boxShadow: d === 7 ? `0 0 12px ${C.gold}` : undefined }} />
            </div>
            <span style={{ width: 64, textAlign: "right", fontSize: 15, color: d === 7 ? "#fff1cf" : "rgba(200,210,255,0.5)" }}>{(pr * 100 * bars).toFixed(1)}%</span>
          </div>
        ))}
      </div>
      <ChapterCard label="CHAPTER  IV" zh="未来" en="FUTURE" index="04 — 04" start={140.25 - offset} end={142.6 - offset} accent={C.magenta} />
      <CourseTag zh="人工智能 · 机器学习" en="Artificial Intelligence · Machine Learning" start={142.8 - offset} end={145.0 - offset} y={150} accent={C.magenta} />
      <Caption zh="人工智能，让机器学会思考" en="Artificial intelligence: teaching machines to think" start={142.9 - offset} end={144.9 - offset} y={850} size={52} accent={C.magenta} backdrop={0.7} />
    </AbsoluteFill>
  );
};
