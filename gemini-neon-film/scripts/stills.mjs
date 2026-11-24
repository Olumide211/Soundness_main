// Check step: renders stills of both formats at the check times into out/stills.
// Usage: node scripts/stills.mjs [t1 t2 ...]   (seconds; defaults to the brief's list)
import {bundle} from '@remotion/bundler';
import {renderStill, selectComposition} from '@remotion/renderer';
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const times = process.argv.slice(2).map(Number);
const T = times.length ? times : [0.5, 5.8, 9.9, 15.0, 22.3, 24.5, 26.5];
const outDir = path.join(root, 'out/stills');
fs.mkdirSync(outDir, {recursive: true});

const serveUrl = await bundle({entryPoint: path.join(root, 'src/index.ts'), publicDir: path.join(root, 'public')});
for (const id of ['GeminiNeon16x9', 'GeminiNeon9x16']) {
  const composition = await selectComposition({serveUrl, id});
  for (const t of T) {
    const frame = Math.min(composition.durationInFrames - 1, Math.round(t * composition.fps));
    const output = path.join(outDir, `${id}_${t.toFixed(2)}s.png`);
    await renderStill({serveUrl, composition, frame, output, imageFormat: 'png', overwrite: true});
    console.log('still', output);
  }
}
