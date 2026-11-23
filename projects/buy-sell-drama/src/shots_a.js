// Scenes 1-2: the friendship (flashback, warm) and the call (night, cold).
import { Shot, W, H } from './engine.js';
import { drawFigure, WHO } from './figures.js';
import { clamp, lerp, seg, ss, eio, eo, mulberry } from '/core/lib.js';
import * as X from './sets.js';
import { BUILD, IRIS } from './registry.js';
const lerp2 = (a, b, k) => [lerp(a[0], b[0], k), lerp(a[1], b[1], k)];
// hand target (u, feet-origin) that reaches a screen point
export function reach(sp, tx, ty) { const w = WHO[sp.who], u = sp.h / 100 * (w.H / 100); return [(tx - sp.x) / (u * (sp.face || 1)), (ty - sp.y) / u - (sp.seated ? 47 : 0)]; }

// ---------- corridor: tunnel-book hospital corridor, Aaron and the buzzing phone ----------
BUILD.corridor = (E) => {
  const P = X.PAL.hospital, VP = [540, 800], buzz = E.hit.buzz;
  const S = new Shot('corridor', { bg: P.sky, vig: .62, bloom: .45, cam: t => ({ x: Math.sin(t * .9) * 4, y: 0, d: .028 * ss(t / 2.7) }),
    fx: t => ({ flick: 1 - .07 * Math.max(0, Math.sin(t * 31) * Math.sin(t * 7.3)) * (t > 1.6 ? 1.6 : .5) }) });
  const back = S.sheet({ z: -.14, col: P.far, trans: .9, light: '#dff3f0', lp: [540, 880], lr: 700, shadow: false, edge: 0, draw: g => g.fillRect(-100, -100, 1300, 2200) });
  S.emit({ after: back, x0: VP[0] - 36, y0: VP[1] - 56, w: 72, h: 112, z: -.14, draw: (g, w, h) => { g.fillStyle = '#e8fbf6'; g.fillRect(0, 0, w, h); }, I: () => .9 });
  const opens = [[120, 168], [210, 300], [340, 500], [530, 790], [830, 1280]], cols = [P.far, P.far2, P.mid, P.mid2, P.near];
  opens.forEach(([ow, oh], k) => {
    const z = -.125 + k * .026, col = cols[k], nx = opens[k + 1] || [1500, 2300];
    const L = S.sheet({ z, col, trans: .55 - k * .08, light: '#cfeeee', lp: [650, VP[1]], lr: 900, shadow: 10 + k * 3, shDx: 6, shDy: 12, shA: .42, draw: g => {
      g.fillRect(-100, -100, 1300, 2200); const fl = g.createLinearGradient(0, VP[1] + oh / 2, 0, VP[1] + nx[1] / 2); fl.addColorStop(0, 'rgba(210,235,235,.38)'); fl.addColorStop(1, 'rgba(210,235,235,0)');
      g.fillStyle = fl; g.fillRect(VP[0] - nx[0] / 2, VP[1] + oh / 2, nx[0], nx[1] / 2 - oh / 2);
      if (k >= 1) { const side = k % 2 ? -1 : 1, dw = ow * .22, dh = oh * .6, dx = VP[0] + side * (ow / 2 + (nx[0] - ow) / 4) - dw / 2; g.fillStyle = X.shade(col, .8); g.fillRect(dx, VP[1] + oh * .5 - dh + 4, dw, dh); }
      X.cut(g, () => g.fillRect(VP[0] - ow / 2, VP[1] - oh / 2, ow, oh)); } });
    const ring = (nx[1] - oh) / 4, bw = ow * .5;
    S.emit({ after: L, x0: VP[0] - bw / 2, y0: VP[1] - oh / 2 - ring - 8, w: bw, h: Math.max(10, ring * .55), z, draw: (g, w, h) => { g.fillStyle = '#eaffff'; g.fillRect(0, 0, w, h); }, blur: 14,
      I: t => .85 * (k === 3 ? 1 - .5 * Math.max(0, Math.sin(t * 17) * Math.sin(t * 5.1)) : 1) });
  });
  const A = { who: 'aaron', x: 395, y: 1590, h: 1040, face: 1, prop: 'phone', col: P.front, rim: 'rgba(190,225,255,.75)' };
  const shake = t => buzz.reduce((a, b) => a + Math.max(0, 1 - Math.abs(t - (b + .1)) / .22), 0);
  S.dyn({ z: -.02, x0: 0, y0: 0, w: W, h: H, shDx: 14, shDy: 10, draw: (g, t) => { const sk = shake(t), lift = ss(seg(t, buzz[0], buzz[0] + .35)) * 3, look = ss(seg(t, buzz[0] + .15, buzz[0] + .6));
    drawFigure(g, { ...A, pose: { lean: 2 + look * 3, tilt: 6 + look * 12, hand1: [12.5 + Math.sin(t * 80) * sk * .35, -73 - lift], hand2: [3, -52], bob: Math.sin(t * 1.3) * .15 } }); } });
  const ph = IRIS.contract = [A.x + 12.5 * 10.4, A.y - 73 * 10.4];
  S.emit({ x0: ph[0] - 70, y0: ph[1] - 90, w: 140, h: 180, z: -.02, draw: (g, w, h) => { g.fillStyle = '#bfe0ff'; g.fillRect(w / 2 - 17, h / 2 - 30, 34, 60); }, blur: 26, glowGain: 1.1,
    I: t => { let i = 0; for (const x of buzz) i = Math.max(i, Math.max(0, 1 - Math.abs(t - (x + .18)) / .42)); return Math.max(i, ss(seg(t, 1.9, 2.6))) + .08; } });
  S.sheet({ z: 0, col: P.front, shadow: false, rim: 'rgba(170,215,230,1)', rimA: .35, draw: g => { g.fillRect(-100, 1560, 1300, 600); X.chairRow(g, 600, 1560, 5, 1.05); } });
  return S;
};

