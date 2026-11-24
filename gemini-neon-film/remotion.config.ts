import {Config} from '@remotion/cli/config';

Config.setVideoImageFormat('png'); // lossless frames into the H.264 encoder
Config.setPixelFormat('yuv420p');
Config.setCodec('h264');
Config.setCrf(16);
Config.setMuted(true); // no audio track at all
Config.setOverwriteOutput(true);
