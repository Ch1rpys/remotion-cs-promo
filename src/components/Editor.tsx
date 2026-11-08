import React from "react";
import { F } from "../theme";

export const WIN = { x: 370, y: 190, w: 1180, h: 660 };
export const CODE = { x: 470, y: 272, lh: 50, fs: 30 };
export const TERM = { top: 646, h: 204, x: 408, line1: 700, line2: 746, lh: 46, fs: 27 };
export const TERM_CW = TERM.fs * 0.6;
/** stage-space centre of the custom "o" glyph (portal) in the terminal output line */
export const ringCenter = (charIndex: number) => ({
  x: TERM.x + charIndex * TERM_CW + TERM_CW / 2,
  y: TERM.line2 + 24.6,
});
export const RING = { rx: 5.5, ry: 6.5, stroke: 2.9 };

const COL = {
  text: "#d6deeb",
  pre: "#c792ea",
  header: "#c3e88d",
  kw: "#c792ea",
  fn: "#82aaff",
  str: "#c3e88d",
  esc: "#89ddff",
  num: "#f78c6c",
  punct: "#89ddff",
};

export const colorize = (code: string): string[] => {
  const colors: string[] = new Array(code.length).fill(COL.text);
  const rules: [RegExp, string | ((m: RegExpExecArray) => string[])][] = [
    [/#include/y, COL.pre],
    [/<[^>\n]*>/y, COL.header],
    [/\b(?:int|void|return|char|for|while|if)\b/y, COL.kw],
    [/\b(?:main|printf)\b/y, COL.fn],
    [
      /"(?:[^"\\\n]|\\.)*"?/y,
      (m) => {
        const s = m[0];
        const out: string[] = [];
        for (let i = 0; i < s.length; i++) {
          if (s[i] === "\\" && i + 1 < s.length) {
            out.push(COL.esc, COL.esc);
            i++;
          } else out.push(COL.str);
        }
        return out;
      },
    ],
    [/\d+/y, COL.num],
    [/[(){};,]/y, COL.punct],
  ];
  let i = 0;
  while (i < code.length) {
    let matched = false;
    for (const [re, col] of rules) {
      re.lastIndex = i;
      const mm = re.exec(code);
      if (mm && mm[0].length > 0) {
        const cols = typeof col === "string" ? new Array(mm[0].length).fill(col) : col(mm);
        for (let k = 0; k < mm[0].length; k++) colors[i + k] = cols[k] ?? COL.text;
        i += mm[0].length;
        matched = true;
        break;
      }
    }
    if (!matched) i++;
  }
  return colors;
};

export const Cursor: React.FC<{ on: boolean; h: number; color?: string }> = ({ on, h, color = "#5ff0ff" }) => (
  <span
    style={{
      display: "inline-block",
      width: 3,
      height: h,
      marginLeft: 1,
      marginRight: -4,
      verticalAlign: "middle",
      background: color,
      boxShadow: `0 0 10px ${color}, 0 0 22px ${color}88`,
      opacity: on ? 1 : 0,
      transform: "translateY(-2px)",
    }}
  />
);

export type EditorProps = {
  code: string;
  visible: number;
  cursorOn: boolean;
  showCursor: boolean;
  selection?: [number, number];
  title?: string;
  codeBlur?: number;
  codeOpacity?: number;
  term: number;
  cmd: string;
  cmdCursorOn: boolean;
  showCmdCursor: boolean;
  afterEnterCursor: boolean;
  output?: string;
  outputGlow: number;
  outputColor?: string;
  ringIndex?: number;
  ringGlow?: number;
  cmdBlur?: number;
  windowGlow?: number;
  cursorAt?: number;
  outputDim?: boolean;
};

