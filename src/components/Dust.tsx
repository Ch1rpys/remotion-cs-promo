import React, { useMemo } from "react";
import { AbsoluteFill } from "remotion";
import { mulberry32, noise1 } from "../lib/anim";
import { useTime } from "./Text";

/** Floating bokeh / dust motes. Pure function of time. */
export const Dust: React.FC<{ count?: number; seed?: number; color?: string; speed?: number; opacity?: number; maxSize?: number }> = ({
  count = 60,
  seed = 7,
  color = "160,210,255",
  speed = 1,
  opacity = 1,
  maxSize = 10,
}) => {
  const t = useTime();
  const parts = useMemo(() => {
    const r = mulberry32(seed);
    return new Array(count).fill(0).map(() => ({
      x: r() * 1920,
      y: r() * 1080,
      z: r(),
      ph: r() * 100,
      a: 0.25 + r() * 0.75,
    }));
  }, [count, seed]);
  return (
    <AbsoluteFill style={{ pointerEvents: "none", opacity }}>
      {parts.map((p, i) => {
        const depth = 0.25 + p.z * 0.75;
        const size = 1.5 + depth * maxSize;
        const x = (p.x + noise1(t * 0.15 + p.ph, i) * 60 * depth + t * 6 * speed * depth) % 1960;
        const y = (((p.y - t * 14 * speed * depth + noise1(t * 0.2 + p.ph * 2, i + 99) * 40) % 1120) + 1120) % 1120;
        const blur = p.z > 0.7 ? (p.z - 0.7) * 16 : (0.3 - Math.min(p.z, 0.3)) * 6;
        const tw = 0.6 + 0.4 * Math.sin(t * (0.8 + p.z) + p.ph);
        return (
          <div
            key={i}
            style={{
              position: "absolute",
              left: x - 20,
              top: y - 20,
              width: size,
              height: size,
              borderRadius: "50%",
              background: `rgba(${color},${0.55 * p.a * tw})`,
              filter: `blur(${blur}px)`,
              boxShadow: `0 0 ${size * 1.5}px rgba(${color},${0.35 * p.a * tw})`,
            }}
          />
        );
      })}
    </AbsoluteFill>
  );
};
