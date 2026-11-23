// Timeline constants (seconds) — ported verbatim from the original film.js so picture, sound and captions
// stay locked to the same beat grid (120 BPM; 1 beat = 0.5 s = 12 frames at 24 fps).
import {CW, CH, CGX, CGY, GX, GY} from '../design/tokens';
import timeline from './timeline.json';

export type Cell = {id: string; label: string; i: number; c: number; r: number; x: number; y: number; ring: number};

export const CELLS: Cell[] = (
  [
    ['sales', 'SALES'],
    ['projects', 'PROJECTS'],
    ['clients', 'CLIENTS'],
    ['ops', 'OPERATIONS'],
    ['key', 'KEY PERSON'],
    ['finance', 'FINANCE'],
    ['team', 'TEAM'],
    ['cash', 'CASH FLOW'],
    ['suppliers', 'SUPPLIERS'],
  ] as [string, string][]
).map(([id, label], i) => ({
  id,
  label,
  i,
  c: i % 3,
  r: (i / 3) | 0,
  x: GX + (i % 3) * (CW + CGX),
  y: GY + ((i / 3) | 0) * (CH + CGY),
  ring: Math.abs((i % 3) - 1) + Math.abs(((i / 3) | 0) - 1),
}));
export const RING1 = [1, 3, 5, 7];
export const RING2 = [0, 2, 6, 8];
export const ord = (i: number) => (CELLS[i].ring === 1 ? RING1 : RING2).indexOf(i);

export const K = {
  land: (i: number) => 0.25 * (i + 1), // file tile i lands; bar fills; check on land+.25
  knife: (i: number) => (CELLS[i].ring === 1 ? 3.0 : 3.25) + 0.125 * ord(i),
  slot: (i: number) => (CELLS[i].ring === 1 ? 3.75 : 4.0) + 0.125 * ord(i),
  live: (i: number) => (CELLS[i].ring === 1 ? 7.5 : 8.0) + 0.125 * ord(i),
  personIn: 3.25,
  qStart: 4.0,
  qEnd: 5.0,
  pushA: 5.0,
  pushB: 6.0,
  pullA: 6.5,
  pullB: 7.5,
  cut: 10.5,
  linksOut: 10.75,
  ripple1: 11.0,
  ripple2: 11.5,
  stall: 12.5,
  worry: 14.5,
  cashDrop: 16.5,
  wipeA: 18.5,
  wipeB: 19.0,
  gd: (i: number) => (CELLS[i].ring === 1 ? 11.0 : 11.5) + 0.125 * ord(i),
};
export const tickT = (i: number) => K.land(i) + 0.25;

export const ROLES: [number, string][] = [
  [-99, 'KEY PERSON'],
  [7.0, 'FOUNDER'],
  [8.0, 'LEAD OPERATOR'],
  [9.0, 'TOP SALESPERSON'],
  [10.0, 'KEY PERSON'],
];

export const S3T = {
  title: 19.0,
  tower: [20.0, 20.25, 20.5],
  shield: [20.5, 22.25],
  card: 22.5,
  tag: 23.0,
  cond: 24.25,
  tick: 26.5,
  pay: [27.0, 27.75],
};

// shield outline: polyline + two beziers, flattened (same 40-segment flattening as the original)
export const SHIELD: [number, number][] = (() => {
  const pts: [number, number][] = [
    [292, 596],
    [512, 626],
    [512, 880],
  ];
  const bez = (p0: number[], p1: number[], p2: number[], p3: number[], n: number) => {
    for (let i = 1; i <= n; i++) {
      const u = i / n;
      const v = 1 - u;
      pts.push([
        v ** 3 * p0[0] + 3 * v * v * u * p1[0] + 3 * v * u * u * p2[0] + u ** 3 * p3[0],
        v ** 3 * p0[1] + 3 * v * v * u * p1[1] + 3 * v * u * u * p2[1] + u ** 3 * p3[1],
      ]);
    }
  };
  bez([512, 880], [512, 1040], [400, 1120], [292, 1166], 40);
  bez([292, 1166], [184, 1120], [72, 1040], [72, 880], 40);
  pts.push([72, 626], [292, 596]);
  return pts;
})();

// ---- narration timeline (word onsets from Whisper, captions chunks) — copied from the original, not re-derived
export type TLLine = {id: string; t: number; dur: number; text: string; screen: string[]; wt: number[]};
export type TLCue = {t0: number; t1: number; text: string; words: number[]; id: string};
export const TL = timeline as unknown as {bpm: number; dur: number; lines: TLLine[]; cues: TLCue[]};
export const wt = (id: string, i: number) => TL.lines.find((l) => l.id === id)!.wt[i];

export type Link = {a: Cell; b: Cell; center: boolean};
export const LINKS: Link[] = (() => {
  const L: Link[] = [];
  for (const a of CELLS)
    for (const b of CELLS) {
      if (b.i <= a.i) continue;
      const dx = Math.abs(a.c - b.c);
      const dy = Math.abs(a.r - b.r);
      if (dx + dy !== 1) continue;
      L.push({a, b, center: a.i === 4 || b.i === 4});
    }
  return L;
})();
