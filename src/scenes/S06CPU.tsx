import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { AbsoluteFill, useDelayRender, useVideoConfig } from "remotion";
import { ThreeCanvas } from "@remotion/three";
import { useThree } from "@react-three/fiber";
import * as THREE from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { BigTitle, Hud, useTime } from "../components/Text";
import { CameraRig, Post, makeCanvasTexture } from "../three/common";
import { clamp, ease, fbm1, invLerp, lerp, mulberry32, smoothstep } from "../lib/anim";

const BOARD = 44;
const TEX = 4096;
type P2 = [number, number];

const offsetPolyline = (pts: P2[], d: number): P2[] => {
  const out: P2[] = [];
  for (let i = 0; i < pts.length; i++) {
    const prev = pts[Math.max(0, i - 1)];
    const next = pts[Math.min(pts.length - 1, i + 1)];
    const n1 = i > 0 ? norm2([-(pts[i][1] - prev[1]), pts[i][0] - prev[0]]) : null;
    const n2 = i < pts.length - 1 ? norm2([-(next[1] - pts[i][1]), next[0] - pts[i][0]]) : null;
    let n: P2;
    if (n1 && n2) {
      const m = norm2([n1[0] + n2[0], n1[1] + n2[1]]);
      const c = m[0] * n1[0] + m[1] * n1[1];
      n = [m[0] / c, m[1] / c];
    } else n = (n1 ?? n2)!;
    out.push([pts[i][0] + n[0] * d, pts[i][1] + n[1] * d]);
  }
  return out;
};
const norm2 = (v: P2): P2 => {
  const l = Math.hypot(v[0], v[1]) || 1;
  return [v[0] / l, v[1] / l];
};

const genTraces = () => {
  const r = mulberry32(2026);
  const bus: P2[][] = [];
  const misc: P2[][] = [];
  const sides: [P2, P2][] = [
    [[1, 0], [0, 1]],
    [[-1, 0], [0, 1]],
    [[0, 1], [1, 0]],
    [[0, -1], [1, 0]],
  ];
  for (const [d, p] of sides) {
    for (let b = 0; b < 3; b++) {
      const n = 7 + Math.floor(r() * 9);
      const lat = (b - 1) * 1.55 + (r() - 0.5) * 0.3;
      const L1 = 0.5 + r() * 1.0;
      const bend = r() < 0.5 ? -1 : 1;
      const L2 = 0.8 + r() * 2.6;
      const L3 = 3 + r() * 14;
      const s: P2 = [d[0] * 3.15 + p[0] * lat, d[1] * 3.15 + p[1] * lat];
      const p1: P2 = [s[0] + d[0] * L1, s[1] + d[1] * L1];
      const k = Math.SQRT1_2;
      const p2: P2 = [p1[0] + (d[0] + p[0] * bend) * k * L2, p1[1] + (d[1] + p[1] * bend) * k * L2];
      const p3: P2 = [p2[0] + d[0] * L3, p2[1] + d[1] * L3];
      const center = [s, p1, p2, p3];
      for (let i = 0; i < n; i++) bus.push(offsetPolyline(center, (i - (n - 1) / 2) * 0.1));
    }
  }
  for (let i = 0; i < 260; i++) {
    let x = (r() - 0.5) * BOARD;
    let z = (r() - 0.5) * BOARD;
    if (Math.abs(x) < 4 && Math.abs(z) < 4) continue;
    const pts: P2[] = [[x, z]];
    let dir = Math.floor(r() * 8);
    for (let k = 0; k < 3 + Math.floor(r() * 3); k++) {
      const a = (dir * Math.PI) / 4;
      const L = 0.5 + r() * 4;
      x += Math.cos(a) * L;
      z += Math.sin(a) * L;
      pts.push([x, z]);
      dir = (dir + (r() < 0.5 ? 1 : 7)) % 8;
    }
    misc.push(pts);
  }
  return { bus, misc };
};

const w2t = (v: number) => (v / BOARD + 0.5) * TEX;

const EnvSetup: React.FC<{ intensity: number }> = ({ intensity }) => {
  const { gl, scene } = useThree();
  useMemo(() => {
    const pm = new THREE.PMREMGenerator(gl);
    scene.environment = pm.fromScene(new RoomEnvironment(), 0.04).texture;
  }, [gl, scene]);
  scene.environmentIntensity = intensity;
  return null;
};

