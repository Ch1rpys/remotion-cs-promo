import React, { useMemo } from "react";
import { AbsoluteFill, useVideoConfig } from "remotion";
import { ThreeCanvas } from "@remotion/three";
import * as THREE from "three";
import { Caption, CourseTag, Hud, ScrambleText, useTime } from "../components/Text";
import { CameraRig, Post, instancedQuad, makeCanvasTexture } from "../three/common";
import { clamp, ease, invLerp, lerp, mulberry32, smoothstep } from "../lib/anim";
import { C, F } from "../theme";

const G = 22;
const SP = 2.2;
const ROAD = 0.9;
const START: [number, number] = [2, 18];
const GOAL: [number, number] = [19, 3];
const VISIT_T0 = 71.6;
const VISIT_T1 = 77.0;
const PATH_T0 = 77.0;
const PATH_T1 = 79.0;
const CAR_T0 = 79.0;
const CAR_T1 = 82.6;

const wx = (i: number) => (i - (G - 1) / 2) * SP;
const id = (i: number, j: number) => j * G + i;

const buildGraph = () => {
  const r = mulberry32(84);
  const edges: { a: number; b: number; w: number; blocked: boolean }[] = [];
  for (let j = 0; j < G; j++)
    for (let i = 0; i < G; i++) {
      if (i < G - 1) edges.push({ a: id(i, j), b: id(i + 1, j), w: 1 + r() * 1.6, blocked: r() < 0.1 });
      if (j < G - 1) edges.push({ a: id(i, j), b: id(i, j + 1), w: 1 + r() * 1.6, blocked: r() < 0.1 });
    }
  const adj: { to: number; w: number; e: number }[][] = Array.from({ length: G * G }, () => []);
  edges.forEach((e, k) => {
    if (e.blocked) return;
    adj[e.a].push({ to: e.b, w: e.w, e: k });
    adj[e.b].push({ to: e.a, w: e.w, e: k });
  });
  // Dijkstra
  const dist = new Array(G * G).fill(Infinity);
  const prevE = new Array(G * G).fill(-1);
  const prevN = new Array(G * G).fill(-1);
  const done = new Array(G * G).fill(false);
  const s = id(...START);
  const g = id(...GOAL);
  dist[s] = 0;
  const order: number[] = [];
  for (;;) {
    let u = -1;
    let best = Infinity;
    for (let k = 0; k < G * G; k++) if (!done[k] && dist[k] < best) ((best = dist[k]), (u = k));
    if (u < 0) break;
    done[u] = true;
    order.push(u);
    if (u === g) break;
    for (const { to, w, e } of adj[u])
      if (dist[u] + w < dist[to]) {
        dist[to] = dist[u] + w;
        prevE[to] = e;
        prevN[to] = u;
      }
  }
  const visitT = new Array(G * G).fill(-1);
  order.forEach((u, k) => (visitT[u] = VISIT_T0 + (k / (order.length - 1)) * (VISIT_T1 - VISIT_T0)));
  const edgeVisit = new Array(edges.length).fill(-1);
  order.forEach((u) => {
    if (prevE[u] >= 0) edgeVisit[prevE[u]] = visitT[u];
  });
  const pathNodes: number[] = [];
  for (let u = g; u >= 0; u = prevN[u]) pathNodes.unshift(u);
  const pathEdge = new Array(edges.length).fill(-1);
  for (let k = 1; k < pathNodes.length; k++) {
    const e = prevE[pathNodes[k]];
    pathEdge[e] = PATH_T0 + (k / (pathNodes.length - 1)) * (PATH_T1 - PATH_T0);
  }
  const pts = pathNodes.map((u) => [wx(u % G), wx(Math.floor(u / G))] as [number, number]);
  return { edges, edgeVisit, pathEdge, pts, visited: order.length, cost: dist[g] };
};

const pathAt = (pts: [number, number][], s: number) => {
  const segs = pts.length - 1;
  const total = segs * SP;
  const ss = clamp(s, 0, total);
  const k = Math.min(segs - 1, Math.floor(ss / SP));
  const f = (ss - k * SP) / SP;
  const a = pts[k];
  const b = pts[k + 1];
  return { x: lerp(a[0], b[0], f), z: lerp(a[1], b[1], f), dx: (b[0] - a[0]) / SP, dz: (b[1] - a[1]) / SP, total };
};

