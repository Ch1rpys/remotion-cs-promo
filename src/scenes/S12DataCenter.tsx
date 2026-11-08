import React, { useMemo } from "react";
import { AbsoluteFill, useVideoConfig } from "remotion";
import { ThreeCanvas } from "@remotion/three";
import { MeshReflectorMaterial } from "@react-three/drei";
import * as THREE from "three";
import { Caption, CourseTag, ScrambleText, useTime } from "../components/Text";
import { CameraRig, Post, instancedQuad } from "../three/common";
import { ease, fbm1, invLerp, lerp, mulberry32, smoothstep } from "../lib/anim";
import { C, F } from "../theme";

const RACKS = 26;
const RW = 0.68;
const RH = 2.35;
const AISLE = 1.25;

const faceVS = /* glsl */ `
attribute vec3 aPos; attribute float aFace; attribute float aSeed;
varying vec2 vUv; varying float vSeed; varying vec3 vPos;
void main(){
  vec3 p = aPos + vec3(0.0, position.y * ${RH.toFixed(2)}, -aFace * position.x * ${RW.toFixed(2)});
  vUv = uv; vSeed = aSeed; vPos = p;
  gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
}`;
const faceFS = /* glsl */ `
uniform float uTime; uniform vec3 uCam; uniform vec3 uFog; uniform float uFogD;
varying vec2 vUv; varying float vSeed; varying vec3 vPos;
float hash(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
float box(vec2 p, vec2 a, vec2 b){ return step(a.x, p.x) * step(p.x, b.x) * step(a.y, p.y) * step(p.y, b.y); }
void main(){
  float U = 40.0;
  float ry = vUv.y * U; float row = floor(ry); float fy = fract(ry);
  vec2 rid = vec2(row, floor(vSeed * 997.0));
  float type = hash(rid);
  vec3 col = vec3(0.010, 0.011, 0.014);
  float inset = step(0.05, vUv.x) * step(vUv.x, 0.95);
  float gap = step(0.08, fy) * step(fy, 0.92);
  vec2 m = fract(vec2(vUv.x * 70.0, fy * 4.0));
  float vent = step(0.45, m.x) * step(0.4, m.y);
  vec3 bezel = vec3(0.020, 0.022, 0.028) + vent * 0.008;
  col = mix(col, bezel, inset * gap);
  vec2 q = vec2(vUv.x, fy);
  float t = uTime;
  if (type > 0.12 && inset * gap > 0.5) {
    float rate = 2.0 + hash(rid + 1.7) * 9.0;
    float blink = step(0.4, hash(vec2(floor(t * rate + hash(rid) * 10.0), row + vSeed)));
    vec3 blue = vec3(0.25, 0.7, 2.6);
    vec3 green = vec3(0.3, 2.4, 0.9);
    col += blue * box(q, vec2(0.08, 0.35), vec2(0.105, 0.65)) * (0.7 + 0.3 * sin(t * 1.3 + row));
    col += green * box(q, vec2(0.12, 0.35), vec2(0.145, 0.65)) * blink;
    if (type > 0.62 && type < 0.86) {
      float bay = floor((vUv.x - 0.2) * 16.0);
      float bx = fract((vUv.x - 0.2) * 16.0);
      float inBay = step(0.2, vUv.x) * step(vUv.x, 0.9);
      float dr = step(0.35, hash(vec2(floor(t * (6.0 + hash(vec2(bay, row)) * 14.0)), bay * 7.0 + row + vSeed * 13.0)));
      col += vec3(1.8, 2.2, 2.8) * inBay * box(vec2(bx, fy), vec2(0.35, 0.18), vec2(0.65, 0.3)) * dr * 0.7;
      col += vec3(0.04, 0.05, 0.06) * inBay * step(0.08, bx) * step(bx, 0.92) * step(0.35, fy);
    } else if (type >= 0.86) {
      float port = fract((vUv.x - 0.25) * 24.0);
      float inP = step(0.25, vUv.x) * step(vUv.x, 0.92);
      float pl = step(0.3, hash(vec2(floor(t * 12.0 + hash(vec2(floor(vUv.x * 24.0), row)) * 30.0), floor(vUv.x * 24.0) + row)));
      col += vec3(0.4, 2.6, 1.0) * inP * box(vec2(port, fy), vec2(0.2, 0.62), vec2(0.45, 0.78)) * pl;
      col += vec3(2.6, 1.6, 0.3) * inP * box(vec2(port, fy), vec2(0.55, 0.62), vec2(0.8, 0.78)) * (1.0 - pl) * 0.6;
    } else {
      float bar = step(0.55, hash(rid + 5.1));
      col += vec3(0.2, 1.4, 2.4) * box(q, vec2(0.72, 0.42), vec2(0.9, 0.58)) * bar * (0.5 + 0.5 * sin(t * 2.0 + row * 0.7));
    }
  }
  float d = length(vPos - uCam);
  float fog = 1.0 - exp(-pow(d * uFogD, 1.5));
  gl_FragColor = vec4(mix(col, uFog, fog), 1.0);
}`;

