// Scenes 3-4: the ownership problem and the crisis (present day, low-key, cool slate with one warm lamp).
import { Shot, W, H } from './engine.js';
import { drawFigure } from './figures.js';
import { clamp, lerp, seg, ss, eio, eo, mulberry } from '/core/lib.js';
import * as X from './sets.js';
import { BUILD } from './registry.js';
import { reach } from './shots_a.js';
const L2 = (a, b, k) => [lerp(a[0], b[0], k), lerp(a[1], b[1], k)];
const beat = (t, t0, w = .35) => Math.max(0, 1 - Math.abs(t - t0) / w);        // 0..1 pulse around t0

// meeting room back wall, pendant lamp and table; pass the ladder. Returns the sheets for ordering.
export function meetBack(S, P, o = {}) {
  S.sheet({ z: -.15, col: P.far, trans: .9, light: o.winLight || '#b9cfee', lp: [260, 560], lr: 1200, shadow: false, edge: 0, draw: g => g.fillRect(-100, -100, 1300, 2200) });
  S.sheet({ z: -.115, col: P.far2, trans: .45, light: o.winLight || '#b9cfee', lp: [260, 650], lr: 900, shadow: 18, draw: g => { g.fillRect(-100, -100, 1300, 2200); X.blinds(g, { x: 60, y: 300, w: 400, h: 620, step: 34 }); g.fillRect(52, 292, 416, 10); g.fillRect(52, 918, 416, 10);
    X.cut(g, () => { }); g.fillStyle = X.shade(P.far2, .85); g.fillRect(620, 340, 360, 18); g.fillRect(620, 520, 360, 18); X.boxes(g, { x: 640, y: 516, w: 330, rows: 1, seed: 3 }); X.boxes(g, { x: 640, y: 336, w: 330, rows: 1, seed: 8 }); g.fillRect(620, 700, 360, 18); } });
  S.sheet({ z: -.08, col: P.mid2, shadow: 14, shDx: 6, draw: g => { X.pendant(g, { x: o.px ?? 600, y: 0, r: 130, len: o.pl ?? 420 }); } });
  S.emit({ z: -.08, x0: (o.px ?? 600) - 360, y0: (o.pl ?? 420) + 8, w: 720, h: 980, blur: 34, glowGain: .5, gain: .9, I: () => o.lamp ?? .75,
    draw: (g, w, h) => { const r = g.createRadialGradient(360, 20, 5, 360, 420, 480); r.addColorStop(0, 'rgba(255,214,150,.95)'); r.addColorStop(1, 'rgba(255,190,100,0)'); g.fillStyle = r; g.beginPath(); g.moveTo(300, 0); g.lineTo(420, 0); g.lineTo(700, h); g.lineTo(20, h); g.closePath(); g.fill(); } });
}
export const tableSheet = (S, P, o = {}) => S.sheet({ z: -.035, col: P.mid2, trans: .08, light: P.light, lp: [600, 1150], lr: 700, shadow: 18, draw: g => { X.table(g, { x: o.x ?? -60, y: o.y ?? 1180, w: o.w ?? 1200, h: 520 }); if (!o.bare) { X.docSheet(g, { x: 220, y: 1152, w: 190, h: 30, col: '#e3d6b8' }); X.docSheet(g, { x: 700, y: 1150, w: 170, h: 30, col: '#e3d6b8', rot: 1 }); } } });
export const darkBand = (S, P, y = 1580) => S.sheet({ z: 0, col: P.front, shadow: false, rim: P.rim, rimA: .35, draw: g => g.fillRect(-100, y, 1300, 600) });
const stage = (id, P, cam, o = {}) => new Shot(id, { bg: P.sky, vig: o.vig ?? .62, bloom: o.bloom ?? .4, cam, fx: o.fx });