export const Editor: React.FC<EditorProps> = (p) => {
  const shown = p.code.slice(0, p.cursorAt !== undefined ? p.code.length : p.visible);
  const colors = colorize(p.code);
  const lines = shown.split("\n");
  const allLines = p.code.split("\n");
  let idx = 0;
  const lineStarts: number[] = [];
  for (const l of allLines) {
    lineStarts.push(idx);
    idx += l.length + 1;
  }
  const cursorLine =
    p.cursorAt !== undefined ? Math.max(0, lineStarts.filter((st) => st <= p.cursorAt!).length - 1) : lines.length - 1;
  const cursorCol = p.cursorAt !== undefined ? p.cursorAt - lineStarts[cursorLine] : -1;
  const outColor = p.outputColor ?? "#ffffff";
  const glowCol = p.outputColor ? p.outputColor : "#5ff0ff";
  return (
    <div
      style={{
        position: "absolute",
        left: WIN.x,
        top: WIN.y,
        width: WIN.w,
        height: WIN.h,
        borderRadius: 20,
        background: "linear-gradient(160deg, rgba(18,26,46,0.92) 0%, rgba(8,12,24,0.94) 60%, rgba(6,9,18,0.96) 100%)",
        border: "1px solid rgba(130,180,255,0.20)",
        boxShadow: `0 50px 140px rgba(0,0,0,0.85), 0 0 ${60 + 60 * (p.windowGlow ?? 0)}px rgba(40,140,255,${0.14 + 0.2 * (p.windowGlow ?? 0)}), inset 0 1px 0 rgba(255,255,255,0.08)`,
        overflow: "hidden",
      }}
    >
      {/* glass sheen */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          background: "linear-gradient(115deg, rgba(255,255,255,0.06) 0%, rgba(255,255,255,0.0) 30%, rgba(255,255,255,0) 70%, rgba(120,200,255,0.04) 100%)",
          pointerEvents: "none",
        }}
      />
      {/* title bar */}
      <div style={{ position: "absolute", left: 0, right: 0, top: 0, height: 48, borderBottom: "1px solid rgba(130,180,255,0.10)", background: "rgba(255,255,255,0.02)" }}>
        {["#ff5f57", "#febc2e", "#28c840"].map((c, i) => (
          <div key={c} style={{ position: "absolute", left: 22 + i * 24, top: 17, width: 14, height: 14, borderRadius: 7, background: c, boxShadow: `0 0 8px ${c}66` }} />
        ))}
        <div style={{ position: "absolute", left: 0, right: 0, top: 13, textAlign: "center", fontFamily: F.inter, fontSize: 16, color: "rgba(200,215,240,0.6)", letterSpacing: "0.04em" }}>
          {p.title ?? "hello.c — ~/cs"}
        </div>
      </div>
      {/* gutter */}
      <div style={{ position: "absolute", left: 0, top: 48, bottom: 0, width: 84, borderRight: "1px solid rgba(130,180,255,0.06)" }} />
      <div style={{ filter: p.codeBlur ? `blur(${p.codeBlur}px)` : undefined, opacity: p.codeOpacity ?? 1 }}>
        {allLines.map((_, li) => (
          <div
            key={li}
            style={{
              position: "absolute",
              left: 0,
              width: 70,
              top: CODE.y - WIN.y + li * CODE.lh,
              height: CODE.lh,
              lineHeight: `${CODE.lh}px`,
              textAlign: "right",
              fontFamily: F.mono,
              fontSize: 24,
              color: li === cursorLine && p.showCursor ? "rgba(200,220,255,0.75)" : "rgba(120,140,180,0.45)",
            }}
          >
            {li + 1}
          </div>
        ))}
        {p.showCursor ? (
          <div style={{ position: "absolute", left: 85, right: 0, top: CODE.y - WIN.y + cursorLine * CODE.lh, height: CODE.lh, background: "rgba(120,170,255,0.05)" }} />
        ) : null}
        {allLines.map((line, li) => {
          const start = lineStarts[li];
          const visibleInLine = p.cursorAt !== undefined ? line.length : Math.max(0, Math.min(line.length, p.visible - start));
          if (li > cursorLine && p.cursorAt === undefined) return null;
          const chars = line.slice(0, visibleInLine);
          return (
            <div
              key={li}
              style={{
                position: "absolute",
                left: CODE.x - WIN.x,
                top: CODE.y - WIN.y + li * CODE.lh,
                height: CODE.lh,
                lineHeight: `${CODE.lh}px`,
                fontFamily: F.mono,
                fontSize: CODE.fs,
                whiteSpace: "pre",
                fontWeight: 450,
              }}
            >
              {Array.from(chars).map((ch, ci) => {
                const gi = start + ci;
                const sel = p.selection && gi >= p.selection[0] && gi < p.selection[1];
                return (
                  <React.Fragment key={ci}>
                    {li === cursorLine && ci === cursorCol && p.showCursor ? <Cursor on={p.cursorOn} h={CODE.fs * 1.2} /> : null}
                    <span style={{ color: colors[gi], background: sel ? "rgba(95,170,255,0.38)" : undefined, textShadow: `0 0 12px ${colors[gi]}33` }}>{ch}</span>
                  </React.Fragment>
                );
              })}
              {li === cursorLine && p.showCursor && (cursorCol < 0 || cursorCol >= chars.length) ? <Cursor on={p.cursorOn} h={CODE.fs * 1.2} /> : null}
            </div>
          );
        })}
      </div>
      {/* terminal */}
      {p.term > 0.001 ? (
        <div
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            top: TERM.top - WIN.y + (1 - p.term) * TERM.h,
            height: TERM.h,
            background: "linear-gradient(180deg, rgba(4,8,16,0.97), rgba(3,6,12,0.99))",
            borderTop: "1px solid rgba(95,240,255,0.25)",
            boxShadow: "0 -20px 40px rgba(0,0,0,0.5)",
          }}
        >
          <div style={{ position: "absolute", left: 38, top: 12, fontFamily: F.inter, fontSize: 14, letterSpacing: "0.2em", color: "rgba(160,200,255,0.55)" }}>TERMINAL</div>
          <div style={{ position: "absolute", left: 38, top: 36, width: 86, height: 2, background: "#5ff0ff", boxShadow: "0 0 8px #5ff0ff" }} />
          <div
            style={{
              position: "absolute",
              left: TERM.x - WIN.x,
              top: TERM.line1 - TERM.top,
              height: TERM.lh,
              lineHeight: `${TERM.lh}px`,
              fontFamily: F.mono,
              fontSize: TERM.fs,
              whiteSpace: "pre",
              filter: p.cmdBlur ? `blur(${p.cmdBlur}px)` : undefined,
            }}
          >
            <span style={{ color: "#3dff9a" }}>➜ </span>
            <span style={{ color: "#5ff0ff" }}>~/cs </span>
            <span style={{ color: "#e8eefc" }}>{p.cmd}</span>
            {p.showCmdCursor ? <Cursor on={p.cmdCursorOn} h={TERM.fs * 1.15} /> : null}
          </div>
          {p.afterEnterCursor && !p.output ? (
            <div style={{ position: "absolute", left: TERM.x - WIN.x, top: TERM.line2 - TERM.top, height: TERM.lh, lineHeight: `${TERM.lh}px` }}>
              <Cursor on={p.cmdCursorOn} h={TERM.fs * 1.15} />
            </div>
          ) : null}
          {p.output ? (
            <div style={{ position: "absolute", left: TERM.x - WIN.x, top: TERM.line2 - TERM.top, height: TERM.lh }}>
              {Array.from(p.output).map((ch, i) => {
                const isRing = i === p.ringIndex;
                const glow = p.outputGlow;
                return (
                  <div
                    key={i}
                    style={{
                      position: "absolute",
                      left: i * TERM_CW,
                      top: 0,
                      width: TERM_CW,
                      height: TERM.lh,
                      lineHeight: `${TERM.lh}px`,
                      fontFamily: F.mono,
                      fontSize: TERM.fs,
                      fontWeight: 500,
                      color: outColor,
                      opacity: p.outputDim ? 0.45 : 1,
                      textAlign: "center",
                      textShadow: `0 0 ${8 + 26 * glow}px ${glowCol}${Math.round(120 + 135 * Math.min(1, glow)).toString(16).padStart(2, "0")}, 0 0 ${2 + 8 * glow}px #fff`,
                    }}
                  >
                    {isRing ? (
                      <svg width={TERM_CW} height={TERM.lh} style={{ position: "absolute", left: 0, top: 0, overflow: "visible" }}>
                        <ellipse
                          cx={TERM_CW / 2}
                          cy={24.6}
                          rx={RING.rx}
                          ry={RING.ry}
                          fill="none"
                          stroke={outColor}
                          strokeWidth={RING.stroke}
                          style={{ filter: `drop-shadow(0 0 ${2 + 6 * glow}px ${glowCol})` }}
                        />
                        {p.ringGlow ? (
                          <ellipse cx={TERM_CW / 2} cy={24.6} rx={RING.rx} ry={RING.ry} fill="none" stroke="#bff8ff" strokeWidth={RING.stroke * 0.5} opacity={p.ringGlow} />
                        ) : null}
                      </svg>
                    ) : (
                      ch
                    )}
                  </div>
                );
              })}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
};
