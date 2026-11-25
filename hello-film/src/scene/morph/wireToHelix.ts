import * as THREE from 'three';
import {WIRE_B} from '../layout';
import {easeInOutCubic, remap, smoothstep, lerp} from '../../lib/ease';

const N = 4200;
const base = WIRE_B.getSpacedPoints(N);
const frames = WIRE_B.computeFrenetFrames(N, false);
const LEN = WIRE_B.getLength();
/** cord pitch (m): 6 mm, stretching to 9 mm while the handset lifts (620-640) */
export const cordPitch = (f: number) => lerp(0.006, 0.009, smoothstep(620, 640, f));
/** wire -> helix (r 8 mm), starting at the far (phone) end and progressing toward the key; 525-555 */
export function coilPoints(f: number): THREE.Vector3[] {
  const prog = easeInOutCubic(remap(f, 525, 555));
  const pitch = cordPitch(f);
  const out: THREE.Vector3[] = [];
  for (let i = 0; i <= N; i++) {
    const s = (i / N) * LEN;
    const fromFar = 1 - i / N;
    const k = smoothstep(0, 0.12, prog * 1.12 - fromFar);
    const ang = (2 * Math.PI * s) / pitch;
    const r = 0.008 * k;
    const p = base[i].clone().addScaledVector(frames.normals[i], Math.cos(ang) * r).addScaledVector(frames.binormals[i], Math.sin(ang) * r);
    // the coiled cord sags a little more
    p.y -= 0.03 * k * Math.sin(Math.PI * (i / N));
    out.push(p);
  }
  return out;
}
export const cordMaterialMix = (f: number) => smoothstep(525, 555, f);
