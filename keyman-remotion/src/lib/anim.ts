// Animation primitives — same names and semantics as the original film.js so every timing
// constant ports verbatim. Everything is a pure function of absolute time t (seconds).
import {Easing} from 'remotion';

export const clamp = (x: number, a = 0, b = 1) => Math.max(a, Math.min(b, x));
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
/** 0..1 progress of t between a and b (linear). */
export const seg = (t: number, a: number, b: number) => clamp((t - a) / (b - a));
export const lin = seg;

/** The one precise ease of the film: cubic-bezier(.7,0,.2,1). */
const bez = Easing.bezier(0.7, 0, 0.2, 1);
export const E = (t: number) => (t <= 0 ? 0 : t >= 1 ? 1 : bez(t));

/** Starts d seconds early and LANDS at t1. */
export const snap = (t: number, t1: number, d = 0.25) => E(seg(t, t1 - d, t1));
/** n eased steps between a and b. */
export const steps = (t: number, a: number, b: number, n: number) => {
  const p = seg(t, a, b) * n;
  const i = Math.floor(p);
  return i >= n ? 1 : (i + E(p - i)) / n;
};
/** clip-reveal in / out progress */
export const rin = (t: number, t1: number) => snap(t, t1, 0.125);
export const rout = (t: number, t0: number) => E(seg(t, t0, t0 + 0.25));

const hex = (c: string) => [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16));
export const mix = (a: string, b: string, t: number) => {
  const x = hex(a);
  const y = hex(b);
  return `rgb(${x.map((v, i) => Math.round(lerp(v, y[i], t))).join(',')})`;
};
export const A = (a: number) => `rgba(255,255,255,${a})`;
export const q4 = (x: number) => Math.round(x * 4) / 4;