// ---------- meetwide: "Several weeks later": Sarah, Aaron and the estate representative ----------
BUILD.meetwide = (E) => {
  const P = X.PAL.dusk, S = stage('meetwide', P, t => ({ x: 0, y: -6 * ss(t / 2.7), d: .035 * ss(t / 2.8) }));
  meetBack(S, P, { px: 560, pl: 380 });
  const R = { who: 'rep', x: 585, y: 1096, h: 600, face: -1, seated: true, col: '#0a1018', rim: 'rgba(255,205,150,.5)' };
  S.dyn({ z: -.06, x0: 0, y0: 0, w: W, h: H, draw: (g, t) => drawFigure(g, { ...R, pose: { lean: 2, hand1: reach(R, 560, 1130), hand2: reach(R, 600, 1130), bob: Math.sin(t * 1.2) * .2 } }) });
  S.dyn({ z: -.05, x0: 0, y0: 0, w: W, h: H, draw: (g, t) => {
    drawFigure(g, { who: 'aaron', x: 250, y: 1268, h: 790, face: 1, seated: true, col: P.front, rim: 'rgba(255,205,150,.6)', pose: { lean: 4, tilt: 8, hand1: reach({ who: 'aaron', x: 250, y: 1268, h: 790, face: 1, seated: true }, 420, 1150), bob: Math.sin(t * 1.3) * .2 } });
    drawFigure(g, { who: 'sarah', x: 860, y: 1262, h: 790, face: -1, seated: true, col: P.front, rim: 'rgba(255,205,150,.6)', pose: { lean: 2, tilt: 5, hand1: reach({ who: 'sarah', x: 860, y: 1262, h: 790, face: -1, seated: true }, 690, 1150), bob: Math.sin(t * 1.1 + 1) * .2 } }); } });
  tableSheet(S, P); darkBand(S, P); return S;
};

// ---------- sarah: over Aaron's shoulder, Sarah speaks ----------
BUILD.sarah = (E) => {
  const P = X.PAL.dusk, T0 = E.shotInfo.t0, S = stage('sarah', P, t => ({ x: -10 * ss(t / 6.6), y: 0, d: .045 * ss(t / 6.6) }));
  meetBack(S, P, { px: 760, pl: 340 });
  const SA = { who: 'sarah', x: 770, y: 1290, h: 1010, face: -1, seated: true, col: P.front, rim: 'rgba(255,205,150,.75)' };
  S.dyn({ z: -.05, x0: 0, y0: 0, w: W, h: H, draw: (g, t) => {
    const tt = t + T0, s1 = beat(tt, 30.7, .6), s2 = beat(tt, 32.6, .5), s3 = beat(tt, 34.6, .6) + beat(tt, 35.3, .4), end = ss(seg(tt, 35.5, 36.3));
    drawFigure(g, { ...SA, pose: { lean: 1 + 3 * s1, tilt: 3 + 4 * s2 + 9 * end, hand1: L2(reach(SA, 600, 1160), reach(SA, 520, 1010 - 60 * s3), clamp(s1 * .6 + s3)), hand2: reach(SA, 700, 1160), bob: Math.sin(t * 1.1) * .2 } }); } });
  tableSheet(S, P, { bare: true });
  S.sheet({ z: -.01, col: P.front, shadow: 22, shDx: 16, blurPx: 9, rim: 'rgba(255,205,150,.5)', draw: g => drawFigure(g, { who: 'aaron', x: 60, y: 2150, h: 2300, face: 1, seated: true, col: P.front, rim: 'rgba(255,205,150,.5)', pose: { lean: 2, tilt: 6 } }) });
  darkBand(S, P); return S;
};

