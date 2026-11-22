// Shared design tokens — palette, frame grid, module grid, caption spec. Values are the original film's.
export const W = 1080;
export const H = 1920;
export const FPS = 24;
export const DURATION_S = 52;
export const DURATION_FRAMES = DURATION_S * FPS; // 1248

export const C = {
  bg: '#0B1220',
  panel: '#17243A',
  ink: '#FFFFFF',
  cy: '#00D9E8', // the single signal colour
  or: '#FF9A3C', // risk state, scene 2 only
  link: '#4C586B',
} as const;

export const FONT = 'Archivo';

// 3 x 3 module grid ("the programme")
export const CW = 272;
export const CH = 180;
export const CGX = 60;
export const CGY = 70;
export const GX = 72;
export const GY = 500;
export const MIDY = 840;
export const WINDOW = {x: 0, y: 480, w: W, h: 720};

export const CAP = {x: 72, maxW: 828, size: 54, weight: 600, y: 1312, lh: 66} as const;
export const xcol = (i: number) => 72 + i * 160;