const FOG = new THREE.Color("#020409");

const Aisle: React.FC<{ t: number; cam: [number, number, number] }> = ({ t, cam }) => {
  const data = useMemo(() => {
    const r = mulberry32(31);
    const n = RACKS * 2;
    const pos = new Float32Array(n * 3);
    const face = new Float32Array(n);
    const seed = new Float32Array(n);
    let k = 0;
    for (const side of [-1, 1]) {
      for (let i = 0; i < RACKS; i++) {
        pos.set([side * AISLE + (side < 0 ? 0.001 : -0.001), RH / 2, 4 - i * (RW + 0.02)], k * 3);
        face[k] = side < 0 ? 1 : -1;
        seed[k] = r();
        k++;
      }
    }
    const g = instancedQuad();
    g.setAttribute("aPos", new THREE.InstancedBufferAttribute(pos, 3));
    g.setAttribute("aFace", new THREE.InstancedBufferAttribute(face, 1));
    g.setAttribute("aSeed", new THREE.InstancedBufferAttribute(seed, 1));
    g.instanceCount = n;
    const m = new THREE.ShaderMaterial({
      vertexShader: faceVS,
      fragmentShader: faceFS,
      uniforms: { uTime: { value: 0 }, uCam: { value: new THREE.Vector3() }, uFog: { value: FOG }, uFogD: { value: 0.07 } },
      side: THREE.DoubleSide,
    });
    return { g, m };
  }, []);
  data.m.uniforms.uTime.value = t;
  data.m.uniforms.uCam.value.set(...cam);
  const len = RACKS * (RW + 0.02);
  const zc = 4 - len / 2 + RW / 2;
  return (
    <>
      <mesh geometry={data.g} material={data.m} frustumCulled={false} />
      {[-1, 1].map((side) => (
        <group key={side}>
          <mesh position={[side * (AISLE + 0.55), RH / 2, zc]}>
            <boxGeometry args={[1.1, RH + 0.02, len]} />
            <meshStandardMaterial color="#07090d" roughness={0.5} metalness={0.6} />
          </mesh>
          <mesh position={[side * (AISLE + 0.3), RH + 0.55, zc]}>
            <boxGeometry args={[0.5, 0.12, len + 4]} />
            <meshStandardMaterial color="#0d1016" roughness={0.6} metalness={0.5} />
          </mesh>
          <mesh position={[side * (AISLE - 0.02), 0.012, zc]}>
            <boxGeometry args={[0.03, 0.02, len + 6]} />
            <meshBasicMaterial color={new THREE.Color(0.2, 1.4, 2.6)} toneMapped={false} />
          </mesh>
          <mesh position={[side * (AISLE - 0.02), RH + 0.03, zc]}>
            <boxGeometry args={[0.03, 0.02, len]} />
            <meshBasicMaterial color={new THREE.Color(0.2, 1.2, 2.2)} toneMapped={false} />
          </mesh>
        </group>
      ))}
      {new Array(9).fill(0).map((_, i) => (
        <mesh key={i} position={[0, 3.25, 4 - i * 2.4]} rotation={[Math.PI / 2, 0, 0]}>
          <planeGeometry args={[0.9, 0.35]} />
          <meshBasicMaterial color={new THREE.Color(1.6, 1.8, 2.0)} toneMapped={false} side={THREE.DoubleSide} />
        </mesh>
      ))}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, zc]}>
        <planeGeometry args={[12, len + 20]} />
        <MeshReflectorMaterial
          blur={[200, 60]}
          resolution={768}
          mixBlur={0.9}
          mixStrength={4}
          roughness={0.7}
          depthScale={0.5}
          minDepthThreshold={0.3}
          maxDepthThreshold={1.2}
          color="#040609"
          metalness={0.5}
          mirror={0.75}
        />
      </mesh>
    </>
  );
};