// ---------- contract: first contract signed, a small shophouse office (flashback) ----------
BUILD.contract = (E) => {
  const P = X.PAL.warm, T = E.hit.pen - E.shotInfo.t0, T2 = E.hit.shake - E.shotInfo.t0;
  const S = new Shot('contract', { bg: P.sky, vig: .5, bloom: .32, cam: t => ({ x: Math.sin(t * .8) * 5, y: -4 * ss(t / 2.5), d: .026 * ss(t / 2.5) }), fx: () => ({ tint: ['#ffe1a8', .1, 'multiply'] }) });
  S.sheet({ z: -.15, col: P.far, trans: .95, light: '#fff3c8', lp: [540, 700], lr: 1100, shadow: false, edge: 0, draw: g => g.fillRect(-100, -100, 1300, 2200) });
  S.sheet({ z: -.135, col: P.far2, trans: .55, light: '#ffe9b4', lp: [540, 900], lr: 900, shadow: 10, draw: g => { for (let i = 0; i < 5; i++) X.shophouse(g, { x: -40 + i * 250, y: 560 + (i % 2) * 40, w: 230, h: 700, n: 2 }); } });
  S.sheet({ z: -.105, col: P.mid, trans: .4, light: P.light, lp: [540, 560], lr: 900, shadow: 18, draw: g => { g.fillRect(-100, -100, 1300, 2200); X.cut(g, () => { X.arch(g, 110, 300, 290, 700); X.arch(g, 680, 300, 290, 700); }); g.fillRect(246, 300, 8, 700); g.fillRect(816, 300, 8, 700); } });
  S.sheet({ z: -.085, col: P.mid2, trans: .2, light: P.light, lp: [540, 600], lr: 700, shadow: 14, draw: g => { g.fillRect(40, 760, 130, 600); X.cut(g, () => { for (let i = 0; i < 4; i++) g.fillRect(52, 800 + i * 140, 106, 6); }); X.plant(g, { x: 960, y: 1220, k: 1.9 }); X.docSheet(g, { x: 470, y: 380, w: 150, h: 200, rot: -3, col: '#e7d6b0', head: '2011', hs: 26, lh: 30 }); } });
  const A = { who: 'aaron', x: 330, y: 1500, h: 800, face: 1, col: P.front, rim: 'rgba(255,226,170,.9)' }, D = { who: 'daniel', x: 770, y: 1500, h: 800, face: -1, col: P.front, rim: 'rgba(255,226,170,.9)' };
  S.dyn({ z: -.055, x0: 0, y0: 0, w: W, h: H, shDx: 12, draw: (g, t) => {
    const sign = 1 - ss(seg(t, 1.1, 1.4)), shake = ss(seg(t, T2 - .15, T2 + .15)), pump = Math.sin(t * 17) * shake * 1.6, hs = [540, 1040 + pump * 5];
    const ha = sign > .5 ? [510 + Math.sin(t * 7) * 10 * sign, 1128 + Math.sin(t * 13) * 3] : hs;
    drawFigure(g, { ...A, prop: sign > .5 ? 'pen' : null, pose: { lean: 8 * sign + 2, tilt: 14 * sign - 4 * shake, hand1: reach(A, ha[0], ha[1]), hand2: [4, -50], bob: Math.sin(t * 2) * .2 }, bend: 1 });
    drawFigure(g, { ...D, pose: { lean: 4 + 5 * sign, tilt: 8 * sign - 6 * shake, hand1: shake > .5 ? reach(D, 548, 1040 + pump * 5) : [4, -56], hand2: shake > .3 ? reach(D, A.x + 40, 760) : [3, -52], bob: Math.sin(t * 2.3) * .2 + shake * pump * .2 }, bend: 1 }); } });
  S.sheet({ z: -.03, col: P.near, trans: .1, light: P.light, lp: [540, 1100], lr: 700, shadow: 16, draw: g => { X.desk(g, { x: 150, y: 1130, w: 780, h: 470 }); X.docSheet(g, { x: 400, y: 1096, w: 280, h: 36, rot: 0, col: '#efe3c8', lh: 40, ink: 'rgba(40,28,16,.5)' }); } });
  S.sheet({ z: 0, col: P.front, shadow: false, rim: P.rim, rimA: .4, draw: g => { g.fillRect(-100, 1560, 1300, 600); } });
  return S;
};

