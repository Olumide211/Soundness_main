// usage: node scripts/stills.mjs <CompositionId> <outDir> <frames comma list> [propsJSON] [scale]
import {bundle} from '@remotion/bundler';
import {renderStill, selectComposition, openBrowser} from '@remotion/renderer';
import path from 'node:path';
import fs from 'node:fs';
import {createRequire} from 'node:module';
const require = createRequire(import.meta.url);
const [,, id = 'HelloSquare', outDir = 'review', framesArg = '0', propsArg = '{}', scaleArg = '1', prefix = 'f'] = process.argv;
const gl = process.env.REMOTION_GL || 'swangle';
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const cfgPath = path.join(root, 'remotion.config.ts');
const serveUrl = process.env.BUNDLE || await bundle({
  entryPoint: path.join(root, 'src/index.ts'),
  webpackOverride: (c) => ({...c, module: {...c.module, rules: [...(c.module?.rules ?? []), {test: /\.glsl$/, type: 'asset/source'}]}}),
  publicDir: path.join(root, 'public'),
});
const inputProps = JSON.parse(propsArg);
if (process.env.DBG) inputProps.__dbg = 1;
const browser = await openBrowser('chrome', {chromiumOptions: {gl}});
const composition = await selectComposition({serveUrl, id, inputProps, puppeteerInstance: browser, chromiumOptions: {gl}, timeoutInMilliseconds: 180000});
fs.mkdirSync(outDir, {recursive: true});
const frames = framesArg.split(',').map(Number);
for (const frame of frames) {
  const t0 = Date.now();
  await renderStill({composition, serveUrl, frame, output: path.join(outDir, `${prefix}${frame}.png`), inputProps, puppeteerInstance: browser, chromiumOptions: {gl}, scale: Number(scaleArg), timeoutInMilliseconds: 180000, overwrite: true,
    onBrowserLog: (l) => { if (process.env.ALLLOG || (/error|Error|exception/i.test(l.text) && !/deprecated/.test(l.text))) console.log('[browser]', l.text.slice(0, 400)); }});
  console.log(`frame ${frame} ${((Date.now() - t0) / 1000).toFixed(1)}s`);
}
await browser.close({silent: true});
