import React, { useMemo } from "react";
import { AbsoluteFill, useVideoConfig } from "remotion";
import { ThreeCanvas } from "@remotion/three";
import { MeshReflectorMaterial } from "@react-three/drei";
import * as THREE from "three";
import cues from "../data/cues.json";
import { Caption, CourseTag, Hud, useTime } from "../components/Text";
import { CameraRig, Post } from "../three/common";
import { clamp, ease, invLerp, lerp, mulberry32, smoothstep } from "../lib/anim";
import { F, C } from "../theme";

const N = 64;
const GAP = 0.34;
const STAGE_T0 = cues.sortStages[0];
const STAGE_DT = 0.25;

/** bitonic network: array state after each stage */
const buildStages = () => {
  const r = mulberry32(64);
  const a = Array.from({ length: N }, (_, i) => i);
  for (let i = N - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  const states: number[][] = [a.slice()];
  for (let k = 2; k <= N; k *= 2) {
    for (let j = k / 2; j >= 1; j /= 2) {
      const cur = states[states.length - 1].slice();
      for (let i = 0; i < N; i++) {
        const l = i ^ j;
        if (l > i) {
          const up = (i & k) === 0;
          if ((up && cur[i] > cur[l]) || (!up && cur[i] < cur[l])) [cur[i], cur[l]] = [cur[l], cur[i]];
        }
      }
      states.push(cur);
    }
  }
  return states;
};

const palette = (v: number) => {
  const c1 = new THREE.Color("#1d3bff");
  const c2 = new THREE.Color("#23e6ff");
  const c3 = new THREE.Color("#ffc15e");
  return v < 0.6 ? c1.clone().lerp(c2, v / 0.6) : c2.clone().lerp(c3, (v - 0.6) / 0.4);
};

const Bars: React.FC<{ t: number }> = ({ t }) => {
  const { states, pos } = useMemo(() => {
    const st = buildStages();
    const p = st.map((s) => {
      const inv = new Array(N);
      s.forEach((v, i) => (inv[v] = i));
      return inv as number[];
    });
    return { states: st, pos: p };
  }, []);
  const geo = useMemo(() => new THREE.BoxGeometry(0.24, 1, 0.24), []);
  const mats = useMemo(
    () =>
      Array.from({ length: N }, (_, v) => {
        const c = palette(v / (N - 1));
        return new THREE.MeshStandardMaterial({ color: c.clone().multiplyScalar(0.2), emissive: c, emissiveIntensity: 0.6, roughness: 0.25, metalness: 0.3 });
      }),
    [],
  );
  const nStages = states.length - 1;
  const sf = (t - STAGE_T0) / STAGE_DT;
  const si = clamp(Math.floor(sf), 0, nStages);
  const sp = clamp(sf - si, 0, 1);
  const from = sf < 0 ? pos[0] : pos[Math.min(si, nStages)];
  const to = sf < 0 ? pos[0] : pos[Math.min(si + 1, nStages)];
  const done = cues.sortDone;
  return (
    <group>
      {Array.from({ length: N }, (_, v) => {
        const i0 = from[v];
        const i1 = to[v];
        const moving = i0 !== i1 && sf >= 0 && si < nStages;
        const e = ease.inOutCubic(Math.min(1, sp / 0.8));
        const idx = moving ? lerp(i0, i1, e) : sf >= nStages ? pos[nStages][v] : i0;
        const hop = moving ? Math.sin(Math.PI * e) * (0.25 + Math.abs(i1 - i0) * 0.03) : 0;
        const h = 0.3 + (v / (N - 1)) * 3.6;
        const rise = ease.outBack(clamp((t - 56.0 - v * 0.012) / 0.7));
        const x = (idx - (N - 1) / 2) * GAP;
        const sweep = t >= done ? Math.exp(-Math.pow((t - done) * 1.6 * N / 1.3 - idx, 2) / 18) : 0;
        const settled = t >= done + 0.85 ? 0.35 : 0;
        const m = mats[v];
        m.emissiveIntensity = 0.55 + (moving ? 1.1 * Math.sin(Math.PI * e) : 0) + sweep * 2.2 + settled * 0.6;
        if (sweep > 0.05) m.emissive.copy(palette(v / (N - 1)).lerp(new THREE.Color("#fff3d0"), Math.min(1, sweep)));
        else m.emissive.copy(palette(v / (N - 1)));
        return <mesh key={v} geometry={geo} material={m} position={[x, (h * rise) / 2 + hop, 0]} scale={[1, Math.max(0.001, h * rise), 1]} />;
      })}
    </group>
  );
};

export const S08Sort: React.FC<{ offset: number }> = ({ offset }) => {
  const tau = useTime();
  const t = tau + offset;
  const { width, height } = useVideoConfig();
  const p = ease.inOutSine(invLerp(56.0, 64.3, t));
  const outro = ease.inCubic(invLerp(63.5, 64.3, t));
  const camPos: [number, number, number] = [lerp(-8.5, 5.0, p), lerp(2.6, 3.6, p) + outro * 3, lerp(17.5, 15.5, p) - outro * 1.5];
  const look: [number, number, number] = [lerp(-2.5, 1.5, p), lerp(1.5, 1.7, p) + outro * 2, 0];
  const stagesDone = clamp(Math.floor((t - STAGE_T0) / STAGE_DT) + 1, 0, 21);
  const fadeIn = ease.outCubic(invLerp(56.0, 56.45, t));
  return (
    <AbsoluteFill style={{ background: "#010208", opacity: fadeIn * (1 - outro * 0.9) }}>
      <ThreeCanvas width={width} height={height} gl={{ antialias: true }} camera={{ fov: 38, position: [0, 2, 9] }}>
        <color attach="background" args={["#010208"]} />
        <fog attach="fog" args={["#010208", 16, 40]} />
        <ambientLight intensity={0.2} />
        <directionalLight position={[3, 8, 6]} intensity={1.2} />
        <CameraRig pos={camPos} look={look} fov={36} />
        <Bars t={t} />
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]}>
          <planeGeometry args={[80, 40]} />
          <MeshReflectorMaterial
            blur={[300, 80]}
            resolution={1024}
            mixBlur={0.8}
            mixStrength={3.2}
            roughness={0.85}
            depthScale={0.6}
            minDepthThreshold={0.4}
            maxDepthThreshold={1.4}
            color="#05070d"
            metalness={0.6}
            mirror={0.7}
          />
        </mesh>
        <Post bloom={0.95} threshold={0.45} radius={0.7} ca={0.0008} />
      </ThreeCanvas>
      <CourseTag zh="算法设计与分析" en="Design & Analysis of Algorithms" start={56.8 - offset} end={63.3 - offset} y={150} accent={C.gold} />
      <Hud
        right
        x={96}
        y={150}
        start={57.0 - offset}
        end={63.3 - offset}
        accent={C.gold}
        lines={["BITONIC SORT · 双调排序", "N = 64", `STAGE ${String(stagesDone).padStart(2, "0")} / 21`, `COMPARISONS ${stagesDone * 32}`, "O(n·log²n)"]}
      />
      <Caption zh="排序 · 让混沌归于秩序" en="Sorting: bringing order to chaos" start={58.2 - offset} end={63.0 - offset} y={845} size={52} accent={C.gold} backdrop={0.6} />
      <div style={{ position: "absolute", left: 0, right: 0, top: 790, textAlign: "center", fontFamily: F.mono, fontSize: 18, letterSpacing: "0.4em", color: C.gold, opacity: smoothstep(62.5, 62.8, t) * (1 - smoothstep(63.2, 63.5, t)) }}>
        ✓ SORTED
      </div>
    </AbsoluteFill>
  );
};
