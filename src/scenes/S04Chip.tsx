import React, { useMemo } from "react";
import { AbsoluteFill, useVideoConfig } from "remotion";
import { ThreeCanvas } from "@remotion/three";
import * as THREE from "three";
import { Caption, CourseTag, ScrambleText, useTime } from "../components/Text";
import { CameraRig, Post, makeCanvasTexture } from "../three/common";
import { WAFER_FS, WAFER_VS } from "../three/dieShader";
import { ease, invLerp, lerp, smoothstep } from "../lib/anim";
import { C, F } from "../theme";

const R = 7.2;

type Cam = { pos: [number, number, number]; target: [number, number, number]; up: [number, number, number]; fov: number };

const camAt = (tau: number): Cam => {
  const start = [-0.36, -0.39];
  const zA = ease.inOutCubic(invLerp(0, 3.7, tau));
  let dist = Math.exp(lerp(Math.log(0.022), Math.log(1.72), zA));
  dist *= lerp(1, 1.12, ease.inOutSine(invLerp(3.7, 5.7, tau)));
  const zB = ease.inOutCubic(invLerp(5.6, 8.8, tau));
  dist = Math.exp(lerp(Math.log(dist), Math.log(19.5), zB));
  dist *= lerp(1, 0.9, ease.inOutSine(invLerp(8.8, 11.3, tau)));
  const push = ease.inQuart(invLerp(11.25, 12.05, tau));
  dist = lerp(dist, 0.9, push);
  const elev = lerp(Math.PI / 2, 0.64, ease.inOutCubic(invLerp(5.8, 9.0, tau)));
  const az = lerp(0, 0.62, ease.inOutSine(invLerp(5.6, 12.1, tau)));
  const tx = lerp(start[0], 0, zA);
  const tz = lerp(start[1], 0, zA);
  const pos: [number, number, number] = [tx + dist * Math.cos(elev) * Math.sin(az), dist * Math.sin(elev), tz + dist * Math.cos(elev) * Math.cos(az)];
  const up: [number, number, number] = [-Math.sin(elev) * Math.sin(az), Math.cos(elev), -Math.sin(elev) * Math.cos(az)];
  return { pos, target: [tx, 0, tz], up, fov: 40 + 34 * push };
};

const Wafer: React.FC<{ tau: number; cam: Cam }> = ({ tau, cam }) => {
  const mat = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: WAFER_VS,
        fragmentShader: WAFER_FS,
        uniforms: {
          uCam: { value: new THREE.Vector3() },
          uLight: { value: new THREE.Vector3(0, 1, -1) },
          uTime: { value: 0 },
          uSheen: { value: 0 },
          uR: { value: R },
          uDetail: { value: 1 },
          uFocus: { value: 0.3 },
        },
        transparent: true,
      }),
    [],
  );
  const pool = useMemo(
    () =>
      makeCanvasTexture(512, 512, (ctx) => {
        const g = ctx.createRadialGradient(256, 256, 0, 256, 256, 256);
        g.addColorStop(0, "rgba(60,140,255,0.55)");
        g.addColorStop(0.4, "rgba(30,70,200,0.18)");
        g.addColorStop(1, "rgba(0,0,0,0)");
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, 512, 512);
      }),
    [],
  );
  const phi = lerp(-0.9, 1.0, ease.inOutSine(invLerp(6.0, 12.0, tau)));
  mat.uniforms.uCam.value.set(...cam.pos);
  mat.uniforms.uLight.value.set(Math.sin(phi) * 1.0, 0.85, -Math.cos(phi));
  mat.uniforms.uTime.value = tau;
  mat.uniforms.uSheen.value = lerp(0.06, 1.0, smoothstep(5.8, 8.6, tau));
  mat.uniforms.uDetail.value = lerp(1.0, 0.85, smoothstep(6.5, 9.0, tau));
  mat.uniforms.uFocus.value = lerp(0.28, 1.0, smoothstep(5.3, 6.8, tau));
  return (
    <>
      <mesh rotation={[-Math.PI / 2, 0, 0]} material={mat}>
        <circleGeometry args={[R + 0.05, 256]} />
      </mesh>
      <mesh position={[0, -0.05, 0]}>
        <cylinderGeometry args={[R, R, 0.1, 256, 1, true]} />
        <meshStandardMaterial color="#9aa6b4" metalness={0.9} roughness={0.3} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -1.2, 0]}>
        <planeGeometry args={[60, 60]} />
        <meshBasicMaterial map={pool} transparent blending={THREE.AdditiveBlending} depthWrite={false} opacity={0.55 * smoothstep(6.0, 9.0, tau)} />
      </mesh>
    </>
  );
};

const LABELS: { u: [number, number]; zh: string; en: string; at: number; col: string; dir: 1 | -1 }[] = [
  { u: [0.345, 0.265], zh: "CPU 核心 ×8", en: "8 × CPU CORES", at: 2.2, col: "#1ad9f2", dir: -1 },
  { u: [0.805, 0.265], zh: "GPU 图形处理器", en: "GRAPHICS", at: 2.5, col: "#8c5cff", dir: 1 },
  { u: [0.5, 0.57], zh: "L3 高速缓存", en: "SHARED CACHE", at: 2.8, col: "#387aff", dir: 1 },
  { u: [0.255, 0.805], zh: "NPU 神经网络引擎", en: "NEURAL ENGINE", at: 3.1, col: "#eb4dff", dir: -1 },
  { u: [0.835, 0.805], zh: "内存控制器", en: "MEMORY CONTROLLER", at: 3.4, col: "#ff9d3c", dir: 1 },
];

