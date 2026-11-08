import { loadFont } from "@remotion/fonts";
import { staticFile } from "remotion";

const fonts: { family: string; file: string; weight: string }[] = [
  { family: "NotoSerifSC", file: "fonts/NotoSerifSC.ttf", weight: "200 900" },
  { family: "NotoSansSC", file: "fonts/NotoSansSC.ttf", weight: "100 900" },
  { family: "JetBrainsMono", file: "fonts/JetBrainsMono.ttf", weight: "100 800" },
  { family: "SpaceGrotesk", file: "fonts/SpaceGrotesk.ttf", weight: "300 700" },
  { family: "Orbitron", file: "fonts/Orbitron.ttf", weight: "400 900" },
  { family: "Inter", file: "fonts/Inter.ttf", weight: "100 900" },
];

let loaded = false;
export const ensureFonts = () => {
  if (loaded) return;
  loaded = true;
  for (const f of fonts) {
    loadFont({ family: f.family, url: staticFile(f.file), weight: f.weight, format: "truetype" }).catch((e) =>
      console.error("font load failed", f.family, e),
    );
  }
};
