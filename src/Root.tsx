import { Composition } from "remotion";
import { ensureFonts } from "./fonts";
import { FPS, HEIGHT, TOTAL_FRAMES, WIDTH } from "./lib/timing";
import { MV } from "./MV";

ensureFonts();

export const Root = () => {
  return (
    <>
      <Composition id="MV" component={MV} durationInFrames={TOTAL_FRAMES} fps={FPS} width={WIDTH} height={HEIGHT} defaultProps={{ muted: false }} />
    </>
  );
};
