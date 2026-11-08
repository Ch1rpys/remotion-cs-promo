import React, { useMemo } from "react";
import { AbsoluteFill, useVideoConfig } from "remotion";
import { ThreeCanvas } from "@remotion/three";
import * as THREE from "three";
import { Caption, ChapterCard, useTime } from "../components/Text";
import { CameraRig, Post, instancedQuad, makeCanvasTexture } from "../three/common";
import { ease, invLerp, mulberry32, smoothstep } from "../lib/anim";

const L = 170;

const glyphVS = /* glsl */ `
attribute vec3 aOffset; attribute float aSeed; attribute vec3 aColor; attribute float aScale; attribute float aSpin;
uniform float uTime; uniform float uCamZ; uniform float uL;
varying vec2 vUv; varying vec3 vColor; varying float vFade; varying float vGlyph;
void main(){
  vec3 p = aOffset;
  float ang = aSpin * uTime;
  p.xy = mat2(cos(ang), -sin(ang), sin(ang), cos(ang)) * p.xy;
  p.z = uCamZ + 3.0 - mod(uCamZ + 3.0 - p.z, uL);
  float d = uCamZ - p.z;
  vFade = smoothstep(uL, uL * 0.55, d) * smoothstep(0.2, 4.0, d);
  float k = floor(uTime * (0.6 + fract(aSeed * 7.3) * 4.0) + aSeed * 50.0);
  vGlyph = step(0.5, fract(sin(k * 12.9898 + aSeed * 78.233) * 43758.5453));
  float flick = 0.75 + 0.25 * sin(uTime * (3.0 + aSeed * 9.0) + aSeed * 40.0);
  vColor = aColor * flick;
  vUv = uv;
  vec4 mv = viewMatrix * vec4(p, 1.0);
  mv.xy += position.xy * aScale;
  gl_Position = projectionMatrix * mv;
}`;

const glyphFS = /* glsl */ `
uniform sampler2D uAtlas; uniform float uGain;
varying vec2 vUv; varying vec3 vColor; varying float vFade; varying float vGlyph;
void main(){
  vec2 uv = vec2((vUv.x + vGlyph) * 0.5, vUv.y);
  float a = texture2D(uAtlas, uv).r;
  gl_FragColor = vec4(vColor * a * vFade * uGain, 1.0);
}`;

const streakVS = /* glsl */ `
attribute vec3 aOffset; attribute float aSeed; attribute float aLen; attribute float aSpeed;
uniform float uTime; uniform float uCamZ; uniform float uL;
varying vec2 vUv; varying float vFade; varying float vSeed;
void main(){
  vec3 c = aOffset;
  c.z = c.z - uTime * aSpeed;
  c.z = uCamZ + 6.0 - mod(uCamZ + 6.0 - c.z, uL);
  float th = atan(c.y, c.x);
  vec3 tang = vec3(-sin(th), cos(th), 0.0);
  vec3 p = vec3(c.xy, c.z) + tang * position.x * 0.035 + vec3(0.0, 0.0, position.y * aLen);
  float d = uCamZ - c.z;
  vFade = smoothstep(uL, uL * 0.5, d) * smoothstep(0.0, 6.0, d);
  vUv = uv; vSeed = aSeed;
  gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
}`;

const streakFS = /* glsl */ `
uniform float uGain;
varying vec2 vUv; varying float vFade; varying float vSeed;
void main(){
  float along = vUv.y;
  float head = smoothstep(0.0, 0.85, along) * (1.0 - smoothstep(0.9, 1.0, along));
  float across = 1.0 - abs(vUv.x - 0.5) * 2.0;
  vec3 col = mix(vec3(0.25, 0.85, 1.0), vec3(1.0), step(0.85, fract(vSeed * 3.7)));
  gl_FragColor = vec4(col * head * across * vFade * uGain * 2.2, 1.0);
}`;

