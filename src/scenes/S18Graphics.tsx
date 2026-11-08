import React, { useMemo } from "react";
import { AbsoluteFill, useVideoConfig } from "remotion";
import { ThreeCanvas } from "@remotion/three";
import { useThree } from "@react-three/fiber";
import { MeshReflectorMaterial } from "@react-three/drei";
import * as THREE from "three";
import { TeapotGeometry } from "three/examples/jsm/geometries/TeapotGeometry.js";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { Caption, CourseTag, Hud, useTime } from "../components/Text";
import { CameraRig, Post, makeCanvasTexture } from "../three/common";
import { clamp, ease, invLerp, lerp, smoothstep } from "../lib/anim";
import { C } from "../theme";

const SWEEP0 = 152.2;
const SWEEP1 = 153.4;

const Env: React.FC = () => {
  const { gl, scene } = useThree();
  useMemo(() => {
    gl.localClippingEnabled = true;
    const pm = new THREE.PMREMGenerator(gl);
    scene.environment = pm.fromScene(new RoomEnvironment(), 0.03).texture;
    scene.environmentIntensity = 0.9;
  }, [gl, scene]);
  return null;
};

const Scene: React.FC<{ t: number }> = ({ t }) => {
  const d = useMemo(() => {
    const geo = new TeapotGeometry(0.9, 14);
    geo.computeBoundingBox();
    geo.translate(0, -geo.boundingBox!.min.y, 0);
    geo.computeBoundingBox();
    const top = geo.boundingBox!.max.y;
    const wirePlane = new THREE.Plane(new THREE.Vector3(0, -1, 0), 0);
    const solidPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    const wire = new THREE.LineSegments(
      new THREE.WireframeGeometry(geo),
      new THREE.LineBasicMaterial({ color: new THREE.Color(0.35, 1.6, 2.4), transparent: true, opacity: 0.65, clippingPlanes: [wirePlane], toneMapped: false, depthWrite: false, blending: THREE.AdditiveBlending }),
    );
    const pts = new THREE.Points(geo, new THREE.PointsMaterial({ color: new THREE.Color(1.8, 2.4, 2.8), size: 0.022, clippingPlanes: [wirePlane], toneMapped: false, transparent: true, depthWrite: false }));
    const solid = new THREE.Mesh(
      geo,
      new THREE.MeshPhysicalMaterial({ color: "#eef3fa", metalness: 1, roughness: 0.07, clearcoat: 1, clearcoatRoughness: 0.05, clippingPlanes: [solidPlane] }),
    );
    const checker = makeCanvasTexture(
      1024,
      1024,
      (ctx) => {
        for (let y = 0; y < 16; y++)
          for (let x = 0; x < 16; x++) {
            ctx.fillStyle = (x + y) % 2 ? "#1b1d24" : "#0a0b0f";
            ctx.fillRect(x * 64, y * 64, 64, 64);
          }
      },
      { srgb: true },
    );
    checker.wrapS = checker.wrapT = THREE.RepeatWrapping;
    checker.repeat.set(3, 3);
    const tris = geo.index ? geo.index.count / 3 : geo.getAttribute("position").count / 3;
    return { geo, top, wirePlane, solidPlane, wire, pts, solid, checker, tris };
  }, []);
  const h = lerp(d.top + 0.05, -0.05, ease.inOutCubic(invLerp(SWEEP0, SWEEP1, t)));
  d.wirePlane.constant = h;
  d.solidPlane.constant = -h;
  const rotY = (t - 151) * 0.45;
  const ball = ease.outBack(clamp(invLerp(153.2, 153.9, t)));
  const floor = smoothstep(152.9, 153.8, t);
  const ringOn = t > SWEEP0 - 0.1 && t < SWEEP1 + 0.1;
  return (
    <>
      <group rotation={[0, rotY, 0]}>
        <primitive object={d.solid} />
        <primitive object={d.wire} />
        <primitive object={d.pts} />
      </group>
      {ringOn ? (
        <mesh position={[0, h, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[1.55, 1.62, 128]} />
          <meshBasicMaterial color={new THREE.Color(1.5, 2.6, 3.0)} toneMapped={false} transparent blending={THREE.AdditiveBlending} side={THREE.DoubleSide} depthWrite={false} />
        </mesh>
      ) : null}
      <group scale={[ball, ball, ball]}>
        <mesh position={[-2.0, 0.6, 0.7]}>
          <sphereGeometry args={[0.6, 96, 64]} />
          <meshPhysicalMaterial color="#ffffff" metalness={0} roughness={0} transmission={1} thickness={1.4} ior={1.5} />
        </mesh>
        <mesh position={[1.9, 0.48, 0.9]}>
          <sphereGeometry args={[0.48, 96, 64]} />
          <meshPhysicalMaterial color="#ffc15e" metalness={1} roughness={0.14} />
        </mesh>
        <mesh position={[1.0, 0.36, -1.6]}>
          <sphereGeometry args={[0.36, 96, 64]} />
          <meshPhysicalMaterial color="#ff3355" metalness={0} roughness={0.18} clearcoat={1} />
        </mesh>
      </group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]}>
        <planeGeometry args={[30, 30]} />
        <MeshReflectorMaterial
          map={d.checker}
          blur={[200, 60]}
          resolution={1024}
          mixBlur={0.6}
          mixStrength={2.2 * floor}
          roughness={0.5}
          depthScale={0.4}
          minDepthThreshold={0.4}
          maxDepthThreshold={1.2}
          color={new THREE.Color(0.35 * floor + 0.04, 0.35 * floor + 0.04, 0.37 * floor + 0.05)}
          metalness={0.3}
          mirror={0.6}
        />
      </mesh>
    </>
  );
};