// ---------- estate: the estate representative sets out the process ----------
BUILD.estate = (E) => {
  const P = X.PAL.dusk, T0 = E.shotInfo.t0, S = stage('estate', P, t => ({ x: 6 * ss(t / 6.7), y: -4 * ss(t / 6.7), d: .042 * ss(t / 6.7) }));
  meetBack(S, P, { px: 540, pl: 340 });
  const RP = { who: 'rep', x: 540, y: 1150, h: 700, face: 1, seated: true, prop: 'folder', col: '#0a1018', rim: 'rgba(255,205,150,.6)' };
  S.dyn({ z: -.07, x0: 0, y0: 0, w: W, h: H, draw: (g, t) => { const tt = t + T0, sp = ss(seg(tt, 36.3, 36.8)) * (1 - ss(seg(tt, 41.9, 42.4)));
    drawFigure(g, { ...RP, pose: { lean: 2 + sp * 2, tilt: 2 + 3 * Math.sin(tt * 2.2) * sp, hand1: reach(RP, 640, 1060 - sp * 50 * (.5 + .5 * Math.sin(tt * 2.6))), hand2: reach(RP, 600, 1150) } }); } });
  const SA = { who: 'sarah', x: 220, y: 1262, h: 830, face: 1, seated: true, col: P.front, rim: 'rgba(255,205,150,.65)' }, A = { who: 'aaron', x: 880, y: 1268, h: 840, face: -1, seated: true, col: P.front, rim: 'rgba(255,205,150,.65)' };
  S.dyn({ z: -.05, x0: 0, y0: 0, w: W, h: H, draw: (g, t) => { const tt = t + T0;
    drawFigure(g, { ...SA, pose: { lean: 0, tilt: 4 + 5 * ss(seg(tt, 37.5, 39)), hand1: reach(SA, 420, 1150), bob: Math.sin(t * 1.2) * .2 } });
    drawFigure(g, { ...A, pose: { lean: 3, tilt: 8 - 10 * beat(tt, 40.5, .8), hand1: reach(A, 700, 1150), bob: Math.sin(t * 1.3 + 2) * .2 } }); } });
  tableSheet(S, P); darkBand(S, P); return S;
};

// ---------- aaronclose: Aaron's profile, close; "I understand" ----------
BUILD.aaronclose = (E) => {
  const P = X.PAL.dusk, T0 = E.shotInfo.t0, S = stage('aaronclose', P, t => ({ x: 14 * ss(t / 5.1), y: 0, d: .06 * ss(t / 5.1) }), { vig: .7 });
  S.sheet({ z: -.15, col: P.far, trans: .9, light: '#b9cfee', lp: [300, 700], lr: 1200, shadow: false, edge: 0, draw: g => g.fillRect(-100, -100, 1300, 2200) });
  S.sheet({ z: -.11, col: P.far2, trans: .4, light: '#ffcf94', lp: [540, 500], lr: 900, shadow: false, blurPx: 16, draw: g => { g.fillRect(-100, -100, 1300, 2200); X.cut(g, () => { for (let i = 0; i < 9; i++) { g.beginPath(); g.arc(140 + i * 110, 380 + (i % 3) * 120, 36 + (i % 2) * 22, 0, 7); g.fill(); } }); } });
  S.sheet({ z: -.08, col: P.mid2, shadow: false, blurPx: 22, draw: g => drawFigure(g, { who: 'sarah', x: 930, y: 1500, h: 1250, face: -1, seated: true, col: P.mid2, rim: 'rgba(0,0,0,0)', shade: 'rgba(0,0,0,0)' }) });
  const A = { who: 'aaron', x: 420, y: 1500, h: 1500, face: 1, seated: true, col: P.front, rim: 'rgba(255,205,150,.8)' };
  S.dyn({ z: -.04, x0: 0, y0: 0, w: W, h: H, draw: (g, t) => { const tt = t + T0, ch = ss(seg(tt, 43.0, 43.8)) * (1 - ss(seg(tt, 45.6, 46.4))), dn = ss(seg(tt, 46.5, 47.4));
    drawFigure(g, { ...A, pose: { lean: 2 + 2 * dn, tilt: 4 + 8 * dn - 3 * ch, hand1: L2(reach(A, 640, 1380), reach(A, 560, 880), ch), hand2: reach(A, 560, 1400), bob: Math.sin(t * 1.4) * .3 } }); } });
  S.sheet({ z: -.02, col: P.mid2, trans: .05, light: P.light, lp: [600, 1300], lr: 700, shadow: 18, draw: g => g.fillRect(-100, 1400, 1300, 600) });
  darkBand(S, P, 1600); return S;
};

