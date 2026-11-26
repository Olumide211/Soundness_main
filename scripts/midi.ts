// Minimal Standard MIDI File (type 1) writer — no dependencies.
export interface MidiNote {
  time: number; // seconds
  dur: number; // seconds
  midi: number;
  vel: number; // 1..127
  channel: number; // 0..15
  track: string;
}

const PPQ = 480;
const BPM = 120; // 1 beat = 0.5 s  ->  ticks = seconds * 960
const secToTicks = (s: number) => Math.round(s * (PPQ * BPM) / 60);

function vlq(n: number): number[] {
  const bytes = [n & 0x7f];
  n >>= 7;
  while (n > 0) {
    bytes.unshift((n & 0x7f) | 0x80);
    n >>= 7;
  }
  return bytes;
}

function chunk(type: string, data: number[]): Buffer {
  const head = Buffer.alloc(8);
  head.write(type, 0, 'ascii');
  head.writeUInt32BE(data.length, 4);
  return Buffer.concat([head, Buffer.from(data)]);
}

export function writeMidi(notes: MidiNote[], programs: Record<string, number>): Buffer {
  const trackNames = [...new Set(notes.map((n) => n.track))];
  const tracks: Buffer[] = [];
  // conductor track
  const usPerBeat = Math.round(60e6 / BPM);
  const cond: number[] = [
    0x00, 0xff, 0x03, ...vlq(8), ...Buffer.from('ONE BALL'),
    0x00, 0xff, 0x51, 0x03, (usPerBeat >> 16) & 0xff, (usPerBeat >> 8) & 0xff, usPerBeat & 0xff,
    0x00, 0xff, 0x58, 0x04, 4, 2, 24, 8,
    0x00, 0xff, 0x2f, 0x00,
  ];
  tracks.push(chunk('MTrk', cond));
  for (const name of trackNames) {
    const ns = notes.filter((n) => n.track === name);
    const ch = ns[0].channel;
    const evs: { tick: number; bytes: number[]; order: number }[] = [];
    for (const n of ns) {
      const on = secToTicks(n.time);
      const off = Math.max(on + 1, secToTicks(n.time + n.dur));
      evs.push({ tick: on, bytes: [0x90 | ch, n.midi & 0x7f, Math.max(1, Math.min(127, Math.round(n.vel)))], order: 1 });
      evs.push({ tick: off, bytes: [0x80 | ch, n.midi & 0x7f, 0], order: 0 });
    }
    evs.sort((a, b) => a.tick - b.tick || a.order - b.order);
    const nameBytes = [...Buffer.from(name)];
    const data: number[] = [0x00, 0xff, 0x03, ...vlq(nameBytes.length), ...nameBytes, 0x00, 0xc0 | ch, programs[name] ?? 0];
    let last = 0;
    for (const e of evs) {
      data.push(...vlq(e.tick - last), ...e.bytes);
      last = e.tick;
    }
    data.push(0x00, 0xff, 0x2f, 0x00);
    tracks.push(chunk('MTrk', data));
  }
  const header = Buffer.alloc(14);
  header.write('MThd', 0, 'ascii');
  header.writeUInt32BE(6, 4);
  header.writeUInt16BE(1, 8);
  header.writeUInt16BE(tracks.length, 10);
  header.writeUInt16BE(PPQ, 12);
  return Buffer.concat([header, ...tracks]);
}
