import React, { useMemo } from "react";
import { AbsoluteFill, useVideoConfig } from "remotion";
import { ThreeCanvas } from "@remotion/three";
import cues from "../data/cues.json";
import dets from "../data/detections.json";
import { Backdrop } from "../components/Backdrop";
import { Dust } from "../components/Dust";
import { Caption, CourseTag, Hud, ScrambleText, useTime } from "../components/Text";
import { Post } from "../three/common";
import { Photo } from "./S15Photos";
import { clamp, ease, invLerp, lerp, smoothstep } from "../lib/anim";
import { C, F } from "../theme";

type Det = { label: string; score: number; x0: number; y0: number; x1: number; y1: number };
const CLS: Record<string, { zh: string; col: string }> = {
  person: { zh: "行人", col: "#3ee8ff" },
  car: { zh: "汽车", col: "#ffc15e" },
  bus: { zh: "公交车", col: "#ff7a3c" },
  bicycle: { zh: "自行车", col: "#3dff9a" },
  "traffic light": { zh: "信号灯", col: "#ff4d6a" },
  handbag: { zh: "手提包", col: "#b48cff" },
  backpack: { zh: "背包", col: "#b48cff" },
};

const pickGroups = () => {
  const list = (dets as Det[]).filter((d) => CLS[d.label]);
  const groups: Det[][] = [[], [], [], [], [], []];
  for (const d of list) {
    const area = (d.x1 - d.x0) * (d.y1 - d.y0);
    if (d.label === "bus") groups[0].push(d);
    else if (d.label === "person" && area > 0.004) groups[1].push(d);
    else if (d.label === "car" && area > 0.0006) groups[2].push(d);
    else if (d.label === "bicycle") groups[3].push(d);
    else if (d.label === "person") groups[4].push(d);
    else if (groups[5].length < 7 && d.score > 0.8) groups[5].push(d);
  }
  return groups;
};

export const S17Vision: React.FC<{ offset: number }> = ({ offset }) => {
  const tau = useTime();
  const t = tau + offset;
  const { width, height } = useVideoConfig();
  const groups = useMemo(pickGroups, []);
  const p = tau / 3.5;
  const zoom = lerp(1.02, 1.09, ease.inOutSine(clamp(p)));
  const fadeIn = ease.outCubic(invLerp(145.0, 145.35, t));
  const fadeOut = ease.inCubic(invLerp(148.1, 148.5, t));
  const scanY = ease.inOutSine(invLerp(145.15, 146.3, t)) * 1080;
  const times = cues.detections;
  let count = 0;
  groups.forEach((g, gi) => (t >= times[gi] ? (count += g.length) : null));
  return (
    <AbsoluteFill style={{ opacity: fadeIn * (1 - fadeOut), background: "#000" }}>
      <ThreeCanvas width={width} height={height} gl={{ antialias: false }} camera={{ position: [0, 0, 1] }}>
        <Photo name="city_street" p={p} m={{ zoom: [zoom, zoom], dolly: 0, shift: [[0, 0], [0, 0]], focus: 0.5 }} exposure={0.82} extraZoom={1} />
        <Post bloom={0.4} threshold={0.75} radius={0.7} ca={0.0008} />
      </ThreeCanvas>
      <AbsoluteFill style={{ background: "radial-gradient(ellipse 80% 70% at 50% 55%, rgba(0,0,0,0) 40%, rgba(0,5,15,0.55) 100%)" }} />
      {t < 146.5 ? (
        <div style={{ position: "absolute", left: 0, right: 0, top: scanY - 60, height: 120, background: "linear-gradient(180deg, rgba(62,232,255,0) 0%, rgba(62,232,255,0.16) 50%, rgba(62,232,255,0) 100%)", borderBottom: "1px solid rgba(62,232,255,0.6)" }} />
      ) : null}
      {groups.map((g, gi) =>
        g.map((d, k) => {
          const at = times[gi] + k * 0.025;
          if (t < at) return null;
          const a = ease.outCubic(clamp((t - at) / 0.22));
          const s = 1.18 - 0.18 * a;
          const x0 = 960 + (d.x0 - 0.5) * 1920 * zoom;
          const x1 = 960 + (d.x1 - 0.5) * 1920 * zoom;
          const y0 = 540 + (d.y0 - 0.5) * 1080 * zoom;
          const y1 = 540 + (d.y1 - 0.5) * 1080 * zoom;
          const w = x1 - x0;
          const h = y1 - y0;
          const cls = CLS[d.label];
          const cl = Math.max(6, Math.min(18, Math.min(w, h) * 0.28));
          const big = w * h > 2500;
          return (
            <div key={`${gi}-${k}`} style={{ position: "absolute", left: x0, top: y0, width: w, height: h, opacity: a, transform: `scale(${s})`, transformOrigin: "50% 50%" }}>
              <div style={{ position: "absolute", inset: 0, border: `1px solid ${cls.col}66`, background: `${cls.col}${t - at < 0.15 ? "30" : "0d"}` }} />
              {[
                [0, 0, 1, 1],
                [1, 0, -1, 1],
                [0, 1, 1, -1],
                [1, 1, -1, -1],
              ].map(([cx, cy, sx, sy], i) => (
                <div
                  key={i}
                  style={{
                    position: "absolute",
                    left: cx ? w - cl : 0,
                    top: cy ? h - cl : 0,
                    width: cl,
                    height: cl,
                    borderLeft: sx > 0 ? `2.5px solid ${cls.col}` : undefined,
                    borderRight: sx < 0 ? `2.5px solid ${cls.col}` : undefined,
                    borderTop: sy > 0 ? `2.5px solid ${cls.col}` : undefined,
                    borderBottom: sy < 0 ? `2.5px solid ${cls.col}` : undefined,
                    boxShadow: `0 0 8px ${cls.col}88`,
                  }}
                />
              ))}
              {big ? (
                <div style={{ position: "absolute", left: -1, top: -24, whiteSpace: "nowrap", background: cls.col, color: "#02060c", fontFamily: F.mono, fontSize: 13, fontWeight: 700, padding: "3px 7px", borderRadius: 3 }}>
                  {d.label} {d.score.toFixed(2)}
                </div>
              ) : null}
            </div>
          );
        }),
      )}
      <Hud right x={96} y={150} start={145.3 - offset} end={148.0 - offset} lines={["OBJECT DETECTION · 目标检测", "MODEL  DETR-ResNet-101", `OBJECTS  ${count}`, "LATENCY  16 ms"]} />
      <CourseTag zh="计算机视觉" en="Computer Vision" start={145.3 - offset} end={148.0 - offset} y={150} />
      <Caption zh="计算机视觉，让机器看懂世界" en="Computer vision: teaching machines to see" start={145.6 - offset} end={148.0 - offset} y={850} size={52} backdrop={0.7} />
    </AbsoluteFill>
  );
};

