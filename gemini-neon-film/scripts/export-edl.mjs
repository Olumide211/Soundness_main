// Exports src/edl.ts → out/edl.json for the Python audio scripts (Node ≥22.6, type stripping).
import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
const edl = await import(pathToFileURL(path.resolve('src/edl.ts')).href);
fs.mkdirSync('out', {recursive: true});
fs.writeFileSync('out/edl.json', JSON.stringify({FPS: edl.FPS, DURATION: edl.DURATION, ANCHORS: edl.ANCHORS, SHOTS: edl.SHOTS, CUES: edl.CUES}, null, 1));
console.log('wrote out/edl.json');
