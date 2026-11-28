// Usage: node scripts/stills.mjs <compId> <outPrefix> frame[:name] frame[:name] ...
import { bundle } from '@remotion/bundler';
import { renderStill, selectComposition, openBrowser } from '@remotion/renderer';
import path from 'node:path';

const [compId, prefix, ...frames] = process.argv.slice(2);
const serveUrl = await bundle({ entryPoint: path.resolve('src/index.ts') });
const browser = await openBrowser('chrome', { chromiumOptions: { gl: 'swangle' } });
const composition = await selectComposition({ serveUrl, id: compId, puppeteerInstance: browser, chromiumOptions: { gl: 'swangle' } });
for (const spec of frames) {
  const [f, name] = spec.split(':');
  const t0 = Date.now();
  const output = `${prefix}${name ?? f}.png`;
  await renderStill({ composition, serveUrl, frame: Number(f), output, puppeteerInstance: browser, chromiumOptions: { gl: 'swangle' }, timeoutInMilliseconds: 600000, overwrite: true });
  console.log(`${output} (${((Date.now() - t0) / 1000).toFixed(1)}s)`);
}
await browser.close({ silent: true });
