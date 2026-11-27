import raw from '../data/timeline.json';

export type Word = {spoken: string; display: string; start: number; end: number; frame: number; tone: string};
export type Segment = {id: string; text: string; start: number; dur: number; durSec: number; caption: boolean; words: Word[]};
export type SceneT = {id: string; start: number; end: number; dur: number; segments: Segment[]};
export const TL = raw as unknown as {fps: number; totalFrames: number; totalSeconds: number; scenes: SceneT[]};
export const FPS = TL.fps;
export const SCENE = Object.fromEntries(TL.scenes.map((s) => [s.id, s])) as Record<string, SceneT>;
export const SEG = Object.fromEntries(TL.scenes.flatMap((s) => s.segments.map((g) => [g.id, g]))) as Record<string, Segment>;

/** global frame when a narration word (regex on the spoken text) starts */
export const wordFrame = (segId: string, pattern: string | RegExp, nth = 0): number => {
  const re = new RegExp(typeof pattern === 'string' ? pattern : pattern.source, 'i');
  const hits = SEG[segId].words.filter((w) => re.test(w.spoken));
  if (!hits[nth]) throw new Error(`No word /${re.source}/ #${nth} in ${segId}`);
  return hits[nth].frame;
};
export const wordEnd = (segId: string, pattern: string | RegExp, nth = 0): number => {
  const re = new RegExp(typeof pattern === 'string' ? pattern : pattern.source, 'i');
  const hits = SEG[segId].words.filter((w) => re.test(w.spoken));
  if (!hits[nth]) throw new Error(`No word /${re.source}/ #${nth} in ${segId}`);
  return Math.round(hits[nth].end * FPS);
};
export const segEnd = (segId: string) => SEG[segId].start + SEG[segId].dur;
export const sec = (s: number) => Math.round(s * FPS);