export const Tunnel: React.FC<{ t: number; camZ: number; gain: number }> = ({ t, camZ, gain }) => {
  const { glyphGeo, glyphMat, streakGeo, streakMat } = useMemo(() => {
    const atlas = makeCanvasTexture(256, 128, (ctx) => {
      ctx.fillStyle = "#000";
      ctx.fillRect(0, 0, 256, 128);
      ctx.fillStyle = "#fff";
      ctx.font = "bold 104px Menlo, monospace";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("0", 64, 68);
      ctx.fillText("1", 192, 68);
    });
    const r = mulberry32(11);
    const rings = 44;
    const perRing = 72;
    const scattered = 7000;
    const n = rings * perRing + scattered;
    const off = new Float32Array(n * 3);
    const seed = new Float32Array(n);
    const col = new Float32Array(n * 3);
    const scl = new Float32Array(n);
    const spin = new Float32Array(n);
    const palette = [
      [0.25, 0.8, 1.0],
      [0.18, 0.5, 1.0],
      [0.45, 0.95, 1.0],
      [0.1, 0.35, 0.9],
    ];
    let k = 0;
    for (let i = 0; i < rings; i++) {
      const z = -i * (L / rings);
      const rad = 4.2 + (i % 3) * 0.9;
      const sp = (i % 2 ? 1 : -1) * (0.08 + r() * 0.1);
      for (let j = 0; j < perRing; j++) {
        const a = (j / perRing) * Math.PI * 2;
        off.set([Math.cos(a) * rad, Math.sin(a) * rad, z], k * 3);
        seed[k] = r();
        const c = palette[Math.floor(r() * 2)];
        const bright = 1.6;
        col.set([c[0] * bright, c[1] * bright, c[2] * bright], k * 3);
        scl[k] = 0.36;
        spin[k] = sp;
        k++;
      }
    }
    for (let i = 0; i < scattered; i++) {
      const a = r() * Math.PI * 2;
      const rad = Math.sqrt(2.5 * 2.5 + r() * (13 * 13 - 2.5 * 2.5));
      off.set([Math.cos(a) * rad, Math.sin(a) * rad, -r() * L], k * 3);
      seed[k] = r();
      const q = r();
      let c = palette[Math.floor(r() * palette.length)];
      let b = 0.7 + r() * 0.9;
      if (q > 0.97) {
        c = [1.0, 0.72, 0.3];
        b = 2.2;
      } else if (q > 0.93) {
        c = [1, 1, 1];
        b = 2.0;
      }
      col.set([c[0] * b, c[1] * b, c[2] * b], k * 3);
      scl[k] = 0.22 + r() * 0.55;
      spin[k] = (r() - 0.5) * 0.04;
      k++;
    }
    const g = instancedQuad();
    g.setAttribute("aOffset", new THREE.InstancedBufferAttribute(off, 3));
    g.setAttribute("aSeed", new THREE.InstancedBufferAttribute(seed, 1));
    g.setAttribute("aColor", new THREE.InstancedBufferAttribute(col, 3));
    g.setAttribute("aScale", new THREE.InstancedBufferAttribute(scl, 1));
    g.setAttribute("aSpin", new THREE.InstancedBufferAttribute(spin, 1));
    g.instanceCount = n;
    const m = new THREE.ShaderMaterial({
      vertexShader: glyphVS,
      fragmentShader: glyphFS,
      uniforms: { uTime: { value: 0 }, uCamZ: { value: 0 }, uL: { value: L }, uAtlas: { value: atlas }, uGain: { value: 1 } },
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });

    const ns = 420;
    const so = new Float32Array(ns * 3);
    const ss = new Float32Array(ns);
    const sl = new Float32Array(ns);
    const sv = new Float32Array(ns);
    for (let i = 0; i < ns; i++) {
      const a = r() * Math.PI * 2;
      const rad = 2.2 + r() * 9;
      so.set([Math.cos(a) * rad, Math.sin(a) * rad, -r() * L], i * 3);
      ss[i] = r();
      sl[i] = 2 + r() * 7;
      sv[i] = 10 + r() * 30;
    }
    const sg = instancedQuad();
    sg.setAttribute("aOffset", new THREE.InstancedBufferAttribute(so, 3));
    sg.setAttribute("aSeed", new THREE.InstancedBufferAttribute(ss, 1));
    sg.setAttribute("aLen", new THREE.InstancedBufferAttribute(sl, 1));
    sg.setAttribute("aSpeed", new THREE.InstancedBufferAttribute(sv, 1));
    sg.instanceCount = ns;
    const smat = new THREE.ShaderMaterial({
      vertexShader: streakVS,
      fragmentShader: streakFS,
      uniforms: { uTime: { value: 0 }, uCamZ: { value: 0 }, uL: { value: L }, uGain: { value: 1 } },
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
    });
    return { glyphGeo: g, glyphMat: m, streakGeo: sg, streakMat: smat };
  }, []);
  glyphMat.uniforms.uTime.value = t;
  glyphMat.uniforms.uCamZ.value = camZ;
  glyphMat.uniforms.uGain.value = gain;
  streakMat.uniforms.uTime.value = t;
  streakMat.uniforms.uCamZ.value = camZ;
  streakMat.uniforms.uGain.value = gain;
  return (
    <>
      <mesh geometry={glyphGeo} material={glyphMat} frustumCulled={false} />
      <mesh geometry={streakGeo} material={streakMat} frustumCulled={false} />
    </>
  );
};