const fmt = (n: number) => Math.floor(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");

export const S12DataCenter: React.FC<{ offset: number }> = ({ offset }) => {
  const tau = useTime();
  const t = tau + offset;
  const { width, height } = useVideoConfig();
  const p = ease.inOutSine(invLerp(94.0, 102.3, t));
  const z = lerp(6.5, -6.0, p);
  const sway = fbm1(tau * 0.4, 3) * 0.08;
  const cam: [number, number, number] = [sway, 1.32 + fbm1(tau * 0.3, 5) * 0.04, z];
  const look: [number, number, number] = [sway * 0.5 + Math.sin(tau * 0.25) * 0.15, 1.15, z - 6];
  const fadeIn = ease.outCubic(invLerp(94.0, 94.6, t));
  const fadeOut = ease.inCubic(invLerp(101.7, 102.3, t));
  const count = 583000 * ease.outExpo(invLerp(94.9, 97.6, t));
  const cOp = smoothstep(94.7, 95.1, t) * (1 - smoothstep(101.2, 101.7, t));
  const tags = [
    { zh: "负载均衡", en: "LOAD BALANCING", at: 95.6 },
    { zh: "分布式数据库", en: "DISTRIBUTED DATABASE", at: 96.0 },
    { zh: "消息队列", en: "MESSAGE QUEUE", at: 96.4 },
    { zh: "容器编排", en: "CONTAINER ORCHESTRATION", at: 96.8 },
  ];
  return (
    <AbsoluteFill style={{ background: "#020409", opacity: fadeIn * (1 - fadeOut) }}>
      <ThreeCanvas width={width} height={height} gl={{ antialias: true }} camera={{ fov: 52, position: [0, 1.3, 6], near: 0.05, far: 100 }}>
        <color attach="background" args={["#020409"]} />
        <ambientLight intensity={0.15} />
        <pointLight position={[0, 3, z - 2]} intensity={6} distance={10} color="#9fd8ff" />
        <CameraRig pos={cam} look={look} fov={52} near={0.05} far={100} />
        <Aisle t={t} cam={cam} />
        <Post bloom={1.15} threshold={0.35} radius={0.7} ca={0.0012} />
      </ThreeCanvas>
      <div style={{ position: "absolute", left: 110, top: 360, opacity: cOp }}>
        <div style={{ fontFamily: F.sans, fontSize: 20, letterSpacing: "0.4em", color: C.cyan }}>双十一 · 订单创建峰值</div>
        <div style={{ fontFamily: F.tech, fontSize: 118, fontWeight: 800, color: "#fff", letterSpacing: "0.02em", lineHeight: 1.1, marginTop: 8, textShadow: `0 0 40px ${C.cyan}88, 0 0 12px rgba(0,0,0,0.9)` }}>
          {fmt(count)}
        </div>
        <div style={{ display: "flex", gap: 18, alignItems: "baseline", marginTop: 4 }}>
          <span style={{ fontFamily: F.sans, fontSize: 30, fontWeight: 600, color: C.gold }}>笔 / 秒</span>
          <span style={{ fontFamily: F.mono, fontSize: 15, letterSpacing: "0.3em", color: "rgba(200,220,255,0.7)" }}>ORDERS PER SECOND · 2020</span>
        </div>
      </div>
      <div style={{ position: "absolute", right: 110, top: 330, display: "flex", flexDirection: "column", gap: 22, alignItems: "flex-end" }}>
        {tags.map((g, i) => {
          const a = smoothstep(g.at, g.at + 0.3, t) * (1 - smoothstep(101.2, 101.7, t));
          return (
            <div key={i} style={{ opacity: a, textAlign: "right", borderRight: `3px solid ${C.cyan}`, paddingRight: 16, transform: `translateX(${(1 - a) * 30}px)` }}>
              <div style={{ fontFamily: F.sans, fontSize: 26, fontWeight: 600, color: "#fff", textShadow: "0 0 16px rgba(0,0,0,0.9)" }}>{g.zh}</div>
              <ScrambleText text={g.en} t0={g.at - offset} dur={0.6} style={{ fontFamily: F.mono, fontSize: 13, letterSpacing: "0.25em", color: C.cyan }} />
            </div>
          );
        })}
      </div>
      <CourseTag zh="操作系统 · 数据库 · 分布式" en="OS · Databases · Distributed Systems" start={94.6 - offset} end={101.3 - offset} y={150} />
      <Caption zh="看不见的系统，托起整个数字世界" en="Invisible systems hold up the digital world" start={97.9 - offset} end={101.4 - offset} y={850} size={50} backdrop={0.8} />
    </AbsoluteFill>
  );
};
