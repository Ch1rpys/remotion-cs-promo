import React, { useMemo } from "react";
import { AbsoluteFill, staticFile, useVideoConfig } from "remotion";
import { ThreeCanvas } from "@remotion/three";
import { useLoader } from "@react-three/fiber";
import * as THREE from "three";
import { Caption, ChapterCard, CourseTag, Hud, useTime } from "../components/Text";
import { CameraRig, Post, makeCanvasTexture } from "../three/common";
import { ease, invLerp, lerp, mulberry32 } from "../lib/anim";

const ll = (lat: number, lon: number, r = 1) => {
  const a = (lat * Math.PI) / 180;
  const b = (lon * Math.PI) / 180;
  return new THREE.Vector3(r * Math.cos(a) * Math.cos(b), r * Math.sin(a), -r * Math.cos(a) * Math.sin(b));
};

const CITIES: Record<string, [number, number]> = {
  beijing: [39.9, 116.4],
  shanghai: [31.2, 121.5],
  shenzhen: [22.5, 114.1],
  chengdu: [30.7, 104.1],
  xian: [34.3, 108.9],
  tokyo: [35.7, 139.7],
  seoul: [37.6, 127.0],
  singapore: [1.35, 103.8],
  mumbai: [19.1, 72.9],
  dubai: [25.2, 55.3],
  moscow: [55.8, 37.6],
  london: [51.5, -0.13],
  frankfurt: [50.1, 8.7],
  paris: [48.9, 2.35],
  newyork: [40.7, -74.0],
  sanfrancisco: [37.8, -122.4],
  seattle: [47.6, -122.3],
  losangeles: [34.05, -118.2],
  saopaulo: [-23.5, -46.6],
  sydney: [-33.9, 151.2],
  capetown: [-33.9, 18.4],
  jakarta: [-6.2, 106.8],
};

const LINKS: [string, string][] = [
  ["shanghai", "sanfrancisco"],
  ["beijing", "london"],
  ["shenzhen", "singapore"],
  ["shanghai", "tokyo"],
  ["beijing", "moscow"],
  ["shenzhen", "sydney"],
  ["singapore", "mumbai"],
  ["mumbai", "dubai"],
  ["dubai", "frankfurt"],
  ["london", "newyork"],
  ["newyork", "sanfrancisco"],
  ["tokyo", "seattle"],
  ["seoul", "losangeles"],
  ["newyork", "saopaulo"],
  ["london", "capetown"],
  ["chengdu", "singapore"],
  ["xian", "dubai"],
  ["beijing", "shanghai"],
  ["beijing", "shenzhen"],
  ["shanghai", "chengdu"],
  ["beijing", "seoul"],
  ["shenzhen", "jakarta"],
  ["paris", "frankfurt"],
  ["shanghai", "singapore"],
  ["beijing", "xian"],
  ["tokyo", "sydney"],
  ["sanfrancisco", "sydney"],
  ["frankfurt", "moscow"],
];

const earthVS = /* glsl */ `
varying vec2 vUv; varying vec3 vN; varying vec3 vPos;
void main(){ vUv = uv; vN = normalize(mat3(modelMatrix) * normal); vec4 w = modelMatrix * vec4(position, 1.0); vPos = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`;
const earthFS = /* glsl */ `
uniform sampler2D uDay; uniform sampler2D uNight; uniform sampler2D uSpec; uniform vec3 uSun; uniform vec3 uCam; uniform float uLights;
varying vec2 vUv; varying vec3 vN; varying vec3 vPos;
void main(){
  vec3 n = normalize(vN);
  vec3 L = normalize(uSun);
  float sd = dot(n, L);
  float day = smoothstep(-0.12, 0.3, sd);
  vec3 dayC = texture2D(uDay, vUv).rgb;
  vec3 nightC = texture2D(uNight, vUv).rgb;
  float spec = texture2D(uSpec, vUv).r;
  vec3 V = normalize(uCam - vPos);
  vec3 H = normalize(L + V);
  float warm = clamp(nightC.r * 1.5 - nightC.b * 1.1, 0.0, 1.0);
  vec3 lights = pow(warm, 1.15) * vec3(1.0, 0.74, 0.45) * uLights;
  vec3 moon = nightC * vec3(0.55, 0.65, 1.0) * 0.35;
  vec3 col = dayC * day * 0.9 + (moon + lights) * (1.0 - day);
  col += vec3(1.0, 0.9, 0.75) * pow(max(dot(n, H), 0.0), 60.0) * spec * day * 0.8;
  float fres = pow(1.0 - max(dot(n, V), 0.0), 2.5);
  col += vec3(0.15, 0.45, 1.0) * fres * (0.18 + 0.9 * smoothstep(-0.25, 0.4, sd));
  gl_FragColor = vec4(col, 1.0);
}`;