const buildingVS = /* glsl */ `
attribute float aSeed;
varying vec3 vPos; varying vec3 vN; varying float vSeed;
void main(){
  vec4 wp = modelMatrix * instanceMatrix * vec4(position, 1.0);
  vPos = wp.xyz; vSeed = aSeed;
  vN = normalize(mat3(modelMatrix * instanceMatrix) * normal);
  gl_Position = projectionMatrix * viewMatrix * wp;
}`;
const buildingFS = /* glsl */ `
uniform vec3 uCam; uniform float uTime; uniform vec3 uFog; uniform float uFogD;
varying vec3 vPos; varying vec3 vN; varying float vSeed;
float hash(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
void main(){
  vec3 n = normalize(vN);
  float diff = max(dot(n, normalize(vec3(-0.4, 0.8, 0.35))), 0.0);
  vec3 col = vec3(0.010, 0.014, 0.024) * (0.5 + 1.2 * diff);
  if (abs(n.y) < 0.5) {
    vec2 w = abs(n.x) > 0.5 ? vec2(vPos.z, vPos.y) : vec2(vPos.x, vPos.y);
    vec2 g = w * vec2(4.2, 3.4);
    vec2 cid = floor(g); vec2 f = fract(g);
    vec2 aa = fwidth(g);
    float win = smoothstep(0.18 - aa.x, 0.18 + aa.x, f.x) * smoothstep(0.82 + aa.x, 0.82 - aa.x, f.x) * smoothstep(0.25 - aa.y, 0.25 + aa.y, f.y) * smoothstep(0.75 + aa.y, 0.75 - aa.y, f.y);
    float lod = smoothstep(0.35, 0.8, max(aa.x, aa.y));
    float on = step(0.5, hash(cid + vSeed * 17.0));
    vec3 wc = mix(vec3(1.0, 0.68, 0.36), vec3(0.5, 0.78, 1.0), step(0.62, hash(cid * 1.7 + vSeed)));
    float flick = 0.85 + 0.15 * sin(uTime * (0.5 + hash(cid) * 2.0) + hash(cid + 9.0) * 6.28);
    float on2 = step(0.72, hash(cid + vSeed * 17.0));
    float lit = mix(win * on2, 0.1, lod);
    col += wc * lit * (0.35 + 0.65 * hash(cid + 3.3)) * flick;
    col += vec3(0.1, 0.3, 0.6) * 0.06 * smoothstep(0.6, 0.0, vPos.y);
  } else {
    col += vec3(0.012, 0.016, 0.024);
  }
  float d = length(vPos - uCam);
  float fog = 1.0 - exp(-pow(d * uFogD, 1.6));
  gl_FragColor = vec4(mix(col, uFog, fog), 1.0);
}`;

const roadVS = /* glsl */ `
attribute vec3 aCenter; attribute float aAxis; attribute float aVisit; attribute float aPath;
uniform float uWidth; uniform float uLen; uniform float uLift;
varying vec2 vUv; varying float vVisit; varying float vPath; varying vec3 vPos;
void main(){
  vec3 p = aCenter;
  p.y += uLift;
  vec2 q = position.xy;
  if (aAxis < 0.5) { p.x += q.x * uLen; p.z += q.y * uWidth; }
  else { p.z += q.x * uLen; p.x += q.y * uWidth; }
  vUv = uv; vVisit = aVisit; vPath = aPath; vPos = p;
  gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
}`;
const roadFS = /* glsl */ `
uniform float uTime; uniform vec3 uCam; uniform vec3 uFog; uniform float uFogD; uniform float uHalo;
varying vec2 vUv; varying float vVisit; varying float vPath; varying vec3 vPos;
void main(){
  float across = uHalo > 0.5 ? exp(-pow((vUv.y - 0.5) * 3.2, 2.0)) * 0.35 : exp(-pow((vUv.y - 0.5) * 4.0, 2.0));
  vec3 col = uHalo > 0.5 ? vec3(0.0) : vec3(0.014, 0.017, 0.025);
  float dash = step(0.5, fract(vUv.x * 5.0)) * (1.0 - smoothstep(0.03, 0.06, abs(vUv.y - 0.5)));
  if (uHalo < 0.5) col += vec3(0.05, 0.05, 0.045) * dash;
  if (vVisit > 0.0 && uTime >= vVisit) {
    float age = uTime - vVisit;
    float grow = clamp(age / 0.18, 0.0, 1.0);
    float along = step(vUv.x, grow + 0.001);
    float flash = exp(-age * 2.5);
    col += vec3(0.08, 0.6, 1.0) * along * across * (0.55 + 2.4 * flash);
  }
  if (vPath > 0.0 && uTime >= vPath) {
    float age = uTime - vPath;
    float grow = clamp(age / 0.12, 0.0, 1.0);
    vec3 gold = vec3(3.2, 1.8, 0.45) * (1.1 + 1.0 * exp(-age * 3.0));
    col = uHalo > 0.5 ? col + gold * across * step(vUv.x, grow + 0.001) : mix(col, gold, across * step(vUv.x, grow + 0.001));
  }
  float d = length(vPos - uCam);
  float fog = 1.0 - exp(-pow(d * uFogD, 1.6));
  gl_FragColor = uHalo > 0.5 ? vec4(col * (1.0 - fog), 1.0) : vec4(mix(col, uFog, fog), 1.0);
}`;