export const S18Graphics: React.FC<{ offset: number }> = ({ offset }) => {
  const tau = useTime();
  const t = tau + offset;
  const { width, height } = useVideoConfig();
  const p = ease.inOutSine(invLerp(151.0, 156.3, t));
  const whip = ease.inCubic(invLerp(155.7, 156.3, t));
  const az = lerp(-0.55, 0.65, p) + whip * 1.2;
  const r = lerp(5.4, 4.5, p);
  const cam: [number, number, number] = [Math.sin(az) * r, lerp(1.9, 1.35, p), Math.cos(az) * r];
  const fadeIn = ease.outCubic(invLerp(151.0, 151.35, t));
  const stage = t < SWEEP0 ? "WIREFRAME" : t < SWEEP1 ? "RASTERIZATION" : "PBR · RAY TRACING";
  return (
    <AbsoluteFill style={{ background: "#040509", opacity: fadeIn * (1 - whip) }}>
      <ThreeCanvas width={width} height={height} gl={{ antialias: true }} camera={{ fov: 38, position: [0, 1.6, 5], near: 0.05, far: 100 }}>
        <color attach="background" args={["#040509"]} />
        <fog attach="fog" args={["#040509", 7, 22]} />
        <Env />
        <ambientLight intensity={0.1} />
        <spotLight position={[3, 6, 4]} angle={0.42} penumbra={0.7} intensity={22} color="#fff4e6" />
        <directionalLight position={[-5, 3, -4]} intensity={2.2} color="#4ad8ff" />
        <directionalLight position={[5, 2, -5]} intensity={1.6} color="#ff7ad9" />
        <CameraRig pos={cam} look={[0, 0.72, 0]} fov={38} near={0.05} far={100} />
        <Scene t={t} />
        <Post bloom={0.8} threshold={0.6} radius={0.7} ca={0.0008 + whip * 0.006} />
      </ThreeCanvas>
      <CourseTag zh="计算机图形学" en="Computer Graphics" start={151.3 - offset} end={155.6 - offset} y={150} />
      <Hud right x={96} y={150} start={151.4 - offset} end={155.6 - offset} lines={["UTAH TEAPOT · 1975", `SHADING  ${stage}`, "ENV  IBL · PMREM", "REFLECTION  SSR"]} />
      <Caption zh="计算机图形学，用数学渲染整个世界" en="Computer graphics: rendering worlds with mathematics" start={152.0 - offset} end={155.6 - offset} y={855} size={50} backdrop={0.6} accent={C.cyan} />
    </AbsoluteFill>
  );
};
