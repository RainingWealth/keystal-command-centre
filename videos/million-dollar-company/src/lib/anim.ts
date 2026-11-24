import {Easing, interpolate, spring} from 'remotion';

export const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
export const easeOut = Easing.bezier(0.22, 1, 0.36, 1); // ~ easeOutQuint
export const easeInOut = Easing.bezier(0.65, 0, 0.35, 1); // ~ easeInOutCubic
export const easeOutSoft = Easing.bezier(0.16, 1, 0.3, 1);
export const lin = (x: number) => x;

/** progress 0..1 over [start, start+dur] frames with an easing */
export const prog = (f: number, start: number, dur: number, ease: (t: number) => number = easeOut) =>
  ease(clamp01((f - start) / Math.max(1, dur)));

/** map a frame range to an arbitrary range with easing */
export const tween = (f: number, start: number, dur: number, from: number, to: number, ease: (t: number) => number = easeOut) =>
  from + (to - from) * prog(f, start, dur, ease);

/** keyframes: [[frame, value], ...] with ease between each pair */
export const keys = (f: number, k: Array<[number, number]>, ease: (t: number) => number = easeInOut) => {
  if (f <= k[0][0]) return k[0][1];
  for (let i = 1; i < k.length; i++) {
    if (f <= k[i][0]) {
      const t = (f - k[i - 1][0]) / Math.max(1, k[i][0] - k[i - 1][0]);
      return k[i - 1][1] + (k[i][1] - k[i - 1][1]) * ease(t);
    }
  }
  return k[k.length - 1][1];
};

/** well-damped spring (no bounce) from 0 -> 1 */
export const soft = (f: number, fps: number, delay: number, dur = 24) =>
  spring({frame: f - delay, fps, durationInFrames: dur, config: {damping: 200, mass: 1, stiffness: 120}});

/** appear: opacity + rise */
export const appear = (f: number, start: number, dur = 14, rise = 24) => {
  const p = prog(f, start, dur);
  return {opacity: p, y: (1 - p) * rise, p};
};

export const mix = (a: number, b: number, t: number) => a + (b - a) * t;
export const hexMix = (a: string, b: string, t: number) => {
  const pa = parseInt(a.slice(1), 16), pb = parseInt(b.slice(1), 16);
  const ch = (s: number) => Math.round(mix((pa >> s) & 255, (pb >> s) & 255, clamp01(t)));
  return `rgb(${ch(16)},${ch(8)},${ch(0)})`;
};
export const rand = (seed: number) => {
  const x = Math.sin(seed * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
};
export {interpolate};