const FOG = new THREE.Color("#03060f");

const City: React.FC<{ t: number; cam: [number, number, number]; fogD: number }> = ({ t, cam, fogD }) => {
  const data = useMemo(() => {
    const graph = buildGraph();
    const r = mulberry32(12);
    const mats: THREE.Matrix4[] = [];
    const seeds: number[] = [];
    const tall: [number, number, number][] = [];
    const lot = SP - ROAD - 0.1;
    for (let j = 0; j < G - 1; j++)
      for (let i = 0; i < G - 1; i++) {
        const cx = (wx(i) + wx(i + 1)) / 2;
        const cz = (wx(j) + wx(j + 1)) / 2;
        const dc = Math.hypot(cx + 3, cz - 2) / 28;
        const hBase = 0.4 + 6.8 * Math.pow(Math.max(0, 1 - dc), 2.4);
        const split = r();
        const parts: [number, number, number, number][] =
          split < 0.35
            ? [[0, 0, 1, 1]]
            : split < 0.7
              ? [
                  [-0.25, 0, 0.48, 1],
                  [0.25, 0, 0.48, 1],
                ]
              : [
                  [-0.25, -0.25, 0.48, 0.48],
                  [0.25, -0.25, 0.48, 0.48],
                  [-0.25, 0.25, 0.48, 0.48],
                  [0.25, 0.25, 0.48, 0.48],
                ];
        for (const [ox, oz, sx, sz] of parts) {
          const h = Math.max(0.3, hBase * (0.45 + r() * 0.9));
          const m = new THREE.Matrix4().compose(
            new THREE.Vector3(cx + ox * lot, h / 2, cz + oz * lot),
            new THREE.Quaternion(),
            new THREE.Vector3(sx * lot * 0.94, h, sz * lot * 0.94),
          );
          mats.push(m);
          seeds.push(r());
          if (h > 6.6 && tall.length < 14) tall.push([cx + ox * lot, h + 0.1, cz + oz * lot]);
        }
      }
    const bGeo = new THREE.BoxGeometry(1, 1, 1);
    bGeo.setAttribute("aSeed", new THREE.InstancedBufferAttribute(new Float32Array(seeds), 1));
    const bMat = new THREE.ShaderMaterial({
      vertexShader: buildingVS,
      fragmentShader: buildingFS,
      uniforms: { uCam: { value: new THREE.Vector3() }, uTime: { value: 0 }, uFog: { value: FOG }, uFogD: { value: 0.02 } },
    });
    const bMesh = new THREE.InstancedMesh(bGeo, bMat, mats.length);
    mats.forEach((m, k) => bMesh.setMatrixAt(k, m));
    bMesh.instanceMatrix.needsUpdate = true;
    bMesh.frustumCulled = false;

    const E = graph.edges.length;
    const center = new Float32Array(E * 3);
    const axis = new Float32Array(E);
    const visit = new Float32Array(E);
    const path = new Float32Array(E);
    graph.edges.forEach((e, k) => {
      const ai = e.a % G;
      const aj = Math.floor(e.a / G);
      const horiz = e.b === e.a + 1;
      center.set([wx(ai) + (horiz ? SP / 2 : 0), 0.01, wx(aj) + (horiz ? 0 : SP / 2)], k * 3);
      axis[k] = horiz ? 0 : 1;
      visit[k] = e.blocked ? -1 : graph.edgeVisit[k];
      path[k] = graph.pathEdge[k];
    });
    const rGeo = instancedQuad();
    rGeo.setAttribute("aCenter", new THREE.InstancedBufferAttribute(center, 3));
    rGeo.setAttribute("aAxis", new THREE.InstancedBufferAttribute(axis, 1));
    rGeo.setAttribute("aVisit", new THREE.InstancedBufferAttribute(visit, 1));
    rGeo.setAttribute("aPath", new THREE.InstancedBufferAttribute(path, 1));
    rGeo.instanceCount = E;
    const rMat = new THREE.ShaderMaterial({
      vertexShader: roadVS,
      fragmentShader: roadFS,
      uniforms: { uTime: { value: 0 }, uCam: { value: new THREE.Vector3() }, uFog: { value: FOG }, uFogD: { value: 0.02 }, uHalo: { value: 0 }, uWidth: { value: ROAD }, uLen: { value: SP }, uLift: { value: 0 } },
      side: THREE.DoubleSide,
    });
    const hMat = rMat.clone();
    hMat.uniforms = THREE.UniformsUtils.clone(rMat.uniforms);
    hMat.uniforms.uHalo.value = 1;
    hMat.uniforms.uWidth.value = 3.2;
    hMat.uniforms.uLen.value = SP + 0.6;
    hMat.uniforms.uLift.value = 0.05;
    hMat.blending = THREE.AdditiveBlending;
    hMat.transparent = true;
    hMat.depthWrite = false;
    const glow = makeCanvasTexture(128, 128, (ctx) => {
      const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
      g.addColorStop(0, "rgba(255,255,255,1)");
      g.addColorStop(0.25, "rgba(255,255,255,0.5)");
      g.addColorStop(1, "rgba(255,255,255,0)");
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, 128, 128);
    });
    const beam = makeCanvasTexture(64, 256, (ctx) => {
      const g = ctx.createLinearGradient(0, 0, 0, 256);
      g.addColorStop(0, "rgba(255,255,255,0)");
      g.addColorStop(1, "rgba(255,255,255,1)");
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, 64, 256);
      const h = ctx.createLinearGradient(0, 0, 64, 0);
      h.addColorStop(0, "rgba(0,0,0,1)");
      h.addColorStop(0.5, "rgba(0,0,0,0)");
      h.addColorStop(1, "rgba(0,0,0,1)");
      ctx.globalCompositeOperation = "destination-out";
      ctx.fillStyle = h;
      ctx.fillRect(0, 0, 64, 256);
    });
    return { graph, bMesh, bMat, rGeo, rMat, hMat, glow, beam, tall };
  }, []);
  data.bMat.uniforms.uCam.value.set(...cam);
  data.bMat.uniforms.uTime.value = t;
  data.bMat.uniforms.uFogD.value = fogD;
  data.rMat.uniforms.uTime.value = t;
  data.rMat.uniforms.uCam.value.set(...cam);
  data.rMat.uniforms.uFogD.value = fogD;
  data.hMat.uniforms.uTime.value = t;
  data.hMat.uniforms.uCam.value.set(...cam);
  data.hMat.uniforms.uFogD.value = fogD;
  const { pts } = data.graph;
  const carP = ease.inOutSine(invLerp(CAR_T0, CAR_T1, t));
  const showCar = t >= CAR_T0 - 0.2;
  const trail = Array.from({ length: 16 }, (_, k) => pathAt(pts, carP * (pts.length - 1) * SP - k * 0.35));
  const s0 = [wx(START[0]), wx(START[1])];
  const g0 = [wx(GOAL[0]), wx(GOAL[1])];
  const beacon = (x: number, z: number, col: THREE.Color, amp: number) => (
    <group position={[x, 0, z]}>
      <mesh position={[0, 6, 0]}>
        <planeGeometry args={[0.9, 12]} />
        <meshBasicMaterial map={data.beam} color={col.clone().multiplyScalar(amp)} transparent blending={THREE.AdditiveBlending} depthWrite={false} side={THREE.DoubleSide} toneMapped={false} />
      </mesh>
      <mesh position={[0, 6, 0]} rotation={[0, Math.PI / 2, 0]}>
        <planeGeometry args={[0.9, 12]} />
        <meshBasicMaterial map={data.beam} color={col.clone().multiplyScalar(amp)} transparent blending={THREE.AdditiveBlending} depthWrite={false} side={THREE.DoubleSide} toneMapped={false} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.03, 0]}>
        <ringGeometry args={[0.5 + ((t * 1.2) % 1) * 1.4, 0.62 + ((t * 1.2) % 1) * 1.4, 48]} />
        <meshBasicMaterial color={col.clone().multiplyScalar(2 * (1 - ((t * 1.2) % 1)))} transparent blending={THREE.AdditiveBlending} depthWrite={false} toneMapped={false} />
      </mesh>
    </group>
  );
  return (
    <>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.01, 0]}>
        <planeGeometry args={[400, 400]} />
        <meshBasicMaterial color="#020409" />
      </mesh>
      <primitive object={data.bMesh} />
      <mesh geometry={data.rGeo} material={data.rMat} frustumCulled={false} />
      <mesh geometry={data.rGeo} material={data.hMat} frustumCulled={false} renderOrder={5} />
      {beacon(s0[0], s0[1], new THREE.Color(0.3, 1.6, 3.0), 1)}
      {beacon(g0[0], g0[1], new THREE.Color(3.0, 1.7, 0.4), 1)}
      {data.tall.map((p, k) => (
        <sprite key={k} position={p} scale={[0.5, 0.5, 1]}>
          <spriteMaterial map={data.glow} color={new THREE.Color(3, 0.2, 0.15).multiplyScalar(0.3 + 0.7 * (Math.sin(t * 3 + k) > 0.3 ? 1 : 0.1))} blending={THREE.AdditiveBlending} depthWrite={false} toneMapped={false} />
        </sprite>
      ))}
      {showCar
        ? trail.map((q, k) => (
            <sprite key={k} position={[q.x, 0.25, q.z]} scale={[k === 0 ? 1.1 : 0.7 - k * 0.03, k === 0 ? 1.1 : 0.7 - k * 0.03, 1]}>
              <spriteMaterial map={data.glow} color={new THREE.Color(3.5, 2.6, 1.4).multiplyScalar(k === 0 ? 1.4 : 0.6 * (1 - k / 16))} blending={THREE.AdditiveBlending} depthWrite={false} toneMapped={false} />
            </sprite>
          ))
        : null}
    </>
  );
};

