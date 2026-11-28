import { Config } from '@remotion/cli/config';
Config.setChromiumOpenGlRenderer('swangle');
Config.setVideoImageFormat('jpeg');
Config.setJpegQuality(95);
Config.setDelayRenderTimeoutInMilliseconds(600000);
Config.setMuted(true);