const atmoVS = /* glsl */ `
varying vec3 vNV;
void main(){ vNV = normalize(normalMatrix * normal); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
const atmoFS = /* glsl */ `
uniform float uAmp;
varying vec3 vNV;
void main(){
  float i = pow(clamp(0.78 - dot(vNV, vec3(0.0, 0.0, 1.0)), 0.0, 1.0), 4.0);
  gl_FragColor = vec4(vec3(0.25, 0.6, 1.0) * i * uAmp, 1.0);
}`;

const arcFS = /* glsl */ `
uniform float uTime; uniform float uPhase; uniform float uSpeed; uniform vec3 uColor; uniform float uGrow;
varying vec2 vUv;
void main(){
  float s = vUv.x;
  if (s > uGrow) discard;
  float head = fract(uTime * uSpeed + uPhase);
  float d = head - s; if (d < 0.0) d += 1.0;
  float pulse = exp(-d * 14.0);
  float head2 = fract(uTime * uSpeed * 0.7 + uPhase + 0.5);
  float d2 = head2 - s; if (d2 < 0.0) d2 += 1.0;
  pulse += 0.6 * exp(-d2 * 18.0);
  float ends = smoothstep(0.0, 0.04, s) * smoothstep(0.0, 0.04, uGrow - s + 0.001);
  gl_FragColor = vec4(uColor * (0.22 + 3.2 * pulse) * (0.4 + 0.6 * ends), 1.0);
}`;
const arcVS = /* glsl */ `
varying vec2 vUv;
void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;

const Earth: React.FC<{ tau: number; cam: THREE.Vector3 }> = ({ tau, cam }) => {
  const [day, night, spec] = useLoader(THREE.TextureLoader, [
    staticFile("textures/earth-blue-marble.jpg"),
    staticFile("textures/earth-lights-8k.jpg"),
    staticFile("textures/earth-water.png"),
  ]);
  const mats = useMemo(() => {
    day.colorSpace = THREE.SRGBColorSpace;
    night.colorSpace = THREE.SRGBColorSpace;
    [day, night, spec].forEach((t) => {
      t.anisotropy = 8;
      t.needsUpdate = true;
    });
    const earth = new THREE.ShaderMaterial({
      vertexShader: earthVS,
      fragmentShader: earthFS,
      uniforms: { uDay: { value: day }, uNight: { value: night }, uSpec: { value: spec }, uSun: { value: new THREE.Vector3() }, uCam: { value: new THREE.Vector3() }, uLights: { value: 3.2 } },
    });
    const atmo = new THREE.ShaderMaterial({
      vertexShader: atmoVS,
      fragmentShader: atmoFS,
      uniforms: { uAmp: { value: 1.3 } },
      side: THREE.BackSide,
      blending: THREE.AdditiveBlending,
      transparent: true,
      depthWrite: false,
    });
    const r = mulberry32(5);
    const arcs = LINKS.map(([a, b], i) => {
      const A = ll(...CITIES[a]);
      const B = ll(...CITIES[b]);
      const ang = A.angleTo(B);
      const h = 0.03 + 0.32 * (ang / Math.PI);
      const pts: THREE.Vector3[] = [];
      for (let k = 0; k <= 64; k++) {
        const s = k / 64;
        const q = new THREE.Vector3().copy(A).lerp(B, s).normalize();
        const sl = A.clone()
          .multiplyScalar(Math.sin((1 - s) * ang) / Math.sin(ang))
          .add(B.clone().multiplyScalar(Math.sin(s * ang) / Math.sin(ang)));
        pts.push((ang > 1e-3 ? sl : q).normalize().multiplyScalar(1.002 + h * Math.sin(Math.PI * s)));
      }
      const geo = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 96, 0.0032, 6, false);
      const gold = i % 5 === 0;
      const mat = new THREE.ShaderMaterial({
        vertexShader: arcVS,
        fragmentShader: arcFS,
        uniforms: {
          uTime: { value: 0 },
          uPhase: { value: r() },
          uSpeed: { value: 0.35 + r() * 0.35 },
          uColor: { value: gold ? new THREE.Color(1.0, 0.62, 0.22) : new THREE.Color(0.25, 0.8, 1.0) },
          uGrow: { value: 0 },
        },
        blending: THREE.AdditiveBlending,
        transparent: true,
        depthWrite: false,
      });
      return { geo, mat, delay: 0.3 + r() * 1.6 };
    });
    const dot = makeCanvasTexture(128, 128, (ctx) => {
      const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
      g.addColorStop(0, "rgba(255,255,255,1)");
      g.addColorStop(0.2, "rgba(255,240,210,0.7)");
      g.addColorStop(1, "rgba(255,200,120,0)");
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, 128, 128);
    });
    const stars = (() => {
      const n = 4000;
      const p = new Float32Array(n * 3);
      const c = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) {
        const v = new THREE.Vector3(r() * 2 - 1, r() * 2 - 1, r() * 2 - 1).normalize().multiplyScalar(80 + r() * 40);
        p.set([v.x, v.y, v.z], i * 3);
        const b = 0.3 + Math.pow(r(), 3) * 1.8;
        c.set([b * 0.85, b * 0.9, b], i * 3);
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute("position", new THREE.BufferAttribute(p, 3));
      g.setAttribute("color", new THREE.BufferAttribute(c, 3));
      return g;
    })();
    return { earth, atmo, arcs, dot, stars };
  }, [day, night, spec]);
  const cd = cam.clone().normalize();
  const right = new THREE.Vector3().crossVectors(cd, new THREE.Vector3(0, 1, 0)).normalize();
  const sun = right.multiplyScalar(-0.62).add(cd.clone().multiplyScalar(-0.78)).add(new THREE.Vector3(0, 0.22, 0)).normalize();
  mats.earth.uniforms.uSun.value.copy(sun);
  mats.earth.uniforms.uCam.value.copy(cam);
  mats.arcs.forEach((a) => {
    a.mat.uniforms.uTime.value = tau;
    a.mat.uniforms.uGrow.value = ease.inOutCubic(invLerp(a.delay, a.delay + 1.4, tau));
  });
  return (
    <>
      <points geometry={mats.stars}>
        <pointsMaterial size={0.35} vertexColors sizeAttenuation transparent depthWrite={false} />
      </points>
      <mesh material={mats.earth}>
        <sphereGeometry args={[1, 160, 120]} />
      </mesh>
      <mesh material={mats.atmo} scale={1.13}>
        <sphereGeometry args={[1, 96, 64]} />
      </mesh>
      {mats.arcs.map((a, i) => (
        <mesh key={i} geometry={a.geo} material={a.mat} />
      ))}
      {Object.values(CITIES).map((c, i) => {
        const p = ll(c[0], c[1], 1.004);
        const s = 0.028 + 0.012 * Math.sin(tau * 3 + i);
        return (
          <sprite key={i} position={p} scale={[s, s, 1]}>
            <spriteMaterial map={mats.dot} color={new THREE.Color(2.2, 1.8, 1.2)} blending={THREE.AdditiveBlending} depthWrite={false} toneMapped={false} />
          </sprite>
        );
      })}
    </>
  );
};

