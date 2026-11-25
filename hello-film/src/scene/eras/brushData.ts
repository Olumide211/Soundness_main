import * as THREE from 'three';
import {getAssets} from '../../lib/assets';
import {parseSvg, ArcPolyline} from '../../lib/svgPaths';
import {SHEET} from '../layout';
import {easeInOutSine, remap} from '../../lib/ease';

export const BRUSH_K = 0.3 / 420; // svg units -> metres (0.30 m wide)
export const BRUSH_OFF = new THREE.Vector2(-0.03, 0.012);
export const svgToSheet = (x: number, y: number) => new THREE.Vector2((x - 210) * BRUSH_K + BRUSH_OFF.x, (90 - y) * BRUSH_K + BRUSH_OFF.y);
export const GLYPH = {x: 0.142, y: -0.03, h: 0.014};

export type BrushData = {pl: ArcPolyline; letters: [number, number][]};
let cache: BrushData | null = null;
export function brushData(): BrushData {
  if (cache) return cache;
  const paths = parseSvg(getAssets().svg.hello_brush_centerline);
  const sp = paths[0].path;
  const raw: THREE.Vector2[] = [];
  for (const sub of sp.subPaths) for (const p of sub.getSpacedPoints(900)) raw.push(svgToSheet(p.x, p.y));
  const pl = new ArcPolyline(raw);
  // letter boundaries at the path's joining anchors (h | e | l | l | o)
  const cuts = [[108, 150], [185, 140], [210, 150], [265, 150]].map(([x, y]) => pl.nearestU(svgToSheet(x, y)));
  const b = [0, ...cuts, 1];
  cache = {pl, letters: [0, 1, 2, 3, 4].map((i) => [b[i], b[i + 1]] as [number, number])};
  return cache;
}
export const brushU = (f: number) => easeInOutSine(remap(f, 165, 215));
export const pressure = (u: number) => 0.6 + 0.4 * Math.sin(u * Math.PI * 7);
export const INK_W = 0.0022 * 1.6; // see DECISIONS: 2.2 mm x 1.6 so the word reads at 1080p
export const SHEET_SIZE = SHEET;