// ---------- accounts: top-down on the ledger; the numbers arrive as paper strips (overlay) ----------
BUILD.accounts = (E) => {
  const P = X.PAL.dusk, T0 = E.shotInfo.t0, S = stage('accounts', P, t => ({ x: 0, y: 8 * ss(t / 8.6), d: .03 * ss(t / 8.6) }), { vig: .66 });
  S.sheet({ z: -.12, col: P.mid, trans: .5, light: '#ffcf94', lp: [540, 1050], lr: 1100, shadow: false, edge: 0, draw: g => { g.fillRect(-100, -100, 1300, 2200); X.cut(g, () => { }); } });
  S.sheet({ z: -.09, col: '#e9ddc0', trans: .35, light: '#fff0c8', lp: [540, 1080], lr: 700, shadow: 20, shDx: 14, draw: g => { g.save(); g.translate(540, 1070); g.rotate(-.02); g.translate(-400, -330); g.fillRect(0, 0, 800, 660); g.fillStyle = 'rgba(40,28,16,.5)'; g.fillRect(398, 0, 4, 660);
    const r = mulberry(4); for (let j = 0; j < 14; j++) { g.fillRect(30, 60 + j * 42, 340, 3); g.fillRect(430, 60 + j * 42, 340, 3); g.font = "600 26px 'Corm'"; for (let i = 0; i < 3; i++) g.fillText(String(Math.floor(r() * 90000 + 1000)).replace(/\B(?=(\d{3})+(?!\d))/g, ','), 60 + i * 110, 50 + j * 42); } g.restore(); } });
  S.sheet({ z: -.06, col: P.mid2, shadow: 14, draw: g => { X.rr(g, 780, 1330, 220, 300, 18); g.fill(); X.cut(g, () => { for (let j = 0; j < 4; j++) for (let i = 0; i < 3; i++) g.fillRect(800 + i * 64, 1430 + j * 48, 48, 32); g.fillRect(800, 1350, 180, 56); }); g.beginPath(); g.arc(130, 1420, 70, 0, 7); g.fill(); X.cut(g, () => { g.beginPath(); g.arc(130, 1420, 54, 0, 7); g.fill(); }); } });
  S.dyn({ z: -.04, x0: 0, y0: 0, w: W, h: H, draw: (g, t) => { const tt = t + T0, pt = ss(seg(tt, 49.0, 50.2)) * (1 - ss(seg(tt, 55.2, 56.2))), y = lerp(1290, 960 + 40 * Math.sin(tt * .9), pt) + Math.sin(tt * 5) * 2 * pt;
    g.save(); g.lineCap = 'round'; for (const [oy, c, a] of [[-2.4, 'rgba(255,205,150,.5)', 1], [2.2, 'rgba(0,0,0,.6)', 1], [0, P.front, 1]]) { g.strokeStyle = c; g.fillStyle = c; g.lineWidth = 104; g.beginPath(); g.moveTo(700, 2100 + oy); g.lineTo(600 + 40 * pt, y + 260 + oy); g.stroke(); g.lineWidth = 56; g.beginPath(); g.moveTo(600 + 40 * pt, y + 260 + oy); g.lineTo(540, y + oy); g.stroke(); g.beginPath(); g.ellipse(536, y - 20 + oy, 40, 56, -.1, 0, 7); g.fill(); g.lineWidth = 17; g.beginPath(); g.moveTo(528, y - 60 + oy); g.lineTo(512, y - 150 + oy); g.stroke(); } g.restore(); } });
  darkBand(S, P, 1700); return S;
};