export const S11Globe: React.FC<{ offset: number }> = ({ offset }) => {
  const tau = useTime();
  const { width, height } = useVideoConfig();
  const pull = ease.outCubic(invLerp(0.2, 3.6, tau));
  const dist = Math.exp(lerp(Math.log(1.1), Math.log(3.25), pull)) - 0.25 * ease.inOutSine(invLerp(3.6, 10.7, tau));
  const d0 = ll(31.2, 121.5);
  const d1 = ll(18, 118);
  const dir = d0.clone().lerp(d1, pull).normalize();
  dir.applyAxisAngle(new THREE.Vector3(0, 1, 0), -0.045 * tau);
  const cam = dir.clone().multiplyScalar(dist);
  const look = new THREE.Vector3(0, 0, 0).lerp(new THREE.Vector3(0, 0.12, 0), pull);
  const fadeIn = ease.outCubic(invLerp(0, 0.6, tau));
  const fadeOut = ease.inCubic(invLerp(10.0, 10.7, tau));
  return (
    <AbsoluteFill style={{ background: "#000", opacity: fadeIn * (1 - fadeOut) }}>
      <ThreeCanvas width={width} height={height} gl={{ antialias: true }} camera={{ fov: 40, position: [0, 0, 3], near: 0.01, far: 400 }}>
        <color attach="background" args={["#000105"]} />
        <CameraRig pos={[cam.x, cam.y, cam.z]} look={[look.x, look.y, look.z]} fov={lerp(55, 38, pull)} near={0.01} far={400} />
        <Earth tau={tau} cam={cam} />
        <Post bloom={1.2} threshold={0.25} radius={0.8} ca={0.0008} />
      </ThreeCanvas>
      <ChapterCard label="CHAPTER  III" zh="连接" en="CONNECTED" index="03 — 04" start={84.3 - offset} end={87.3 - offset} />
      <CourseTag zh="计算机网络" en="Computer Networks" start={88.0 - offset} end={93.6 - offset} y={150} />
      <Hud right x={96} y={150} start={88.2 - offset} end={93.6 - offset} lines={["TCP / IP · 协议栈", "应用层 · 传输层 · 网络层 · 链路层", "INTERNET USERS  5.5 BILLION+"]} />
      <Caption zh="计算机网络，让五十亿人彼此相连" en="Networks connect more than five billion people" start={88.4 - offset} end={93.4 - offset} y={850} size={50} backdrop={0.7} />
    </AbsoluteFill>
  );
};

