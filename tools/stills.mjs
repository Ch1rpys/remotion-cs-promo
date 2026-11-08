// usage: node tools/stills.mjs [--scale=0.5] [--prefix=name] 1.5 3 10.2 ...
import { bundle } from "@remotion/bundler";
import { openBrowser, renderStill, selectComposition } from "@remotion/renderer";
import fs from "fs";
import path from "path";

const args = process.argv.slice(2);
let scale = 0.5;
let prefix = "f";
const secs = [];
for (const a of args) {
  if (a.startsWith("--scale=")) scale = Number(a.slice(8));
  else if (a.startsWith("--prefix=")) prefix = a.slice(9);
  else secs.push(Number(a));
}
fs.mkdirSync("out/stills", { recursive: true });
const t0 = Date.now();
const serveUrl = await bundle({ entryPoint: path.resolve("src/index.ts"), onProgress: () => {} });
const chromiumOptions = { gl: "angle" };
const browser = await openBrowser("chrome", { chromiumOptions });
const inputProps = { muted: true };
const composition = await selectComposition({ serveUrl, id: process.env.COMP ?? "MV", inputProps, puppeteerInstance: browser, chromiumOptions });
for (const s of secs) {
  const frame = Math.min(composition.durationInFrames - 1, Math.round(s * composition.fps));
  const output = `out/stills/${prefix}_${s.toFixed(2)}.jpg`;
  await renderStill({ composition, serveUrl, output, frame, imageFormat: "jpeg", jpegQuality: 88, inputProps, puppeteerInstance: browser, chromiumOptions, scale, overwrite: true });
  console.log("wrote", output);
}
await browser.close({ silent: true });
console.log(`done in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