// ---------- accountant: over Aaron's shoulder, the options ----------
function officeBack(S, P, o = {}) {
  S.sheet({ z: -.15, col: P.far, trans: .9, light: '#8fb0ff', lp: [540, 900], lr: 1200, shadow: false, edge: 0, draw: g => g.fillRect(-100, -100, 1300, 2200) });
  S.sheet({ z: -.13, col: P.far2, trans: .55, light: '#9bb8ff', lp: [540, 1000], lr: 1000, shadow: 10, draw: g => X.skyline(g, { y: 1160, seed: o.seed || 21, hMin: 220, hMax: 760, lit: .4 }) });
  S.sheet({ z: -.1, col: P.mid2, trans: .15, light: '#ffd9a0', lp: [760, 900], lr: 900, shadow: 20, draw: g => { g.fillRect(-100, -100, 1300, 2200); X.cut(g, () => g.fillRect(90, 340, 900, 700)); g.fillRect(534, 340, 12, 700); g.fillRect(90, 690, 900, 10); if (o.clock) { g.beginPath(); g.arc(900, 220, 70, 0, 7); g.fill(); X.cut(g, () => { g.beginPath(); g.arc(900, 220, 58, 0, 7); g.fill(); }); g.fillRect(897, 170, 6, 52); g.fillRect(900, 217, 38, 6); } } });
}
BUILD.accountant = (E) => {
  const P = X.PAL.night, T0 = E.shotInfo.t0, S = stage('accountant', P, t => ({ x: -8 * ss(t / 5.8), y: 0, d: .04 * ss(t / 5.8) }));
  officeBack(S, P, { seed: 31 });
  S.sheet({ z: -.07, col: P.near, trans: .05, light: '#ffd9a0', lp: [760, 1000], lr: 800, shadow: 16, draw: g => X.plant(g, { x: 140, y: 1250, k: 2.2 }) });
  const AC = { who: 'acct', x: 700, y: 1262, h: 900, face: -1, seated: true, col: P.front, rim: 'rgba(255,205,150,.85)' };
  S.dyn({ z: -.05, x0: 0, y0: 0, w: W, h: H, draw: (g, t) => { const tt = t + T0, b = beat(tt, 58.5, .45) + beat(tt, 59.8, .45) + beat(tt, 61.3, .5), sp = ss(seg(tt, 56.9, 57.4)) * (1 - ss(seg(tt, 62.3, 62.8)));
    drawFigure(g, { ...AC, pose: { lean: 2, tilt: 2 + 4 * b, hand1: reach(AC, 480, 1010 - 85 * Math.min(1, b) * sp), hand2: reach(AC, 760, 1070), bob: Math.sin(t * 1.4) * .15 } }); } });
  S.sheet({ z: -.03, col: P.mid2, shadow: 18, draw: g => { X.desk(g, { x: -40, y: 1100, w: 1160, h: 600 }); X.docSheet(g, { x: 280, y: 1074, w: 240, h: 30, col: '#dbcfb6' }); X.lampDesk(g, { x: 940, y: 1100, k: 1.3, flip: -1 }); } });
  S.sheet({ z: -.01, col: P.front, shadow: 22, shDx: 16, blurPx: 9, draw: g => drawFigure(g, { who: 'aaron', x: 20, y: 2200, h: 2400, face: 1, seated: true, col: P.front, rim: 'rgba(255,205,150,.5)', pose: { lean: 2, tilt: 4 } }) });
  darkBand(S, P, 1590); return S;
};

// ---------- latedesk: Aaron alone, late, head in his hand ----------
BUILD.latedesk = (E) => {
  const P = X.PAL.night, S = stage('latedesk', P, t => ({ x: 0, y: 6 * (1 - ss(t / 2.4)), d: .05 * (1 - ss(t / 2.4)) }), { vig: .7 });
  officeBack(S, P, { seed: 41, clock: true });
  const A = { who: 'aaron', x: 540, y: 1262, h: 900, face: 1, seated: true, col: P.front, rim: 'rgba(255,205,150,.8)' };
  S.dyn({ z: -.05, x0: 0, y0: 0, w: W, h: H, draw: (g, t) => drawFigure(g, { ...A, pose: { lean: 14 + Math.sin(t * .9) * .6, tilt: 18, hand1: reach(A, 610, 900), hand2: reach(A, 640, 1070), bob: Math.sin(t * 1.1) * .15 } }) });
  S.sheet({ z: -.03, col: P.mid2, shadow: 18, draw: g => { X.desk(g, { x: -40, y: 1100, w: 1160, h: 600 }); X.docSheet(g, { x: 160, y: 1068, w: 220, h: 32, col: '#dbcfb6', rot: -2 }); X.docSheet(g, { x: 400, y: 1072, w: 180, h: 28, col: '#d4c8ae', rot: 3 }); X.lampDesk(g, { x: 900, y: 1100, k: 1.5, flip: -1 }); } });
  S.emit({ z: -.03, x0: 560, y0: 670, w: 480, h: 520, draw: (g, w, h) => { const r = g.createRadialGradient(330, 130, 10, 250, 330, 330); r.addColorStop(0, 'rgba(255,214,150,.95)'); r.addColorStop(1, 'rgba(255,190,100,0)'); g.fillStyle = r; g.beginPath(); g.moveTo(330, 100); g.lineTo(480, 520); g.lineTo(20, 520); g.closePath(); g.fill(); }, blur: 30, I: () => .5, glowGain: .6 });
  darkBand(S, P, 1590); return S;
};