const Q = "用一句话解释：什么是计算机科学？";
const A = "计算机科学，是研究如何用计算解决问题的学问——从一颗晶体管，到改变世界的智能。";

export const S17LLM: React.FC<{ offset: number }> = ({ offset }) => {
  const tau = useTime();
  const t = tau + offset;
  const fadeIn = ease.outCubic(invLerp(148.0, 148.4, t));
  const fadeOut = ease.inCubic(invLerp(150.9, 151.3, t));
  const qn = Math.round(clamp(invLerp(148.15, 148.55, t)) * Q.length);
  const a0 = cues.llmStart;
  const an = Math.round(clamp((t - a0) / 1.75) * A.length);
  const thinking = t > 148.6 && t < a0;
  const push = 1 + 0.04 * ease.inOutSine(invLerp(148, 151.3, t));
  return (
    <AbsoluteFill style={{ background: "radial-gradient(ellipse 80% 70% at 50% 45%, #1a0f3a 0%, #0a0820 45%, #030210 100%)", opacity: fadeIn * (1 - fadeOut) }}>
      <Backdrop name="ft_vr" t={t} t0={148} t1={151.3} opacity={0.75} blur={11} bright={0.56} zoom={[1.08, 1.14]} drift={[-20, 20]} />
      <AbsoluteFill style={{ background: "radial-gradient(ellipse 70% 60% at 50% 45%, rgba(26,15,58,0.25) 0%, rgba(3,2,16,0.72) 100%)" }} />
      <Dust count={50} seed={77} color="190,160,255" opacity={0.7} speed={0.5} />
      <AbsoluteFill style={{ transform: `scale(${push})` }}>
        <div
          style={{
            position: "absolute",
            left: 410,
            top: 200,
            width: 1100,
            height: 600,
            borderRadius: 26,
            background: "linear-gradient(160deg, rgba(40,30,80,0.55), rgba(12,10,30,0.8))",
            border: "1px solid rgba(180,150,255,0.25)",
            boxShadow: "0 40px 120px rgba(0,0,0,0.7), 0 0 80px rgba(140,80,255,0.18)",
            overflow: "hidden",
          }}
        >
          <div style={{ height: 64, borderBottom: "1px solid rgba(180,150,255,0.15)", display: "flex", alignItems: "center", gap: 14, padding: "0 28px" }}>
            <div style={{ width: 26, height: 26, borderRadius: 13, background: `conic-gradient(from ${tau * 120}deg, ${C.cyan}, ${C.magenta}, ${C.gold}, ${C.cyan})`, boxShadow: `0 0 16px ${C.magenta}` }} />
            <div style={{ fontFamily: F.inter, fontSize: 20, fontWeight: 600, color: "#f0eaff" }}>AI Assistant</div>
            <div style={{ fontFamily: F.mono, fontSize: 13, color: "rgba(200,180,255,0.5)", marginLeft: "auto", letterSpacing: "0.1em" }}>LLM · 70B · {an > 0 ? `${Math.round(an * 1.3)} tokens` : "ready"}</div>
          </div>
          <div style={{ position: "absolute", right: 36, top: 100, maxWidth: 620, padding: "18px 24px", borderRadius: "22px 22px 6px 22px", background: "linear-gradient(135deg, #3b6bff, #7b5cff)", fontFamily: F.sans, fontSize: 28, color: "#fff", opacity: qn > 0 ? 1 : 0, boxShadow: "0 10px 30px rgba(60,80,255,0.35)" }}>
            {Q.slice(0, qn)}
          </div>
          <div style={{ position: "absolute", left: 36, top: 230, display: "flex", gap: 18, alignItems: "flex-start", width: 980 }}>
            <div style={{ width: 46, height: 46, flex: "0 0 46px", borderRadius: 23, background: `conic-gradient(from ${-tau * 90}deg, ${C.cyan}, ${C.magenta}, ${C.gold}, ${C.cyan})`, boxShadow: `0 0 22px ${C.magenta}aa`, opacity: t > 148.55 ? 1 : 0 }} />
            <div style={{ fontFamily: F.serif, fontSize: 36, lineHeight: 1.65, color: "#f3eeff", fontWeight: 500, paddingTop: 2 }}>
              {thinking ? (
                <span style={{ fontFamily: F.mono, fontSize: 30, color: "rgba(200,180,255,0.8)" }}>{"●".repeat(1 + (Math.floor(tau * 6) % 3))}</span>
              ) : (
                <>
                  {Array.from(A.slice(0, an)).map((ch, i) => {
                    const age = t - (a0 + (i / A.length) * 1.75);
                    return (
                      <span key={i} style={{ color: age < 0.25 ? "#e6c8ff" : "#f3eeff", textShadow: age < 0.25 ? `0 0 14px ${C.magenta}` : undefined }}>
                        {ch}
                      </span>
                    );
                  })}
                  {an > 0 && an < A.length ? <span style={{ display: "inline-block", width: 14, height: 34, marginLeft: 4, background: C.magenta, verticalAlign: "middle", boxShadow: `0 0 12px ${C.magenta}` }} /> : null}
                </>
              )}
            </div>
          </div>
          <div style={{ position: "absolute", left: 28, right: 28, bottom: 26, height: 58, borderRadius: 16, border: "1px solid rgba(180,150,255,0.2)", background: "rgba(10,8,26,0.6)", display: "flex", alignItems: "center", padding: "0 22px", fontFamily: F.sans, fontSize: 20, color: "rgba(200,180,255,0.35)" }}>
            给 AI 发送消息…
          </div>
        </div>
      </AbsoluteFill>
      <CourseTag zh="自然语言处理 · 大模型" en="NLP · Large Language Models" start={148.3 - offset} end={150.9 - offset} y={150} accent={C.magenta} />
      <div style={{ position: "absolute", left: 0, right: 0, top: 870, textAlign: "center", opacity: smoothstep(149.0, 149.4, t) * (1 - fadeOut) }}>
        <ScrambleText text="大模型 · 用人类的语言与世界对话" t0={149.0 - offset} dur={0.7} style={{ fontFamily: F.serif, fontSize: 40, fontWeight: 600, letterSpacing: "0.14em", color: "#fff", textShadow: "0 0 24px rgba(0,0,0,0.9)" }} />
      </div>
    </AbsoluteFill>
  );
};
