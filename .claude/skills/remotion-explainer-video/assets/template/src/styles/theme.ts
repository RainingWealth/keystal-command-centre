import {Easing, interpolate, spring, SpringConfig} from 'remotion';

export const W = 1080;
export const H = 1920;
export const FPS = 30;

export const C = {
  navy: '#0B1B33',
  deep: '#071226',
  panel: '#12284A',
  panel2: '#183560',
  off: '#F4F1EA',
  cobalt: '#2A5BFF',
  cobaltLight: '#6C8DFF',
  teal: '#14B8A6',
  tealLight: '#5EEAD4',
  orange: '#FF6B2C',
  red: '#E5383B',
  slate: '#8A97AD',
  grid: 'rgba(244,241,234,0.07)',
} as const;

export type AccentName = 'orange' | 'cobalt' | 'teal' | 'red';
export const ACCENT: Record<AccentName, string> = {
  orange: C.orange,
  cobalt: C.cobaltLight,
  teal: C.teal,
  red: C.red,
};

export const FONT_DISPLAY = '"Buysell Display", "Inter Display", Inter, Helvetica, Arial, sans-serif';
export const FONT_TEXT = '"Buysell Text", Inter, Helvetica, Arial, sans-serif';

// Layout in 1080x1920 canvas. Essential content stays inside SAFE.
export const SAFE = {left: 72, right: 970, top: 200, bottom: 1470};
export const CX = 540;
export const CONTENT_W = SAFE.right - SAFE.left; // 898
export const ZONE = {
  label: 214,
  headTop: 270,
  headBottom: 650,
  midTop: 690,
  midBottom: 1200,
  footnote: 1222,
  captionTop: 1300,
  captionBottom: 1470,
};

// ---- motion helpers ----
export const EASE_OUT = Easing.bezier(0.16, 1, 0.3, 1);
export const EASE_IN_OUT = Easing.bezier(0.65, 0, 0.35, 1);
export const EASE_IN = Easing.bezier(0.7, 0, 0.84, 0);

/** 0..1 progress between frames [start, start+dur] with easing (clamped). */
export const prog = (frame: number, start: number, dur: number, easing: (t: number) => number = EASE_OUT) =>
  interpolate(frame, [start, start + dur], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing,
  });

export const SPR: Record<string, Partial<SpringConfig>> = {
  ui: {damping: 200},
  pop: {damping: 13, stiffness: 160, mass: 0.7},
  slam: {damping: 11, stiffness: 220, mass: 0.8},
  soft: {damping: 22, stiffness: 120},
};

/** Spring from a start frame (0 before start). */
export const sp = (frame: number, fps: number, start: number, kind: keyof typeof SPR = 'ui', durationInFrames?: number) =>
  spring({frame: frame - start, fps, config: SPR[kind], durationInFrames});

export const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/** Seeded pseudo-random (deterministic across frames/renders). */
export const rand = (seed: number) => {
  const x = Math.sin(seed * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
};
