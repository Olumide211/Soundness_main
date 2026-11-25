import * as THREE from 'three';
import {staticFile} from 'remotion';
import {RGBELoader} from 'three/examples/jsm/loaders/RGBELoader.js';
import {GLTFLoader, GLTF} from 'three/examples/jsm/loaders/GLTFLoader.js';
import opentype from 'opentype.js';
import {buildPigment} from '../scene/particles/pigmentData';

export const P = (p: string) => staticFile('hello-film-pack/' + p);

export type MapName = 'albedo' | 'normal_gl' | 'roughness' | 'ao' | 'displacement' | 'metalness';
export type TexSet = Partial<Record<MapName, THREE.Texture>>;
const SETS: Record<string, MapName[]> = {
  cave_rock: ['albedo', 'normal_gl', 'roughness', 'ao', 'displacement'],
  papyrus_fibre: ['normal_gl', 'roughness', 'ao', 'displacement'],
  papyrus_paper: ['albedo', 'normal_gl', 'roughness'],
  press_wood: ['albedo', 'normal_gl', 'roughness', 'ao', 'displacement'],
  brushed_steel: ['albedo', 'normal_gl', 'roughness', 'metalness'],
  brass: ['albedo', 'normal_gl', 'roughness', 'metalness'],
  copper: ['albedo', 'normal_gl', 'roughness', 'metalness'],
  black_gloss_plastic: ['albedo', 'normal_gl', 'roughness'],
  aluminium: ['albedo', 'normal_gl', 'roughness', 'metalness'],
};
export const SVG_FILES = [
  'hand_stencil_silhouette', 'hand_stencil_spray', 'stick_figures_running', 'sun',
  'hello_primitive_strokes', 'hello_brush_centerline', 'avatar_breezeog',
] as const;
export const FONT_FILES = {
  inter700: 'fonts/static/Inter-700.ttf',
  geist200: 'fonts/static/Geist-200.ttf',
  fraktur: 'fonts/static/UnifrakturMaguntia-Book.ttf',
  hiero: 'fonts/static/NotoSansEgyptianHieroglyphs-Regular.ttf',
} as const;

export type Assets = {
  tex: Record<string, TexSet>;
  hdr: THREE.DataTexture;
  handR: GLTF;
  handL: GLTF;
  radio: GLTF;
  svg: Record<string, string>;
  fonts: Record<keyof typeof FONT_FILES, opentype.Font>;
  avatar: HTMLImageElement;
};

let cache: Promise<Assets> | null = null;
let loaded: Assets | null = null;
export const getAssets = () => loaded!;

export function loadAssets(): Promise<Assets> {
  if (cache) return cache;
  const tl = new THREE.TextureLoader();
  const loadTex = (url: string, srgb: boolean) =>
    new Promise<THREE.Texture>((res, rej) =>
      tl.load(url, (t) => {
        t.wrapS = t.wrapT = THREE.RepeatWrapping;
        t.anisotropy = 8;
        t.generateMipmaps = true;
        t.minFilter = THREE.LinearMipmapLinearFilter;
        t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
        res(t);
      }, undefined, rej),
    );
  const texP = Promise.all(
    Object.entries(SETS).map(async ([set, maps]) => {
      const out: TexSet = {};
      await Promise.all(maps.map(async (m) => {
        out[m] = await loadTex(P(`textures/${set}/${m}.jpg`), m === 'albedo');
      }));
      return [set, out] as const;
    }),
  ).then((e) => Object.fromEntries(e));
  const hdrP = new Promise<THREE.DataTexture>((res, rej) => new RGBELoader().load(P('hdri/studio_small_09_1k.hdr'), (t) => { t.mapping = THREE.EquirectangularReflectionMapping; res(t); }, undefined, rej));
  const gl = new GLTFLoader();
  const glb = (p: string) => new Promise<GLTF>((res, rej) => gl.load(P(p), res, undefined, rej));
  const svgP = Promise.all(SVG_FILES.map(async (n) => [n, await (await fetch(P(`svg/${n}.svg`))).text()] as const)).then((e) => Object.fromEntries(e));
  const fontP = Promise.all(Object.entries(FONT_FILES).map(async ([k, p]) => {
    const buf = await (await fetch(P(p))).arrayBuffer();
    return [k, opentype.parse(buf)] as const;
  })).then((e) => Object.fromEntries(e) as Assets['fonts']);
  const avatarP = new Promise<HTMLImageElement>((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = P('svg/avatar_breezeog.svg'); });
  cache = Promise.all([texP, hdrP, glb('models/hand/generic-hand_right.glb'), glb('models/hand/generic-hand_left.glb'), glb('models/vintage_radio_transceiver/vintage_radio_transceiver_1k.gltf'), svgP, fontP, avatarP]).then(
    ([tex, hdr, handR, handL, radio, svg, fonts, avatar]) => {
      loaded = {tex, hdr, handR, handL, radio, svg, fonts, avatar} as Assets;
      return buildPigment(svg, (tex as any).cave_rock.displacement.image).then((pig) => {
        (loaded as any).pigment = pig;
        return loaded!;
      });
    },
  );
  return cache;
}

/** clone a set's maps with a world-size based repeat */
export function texSet(set: string, repeatX: number, repeatY: number): TexSet {
  const src = getAssets().tex[set];
  const out: TexSet = {};
  for (const [k, t] of Object.entries(src)) {
    const c = (t as THREE.Texture).clone();
    c.repeat.set(repeatX, repeatY);
    c.needsUpdate = true;
    out[k as MapName] = c;
  }
  return out;
}
/** tile sizes in metres (§6) */
export const TILE = {rock: 1.5, paper: 0.3, wood: 0.6, metal: 0.08};
