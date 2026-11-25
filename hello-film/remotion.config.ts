import {Config} from '@remotion/cli/config';
// Windows GPU path per spec is 'angle'. This build machine is a GPU-less Linux container,
// so the default here is overridable via REMOTION_GL (see DECISIONS.md).
Config.setChromiumOpenGlRenderer((process.env.REMOTION_GL as any) || 'angle');
Config.setConcurrency(2);
Config.setVideoImageFormat('png');
Config.setPixelFormat('yuv420p');
Config.setCodec('h264');
Config.setCrf(14);
Config.setDelayRenderTimeoutInMilliseconds(120000);
// .glsl files are imported as raw strings
Config.overrideWebpackConfig((c) => ({
  ...c,
  module: {...c.module, rules: [...(c.module?.rules ?? []), {test: /\.glsl$/, type: 'asset/source'}]},
}));
