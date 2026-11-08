import React from "react";
import { AbsoluteFill, Audio, Sequence, staticFile } from "remotion";
import { Flashes, Grain, Letterbox, Vignette } from "./components/Overlays";
import { FPS } from "./lib/timing";
import { CourseMontage } from "./scenes/Courses";
import { PhotoMontage } from "./scenes/Montage";
import { S01Hello } from "./scenes/S01Hello";
import { S02Binary } from "./scenes/S02Binary";
import { S03Gates } from "./scenes/S03Gates";
import { S04Chip } from "./scenes/S04Chip";
import { S06CPU } from "./scenes/S06CPU";
import { S07Quote } from "./scenes/S07Quote";
import { S08Sort } from "./scenes/S08Sort";
import { S09Tree } from "./scenes/S09Tree";
import { S10City } from "./scenes/S10City";
import { S11Globe } from "./scenes/S11Globe";
import { S12DataCenter } from "./scenes/S12DataCenter";
import { S13Compiler } from "./scenes/S13Compiler";
import { S14Crypto } from "./scenes/S14Crypto";
import { PHOTOS, PhotoShot } from "./scenes/S15Photos";
import { S16Neural } from "./scenes/S16Neural";
import { S17LLM, S17Vision } from "./scenes/S17AI";
import { S18Graphics } from "./scenes/S18Graphics";
import { S19Timeline } from "./scenes/S19Timeline";
import { S20You, S21Future, S22Title } from "./scenes/S20Finale";

/**
 * A shot plays [from, to) of a scene's own timeline, starting at `at` in the edit.
 * Scenes keep the timebase they were authored in: `origin` (default `from`) is passed as their offset.
 */
type Shot = { id: string; at: number; from: number; to: number; origin?: number; el: (offset: number) => React.ReactNode };

/** Order = z-order (later entries render on top). */
const SHOTS: Shot[] = [
  { id: "binary", at: 14.6, from: 14.6, to: 24.55, el: (o) => <S02Binary offset={o} /> },
  { id: "hello", at: 0, from: 0, to: 16.05, el: (o) => <S01Hello offset={o} /> },
  { id: "gates", at: 24.5, from: 24.5, to: 32.6, el: (o) => <S03Gates offset={o} /> },
  { id: "chip", at: 32.0, from: 32.0, to: 44.05, el: (o) => <S04Chip offset={o} /> },
  { id: "cpu", at: 44.0, from: 44.0, to: 52.05, el: (o) => <S06CPU offset={o} /> },
  { id: "hardware", at: 52.0, from: 52.0, to: 60.0, el: (o) => <PhotoMontage set="hardware" offset={o} /> },
  { id: "quote", at: 60.0, from: 52.0, to: 56.3, el: (o) => <S07Quote offset={o} /> },
  { id: "sort", at: 64.0, from: 56.0, to: 64.3, el: (o) => <S08Sort offset={o} /> },
  { id: "tree", at: 72.0, from: 64.0, to: 70.05, el: (o) => <S09Tree offset={o} /> },
  { id: "city", at: 78.0, from: 74.0, to: 84.3, origin: 70.0, el: (o) => <S10City offset={o} /> },
  { id: "globe", at: 87.6, from: 83.6, to: 94.3, el: (o) => <S11Globe offset={o} /> },
  { id: "datacenter", at: 98.0, from: 94.0, to: 102.3, el: (o) => <S12DataCenter offset={o} /> },
  { id: "compiler", at: 106.0, from: 102.0, to: 109.3, el: (o) => <S13Compiler offset={o} /> },
  { id: "crypto", at: 113.0, from: 109.0, to: 116.05, el: (o) => <S14Crypto offset={o} /> },
  { id: "courses", at: 120.0, from: 120.0, to: 128.2, el: (o) => <CourseMontage offset={o} /> },
  ...PHOTOS.map((cfg) => ({ id: cfg.name, at: cfg.from, from: cfg.from, to: cfg.to, el: (o: number) => <PhotoShot cfg={cfg} offset={o} /> })),
  { id: "neural", at: 152.0, from: 140.0, to: 145.4, el: (o) => <S16Neural offset={o} /> },
  { id: "vision", at: 157.0, from: 145.0, to: 148.5, el: (o) => <S17Vision offset={o} /> },
  { id: "llm", at: 160.0, from: 148.0, to: 151.3, el: (o) => <S17LLM offset={o} /> },
  { id: "graphics", at: 163.0, from: 151.0, to: 156.05, el: (o) => <S18Graphics offset={o} /> },
  { id: "future-tech", at: 168.0, from: 168.0, to: 176.0, el: (o) => <PhotoMontage set="future" offset={o} /> },
  { id: "timeline", at: 176.0, from: 156.0, to: 172.05, el: (o) => <S19Timeline offset={o} /> },
  { id: "you", at: 192.0, from: 172.0, to: 174.4, el: (o) => <S20You offset={o} /> },
  { id: "title", at: 199.2, from: 179.2, to: 204.0, el: (o) => <S22Title offset={o} /> },
  { id: "future", at: 194.0, from: 174.0, to: 180.05, origin: 173.9, el: (o) => <S21Future offset={o} /> },
];

const HITS = [
  { t: 44.0, strength: 0.9 },
  { t: 88.0, strength: 0.7 },
  { t: 120.0, strength: 0.6 },
  { t: 128.0, strength: 0.55, color: "255,236,210" },
  { t: 152.0, strength: 0.9 },
  { t: 176.0, strength: 0.5 },
  { t: 192.0, strength: 0.6 },
  { t: 200.0, strength: 0.75 },
];

export const MV: React.FC<{ muted?: boolean }> = ({ muted }) => {
  return (
    <AbsoluteFill style={{ background: "#000" }}>
      {SHOTS.map((s) => {
        const skip = Math.round((s.from - (s.origin ?? s.from)) * FPS);
        return (
          <Sequence key={s.id} name={s.id} from={Math.round(s.at * FPS)} durationInFrames={Math.round((s.to - s.from) * FPS)}>
            <Sequence from={-skip} layout="none">
              {s.el(s.origin ?? s.from)}
            </Sequence>
          </Sequence>
        );
      })}
      <Flashes hits={HITS} />
      <Vignette />
      <Letterbox />
      <Grain />
      {muted ? null : <Audio src={staticFile("audio/music.wav")} />}
    </AbsoluteFill>
  );
};
