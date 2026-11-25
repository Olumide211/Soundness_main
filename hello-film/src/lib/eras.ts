import {smoothstep} from './ease';
// Era weights from the §9 crossfade windows; they always sum to 1.
export type EraKey = 'cave' | 'papyrus' | 'press' | 'telegraph' | 'phone' | 'smartphone' | 'chat' | 'ret';
const X: [number, number][] = [
  [100, 150], // cave -> papyrus
  [225, 255], // papyrus -> press
  [375, 405], // press -> telegraph
  [525, 555], // telegraph -> phone
  [675, 705], // phone -> smartphone
  [828, 860], // smartphone -> chat
  [1040, 1150], // chat -> cave (return)
];
const ORDER: EraKey[] = ['cave', 'papyrus', 'press', 'telegraph', 'phone', 'smartphone', 'chat'];
export function eraWeights(f: number): Record<EraKey, number> {
  const w: Record<EraKey, number> = {cave: 0, papyrus: 0, press: 0, telegraph: 0, phone: 0, smartphone: 0, chat: 0, ret: 0};
  const s = X.map(([a, b]) => smoothstep(a, b, f));
  w.cave = 1 - s[0];
  for (let i = 1; i < ORDER.length; i++) w[ORDER[i]] = s[i - 1] * (1 - s[i]);
  w.cave += s[6]; // return to the cave rig
  return w;
}
