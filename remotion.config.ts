import { Config } from "@remotion/cli/config";
import os from "os";

// Remotion refuses to start when concurrency exceeds the core count, so clamp it.
// CI runners typically have 2 cores — a hard-coded 8 would fail there.
const cores = os.cpus()?.length ?? 1;

Config.setVideoImageFormat("jpeg");
Config.setJpegQuality(95);
Config.setOverwriteOutput(true);
Config.setChromiumOpenGlRenderer("angle");
Config.setConcurrency(Math.max(1, Math.min(8, cores)));
Config.setCodec("h264");
Config.setCrf(14);
Config.setPixelFormat("yuv420p");
