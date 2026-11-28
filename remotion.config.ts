import { Config } from "@remotion/cli/config";
Config.setChromiumOpenGlRenderer("swangle");
Config.setVideoImageFormat("png");
Config.setCodec("h264");
Config.setCrf(16);
Config.setPixelFormat("yuv420p");
Config.setMuted(true);