const project = (cam: Cam, p: [number, number, number]) => {
  const c = new THREE.PerspectiveCamera(cam.fov, 1920 / 1080, 0.001, 1000);
  c.position.set(...cam.pos);
  c.up.set(...cam.up);
  c.lookAt(...cam.target);
  c.updateMatrixWorld();
  c.updateProjectionMatrix();
  const v = new THREE.Vector3(...p).project(c);
  return { x: ((v.x + 1) / 2) * 1920, y: ((1 - v.y) / 2) * 1080 };
};

const fmt = (n: number) => Math.floor(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");

export const S04Chip: React.FC<{ offset: number }> = ({ offset }) => {
  const tau = useTime();
  const { width, height } = useVideoConfig();
  const cam = camAt(tau);
  const fadeIn = ease.outCubic(invLerp(0, 0.55, tau));
  const count = 1e11 * ease.outExpo(invLerp(1.0, 4.6, tau));
  const hudOp = ease.outCubic(invLerp(0.9, 1.4, tau)) * (1 - ease.inCubic(invLerp(5.5, 6.0, tau)));
  const labelOut = 1 - ease.inCubic(invLerp(5.4, 5.9, tau));
  return (
    <AbsoluteFill style={{ background: "#020409", opacity: fadeIn }}>
      <ThreeCanvas width={width} height={height} gl={{ antialias: true }} camera={{ fov: 40, position: [0, 2, 0], near: 0.001, far: 500 }}>
        <color attach="background" args={["#020409"]} />
        <ambientLight intensity={0.4} />
        <directionalLight position={[3, 6, -4]} intensity={2.5} />
        <CameraRig pos={cam.pos} look={cam.target} up={cam.up} fov={cam.fov} near={0.002} far={500} />
        <Wafer tau={tau} cam={cam} />
        <Post bloom={0.9 + 0.8 * smoothstep(11.3, 12.0, tau)} threshold={0.3} radius={0.7} ca={0.0006 + 0.004 * smoothstep(11.3, 12.0, tau)} />
      </ThreeCanvas>
      {LABELS.map((l, i) => {
        const p = project(cam, [l.u[0] - 0.5, 0, l.u[1] - 0.5]);
        const a = ease.outCubic(invLerp(l.at, l.at + 0.5, tau)) * labelOut;
        if (a <= 0.001) return null;
        const dx = 70 * l.dir;
        return (
          <div key={i} style={{ position: "absolute", left: p.x, top: p.y, opacity: a }}>
            <div style={{ position: "absolute", left: -7, top: -7, width: 14, height: 14, borderRadius: 7, border: `2px solid ${l.col}`, boxShadow: `0 0 12px ${l.col}` }} />
            <div style={{ position: "absolute", left: -2, top: -2, width: 4, height: 4, borderRadius: 2, background: "#fff" }} />
            <svg style={{ position: "absolute", left: Math.min(0, dx * 1.6), top: -46, overflow: "visible" }} width={Math.abs(dx) * 1.6} height={46}>
              <polyline
                points={dx > 0 ? `0,46 ${dx * 0.6 * a},${46 - 40 * a} ${dx * 1.6 * a},${46 - 40 * a}` : `${-dx * 1.6},46 ${-dx * 1.6 + dx * 0.6 * a},${46 - 40 * a} ${-dx * 1.6 + dx * 1.6 * a},${46 - 40 * a}`}
                fill="none"
                stroke={l.col}
                strokeWidth={1.5}
              />
            </svg>
            <div
              style={{
                position: "absolute",
                left: dx > 0 ? dx * 1.6 + 10 : undefined,
                right: dx < 0 ? -dx * 1.6 + 10 : undefined,
                top: -66,
                whiteSpace: "nowrap",
                textAlign: dx > 0 ? "left" : "right",
                background: "rgba(2,6,16,0.72)",
                border: `1px solid ${l.col}55`,
                padding: "6px 12px",
                borderRadius: 6,
              }}
            >
              <div style={{ fontFamily: F.sans, fontSize: 22, fontWeight: 600, color: "#fff", letterSpacing: "0.08em" }}>{l.zh}</div>
              <ScrambleText text={l.en} t0={l.at + 0.1} dur={0.6} style={{ fontFamily: F.mono, fontSize: 13, letterSpacing: "0.2em", color: l.col }} />
            </div>
          </div>
        );
      })}
      <div style={{ position: "absolute", right: 90, top: 150, textAlign: "right", opacity: hudOp }}>
        <div style={{ fontFamily: F.sans, fontSize: 16, letterSpacing: "0.35em", color: C.cyan }}>单颗芯片晶体管 · TRANSISTORS</div>
        <div style={{ fontFamily: F.tech, fontSize: 54, fontWeight: 700, color: "#fff", letterSpacing: "0.04em", textShadow: `0 0 24px ${C.cyan}88`, marginTop: 6 }}>
          {fmt(count)}
          <span style={{ color: C.gold }}>{count > 0.999e11 ? "+" : ""}</span>
        </div>
      </div>
      <CourseTag zh="计算机组成原理" en="Computer Organization" start={0.8} end={5.6} y={150} />
      <Caption zh="从一个逻辑门，到一颗处理器" en="From a single gate to an entire processor" start={2.0} end={5.5} y={850} size={50} backdrop={0.9} />
      <CourseTag zh="计算机体系结构" en="Computer Architecture" start={6.6} end={11.1} y={150} />
      <Caption zh="一片晶圆，数以万亿计的晶体管" en="Trillions of transistors on a single wafer" start={7.0} end={10.9} y={850} size={50} backdrop={0.7} />
      <AbsoluteFill style={{ background: "#eafcff", opacity: ease.inQuad(invLerp(11.7, 12.05, tau)) * 0.95, mixBlendMode: "screen" }} />
    </AbsoluteFill>
  );
};