// ---------- growth: lateral travel through fifteen years (shophouse -> warehouse -> tower) ----------
BUILD.growth = (E) => {
  const P = X.PAL.warm, D = 3.6;
  const S = new Shot('growth', { bg: P.sky, vig: .5, bloom: .4, cam: t => ({ x: 760 * eio(t / D), y: 0, d: .012 * t / D }), fx: t => ({ tint: [X.mix('#ffd9a0', '#ffe9b0', t / D), .1, 'multiply'] }) });
  const sk = S.sheet({ z: -.15, col: P.far, trans: .95, light: '#fff0c0', lp: [900, 800], lr: 1500, w: 2600, h: 2100, shadow: false, edge: 0, draw: g => g.fillRect(-700, -100, 2600, 2200) });
  S.sheet({ z: -.13, col: P.far2, trans: .55, light: '#ffe8b0', lp: [900, 1000], lr: 1200, w: 2600, h: 2100, shadow: 10, draw: g => X.skyline(g, { y: 1180, seed: 5, x0: -700, x1: 1900, hMin: 200, hMax: 640, lit: .35 }) });
  S.sheet({ z: -.09, col: P.mid, trans: .3, light: P.light, lp: [700, 900], lr: 1200, w: 2600, h: 2100, shadow: 16, draw: g => {
    X.shophouse(g, { x: -120, y: 700, w: 340, h: 700, n: 2 }); X.shophouse(g, { x: 230, y: 740, w: 300, h: 660, n: 2 });                 // 1: first office
    g.fillRect(600, 880, 700, 520); g.fillRect(590, 860, 720, 30); X.cut(g, () => { g.fillRect(660, 1060, 260, 340); for (let i = 0; i < 6; i++) g.fillRect(960 + i * 52, 920, 36, 40); });   // 2: warehouse
    g.fillRect(1420, 380, 400, 1020); X.cut(g, () => { for (let j = 0; j < 14; j++) for (let i = 0; i < 6; i++) if ((i * 7 + j * 3) % 5 !== 0) g.fillRect(1448 + i * 62, 430 + j * 66, 36, 34); }); } });   // 3: the tower
  S.emit({ z: -.09, x0: 150, y0: 1000, w: 100, h: 80, draw: (g, w, h) => { g.fillStyle = '#ffd27a'; g.fillRect(0, 0, w, h); }, I: () => 1 });
  S.dyn({ z: -.07, x0: -100, y0: 0, w: 2200, h: H, shDx: 8, draw: (g, t) => {
    drawFigure(g, { who: 'aaron', x: 140, y: 1300, h: 150, face: 1, seated: true, col: P.front, rim: 'rgba(255,226,170,.9)', pose: { lean: 12, hand1: [14, -62] } });     // two founders at the first desk
    drawFigure(g, { who: 'daniel', x: 280, y: 1300, h: 150, face: -1, seated: true, col: P.front, rim: 'rgba(255,226,170,.9)', pose: { lean: 8, hand1: [14, -62] } });
    const f = (t * 1.7) % 1; X.forklift(g, { x: 880 + Math.sin(t * 1.1) * 40, y: 1385, k: .9, face: 1 }); } });
  S.sheet({ z: -.05, col: P.mid2, trans: .1, light: P.light, lp: [900, 1200], lr: 900, w: 2600, h: 2100, shadow: 14, draw: g => { X.boxes(g, { x: 620, y: 1400, w: 300, rows: 3, seed: 5 }); X.boxes(g, { x: 1180, y: 1400, w: 220, rows: 2, seed: 8 }); } });
  S.sheet({ z: -.02, col: P.near, shadow: 14, w: 2600, h: 2100, draw: g => { g.fillRect(-700, 1400, 2600, 700); for (let i = 0; i < 6; i++) { g.fillRect(-300 + i * 480, 960, 12, 460); g.fillRect(-300 + i * 480 - 36, 950, 96, 14); } } });
  S.emit({ z: -.02, after: undefined, x0: 0, y0: 0, w: 1, h: 1, draw: () => { }, I: () => 0 });
  S.sheet({ z: 0, col: P.front, shadow: false, rim: P.rim, rimA: .35, w: 2600, h: 2100, draw: g => g.fillRect(-700, 1560, 2600, 600) });
  const van = S.sheet({ z: -.04, col: P.mid2, shadow: 12, w: 2600, h: 2100, anim: t => ({ dx: -340 + 1400 * eio(t / D) }), draw: g => X.van(g, { x: 0, y: 1410, k: 1.2 }) });
  return S;
};

