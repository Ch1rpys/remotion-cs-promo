import { Config } from "@remotion/cli/config";

Config.setVideoImageFormat("jpeg");
Config.setJpegQuality(95);
Config.setOverwriteOutput(true);
Config.setChromiumOpenGlRenderer("angle");
Config.setConcurrency(8);
Config.setCodec("h264");
Config.setCrf(14);
Config.setPixelFormat("yuv420p");