// ---------- photos: Sarah at home, the family on the shelf ----------
BUILD.photos = (E) => {
  const P = X.PAL.home, S = stage('photos', P, t => ({ x: 12 * ss(t / 2.6), y: 0, d: .05 * ss(t / 2.6) }), { vig: .68 });
  S.sheet({ z: -.15, col: P.far, trans: .85, light: '#ffb878', lp: [700, 700], lr: 1200, shadow: false, edge: 0, draw: g => g.fillRect(-100, -100, 1300, 2200) });
  S.sheet({ z: -.11, col: P.mid, trans: .3, light: '#ffc98a', lp: [700, 800], lr: 900, shadow: 18, draw: g => { g.fillRect(-100, -100, 1300, 2200); X.cut(g, () => { g.fillRect(90, 300, 300, 560); }); for (let i = 1; i < 6; i++) g.fillRect(90 + i * 50 - 3, 300, 6, 560); g.fillRect(90, 560, 300, 6); } });
  const figs = [['daniel', 'sarah'], ['daniel', 'kid', 'kid2'], ['sarah', 'kid']];
  const sh = S.sheet({ z: -.08, col: P.mid2, shadow: 16, draw: g => { g.fillRect(420, 1030, 600, 26); g.fillRect(450, 1056, 12, 70); g.fillRect(980, 1056, 12, 70);
    for (let i = 0; i < 3; i++) { const fx = 460 + i * 190; g.fillStyle = P.mid2; X.rr(g, fx, 790, 160, 240, 10); g.fill(); g.fillStyle = '#f3d9a8'; g.fillRect(fx + 14, 804, 132, 212);
      figs[i].forEach((who, k) => drawFigure(g, { who, x: fx + 46 + k * 38, y: 1010, h: who.startsWith('kid') ? 88 : 130, face: k % 2 ? -1 : 1, col: '#5a3418', rim: 'rgba(0,0,0,0)', shade: 'rgba(0,0,0,0)' })); } } });
  for (let i = 0; i < 3; i++) S.emit({ after: sh, z: -.08, x0: 474 + i * 190, y0: 804, w: 132, h: 212, blur: 22, glowGain: .4, gain: 0, I: () => .8, draw: (g, w, h) => { g.fillStyle = '#ffd9a0'; g.fillRect(0, 0, w, h); } });
  S.dyn({ z: -.05, x0: 0, y0: 0, w: W, h: H, draw: (g, t) => { const dn = ss(seg(t, .9, 2.4)); drawFigure(g, { who: 'sarah', x: 330, y: 1480, h: 1000, face: 1, col: P.front, rim: 'rgba(255,205,150,.8)', pose: { lean: 2 + 3 * dn, tilt: 4 + 10 * dn, hand1: reach({ who: 'sarah', x: 330, y: 1480, h: 1000, face: 1 }, 470, 1020 - 140 * (1 - dn)), hand2: [2, -50], bob: Math.sin(t * 1.2) * .2 }, bend: 1 }); } });
  S.sheet({ z: -.02, col: P.near, shadow: 14, draw: g => { g.fillRect(-100, 1460, 1300, 700); } });
  darkBand(S, P, 1620); return S;
};

