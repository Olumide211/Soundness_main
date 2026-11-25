import * as THREE from 'three';
import {interpolate} from 'flubber';
import {brushData, INK_W, pressure} from '../eras/brushData';
import {getAssets} from '../../lib/assets';
import {glyphOuterRing, glyphShapes, resampleRing} from '../../lib/svgPaths';
import {sheetToWorld, SHEET_MATRIX} from '../layout';

export const SORT = {face: 0.036, height: 0.024, relief: 0.0012, glyph: 0.026, pitch: 0.04};
export const LETTERS = ['H', 'E', 'L', 'L', 'O'];
export type LetterMorph = {centre: THREE.Vector2; interp: (t: number) => [number, number][]};

let cache: LetterMorph[] | null = null;
/** split the dried ink ribbon into its 5 letters; outline -> mirrored Inter 700 sort-face outline (256 pts each) */
export function letterMorphs(): LetterMorph[] {
  if (cache) return cache;
  const bd = brushData();
  const font = getAssets().fonts.inter700;
  cache = bd.letters.map(([a, b], i) => {
    const pts: THREE.Vector2[] = [], left: THREE.Vector2[] = [], right: THREE.Vector2[] = [];
    const n = 120;
    for (let k = 0; k <= n; k++) {
      const u = a + ((b - a) * k) / n;
      const {p, tan} = bd.pl.at(u);
      const w = INK_W * pressure(u) * 0.5 + 0.0006;
      left.push(new THREE.Vector2(p.x - tan.y * w, p.y + tan.x * w));
      right.push(new THREE.Vector2(p.x + tan.y * w, p.y - tan.x * w));
      pts.push(p);
    }
    const centre = pts.reduce((s, p) => s.add(p), new THREE.Vector2()).multiplyScalar(1 / pts.length);
    const ring: [number, number][] = [...left, ...right.reverse()].map((p) => [p.x - centre.x, p.y - centre.y]);
    const A = resampleRing(ring, 256);
    const B = resampleRing(glyphOuterRing(font, LETTERS[i], SORT.glyph * 1.38, true), 256);
    const interp = interpolate(A, B, {maxSegmentLength: Infinity, string: false} as any) as unknown as (t: number) => [number, number][];
    return {centre, interp};
  });
  return cache;
}
export const letterWorld = (m: LetterMorph) => sheetToWorld(m.centre.x, m.centre.y, 0.0015);
export const SHEET_Q = new THREE.Quaternion().setFromRotationMatrix(SHEET_MATRIX);
/** sort face geometry (mirrored glyph with holes, raised relief) */
export function sortFaceGeometry(i: number) {
  const shapes = glyphShapes(getAssets().fonts.inter700, LETTERS[i], SORT.glyph * 1.38, true);
  const g = new THREE.ExtrudeGeometry(shapes, {depth: SORT.relief, bevelEnabled: true, bevelSize: 0.0002, bevelThickness: 0.0002, bevelSegments: 1, curveSegments: 6});
  return g;
}