const project = (pos: [number, number, number], look: [number, number, number], fov: number, p: [number, number, number]) => {
  const c = new THREE.PerspectiveCamera(fov, 1920 / 1080, 0.1, 1000);
  c.position.set(...pos);
  c.lookAt(...look);
  c.updateMatrixWorld();
  c.updateProjectionMatrix();
  const v = new THREE.Vector3(...p).project(c);
  return { x: ((v.x + 1) / 2) * 1920, y: ((1 - v.y) / 2) * 1080, vis: v.z < 1 };
};

export const S10City: React.FC<{ offset: number }> = ({ offset }) => {
  const tau = useTime();
  const t = tau + offset;
  const { width, height } = useVideoConfig();
  const graph = useMemo(buildGraph, []);
  const pts = graph.pts;
  // orbit camera
  const d = ease.outCubic(invLerp(70.0, 72.4, t));
  const orbitA = lerp(0.35, 1.0, ease.inOutSine(invLerp(70.0, 79.2, t)));
  const orbitR = lerp(52, 29, d);
  const orbitH = lerp(70, 37, d);
  const center: [number, number, number] = [1, 0, 0];
  let pos: [number, number, number] = [center[0] + Math.sin(orbitA) * orbitR, orbitH, center[2] + Math.cos(orbitA) * orbitR];
  let look: [number, number, number] = [center[0], 0, center[2]];
  let up: [number, number, number] | undefined;
  // chase camera
  const total = (pts.length - 1) * SP;
  const carS = ease.inOutSine(invLerp(CAR_T0, CAR_T1, t)) * total;
  const behind = pathAt(pts, carS - 7.5);
  const ahead = pathAt(pts, carS + 7);
  const chasePos: [number, number, number] = [behind.x, 7.2, behind.z];
  const chaseLook: [number, number, number] = [ahead.x, 0.0, ahead.z];
  const chase = ease.inOutCubic(invLerp(78.9, 79.8, t)) * (1 - ease.inOutCubic(invLerp(82.3, 83.0, t)));
  pos = pos.map((v, k) => lerp(v, chasePos[k], chase)) as [number, number, number];
  look = look.map((v, k) => lerp(v, chaseLook[k], chase)) as [number, number, number];
  // final rise
  const rise = ease.inCubic(invLerp(82.3, 84.3, t));
  if (t > 82.3) {
    const end = pathAt(pts, total);
    const rp: [number, number, number] = [end.x - end.dx * 0.01, lerp(6, 150, rise), end.z - end.dz * 0.01 + 0.01];
    const k = ease.inOutCubic(invLerp(82.3, 83.2, t));
    pos = pos.map((v, i) => lerp(v, rp[i], k)) as [number, number, number];
    look = look.map((v, i) => lerp(v, [end.x, 0, end.z][i], k)) as [number, number, number];
    if (k > 0.5) up = [end.dx, 0, end.dz];
  }
  const fov = lerp(40, 55, chase);
  const fogD = lerp(0.014, 0.024, chase);
  const fadeIn = ease.outCubic(invLerp(70.0, 70.6, t));
  const fadeOut = ease.inCubic(invLerp(83.4, 84.3, t));
  const sLabel = project(pos, look, fov, [wx(START[0]), 3.2, wx(START[1])]);
  const gLabel = project(pos, look, fov, [wx(GOAL[0]), 3.2, wx(GOAL[1])]);
  const labelOp = smoothstep(71.0, 71.6, t) * (1 - smoothstep(78.6, 79.0, t));
  const visitedNow = Math.round(graph.visited * clamp(invLerp(VISIT_T0, VISIT_T1, t)));
  return (
    <AbsoluteFill style={{ background: "#03060f", opacity: fadeIn * (1 - fadeOut) }}>
      <ThreeCanvas width={width} height={height} gl={{ antialias: true }} camera={{ fov: 40, position: [30, 30, 30], near: 0.1, far: 600 }}>
        <color attach="background" args={["#03060f"]} />
        <CameraRig pos={pos} look={look} fov={fov} up={up} near={0.1} far={600} />
        <City t={t} cam={pos} fogD={fogD} />
        <Post bloom={1.15} threshold={0.3} radius={0.8} ca={0.0008 + 0.002 * chase} />
      </ThreeCanvas>
      {sLabel.vis ? (
        <div style={{ position: "absolute", left: sLabel.x, top: sLabel.y - 70, transform: "translateX(-50%)", opacity: labelOp, textAlign: "center" }}>
          <div style={{ fontFamily: F.sans, fontSize: 22, fontWeight: 600, color: "#fff", textShadow: `0 0 12px ${C.cyan}` }}>起点</div>
          <div style={{ fontFamily: F.mono, fontSize: 13, letterSpacing: "0.3em", color: C.cyan }}>START</div>
        </div>
      ) : null}
      {gLabel.vis ? (
        <div style={{ position: "absolute", left: gLabel.x, top: gLabel.y - 70, transform: "translateX(-50%)", opacity: labelOp, textAlign: "center" }}>
          <div style={{ fontFamily: F.sans, fontSize: 22, fontWeight: 600, color: "#fff", textShadow: `0 0 12px ${C.gold}` }}>终点</div>
          <div style={{ fontFamily: F.mono, fontSize: 13, letterSpacing: "0.3em", color: C.gold }}>DESTINATION</div>
        </div>
      ) : null}
      <CourseTag zh="离散数学 · 图论" en="Discrete Mathematics · Graph Theory" start={70.8 - offset} end={78.6 - offset} y={150} />
      <Hud
        right
        x={96}
        y={150}
        start={71.4 - offset}
        end={78.8 - offset}
        lines={["DIJKSTRA · 最短路径", "dist[v] = min(dist[v], dist[u] + w)", `VISITED  ${visitedNow}`, t >= PATH_T0 ? `PATH  ${(graph.cost * 0.42).toFixed(1)} km` : "PATH  —"]}
      />
      <Caption zh="每一次导航的背后，都是一条最短路径" en="Behind every navigation lies a shortest path" start={72.6 - offset} end={78.5 - offset} y={850} size={50} backdrop={0.8} />
      {t > 79.2 && t < 82.6 ? (
        <div style={{ position: "absolute", left: 0, right: 0, top: 150, textAlign: "center", opacity: smoothstep(79.2, 79.6, t) * (1 - smoothstep(82.0, 82.5, t)) }}>
          <ScrambleText text="ROUTE FOUND · 已为您规划最优路线" t0={79.2 - offset} dur={0.8} style={{ fontFamily: F.sans, fontSize: 22, letterSpacing: "0.3em", color: C.gold, textShadow: "0 0 12px rgba(0,0,0,0.9)" }} />
        </div>
      ) : null}
    </AbsoluteFill>
  );
};