// ---------- employees: the floor, worried; the loft light is still on ----------
BUILD.employees = (E) => {
  const P = X.PAL.dusk, S = stage('employees', P, t => ({ x: -14 * ss(t / 2.8), y: 0, d: .03 * ss(t / 2.8) }), { vig: .68 });
  S.sheet({ z: -.15, col: P.far, trans: .8, light: '#b9cfee', lp: [540, 700], lr: 1200, shadow: false, edge: 0, draw: g => g.fillRect(-100, -100, 1300, 2200) });
  const rk = S.sheet({ z: -.12, col: P.far2, trans: .4, light: '#b9cfee', lp: [540, 900], lr: 1000, shadow: 12, draw: g => { X.racks(g, { x: 40, y: 680, w: 1000, h: 740, bays: 5, levels: 3, seed: 15 }); } });
  const lo = S.sheet({ z: -.1, col: P.mid, shadow: 14, draw: g => { g.fillRect(560, 250, 520, 330); X.cut(g, () => g.fillRect(590, 280, 460, 250)); g.fillRect(560, 560, 520, 30); } });
  S.emit({ after: lo, z: -.1, x0: 590, y0: 280, w: 460, h: 250, blur: 20, glowGain: .7, I: t => .8 + .1 * Math.sin(t * 2), draw: (g, w, h) => { g.fillStyle = '#ffbd68'; g.fillRect(0, 0, w, h); } });
  S.dyn({ z: -.09, x0: 0, y0: 0, w: W, h: H, shadow: false, draw: (g, t) => { g.save(); g.beginPath(); g.rect(590, 280, 460, 250); g.clip(); drawFigure(g, { who: 'aaron', x: 810, y: 600, h: 300, face: -1, col: '#3a1d08', rim: 'rgba(0,0,0,0)', shade: 'rgba(0,0,0,0)', pose: { lean: 2, tilt: 10, hand1: [10, -85] } }); g.restore(); } });
  S.dyn({ z: -.06, x0: 0, y0: 0, w: W, h: H, draw: (g, t) => { const ws = [['worker', 230, 1, 860, 1], ['worker2', 420, -1, 830, 1], ['worker', 610, 1, 880, -1], ['worker2', 790, -1, 840, -1]];
    ws.forEach(([who, x, face, h], i) => drawFigure(g, { who, x, y: 1470, h: ws[i][3], face, col: P.front, rim: 'rgba(255,205,150,.45)', pose: { lean: 4, tilt: 8 + Math.sin(t * 1.3 + i) * 2, hand1: [8, -55], hand2: [3, -50], bob: Math.sin(t * 1.1 + i * 1.7) * .25 } })); } });
  S.sheet({ z: -.02, col: P.near, shadow: 14, draw: g => { g.fillRect(-100, 1470, 1300, 700); X.boxes(g, { x: -20, y: 1480, w: 300, rows: 2, seed: 7 }); X.boxes(g, { x: 800, y: 1480, w: 300, rows: 3, seed: 9 }); } });
  darkBand(S, P, 1620); return S;
};

