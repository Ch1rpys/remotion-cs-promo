import React from "react";
import { AbsoluteFill, Img, staticFile } from "remotion";
import { clamp, ease, lerp } from "../lib/anim";

/** A defocused, darkened photo that slowly drifts behind a scene's foreground graphics. */
export const Backdrop: React.FC<{
  name: string;
  t: number;
  t0: number;
  t1: number;
  opacity?: number;
  blur?: number;
  bright?: number;
  sat?: number;
  zoom?: [number, number];
  drift?: [number, number];
  push?: number;
  tint?: string;
}> = ({ name, t, t0, t1, opacity = 0.6, blur = 12, bright = 0.45, sat = 1.0, zoom = [1.08, 1.16], drift = [-24, 24], push = 1, tint }) => {
  if (opacity <= 0.002) return null;
  const e = ease.inOutSine(clamp((t - t0) / (t1 - t0)));
  const z = lerp(zoom[0], zoom[1], e) * push;
  const x = lerp(drift[0], drift[1], e);
  return (
    <AbsoluteFill style={{ opacity, overflow: "hidden" }}>
      <Img
        src={staticFile(`photos/${name}.jpg`)}
        style={{ position: "absolute", left: 0, top: 0, width: 1920, height: 1080, objectFit: "cover", transform: `translateX(${x.toFixed(2)}px) scale(${z.toFixed(4)})`, filter: `blur(${blur}px) brightness(${bright}) saturate(${sat})` }}
      />
      {tint ? <AbsoluteFill style={{ background: tint, mixBlendMode: "multiply" }} /> : null}
    </AbsoluteFill>
  );
};
