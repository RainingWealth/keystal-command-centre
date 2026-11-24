// Style tokens. Cyan = cash in/held, amber = outstanding, red = immediate pressure.
export const C = {
  navy: '#101827', charcoal: '#202C3A', cyan: '#21C6D7', amber: '#FFBE55', red: '#F06262', white: '#F4F6FA',
  // derived
  navy2: '#152033', navy3: '#1A2740', slate: '#2A3A50', slate2: '#3B4D66', mute: '#8E9BB0', mute2: '#B7C1D1',
  cyanDeep: '#148A97', cyanSoft: '#7FE3EC', amberDeep: '#C98A22', amberSoft: '#FFD998', redDeep: '#B13F3F', redSoft: '#F8A5A5',
  skin: '#E6B48D', skinShade: '#C98F68', skinLight: '#F0C8A6', hair: '#171A22', grey: '#A3AAB7',
  blazer: '#1F2E4D', blazerDark: '#17233C', shirt: '#CFE3F5', shirtShade: '#A9C4DE', trouser: '#2B3446',
  wood: '#8A6E58', woodDark: '#6B5444', floor: '#1B2638', floorLight: '#26344B',
} as const;
export const FONT = {display: '"Inter Display", "Inter", sans-serif', text: '"Inter", sans-serif'} as const;
export const W = 1080;
export const H = 1920;
// Platform safe zones (TikTok / Reels / Shorts). Critical content stays inside SAFE; captions live in CAP.
export const SAFE = {left: 60, right: 1020, top: 220, bottom: 1250} as const;
export const CAP = {top: 1285, bottom: 1440} as const;