// ---------- loandoc: a facility letter, the pen that will not sign ----------
BUILD.loandoc = (E) => {
  const P = X.PAL.dusk, T0 = E.shotInfo.t0, S = stage('loandoc', P, t => ({ x: 0, y: 4 * ss(t / 2.3), d: .035 * ss(t / 2.3) }), { vig: .68 });
  S.sheet({ z: -.12, col: P.mid, trans: .5, light: '#ffcf94', lp: [540, 1000], lr: 1100, shadow: false, edge: 0, draw: g => g.fillRect(-100, -100, 1300, 2200) });
  S.sheet({ z: -.09, col: '#ece0c4', trans: .35, light: '#fff0c8', lp: [540, 1000], lr: 700, shadow: 22, shDx: 14, draw: g => X.docSheet(g, { x: 180, y: 640, w: 720, h: 760, rot: 1.2, head: 'LOAN AGREEMENT', hs: 44, lh: 38, seed: 12 }) });
  S.sheet({ z: -.08, col: '#ece0c4', shadow: 8, draw: g => { g.save(); g.translate(540, 1330); g.rotate(.021); g.fillStyle = 'rgba(40,28,16,.55)'; g.fillRect(-260, 0, 330, 3); g.font = "italic 400 28px 'Corm'"; g.fillText('signature', -260, 30); g.restore(); } });
  S.dyn({ z: -.05, x0: 0, y0: 0, w: W, h: H, draw: (g, t) => { const tt = t + T0, hv = Math.sin(tt * 4.2) * 6, tx = 520 + hv, ty = 1250 + Math.sin(tt * 3.1) * 4 - 30 * ss(seg(tt, 71.4, 72.2)); g.save(); g.lineCap = 'round';
    for (const [oy, c] of [[-2.4, 'rgba(255,205,150,.5)'], [2.2, 'rgba(0,0,0,.6)'], [0, P.front]]) { g.strokeStyle = c; g.fillStyle = c; g.lineWidth = 100; g.beginPath(); g.moveTo(840, 2100 + oy); g.lineTo(720, ty + 330 + oy); g.stroke(); g.lineWidth = 58; g.beginPath(); g.moveTo(720, ty + 330 + oy); g.lineTo(tx + 90, ty + 50 + oy); g.stroke(); g.beginPath(); g.ellipse(tx + 70, ty + 20 + oy, 38, 52, .5, 0, 7); g.fill(); g.lineWidth = 11; g.beginPath(); g.moveTo(tx + 40, ty + 20 + oy); g.lineTo(tx - 6, ty + 100 + oy); g.stroke(); } g.restore(); } });
  darkBand(S, P, 1700); return S;
};

// ---------- register: the shareholder register; Daniel's line fades, and there is no plan ----------
BUILD.register = (E) => {
  const P = X.PAL.dusk, T0 = E.shotInfo.t0, S = stage('register', P, t => ({ x: 0, y: 0, d: .05 * ss(t / 1.7) }), { vig: .7 });
  S.sheet({ z: -.12, col: P.mid, trans: .5, light: '#ffcf94', lp: [540, 900], lr: 1100, shadow: false, edge: 0, draw: g => g.fillRect(-100, -100, 1300, 2200) });
  S.sheet({ z: -.09, col: '#e6d9bc', trans: .4, light: '#fff0c8', lp: [540, 900], lr: 700, shadow: 22, shDx: 14, draw: g => { g.fillRect(110, 520, 860, 760); g.fillStyle = 'rgba(40,28,16,.5)'; g.fillRect(150, 650, 780, 3); g.fillRect(150, 770, 780, 2); g.fillRect(150, 890, 780, 2); g.fillRect(150, 1010, 780, 2); g.fillRect(640, 650, 2, 520); } });
  S.dyn({ z: -.08, x0: 0, y0: 0, w: W, h: H, shadow: false, draw: (g, t) => { const tt = t + T0, fade = 1 - .7 * ss(seg(tt, 72.5, 73.9)); g.fillStyle = '#2a1a0e'; g.font = "700 46px 'Corm'"; g.fillText('REGISTER OF MEMBERS', 150, 616);
    g.font = "600 40px 'Corm'"; g.globalAlpha = fade; g.fillText('DANIEL', 160, 740); g.fillText('50%', 680, 740); g.globalAlpha = 1; g.fillText('AARON', 160, 860); g.fillText('50%', 680, 860);
    g.globalAlpha = .55 + .2 * Math.sin(tt * 3); g.font = "italic 400 36px 'Corm'"; g.fillText('?', 160, 980); g.fillText('?', 680, 980); g.globalAlpha = 1; } });
  S.sheet({ z: -.04, col: P.front, shadow: 24, shDx: 14, blurPx: 4, draw: g => drawFigure(g, { who: 'aaron', x: 260, y: 2300, h: 2300, face: 1, seated: true, col: P.front, rim: 'rgba(255,205,150,.6)', pose: { lean: 10, tilt: 22 } }) });
  darkBand(S, P, 1700); return S;
};