// ---------- toast: fifteen years on, in the loft office above the warehouse floor (dusk) ----------
BUILD.toast = (E) => {
  const P = X.PAL.warm, T0 = E.shotInfo.t0, c1 = E.hit.cupclink - T0, c2 = 14.4 - T0;
  const S = new Shot('toast', { bg: '#e9a35a', vig: .55, bloom: .45, cam: t => ({ x: Math.sin(t * .5) * 6, y: -6 * ss(t / 6), d: .036 * ss(t / 6.4) }), fx: () => ({ tint: ['#ffd9a0', .08, 'multiply'] }) });
  S.sheet({ z: -.15, col: '#f0a860', trans: 1, light: '#ffe2a0', lp: [820, 620], lr: 1200, shadow: false, edge: 0, draw: g => g.fillRect(-100, -100, 1300, 2200) });
  S.emit({ z: -.15, x0: 600, y0: 400, w: 420, h: 420, draw: (g, w, h) => { const r = g.createRadialGradient(210, 210, 0, 210, 210, 210); r.addColorStop(0, '#fff4cc'); r.addColorStop(.45, '#ffd88a'); r.addColorStop(1, 'rgba(255,180,80,0)'); g.fillStyle = r; g.fillRect(0, 0, w, h); }, I: () => .8, blur: 30 });
  S.sheet({ z: -.12, col: P.far2, trans: .5, light: '#ffe2a0', lp: [700, 900], lr: 900, shadow: 12, draw: g => { X.racks(g, { x: 80, y: 700, w: 940, h: 640, bays: 5, levels: 3, seed: 7 }); } });
  S.sheet({ z: -.09, col: P.mid, trans: .3, light: P.light, lp: [540, 700], lr: 800, shadow: 20, draw: g => { g.fillRect(-100, -100, 1300, 2200); X.cut(g, () => g.fillRect(110, 330, 860, 760)); g.fillRect(110, 702, 860, 10); g.fillRect(534, 330, 12, 760); } });
  const D = { who: 'daniel', x: 330, y: 1470, h: 850, face: 1, prop: 'cup', col: P.front, rim: 'rgba(255,224,160,.95)' }, A = { who: 'aaron', x: 760, y: 1470, h: 820, face: -1, prop: 'cup', col: P.front, rim: 'rgba(255,224,160,.95)' };
  S.dyn({ z: -.06, x0: 0, y0: 0, w: W, h: H, draw: (g, t) => {
    const spk = ss(seg(t, .3, .6)) * (1 - ss(seg(t, 3.6, 3.9))), cl1 = env(t, c1 - .35, c1 + .5), cl2 = env(t, c2 - .35, c2 + .5), sw = Math.sin(t * 3.1);
    const mid = [546, 930];
    const dh = cl1 > .02 || cl2 > .02 ? lerp2(reach(D, 330 + 120, 980), reach(D, mid[0] - 12, mid[1]), Math.max(cl1, cl2)) : lerp2([6, -64], reach(D, 610, 780 + sw * 8), spk);
    const ah = lerp2([6, -64], reach(A, mid[0] + 12, mid[1]), Math.max(cl1, cl2 * 1));
    const ah2 = t > 4.1 ? lerp2(ah, reach(A, 700, 700), ss(seg(t, 4.2, 4.7)) * (1 - Math.max(cl2, 0) * 0)) : ah;
    drawFigure(g, { ...D, pose: { lean: 3 + spk * 3, tilt: 4 * sw * spk + cl1 * 5, hand1: dh, hand2: reach(D, 520, 820 + sw * 12 * spk) } });
    drawFigure(g, { ...A, pose: { lean: -2 + ss(seg(t, 1, 2)) * 3, tilt: -6 + ss(seg(t, .6, 1.6)) * 6, hand1: ah, hand2: [3, -55] } }); } });
  S.sheet({ z: -.03, col: P.near, trans: .1, light: P.light, lp: [540, 1100], lr: 700, shadow: 16, draw: g => { X.desk(g, { x: 100, y: 1180, w: 880, h: 420 }); X.docSheet(g, { x: 220, y: 1152, w: 200, h: 30, col: '#efe3c8' }); X.cup(g, 700, 1180, 1.1); } });
  S.sheet({ z: 0, col: P.front, shadow: false, rim: P.rim, rimA: .4, draw: g => g.fillRect(-100, 1580, 1300, 600) });
  return S;
};
const env = (t, a, b) => Math.min(seg(t, a, a + .12), 1 - seg(t, b - .3, b));

