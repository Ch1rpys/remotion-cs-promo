import React, { useLayoutEffect, useMemo } from "react";
import { useDelayRender } from "remotion";
import { useThree } from "@react-three/fiber";
import { Bloom, ChromaticAberration, EffectComposer, ToneMapping, Vignette as PPVignette } from "@react-three/postprocessing";
import { BlendFunction, ToneMappingMode } from "postprocessing";
import * as THREE from "three";

export const CameraRig: React.FC<{
  pos: [number, number, number];
  look: [number, number, number];
  roll?: number;
  fov?: number;
  near?: number;
  far?: number;
  up?: [number, number, number];
}> = ({ pos, look, roll = 0, fov = 50, near = 0.1, far = 2000, up: upOverride }) => {
  const { camera } = useThree();
  const cam = camera as THREE.PerspectiveCamera;
  cam.position.set(pos[0], pos[1], pos[2]);
  const dir = new THREE.Vector3(look[0] - pos[0], look[1] - pos[1], look[2] - pos[2]).normalize();
  const worldUp = upOverride
    ? new THREE.Vector3(...upOverride)
    : Math.abs(dir.y) > 0.95
      ? new THREE.Vector3(0, 0, -1)
      : new THREE.Vector3(0, 1, 0);
  const right = new THREE.Vector3().crossVectors(dir, worldUp).normalize();
  const up = new THREE.Vector3().crossVectors(right, dir).normalize();
  const rolled = up.clone().multiplyScalar(Math.cos(roll)).add(right.clone().multiplyScalar(Math.sin(roll)));
  cam.up.copy(rolled);
  cam.lookAt(look[0], look[1], look[2]);
  if (cam.fov !== fov || cam.near !== near || cam.far !== far) {
    cam.fov = fov;
    cam.near = near;
    cam.far = far;
  }
  cam.updateProjectionMatrix();
  return null;
};

export const Post: React.FC<{
  bloom?: number;
  threshold?: number;
  radius?: number;
  ca?: number;
  vignette?: number;
  exposure?: number;
}> = ({ bloom = 1.2, threshold = 0.2, radius = 0.75, ca = 0 }) => {
  const caOffset = useMemo(() => new THREE.Vector2(ca, ca * 0.6), [ca]);
  return (
    <>
      <EffectComposer multisampling={4}>
        <Bloom intensity={bloom} luminanceThreshold={threshold} luminanceSmoothing={0.25} mipmapBlur radius={radius} />
        <ChromaticAberration offset={caOffset} radialModulation={true} modulationOffset={0.2} blendFunction={BlendFunction.NORMAL} />
      </EffectComposer>
      <ComposerWarmup />
    </>
  );
};

/** The composer's passes are wired up after the first advance(), so the very first frame a tab renders
 * after mounting would be black. Hold the screenshot until a couple of extra frames have been drawn. */
const ComposerWarmup: React.FC = () => {
  const { advance } = useThree();
  const { delayRender, continueRender } = useDelayRender();
  // Created in a layout effect (not during render) so a Suspense-discarded render can't leak the handle.
  useLayoutEffect(() => {
    const handle = delayRender("warming up EffectComposer");
    let cancelled = false;
    let cleared = false;
    const clear = () => {
      if (!cleared) {
        cleared = true;
        continueRender(handle);
      }
    };
    const step = (n: number) => {
      if (cancelled) return;
      advance(performance.now());
      if (n <= 0) {
        clear();
        return;
      }
      setTimeout(() => step(n - 1), 16);
    };
    setTimeout(() => step(2), 0);
    return () => {
      cancelled = true;
      clear();
    };
  }, [advance, continueRender, delayRender]);
  return null;
};

export const makeCanvasTexture = (w: number, h: number, draw: (ctx: CanvasRenderingContext2D) => void, opts?: { mipmaps?: boolean; srgb?: boolean }) => {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const ctx = c.getContext("2d")!;
  draw(ctx);
  const tex = new THREE.CanvasTexture(c);
  tex.anisotropy = 8;
  tex.generateMipmaps = opts?.mipmaps ?? true;
  tex.minFilter = tex.generateMipmaps ? THREE.LinearMipmapLinearFilter : THREE.LinearFilter;
  tex.magFilter = THREE.LinearFilter;
  if (opts?.srgb) tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
};

export const instancedQuad = () => {
  const base = new THREE.PlaneGeometry(1, 1);
  const g = new THREE.InstancedBufferGeometry();
  g.index = base.index;
  g.setAttribute("position", base.getAttribute("position"));
  g.setAttribute("uv", base.getAttribute("uv"));
  return g;
};