export const CoreGlow: React.FC<{ camZ: number; intensity: number }> = ({ camZ, intensity }) => {
  const tex = useMemo(
    () =>
      makeCanvasTexture(256, 256, (ctx) => {
        const g = ctx.createRadialGradient(128, 128, 0, 128, 128, 128);
        g.addColorStop(0, "rgba(255,255,255,1)");
        g.addColorStop(0.15, "rgba(120,230,255,0.8)");
        g.addColorStop(0.5, "rgba(30,90,255,0.2)");
        g.addColorStop(1, "rgba(0,0,0,0)");
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, 256, 256);
      }),
    [],
  );
  return (
    <sprite position={[0, 0, camZ - 120]} scale={[70, 70, 1]}>
      <spriteMaterial map={tex} blending={THREE.AdditiveBlending} depthWrite={false} transparent opacity={intensity} color={new THREE.Color(1.4, 1.4, 1.4)} />
    </sprite>
  );
};

const camZAt = (tau: number) => {
  let z = 0;
  const dt = 1 / 120;
  for (let s = 0; s < tau; s += dt) {
    const v = 7 + 55 * Math.exp(-s * 1.4) + 70 * Math.pow(smoothstep(8.7, 10.0, s), 2);
    z -= v * dt;
  }
  return z;
};

export const S02Binary: React.FC<{ offset: number }> = ({ offset }) => {
  const tau = useTime();
  const t = tau + offset;
  const { width, height } = useVideoConfig();
  const camZ = camZAt(tau);
  const roll = 0.35 * Math.sin(tau * 0.35) + tau * 0.04;
  const bob = [Math.sin(tau * 0.5) * 0.25, Math.cos(tau * 0.43) * 0.2] as const;
  const exit = smoothstep(9.0, 9.9, tau);
  const gain = 1 + exit * 2.5;
  return (
    <AbsoluteFill style={{ background: "#01030a" }}>
      <ThreeCanvas width={width} height={height} gl={{ antialias: true }} camera={{ fov: 70, position: [0, 0, 0] }}>
        <color attach="background" args={["#01030a"]} />
        <CameraRig pos={[bob[0], bob[1], camZ]} look={[bob[0] * 0.3, bob[1] * 0.3, camZ - 10]} roll={roll} fov={72 + exit * 18} />
        <Tunnel t={tau} camZ={camZ} gain={gain} />
        <CoreGlow camZ={camZ} intensity={0.55 - 0.4 * (smoothstep(1.9, 2.6, tau) - smoothstep(8.6, 9.2, tau)) + exit * 0.45} />
        <Post bloom={1.35 + exit * 1.5} threshold={0.12} radius={0.8} ca={0.0012 + exit * 0.004} />
      </ThreeCanvas>
      <ChapterCard label="CHAPTER  I" zh="基石" en="FOUNDATION" index="01 — 04" start={16.7 - offset} end={19.7 - offset} />
      <Caption zh="一切，始于 0 与 1" en="Everything begins with zero and one" start={20.3 - offset} end={23.3 - offset} y={430} size={76} backdrop={1} />
      <AbsoluteFill style={{ background: "#dff8ff", opacity: ease.inQuad(invLerp(9.3, 10.0, tau)) * 0.9, mixBlendMode: "screen" }} />
    </AbsoluteFill>
  );
};