// ---------- tower / window: exterior at night; Aaron's lit window and, far right, Daniel's home ----------
function towerShot(id, E, mode) {
  const P = X.PAL.night, T0 = E.shotInfo.t0, off = E.hit.farwin_off - T0, ring = E.hit.ring[0] - T0;
  const out = mode === 'out', D = out ? 2.1 : 4.2, lw = [455, 1060];                                   // Aaron's window centre
  const S = new Shot(id, { bg: P.sky, vig: .62, bloom: .5, cam: t => out ? { x: lerp(-62, 0, ss(t / D)), y: lerp(86, 0, ss(t / D)), d: .12 * (1 - ss(t / D)) } : { x: -62 * ss(t / D), y: 86 * ss(t / D), d: .12 * ss(t / D) } });
  S.sheet({ z: -.15, col: P.far, trans: .9, light: '#8fb0ff', lp: [540, 1100], lr: 1200, shadow: false, edge: 0, draw: g => g.fillRect(-100, -100, 1300, 2200) });
  S.sheet({ z: -.135, col: P.far2, trans: .55, light: '#9bb8ff', lp: [540, 1200], lr: 1000, shadow: 10, draw: g => X.skyline(g, { y: 1500, seed: 11, hMin: 260, hMax: 900, lit: .22 }) });
  const hd = S.sheet({ z: -.11, col: P.mid, trans: .3, light: '#a8c0ff', lp: [900, 1100], lr: 800, shadow: 14, draw: g => { X.hdb(g, { x: 760, y: 700, w: 440, h: 800, cols: 8, rows: 15, seed: 4, lit: .9 }); } });
  const hdW = [760 + 440 / 8 * 5.2, 700 + 20 + 52 * 8];                                                     // Daniel's window in the block
  S.emit({ after: hd, z: -.11, x0: hdW[0], y0: hdW[1], w: 440 / 8 * .5, h: 26, draw: (g, w, h) => { g.fillStyle = '#ffc27a'; g.fillRect(0, 0, w, h); }, blur: 16, glowGain: 1.2, I: t => out ? 1 - ss(seg(t, off - .05, off + .2)) : 1 });
  const tw = S.sheet({ z: -.06, col: P.mid2, trans: .12, light: '#b4c8ff', lp: [400, 1000], lr: 800, shadow: 22, shDx: 14, draw: g => { g.fillRect(-60, 300, 800, 1500); g.fillRect(-60, 270, 800, 36);
    X.cut(g, () => { for (let j = 0; j < 17; j++) for (let i = 0; i < 7; i++) { const x = 6 + i * 104, y = 340 + j * 70; if (Math.abs(x + 34 - lw[0]) < 60 && Math.abs(y + 26 - lw[1]) < 40) continue; if ((i * 5 + j * 3) % 4) g.fillRect(x, y, 68, 50); } }); } });
  const dim = (t) => .55;
  S.emit({ after: tw, z: -.06, x0: lw[0] - 34, y0: lw[1] - 26, w: 68, h: 52, draw: (g, w, h) => { g.fillStyle = '#ffbd68'; g.fillRect(0, 0, w, h); }, blur: 20, glowGain: 1.3, I: t => (out ? 1 : 1) * (1 - .6 * Math.max(0, Math.sin(t * 9.1) * (t > ring - .05 && t < ring + .5 ? 1 : 0))) });
  S.dyn({ z: -.059, x0: 0, y0: 0, w: W, h: H, shadow: false, draw: (g, t) => { g.save(); g.beginPath(); g.rect(lw[0] - 34, lw[1] - 26, 68, 52); g.clip();
    drawFigure(g, { who: 'aaron', x: lw[0] - 4, y: lw[1] + 38, h: 86, face: 1, seated: true, col: '#3a1d08', rim: 'rgba(255,220,160,.0)', shade: 'rgba(0,0,0,0)', pose: { lean: 6, hand1: [14, -62] } }); g.restore(); } });
  S.sheet({ z: 0, col: P.front, shadow: false, rim: P.rim, rimA: .3, draw: g => { g.fillRect(-100, 1620, 1300, 500); g.fillRect(-100, 1590, 1300, 40); for (let i = 0; i < 12; i++) g.fillRect(-60 + i * 110, 1540, 8, 60); } });
  return S;
}
BUILD.tower = (E) => towerShot('tower', E, 'in');
BUILD.window = (E) => towerShot('window', E, 'out');

