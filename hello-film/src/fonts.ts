import {loadFont} from '@remotion/fonts';
import {staticFile} from 'remotion';
const F = (p: string) => staticFile('hello-film-pack/fonts/static/' + p);
const list: [string, string, string][] = [
  ['Inter', 'Inter-400.ttf', '400'], ['Inter', 'Inter-500.ttf', '500'], ['Inter', 'Inter-600.ttf', '600'], ['Inter', 'Inter-700.ttf', '700'],
  ['Geist', 'Geist-200.ttf', '200'], ['Geist', 'Geist-300.ttf', '300'], ['Geist', 'Geist-400.ttf', '400'], ['Geist', 'Geist-500.ttf', '500'], ['Geist', 'Geist-600.ttf', '600'],
  ['GeistMono', 'GeistMono-400.ttf', '400'], ['GeistMono', 'GeistMono-500.ttf', '500'],
  ['UnifrakturMaguntia', 'UnifrakturMaguntia-Book.ttf', '400'],
  ['CaveatBrush', 'CaveatBrush-Regular.ttf', '400'],
  ['NotoSansEgyptianHieroglyphs', 'NotoSansEgyptianHieroglyphs-Regular.ttf', '400'],
];
let p: Promise<unknown> | null = null;
export const loadAllFonts = () => {
  if (!p) p = Promise.all(list.map(([family, file, weight]) => loadFont({family, url: F(file), weight})));
  return p;
};