type Pulse = { trace: number; speed: number; len: number; phase: number; col: [number, number, number] };

const Board: React.FC<{ tau: number; beat: number }> = ({ tau, beat }) => {
  const data = useMemo(() => {
    const { bus, misc } = genTraces();
    const boardTex = makeCanvasTexture(
      TEX,
      TEX,
      (ctx) => {
        ctx.fillStyle = "#07100d";
        ctx.fillRect(0, 0, TEX, TEX);
        const r = mulberry32(9);
        for (let i = 0; i < 14000; i++) {
          ctx.fillStyle = `rgba(${20 + r() * 20},${40 + r() * 30},${34 + r() * 20},${0.05 + r() * 0.06})`;
          ctx.fillRect(r() * TEX, r() * TEX, 2 + r() * 10, 2 + r() * 10);
        }
        ctx.lineCap = "round";
        ctx.lineJoin = "round";
        const drawPoly = (pts: P2[], w: number, col: string) => {
          ctx.strokeStyle = col;
          ctx.lineWidth = w;
          ctx.beginPath();
          pts.forEach((p, i) => (i ? ctx.lineTo(w2t(p[0]), w2t(p[1])) : ctx.moveTo(w2t(p[0]), w2t(p[1]))));
          ctx.stroke();
        };
        misc.forEach((pts) => drawPoly(pts, 3.2, "rgba(150,110,45,0.55)"));
        bus.forEach((pts) => drawPoly(pts, 3.6, "rgba(200,150,60,0.8)"));
        ctx.fillStyle = "rgba(210,170,80,0.9)";
        [...misc.map((m) => m[m.length - 1]), ...misc.map((m) => m[0]), ...bus.map((b) => b[b.length - 1])].forEach((p) => {
          ctx.beginPath();
          ctx.arc(w2t(p[0]), w2t(p[1]), 6, 0, Math.PI * 2);
          ctx.fill();
        });
        ctx.fillStyle = "rgba(230,240,235,0.5)";
        ctx.font = "bold 26px Menlo, monospace";
        for (let i = 0; i < 70; i++) {
          const x = r() * TEX;
          const y = r() * TEX;
          if (Math.abs(x - TEX / 2) < 420 && Math.abs(y - TEX / 2) < 420) continue;
          ctx.fillText(["C", "R", "L", "U", "Q", "D"][Math.floor(r() * 6)] + Math.floor(r() * 99), x, y);
        }
        ctx.strokeStyle = "rgba(230,240,235,0.35)";
        ctx.lineWidth = 3;
        ctx.strokeRect(TEX / 2 - 360, TEX / 2 - 360, 720, 720);
        ctx.font = "bold 40px Menlo, monospace";
        ctx.fillText("CPU1", TEX / 2 - 350, TEX / 2 - 375);
      },
      { srgb: true },
    );
    const emisTex = makeCanvasTexture(TEX / 2, TEX / 2, (ctx) => {
      ctx.fillStyle = "#000";
      ctx.fillRect(0, 0, TEX / 2, TEX / 2);
      ctx.strokeStyle = "rgba(255,170,60,1)";
      ctx.lineWidth = 1.8;
      bus.forEach((pts) => {
        ctx.beginPath();
        pts.forEach((p, i) => (i ? ctx.lineTo(w2t(p[0]) / 2, w2t(p[1]) / 2) : ctx.moveTo(w2t(p[0]) / 2, w2t(p[1]) / 2)));
        ctx.stroke();
      });
    });
    // pulses on bus traces, travelling inward
    const inbound = bus.map((b) => [...b].reverse());
    const cum = inbound.map((pts) => {
      const c = [0];
      for (let i = 1; i < pts.length; i++) c.push(c[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
      return c;
    });
    const r = mulberry32(77);
    const pulses: Pulse[] = [];
    for (let i = 0; i < 220; i++) {
      const q = r();
      pulses.push({
        trace: Math.floor(r() * inbound.length),
        speed: 4 + r() * 7,
        len: 0.7 + r() * 1.6,
        phase: r() * 20,
        col: q > 0.9 ? [3.2, 1.9, 0.5] : q > 0.72 ? [2.6, 2.6, 2.8] : [0.35, 2.0, 3.2],
      });
    }
    const K = 14;
    const nv = pulses.length * K * 2;
    const pos = new Float32Array(nv * 3);
    const col = new Float32Array(nv * 3);
    const idx: number[] = [];
    for (let p = 0; p < pulses.length; p++) {
      for (let k = 0; k < K - 1; k++) {
        const a = (p * K + k) * 2;
        idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    geo.setAttribute("color", new THREE.BufferAttribute(col, 3));
    geo.setIndex(idx);
    const mat = new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, side: THREE.DoubleSide });
    return { boardTex, emisTex, inbound, cum, pulses, geo, mat, K };
  }, []);

  // update pulse ribbons
  const { inbound, cum, pulses, geo, K } = data;
  const pos = geo.getAttribute("position") as THREE.BufferAttribute;
  const col = geo.getAttribute("color") as THREE.BufferAttribute;
  const sample = (ti: number, s: number): [number, number, number, number] => {
    const pts = inbound[ti];
    const c = cum[ti];
    const L = c[c.length - 1];
    const ss = Math.max(0, Math.min(L, s));
    let i = 1;
    while (i < c.length - 1 && c[i] < ss) i++;
    const f = (ss - c[i - 1]) / Math.max(1e-6, c[i] - c[i - 1]);
    const x = pts[i - 1][0] + (pts[i][0] - pts[i - 1][0]) * f;
    const z = pts[i - 1][1] + (pts[i][1] - pts[i - 1][1]) * f;
    const tx = pts[i][0] - pts[i - 1][0];
    const tz = pts[i][1] - pts[i - 1][1];
    const tl = Math.hypot(tx, tz) || 1;
    return [x, z, -tz / tl, tx / tl];
  };
  const surge = 1 + 0.6 * beat;
  for (let p = 0; p < pulses.length; p++) {
    const pu = pulses[p];
    const L = cum[pu.trace][cum[pu.trace].length - 1];
    const cycle = L + pu.len + 2;
    const head = ((tau + pu.phase) * pu.speed) % cycle;
    for (let k = 0; k < K; k++) {
      const f = k / (K - 1);
      const s = head - pu.len * (1 - f);
      const [x, z, nx, nz] = sample(pu.trace, s);
      const valid = s >= 0 && s <= L ? 1 : 0;
      const w = 0.035 + 0.02 * f;
      const a = (p * K + k) * 2;
      pos.setXYZ(a, x + nx * w, 0.012, z + nz * w);
      pos.setXYZ(a + 1, x - nx * w, 0.012, z - nz * w);
      const b = valid * Math.pow(f, 1.8) * surge;
      col.setXYZ(a, pu.col[0] * b, pu.col[1] * b, pu.col[2] * b);
      col.setXYZ(a + 1, pu.col[0] * b, pu.col[1] * b, pu.col[2] * b);
    }
  }
  pos.needsUpdate = true;
  col.needsUpdate = true;

  return (
    <>
      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[BOARD, BOARD]} />
        <meshStandardMaterial map={data.boardTex} emissiveMap={data.emisTex} emissive={new THREE.Color("#ffae40")} emissiveIntensity={0.1 + 0.08 * beat} roughness={0.55} metalness={0.25} />
      </mesh>
      <mesh geometry={geo} material={data.mat} frustumCulled={false} />
    </>
  );
};

const ENGRAVE_FONTS = ["900 190px Orbitron", "700 118px NotoSansSC"];

/** Canvas text needs the web fonts decoded first: hold the frame, then redraw once they are. */
const useCanvasFonts = (specs: string[]) => {
  const { advance } = useThree();
  const { delayRender, continueRender } = useDelayRender();
  const [ready, setReady] = useState(() => specs.every((s) => document.fonts.check(s)));
  const handle = useRef<number | null>(null);
  useLayoutEffect(() => {
    if (ready) return;
    handle.current = delayRender("loading fonts for the CPU engraving");
    let alive = true;
    Promise.all(specs.map((s) => document.fonts.load(s)))
      .catch(() => null)
      .then(() => {
        if (alive) setReady(true);
      });
    return () => {
      alive = false;
      if (handle.current !== null) continueRender(handle.current);
      handle.current = null;
    };
  }, []);
  useEffect(() => {
    if (!ready || handle.current === null) return;
    const h = handle.current;
    const id = setTimeout(() => {
      advance(performance.now());
      continueRender(h);
      if (handle.current === h) handle.current = null;
    }, 0);
    return () => clearTimeout(id);
  }, [ready]);
  return ready;
};

const drawBrand = (ctx: CanvasRenderingContext2D, color: string) => {
  ctx.fillStyle = color;
  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";
  let size = 200;
  ctx.font = `900 ${size}px Orbitron, Menlo, sans-serif`;
  const w = ctx.measureText("Ch1rpy").width;
  if (w > 820) size = (size * 820) / w;
  ctx.font = `900 ${size}px Orbitron, Menlo, sans-serif`;
  ctx.fillText("Ch1rpy", 512, 600);
  ctx.font = "700 118px NotoSansSC, 'PingFang SC', sans-serif";
  ctx.letterSpacing = "40px";
  ctx.fillText("万炯鸣", 512 + 20, 790);
  ctx.letterSpacing = "0px";
};

const Chip: React.FC<{ beat: number; t: number }> = ({ beat, t }) => {
  const fontsReady = useCanvasFonts(ENGRAVE_FONTS);
  const tex = useMemo(() => {
    const ihs = makeCanvasTexture(
      1024,
      1024,
      (ctx) => {
        const r = mulberry32(3);
        ctx.fillStyle = "#b9c0c9";
        ctx.fillRect(0, 0, 1024, 1024);
        for (let i = 0; i < 2600; i++) {
          ctx.fillStyle = `rgba(${r() < 0.5 ? 255 : 90},${r() < 0.5 ? 255 : 100},${r() < 0.5 ? 255 : 110},${0.03 + r() * 0.05})`;
          ctx.fillRect(0, r() * 1024, 1024, 1 + r() * 2);
        }
        ctx.fillStyle = "rgba(60,66,76,0.75)";
        ctx.textAlign = "center";
        ctx.font = "700 64px Menlo, monospace";
        ctx.fillText("</>", 512, 178);
        ctx.font = "700 40px Menlo, monospace";
        ctx.fillText("CS-2026 · 24-CORE · 5.0GHz · 3nm", 512, 262);
        ctx.font = "600 30px Menlo, monospace";
        ctx.fillText("COMPUTER SCIENCE & TECHNOLOGY", 512, 318);
        ctx.fillRect(250, 372, 524, 3);
        drawBrand(ctx, "rgba(52,58,68,0.85)");
        for (let y = 0; y < 8; y++)
          for (let x = 0; x < 8; x++) if (r() < 0.5) ctx.fillRect(84 + x * 11, 872 + y * 11, 10, 10);
        ctx.beginPath();
        ctx.moveTo(60, 60);
        ctx.lineTo(120, 60);
        ctx.lineTo(60, 120);
        ctx.fill();
      },
      { srgb: true },
    );
    const brand = makeCanvasTexture(1024, 1024, (ctx) => {
      ctx.fillStyle = "#000";
      ctx.fillRect(0, 0, 1024, 1024);
      drawBrand(ctx, "#fff");
    });
    const sub = makeCanvasTexture(
      1024,
      1024,
      (ctx) => {
        ctx.fillStyle = "#0c3326";
        ctx.fillRect(0, 0, 1024, 1024);
        ctx.fillStyle = "#c9a14a";
        for (let i = 0; i < 44; i++) {
          const p = 40 + i * 21.8;
          ctx.fillRect(p, 14, 12, 26);
          ctx.fillRect(p, 984, 12, 26);
          ctx.fillRect(14, p, 26, 12);
          ctx.fillRect(984, p, 26, 12);
        }
      },
      { srgb: true },
    );
    return { ihs, brand, sub };
  }, [fontsReady]);
  const mats = useMemo(() => {
    const top = new THREE.MeshPhysicalMaterial({
      color: "#d6dbe2",
      map: tex.ihs,
      metalness: 1,
      roughness: 0.26,
      clearcoat: 0.5,
      clearcoatRoughness: 0.2,
      emissive: new THREE.Color(1.0, 0.8, 0.52),
      emissiveMap: tex.brand,
      emissiveIntensity: 1,
    });
    const u = { uSweep: { value: -1 }, uBase: { value: 0.1 }, uAmp: { value: 3.2 } };
    top.onBeforeCompile = (sh) => {
      Object.assign(sh.uniforms, u);
      sh.fragmentShader =
        "uniform float uSweep; uniform float uBase; uniform float uAmp;\n" +
        sh.fragmentShader.replace(
          "#include <emissivemap_fragment>",
          `#ifdef USE_EMISSIVEMAP
            vec4 emissiveColor = texture2D( emissiveMap, vEmissiveMapUv );
            float band = exp(-pow((vEmissiveMapUv.x + (1.0 - vEmissiveMapUv.y) * 0.3 - uSweep) * 5.0, 2.0));
            totalEmissiveRadiance *= emissiveColor.rgb * (uBase + band * uAmp);
          #endif`,
        );
    };
    const side = new THREE.MeshPhysicalMaterial({ color: "#c3c9d1", metalness: 1, roughness: 0.3, clearcoat: 0.4 });
    return { top, side, u };
  }, [tex]);
  mats.u.uSweep.value = lerp(-0.4, 1.7, clamp((t - 45.45) / 1.0));
  mats.u.uBase.value = lerp(0.1, 0.42, smoothstep(45.9, 46.8, t));
  const caps = useMemo(() => {
    const out: [number, number][] = [];
    for (let i = 0; i < 18; i++) {
      const f = -2.55 + (i / 17) * 5.1;
      out.push([f, 2.72], [f, -2.72], [2.72, f], [-2.72, f]);
    }
    return out;
  }, []);
  const g = 0.5 + 1.2 * beat;
  return (
    <group>
      <mesh position={[0, 0.08, 0]}>
        <boxGeometry args={[6.0, 0.16, 6.0]} />
        <meshStandardMaterial map={tex.sub} roughness={0.5} metalness={0.3} />
      </mesh>
      {caps.map((c, i) => (
        <mesh key={i} position={[c[0], 0.2, c[1]]}>
          <boxGeometry args={[0.1, 0.07, 0.18]} />
          <meshStandardMaterial color="#b58a55" roughness={0.4} metalness={0.5} />
        </mesh>
      ))}
      <mesh position={[0, 0.175, 0]}>
        <boxGeometry args={[4.82, 0.035, 4.82]} />
        <meshBasicMaterial color={new THREE.Color(0.25 * g, 1.6 * g, 2.4 * g)} toneMapped={false} />
      </mesh>
      <mesh position={[0, 0.36, 0]} material={[mats.side, mats.side, mats.top, mats.side, mats.side, mats.side]}>
        <boxGeometry args={[4.6, 0.36, 4.6]} />
      </mesh>
    </group>
  );
};

const Components: React.FC<{ beat: number }> = ({ beat }) => {
  const chokes = useMemo(() => {
    const out: [number, number][] = [];
    for (let i = 0; i < 8; i++) out.push([-4.2 + i * 1.2, -5.4]);
    for (let i = 0; i < 6; i++) out.push([-5.4, -3.6 + i * 1.2]);
    return out;
  }, []);
  const capsBig = useMemo(() => {
    const out: [number, number][] = [];
    for (let i = 0; i < 9; i++) out.push([-4.6 + i * 1.15, -7.1]);
    for (let i = 0; i < 5; i++) out.push([-7.1, -3.2 + i * 1.3]);
    return out;
  }, []);
  const rgb = 0.6 + 1.4 * beat;
  return (
    <group>
      {chokes.map((c, i) => (
        <group key={i} position={[c[0], 0, c[1]]}>
          <mesh position={[0, 0.3, 0]}>
            <boxGeometry args={[0.9, 0.6, 0.9]} />
            <meshStandardMaterial color="#3a3e46" roughness={0.45} metalness={0.7} />
          </mesh>
          <mesh position={[0, 0.07, 0.75]}>
            <boxGeometry args={[0.55, 0.14, 0.4]} />
            <meshStandardMaterial color="#111317" roughness={0.6} metalness={0.2} />
          </mesh>
        </group>
      ))}
      {capsBig.map((c, i) => (
        <group key={i} position={[c[0], 0, c[1]]}>
          <mesh position={[0, 0.45, 0]}>
            <cylinderGeometry args={[0.3, 0.3, 0.9, 32]} />
            <meshStandardMaterial color="#1a1e29" roughness={0.35} metalness={0.4} />
          </mesh>
          <mesh position={[0, 0.905, 0]}>
            <cylinderGeometry args={[0.27, 0.27, 0.02, 32]} />
            <meshStandardMaterial color="#c9ced6" roughness={0.2} metalness={1} />
          </mesh>
        </group>
      ))}
      {[6.6, 7.5, 8.4, 9.3].map((x, i) => (
        <group key={i} position={[x, 0, 0.4]}>
          <mesh position={[0, 0.14, 0]}>
            <boxGeometry args={[0.36, 0.28, 13]} />
            <meshStandardMaterial color="#15171c" roughness={0.6} metalness={0.2} />
          </mesh>
          {i % 2 === 0 ? (
            <>
              <mesh position={[0, 0.95, 0]}>
                <boxGeometry args={[0.2, 1.4, 12.2]} />
                <meshStandardMaterial color="#2b2f36" roughness={0.3} metalness={0.9} />
              </mesh>
              <mesh position={[0, 1.67, 0]}>
                <boxGeometry args={[0.16, 0.05, 12]} />
                <meshBasicMaterial color={new THREE.Color(0.3 * rgb, 1.5 * rgb, 2.6 * rgb)} toneMapped={false} />
              </mesh>
            </>
          ) : null}
        </group>
      ))}
    </group>
  );
};

export const S06CPU: React.FC<{ offset: number }> = ({ offset }) => {
  const tau = useTime();
  const t = tau + offset;
  const { width, height } = useVideoConfig();
  const bp = (t - 44) % 0.5;
  const beat = Math.exp(-bp * 9) * (t >= 44 ? 1 : 0);
  const a = ease.outQuart(invLerp(0, 2.6, tau));
  const orbit = ease.inOutSine(invLerp(2.2, 8.4, tau));
  const outro = ease.inOutCubic(invLerp(7.3, 8.4, tau));
  const rad = lerp(5.6, 12.5, a) - 2.0 * orbit + outro * 4;
  const elev = lerp(0.1, 0.5, a) + outro * 0.35;
  const az = lerp(0.55, 0.14, a) - 0.45 * orbit;
  const shake = Math.max(0, 1 - tau / 0.45);
  const sx = fbm1(tau * 18, 1) * 0.12 * shake;
  const sy = fbm1(tau * 18, 2) * 0.12 * shake;
  const target: [number, number, number] = [0, lerp(0.35, 0.2, a), lerp(0, 0.8, a)];
  const pos: [number, number, number] = [target[0] + rad * Math.cos(elev) * Math.sin(az) + sx, target[1] + rad * Math.sin(elev) + sy, target[2] + rad * Math.cos(elev) * Math.cos(az)];
  const dim = 1 - outro * 0.85;
  return (
    <AbsoluteFill style={{ background: "#020409" }}>
      <AbsoluteFill style={{ opacity: dim }}>
        <ThreeCanvas width={width} height={height} gl={{ antialias: true }} camera={{ fov: 42, position: [0, 5, 10], near: 0.05, far: 200 }}>
          <color attach="background" args={["#020409"]} />
          <fogExp2 attach="fog" args={["#020409", 0.045]} />
          <EnvSetup intensity={0.42} />
          <ambientLight intensity={0.05} />
          <directionalLight position={[-6, 9, 7]} intensity={2.2} color="#ffe2c0" />
          <directionalLight position={[6, 4, -9]} intensity={3.0} color="#57d6ff" />
          <pointLight position={[0, 3.2, 0.5]} intensity={18 + 30 * beat} distance={12} color="#8fe6ff" />
          <CameraRig pos={pos} look={target} fov={lerp(55, 40, a)} near={0.05} far={200} />
          <Board tau={tau} beat={beat} />
          <Chip beat={beat} t={t} />
          <Components beat={beat} />
          <Post bloom={1.25 + 0.4 * beat} threshold={0.55} radius={0.7} ca={0.001 + 0.003 * shake} />
        </ThreeCanvas>
      </AbsoluteFill>
      <BigTitle zh="算力，驱动世界" en="COMPUTING POWER DRIVES THE WORLD" start={0.55} end={7.2} size={150} y={-235} />
      <Hud x={96} y={800} start={2.2} end={7.2} lines={["CPU · 中央处理器", "CLOCK   5.0 GHz", "CORES   24", "OPS/S   10^13"]} />
      <AbsoluteFill style={{ background: "#fff", opacity: 0.85 * Math.pow(1 - smoothstep(0, 0.35, tau), 2), mixBlendMode: "screen" }} />
    </AbsoluteFill>
  );
};