// ---------- call: Aaron at his desk, the phone, the silence ----------
BUILD.call = (E) => {
  const P = X.PAL.night, T0 = E.shotInfo.t0, h1 = E.lines ? 0 : E.hit.answer - T0, sil = E.hit.silence0 - T0, ansT = E.hit.answer - T0;
  const S = new Shot('call', { bg: P.sky, vig: .66, bloom: .42, cam: t => ({ x: 8 * ss(t / 5.2), y: -10 * ss(t / 5.2), d: .05 * ss(t / 5.2) }) });
  S.sheet({ z: -.15, col: P.far, trans: .9, light: '#8fb0ff', lp: [540, 900], lr: 1200, shadow: false, edge: 0, draw: g => g.fillRect(-100, -100, 1300, 2200) });
  S.sheet({ z: -.13, col: P.far2, trans: .55, light: '#9bb8ff', lp: [540, 1000], lr: 1000, shadow: 10, draw: g => X.skyline(g, { y: 1160, seed: 21, hMin: 220, hMax: 760, lit: .4 }) });
  S.sheet({ z: -.1, col: P.mid2, trans: .15, light: '#ffd9a0', lp: [760, 900], lr: 900, shadow: 20, draw: g => { g.fillRect(-100, -100, 1300, 2200); X.cut(g, () => g.fillRect(90, 360, 900, 700)); g.fillRect(534, 360, 12, 700); g.fillRect(90, 700, 900, 10); } });
  S.sheet({ z: -.07, col: P.near, trans: .05, light: '#ffd9a0', lp: [760, 1000], lr: 800, shadow: 16, draw: g => { X.chairOffice(g, { x: 280, y: 1330, k: 2.1, face: 1 }); X.plant(g, { x: 940, y: 1250, k: 2.2 }); } });
  const A = { who: 'aaron', x: 470, y: 1262, h: 930, face: 1, seated: true, prop: 'phone', col: P.front, rim: 'rgba(255,205,140,.85)' };
  S.dyn({ z: -.05, x0: 0, y0: 0, w: W, h: H, draw: (g, t) => {
    const up = ss(seg(t, ansT, ansT + .55)), slump = ss(seg(t, sil, sil + 1.4)), sorry = ss(seg(t, 22.3 - T0, 23.0 - T0)), down = ss(seg(t, sil + .3, sil + 1.8));
    const ear = reach(A, 478, 846), rest = reach(A, 640, 1060);
    const hand = lerp2(rest, ear, up * (1 - down)); const hd = lerp2(hand, reach(A, 600, 1080), down);
    drawFigure(g, { ...A, pose: { lean: 2 - 4 * up + 9 * slump, tilt: 3 + 6 * sorry + 14 * slump, hand1: hd, hand2: reach(A, 560, 1075), bob: Math.sin(t * 1.4) * .12 * (1 - slump) } }); } });
  S.emit({ z: -.05, x0: 520, y0: 660, w: 80, h: 90, draw: (g, w, h) => { g.fillStyle = '#bfe0ff'; g.fillRect(w / 2 - 10, h / 2 - 20, 20, 40); }, blur: 22,
    I: t => { const b = E.hit.ring.map(x => x - T0); let i = 0; for (const x of b) i = Math.max(i, Math.max(0, 1 - Math.abs(t - x) / .35)); return (ss(seg(t, ansT, ansT + .5)) * (1 - ss(seg(t, sil, sil + 1.8))) * .85) + i * .9; } });
  S.sheet({ z: -.03, col: P.mid2, trans: .08, light: '#ffd9a0', lp: [820, 1200], lr: 700, shadow: 18, draw: g => { X.desk(g, { x: -40, y: 1100, w: 1160, h: 600 }); X.docSheet(g, { x: 180, y: 1076, w: 230, h: 30, col: '#dbcfb6' }); X.lampDesk(g, { x: 900, y: 1100, k: 1.5, flip: -1 }); } });
  S.emit({ z: -.03, x0: 580, y0: 670, w: 480, h: 520, draw: (g, w, h) => { const r = g.createRadialGradient(330, 130, 10, 250, 330, 330); r.addColorStop(0, 'rgba(255,214,150,.95)'); r.addColorStop(1, 'rgba(255,190,100,0)'); g.fillStyle = r; g.beginPath(); g.moveTo(330, 100); g.lineTo(480, 520); g.lineTo(20, 520); g.closePath(); g.fill(); }, blur: 30, I: () => .55, glowGain: .6 });
  S.sheet({ z: 0, col: P.front, shadow: false, rim: P.rim, rimA: .3, draw: g => g.fillRect(-100, 1590, 1300, 600) });
  return S;
};
