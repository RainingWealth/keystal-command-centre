// Scenes 5-8: the lamp turns back, the plan, the calm outcome, the close.
import { Shot, W, H, mk } from './engine.js';
import { drawFigure } from './figures.js';
import { clamp, lerp, seg, ss, eio, eo, ei, mulberry } from '/core/lib.js';
import * as X from './sets.js';
import { BUILD } from './registry.js';
import { reach } from './shots_a.js';
import { meetBack, tableSheet, darkBand } from './shots_b.js';
const L2 = (a, b, k) => [lerp(a[0], b[0], k), lerp(a[1], b[1], k)];
const beat = (t, t0, w = .35) => Math.max(0, 1 - Math.abs(t - t0) / w);
const stage = (id, P, cam, o = {}) => new Shot(id, { bg: P.sky, vig: o.vig ?? .6, bloom: o.bloom ?? .4, cam, fx: o.fx });

// ---- the lamp as an object: the film plays inside a wooden box on a table, in a dark room ----
function roomBox(g, inner, k, o = {}) {
  const cx = 540, cy = o.cy ?? 900, iw = W * k, ih = H * k, x = cx - iw / 2, y = cy - ih / 2, fw = 38 * k, ty = y + ih + fw;
  g.fillStyle = '#05060a'; g.fillRect(0, 0, W, H);
  if (k < .995) {
    const sp = g.createRadialGradient(cx, ty + 20, 10, cx, ty + 60, 700 * k + 120); sp.addColorStop(0, `rgba(255,200,130,${.42 * (o.lit ?? 1)})`); sp.addColorStop(1, 'rgba(255,190,110,0)'); g.fillStyle = sp; g.fillRect(0, ty - 60, W, H - ty + 60);
    const tg = g.createLinearGradient(0, ty, 0, H); tg.addColorStop(0, '#2a1a10'); tg.addColorStop(1, '#0d0806'); g.fillStyle = tg; g.fillRect(0, ty, W, H - ty); g.fillStyle = 'rgba(255,220,170,.35)'; g.fillRect(0, ty, W, 3);
    g.save(); g.shadowColor = `rgba(255,190,110,${.7 * (o.lit ?? 1)})`; g.shadowBlur = 90 * k; g.fillStyle = '#4b2f1b'; g.fillRect(x - fw, y - fw, iw + fw * 2, ih + fw * 2); g.restore();
    const wg = g.createLinearGradient(x - fw, 0, x + iw + fw, 0); wg.addColorStop(0, '#6b4528'); wg.addColorStop(.5, '#7d5230'); wg.addColorStop(1, '#4e311c'); g.fillStyle = wg; g.fillRect(x - fw, y - fw, iw + fw * 2, ih + fw * 2);
    g.fillStyle = 'rgba(0,0,0,.55)'; g.fillRect(x - 3, y - 3, iw + 6, ih + 6); g.fillStyle = 'rgba(255,220,170,.25)'; g.fillRect(x - fw, y - fw, iw + fw * 2, 3);
    const ob = clamp((1 - k) * 2.2); g.save(); g.globalAlpha = ob; g.fillStyle = '#0a0705'; g.fillRect(70, ty - 56, 56, 56); g.fillRect(76, ty - 98, 5, 44); g.fillRect(90, ty - 112, 5, 58); g.fillRect(104, ty - 92, 5, 38);   // pen cup
    g.restore();
  }
  g.save(); g.globalAlpha = o.bright ?? 1; g.drawImage(inner, x, y, iw, ih); g.restore();
  return { x, y, iw, ih, ty };
}
function calendar(g, x, y, w, h, flip, month0) {                     // a tear-off calendar whose leaves flip backwards
  const names = ['NOV', 'OCT', 'SEP', 'AUG', 'JUL', 'JUN', 'MAY', 'APR', 'MAR', 'FEB', 'JAN', 'DEC', 'NOV', 'OCT']; g.save();
  g.fillStyle = '#e9ddc0'; g.fillRect(x, y, w, h); g.fillStyle = '#7a2a1c'; g.fillRect(x, y, w, h * .22);
  const n = Math.floor(flip), f = flip - n; g.fillStyle = '#2a1a0e'; g.font = `700 ${h * .36}px 'Corm'`; g.textAlign = 'center'; g.fillText(names[n % names.length], x + w / 2, y + h * .72);
  g.translate(x, y + h * .22); g.fillStyle = '#f4ead2'; g.shadowColor = 'rgba(0,0,0,.4)'; g.shadowBlur = 8; g.transform(1, 0, 0, Math.max(.02, Math.abs(Math.cos(f * Math.PI))), 0, 0); if (f > .02) g.fillRect(0, f < .5 ? 0 : -h * .78, w, h * .78); g.restore();
}
function lampShot(id, E, f) {
  const S = new Shot(id, { bg: '#05060a', vig: .5, bloom: .3, cam: () => ({ x: 0, y: 0, d: 0 }) }), inner = mk(W, H), ig = inner.getContext('2d');
  S.dyn({ z: 0, x0: 0, y0: 0, w: W, h: H, shadow: false, draw: (g, t) => f(g, ig, inner, t + E.shotInfo.t0, t) }); return S;
}

BUILD.pullback = (E) => lampShot('pullback', E, (g, ig, inner, T) => { E.drawShot(ig, 'register', T); const p = ss(seg(T, 74.0, 75.8)); roomBox(g, inner, lerp(1, .58, eio(p)), { cy: lerp(960, 900, p), lit: .6 + .4 * p }); });
BUILD.rewind = (E) => lampShot('rewind', E, (g, ig, inner, T) => {
  const p = clamp((T - 75.8) / 2.4), Tm = lerp(73.8, 2.2, Math.pow(p, 1.35)), k = .58;
  E.film(ig, Tm); const r = roomBox(g, inner, k, { cy: 900, bright: .92 + .08 * Math.sin(T * 40) });
  g.save(); g.globalAlpha = .28; g.drawImage(inner, r.x + 10, r.y - 6, r.iw, r.ih); g.restore();                          // tape ghost
  g.save(); g.beginPath(); g.rect(r.x, r.y, r.iw, r.ih); g.clip(); const rr = mulberry(Math.floor(T * 30)); for (let i = 0; i < 14; i++) { g.fillStyle = `rgba(255,235,200,${.04 + rr() * .06})`; g.fillRect(r.x, r.y + rr() * r.ih, r.iw, 2 + rr() * 5); } g.restore();
  calendar(g, 780, r.ty + 30, 220, 200, lerp(0, 11, p), 0);
});
BUILD.prepared = (E) => lampShot('prepared', E, (g, ig, inner, T) => {
  const on = ss(seg(T, E.hit.lampon, E.hit.lampon + .5)), p = ss(seg(T, 78.2, 79.4)); E.drawShot(ig, 'advisers', T);
  const k = lerp(.58, 1, ei(clamp((T - 78.5) / .9))); roomBox(g, inner, k, { cy: lerp(900, 960, p), bright: .04 + .96 * on * (1 - .12 * Math.max(0, Math.sin(T * 38) * (1 - on) * 3)), lit: on });
});

// ---------- advisers: the planned timeline; both founders alive, a professional adviser ----------
BUILD.advisers = (E) => {
  const P = X.PAL.hope, T0 = E.shotInfo.t0, S = stage('advisers', P, t => ({ x: -8 * ss(t / 5.6), y: -6 * ss(t / 5.6), d: .04 * ss(t / 5.6) }), { vig: .45, bloom: .5, fx: () => ({ tint: ['#fff0c8', .06, 'multiply'] }) });
  meetBack(S, P, { px: 540, pl: 380, winLight: '#fff4c8', lamp: .9 });
  S.sheet({ z: -.09, col: P.mid, shadow: 12, draw: g => { X.plant(g, { x: 100, y: 1170, k: 2.4 }); X.plant(g, { x: 990, y: 1170, k: 2.0, seed: 4 }); } });
  const AD = { who: 'adviser', x: 540, y: 1100, h: 640, face: -1, seated: true, prop: 'folder', col: '#2a1608', rim: 'rgba(255,240,200,.8)' };
  S.dyn({ z: -.07, x0: 0, y0: 0, w: W, h: H, draw: (g, t) => drawFigure(g, { ...AD, pose: { lean: 2, tilt: 3 + 3 * Math.sin(t * 1.5), hand1: reach(AD, 480, 1070), hand2: reach(AD, 600, 1100) } }) });
  const A = { who: 'aaron', x: 230, y: 1268, h: 800, face: 1, seated: true, col: '#2a1608', rim: 'rgba(255,240,200,.85)' }, D = { who: 'daniel', x: 880, y: 1268, h: 840, face: -1, seated: true, col: '#2a1608', rim: 'rgba(255,240,200,.85)' };
  S.dyn({ z: -.05, x0: 0, y0: 0, w: W, h: H, draw: (g, t) => { const tt = t + T0, sp = ss(seg(tt, 80.0, 80.4)) * (1 - ss(seg(tt, 82.3, 82.7))) , sw = Math.sin(tt * 3);
    drawFigure(g, { ...A, pose: { lean: 4, tilt: -3 + 4 * ss(seg(tt, 81.6, 82.6)), hand1: reach(A, 400, 1140), bob: Math.sin(t * 1.3) * .2 } });
    drawFigure(g, { ...D, pose: { lean: 3 + 3 * sp, tilt: 3 * sw * sp, hand1: L2(reach(D, 700, 1140), reach(D, 640, 1050 + 30 * sw), sp), bob: Math.sin(t * 1.1 + 1) * .2 } }); } });
  tableSheet(S, P); darkBand(S, P); return S;
};

// ---------- steps: Agree, Fund, Transfer: three paper tokens on the table, laid out from above ----------
BUILD.steps = (E) => {
  const P = X.PAL.hope, T0 = E.shotInfo.t0, h = E.hit.step.map(x => x - T0), S = stage('steps', P, t => ({ x: 0, y: 6 * ss(t / 8.2), d: .03 * ss(t / 8.2) }), { vig: .5, bloom: .45 });
  S.sheet({ z: -.12, col: P.mid, trans: .6, light: '#fff2c0', lp: [540, 1000], lr: 1200, shadow: false, edge: 0, draw: g => g.fillRect(-100, -100, 1300, 2200) });
  const tok = (i, draw) => S.sheet({ z: -.07 + i * .01, col: i === 1 ? '#f1d9a0' : '#efe3c8', trans: .25, light: '#fff6d8', lp: [200 + i * 340, 1160], lr: 380, shadow: 18, shDx: 10, anim: t => { const q = eo(seg(t, h[i], h[i] + .7)); return { a: q > 0 ? 1 : 0, sc: lerp(.7, .85, q) * (1 + .03 * beat(t, h[i] + .5, .3)), dy: (1 - q) * 30 - 40 }; }, draw });
  tok(0, g => { X.docSheet(g, { x: 70, y: 1020, w: 260, h: 340, rot: -3, head: 'AGREEMENT', hs: 28, lh: 30, seed: 3, col: '#efe3c8' }); g.fillStyle = '#b3261e'; g.beginPath(); g.arc(280, 1330, 44, 0, 7); g.fill(); X.cut(g, () => { g.beginPath(); g.arc(280, 1330, 30, 0, 7); g.stroke(); g.lineWidth = 4; }); });
  tok(1, g => { g.beginPath(); g.moveTo(540, 1030); g.bezierCurveTo(640, 1070, 700, 1070, 700, 1070); g.lineTo(700, 1220); g.bezierCurveTo(700, 1320, 610, 1370, 540, 1400); g.bezierCurveTo(470, 1370, 380, 1320, 380, 1220); g.lineTo(380, 1070); g.bezierCurveTo(380, 1070, 440, 1070, 540, 1030); g.fill(); g.strokeStyle = '#b3261e'; g.lineWidth = 34; g.lineCap = 'round'; g.lineJoin = 'round'; g.beginPath(); g.moveTo(464, 1210); g.lineTo(518, 1268); g.lineTo(620, 1146); g.stroke(); });
  tok(2, g => { g.fillStyle = '#efe3c8'; g.beginPath(); g.arc(880, 1210, 150, 0, 7); g.fill(); g.fillStyle = '#e1a850'; g.beginPath(); g.moveTo(880, 1210); g.arc(880, 1210, 150, -Math.PI / 2, Math.PI / 2); g.closePath(); g.fill(); g.fillStyle = 'rgba(40,28,16,.55)'; g.fillRect(878, 1060, 4, 300); X.cut(g, () => { g.beginPath(); g.arc(880, 1210, 18, 0, 7); g.fill(); }); });
  S.sheet({ z: -.04, col: P.mid2, shadow: 10, anim: t => ({ a: ss(seg(t, h[2] + .5, h[2] + 1.1)) }), draw: g => { g.lineWidth = 12; g.lineCap = 'round'; g.strokeStyle = P.mid2; g.beginPath(); g.moveTo(640, 1215); g.lineTo(700, 1215); g.stroke(); g.beginPath(); g.moveTo(402, 1260); g.quadraticCurveTo(540, 1470, 740, 1290); g.stroke(); g.beginPath(); g.moveTo(724, 1262); g.lineTo(748, 1296); g.lineTo(704, 1304); g.fill(); } });
  darkBand(S, P, 1640); return S;
};

// ---------- example: the simple numbers, as a paper pie ----------
BUILD.example = (E) => {
  const P = X.PAL.hope, T0 = E.shotInfo.t0, S = stage('example', P, t => ({ x: 0, y: 0, d: .03 * ss(t / 4.4) }), { vig: .5, bloom: .45 });
  S.sheet({ z: -.12, col: P.mid, trans: .6, light: '#fff2c0', lp: [540, 600], lr: 1200, shadow: false, edge: 0, draw: g => g.fillRect(-100, -100, 1300, 2200) });
  S.sheet({ z: -.08, col: '#efe3c8', trans: .25, light: '#fff6d8', lp: [540, 600], lr: 500, shadow: 22, shDx: 12, draw: g => { g.beginPath(); g.arc(540, 560, 300, 0, 7); g.fill(); g.fillStyle = 'rgba(40,28,16,.35)'; g.fillRect(538, 250, 4, 620); } });
  const half = S.sheet({ z: -.07, col: '#e1a850', trans: .3, light: '#ffe5a0', lp: [400, 560], lr: 400, shadow: 14, anim: t => ({ dx: 0 }), draw: g => { g.beginPath(); g.moveTo(540, 560); g.arc(540, 560, 300, Math.PI / 2, Math.PI * 1.5); g.closePath(); g.fill(); } });
  S.dyn({ z: -.05, x0: 0, y0: 0, w: W, h: H, draw: (g, t) => { drawFigure(g, { who: 'daniel', x: 380, y: 800, h: 360, face: 1, col: '#2a1608', rim: 'rgba(255,240,200,.8)', pose: { lean: 0, tilt: 0, hand1: [4, -56], bob: Math.sin(t * 1.4) * .15 } });
    drawFigure(g, { who: 'aaron', x: 700, y: 800, h: 340, face: -1, col: '#2a1608', rim: 'rgba(255,240,200,.8)', pose: { lean: 0, tilt: 0, hand1: [4, -56], bob: Math.sin(t * 1.2 + 1) * .15 } }); } });
  darkBand(S, P, 1640); return S;
};

// ---------- buyout: the same room, calm; the agreed price reaches the estate, the shares reach Aaron ----------
BUILD.buyout = (E) => {
  const P = X.PAL.hope, T0 = E.shotInfo.t0, S = stage('buyout', P, t => ({ x: 8 * ss(t / 4.4), y: -4 * ss(t / 4.4), d: .035 * ss(t / 4.4) }), { vig: .45, bloom: .5, fx: () => ({ tint: ['#fff0c8', .06, 'multiply'] }) });
  meetBack(S, P, { px: 540, pl: 380, winLight: '#fff4c8', lamp: .9 });
  const RP = { who: 'rep', x: 560, y: 1100, h: 620, face: -1, seated: true, col: '#2a1608', rim: 'rgba(255,240,200,.8)' };
  S.dyn({ z: -.07, x0: 0, y0: 0, w: W, h: H, draw: (g, t) => drawFigure(g, { ...RP, pose: { lean: 1, tilt: 2, hand1: reach(RP, 520, 1070), hand2: reach(RP, 600, 1100) } }) });
  const A = { who: 'aaron', x: 230, y: 1268, h: 800, face: 1, seated: true, col: '#2a1608', rim: 'rgba(255,240,200,.85)' }, SA = { who: 'sarah', x: 870, y: 1262, h: 780, face: -1, seated: true, col: '#2a1608', rim: 'rgba(255,240,200,.85)' };
  S.dyn({ z: -.05, x0: 0, y0: 0, w: W, h: H, draw: (g, t) => { const tt = t + T0, sl = eio(seg(tt, E.hit.docslide[0] + .2, E.hit.docslide[0] + 1.8)), rec = ss(seg(tt, 100.0, 100.6)), th = ss(seg(tt, 100.8, 101.4));
    drawFigure(g, { ...A, pose: { lean: 4 * (1 - sl) + 2, tilt: -2, hand1: L2(reach(A, 400, 1140), reach(A, 560, 1130), sl * (1 - rec)), bob: Math.sin(t * 1.3) * .2 } });
    drawFigure(g, { ...SA, pose: { lean: 1 + 2 * th, tilt: 2 - 8 * th + 3 * rec, hand1: L2(reach(SA, 700, 1140), reach(SA, 640, 1130), rec), bob: Math.sin(t * 1.1 + 1) * .2 } }); } });
  tableSheet(S, P, { bare: true });
  S.sheet({ z: -.034, col: '#efe3c8', trans: .2, light: '#fff6d8', lp: [540, 1140], lr: 300, shadow: 8, anim: t => { const tt = t + T0, sl = eio(seg(tt, E.hit.docslide[0] + .2, E.hit.docslide[0] + 1.8)); return { dx: 250 + sl * 250 }; }, draw: g => X.docSheet(g, { x: 0, y: 1124, w: 170, h: 28, col: '#efe3c8' }) });
  S.sheet({ z: -.034, col: '#efe3c8', shadow: 6, draw: g => X.docSheet(g, { x: 210, y: 1152, w: 160, h: 28, col: '#e3d6b8' }) });
  darkBand(S, P); return S;
};

// ---------- workers: the floor goes on ----------
BUILD.workers = (E) => {
  const P = X.PAL.hope, S = stage('workers', P, t => ({ x: 70 * ss(t / 2.8), y: 0, d: .01 }), { vig: .45, bloom: .5, fx: () => ({ tint: ['#fff0c8', .06, 'multiply'] }) });
  S.sheet({ z: -.15, col: P.far, trans: .9, light: '#fff2c0', lp: [700, 800], lr: 1300, w: 1500, shadow: false, edge: 0, draw: g => g.fillRect(-200, -100, 1700, 2200) });
  S.sheet({ z: -.12, col: P.far2, trans: .5, light: '#fff2c0', lp: [700, 900], lr: 1000, w: 1500, shadow: 12, draw: g => { X.racks(g, { x: -100, y: 640, w: 1300, h: 800, bays: 6, levels: 3, seed: 21 }); } });
  S.dyn({ z: -.07, x0: -200, y0: 0, w: 1500, h: H, draw: (g, t) => {
    X.forklift(g, { x: 150 + 400 * ss(t / 2.8), y: 1450, k: 1.15, face: 1 });
    const ws = [['worker', 480, 1], ['worker2', 760, -1], ['worker', 960, 1]]; ws.forEach(([who, x, face], i) => drawFigure(g, { who, x: x + Math.sin(t * 1.2 + i) * 12, y: 1470, h: 760 + i * 30, face, col: '#2a1608', rim: 'rgba(255,240,200,.8)', pose: { gait: face > 0 ? (t * .8 + i * .3) % 1 : 0, lean: 3, hand1: [10, -62 + Math.sin(t * 2 + i) * 4], hand2: [8, -60], bob: 0 }, prop: 'folder' })); } });
  S.sheet({ z: -.02, col: P.near, shadow: 14, w: 1500, draw: g => { g.fillRect(-200, 1470, 1700, 700); X.boxes(g, { x: 20, y: 1480, w: 340, rows: 3, seed: 12 }); X.boxes(g, { x: 980, y: 1480, w: 260, rows: 2, seed: 14 }); } });
  S.sheet({ z: 0, col: P.front, shadow: false, rim: P.rim, rimA: .35, w: 1500, draw: g => g.fillRect(-200, 1600, 1700, 600) }); return S;
};

// ---------- home: Sarah's window among many; the camera draws back ----------
BUILD.home = (E) => {
  const P = X.PAL.home, D = 3.1, win = [610, 820], S = stage('home', P, t => ({ x: lerp(-18, 0, ss(t / D)), y: lerp(60, 0, ss(t / D)), d: .13 * (1 - ss(t / D)) }), { vig: .62, bloom: .55 });
  S.sheet({ z: -.15, col: P.far, trans: .9, light: '#ffb878', lp: [540, 1100], lr: 1300, shadow: false, edge: 0, draw: g => g.fillRect(-100, -100, 1300, 2200) });
  S.sheet({ z: -.13, col: P.far2, trans: .5, light: '#ffc98a', lp: [540, 1100], lr: 1000, shadow: 10, draw: g => X.skyline(g, { y: 1500, seed: 8, hMin: 200, hMax: 620, lit: .3 }) });
  S.sheet({ z: -.1, col: '#f3d9a8', trans: .8, light: '#ffe2b0', lp: [win[0] + 80, win[1] + 60], lr: 360, shadow: false, edge: 0, draw: g => g.fillRect(win[0] - 20, win[1] - 20, 200, 160) });
  S.dyn({ z: -.098, x0: 0, y0: 0, w: W, h: H, shadow: false, draw: (g, t) => { g.save(); g.beginPath(); g.rect(win[0] - 20, win[1] - 20, 200, 160); g.clip();
    drawFigure(g, { who: 'sarah', x: win[0] + 66, y: win[1] + 142, h: 130, face: 1, col: '#4a2a14', rim: 'rgba(0,0,0,0)', shade: 'rgba(0,0,0,0)', pose: { lean: 4, tilt: 8, hand1: [10, -55], bob: Math.sin(t * 1.5) * .3 } });
    drawFigure(g, { who: 'kid', x: win[0] + 118, y: win[1] + 142, h: 100, face: -1, col: '#4a2a14', rim: 'rgba(0,0,0,0)', shade: 'rgba(0,0,0,0)', pose: { hand1: [8, -62] } });
    drawFigure(g, { who: 'kid2', x: win[0] + 18, y: win[1] + 142, h: 88, face: 1, col: '#4a2a14', rim: 'rgba(0,0,0,0)', shade: 'rgba(0,0,0,0)' }); g.restore(); } });
  const blk = S.sheet({ z: -.07, col: P.mid2, trans: .1, light: '#ffc98a', lp: [540, 900], lr: 900, shadow: 20, shDx: 12, draw: g => { g.fillRect(-60, 160, 1200, 1500); g.fillRect(-60, 130, 1200, 34);
    const r = mulberry(17); X.cut(g, () => { for (let j = 0; j < 17; j++) for (let i = 0; i < 9; i++) { const x = 20 + i * 118, y = 220 + j * 82; if (x > win[0] - 70 && x < win[0] + 160 && y > win[1] - 70 && y < win[1] + 130) continue; if (r() < .8) g.fillRect(x, y, 80, 52); } }); g.save(); g.globalCompositeOperation = 'destination-out'; g.fillRect(win[0] - 20, win[1] - 20, 200, 160); g.restore(); } });
  const r2 = mulberry(5); for (let i = 0; i < 26; i++) { const x = 20 + Math.floor(r2() * 9) * 118, y = 220 + Math.floor(r2() * 17) * 82; if (x > win[0] - 70 && x < win[0] + 160 && y > win[1] - 70 && y < win[1] + 130) continue; S.emit({ after: blk, z: -.07, x0: x, y0: y, w: 80, h: 52, blur: 12, glowGain: .6, gain: .55, I: () => .5 + .3 * r2(), draw: (g, w, h) => { g.fillStyle = '#ffc27a'; g.fillRect(0, 0, w, h); } }); }
  S.sheet({ z: 0, col: P.front, shadow: false, rim: P.rim, rimA: .3, draw: g => { g.fillRect(-100, 1640, 1300, 500); } }); return S;
};

// ---------- sunrise: Aaron across the warehouse at first light ----------
BUILD.sunrise = (E) => {
  const P = X.PAL.dawn, S = stage('sunrise', P, t => ({ x: 6 * ss(t / 3.1), y: -4 * ss(t / 3.1), d: .04 * ss(t / 3.1) }), { vig: .5, bloom: .6 });
  const sk = S.sheet({ z: -.15, col: '#2e4a78', trans: 1, light: '#ffc277', lp: [760, 1020], lr: 1500, shadow: false, edge: 0, draw: g => { const gr = g.createLinearGradient(0, 0, 0, 1200); gr.addColorStop(0, '#1d3557'); gr.addColorStop(.55, '#8a6a8a'); gr.addColorStop(1, '#f6b36a'); g.fillStyle = gr; g.fillRect(-100, -100, 1300, 1500); g.fillStyle = '#f6b36a'; g.fillRect(-100, 1200, 1300, 1000); } });
  S.emit({ after: sk, z: -.15, x0: 460, y0: 700, w: 600, h: 600, blur: 40, glowGain: 1, I: t => .65 + .35 * ss(t / 3.1), draw: (g, w, h) => { const r = g.createRadialGradient(300, 300, 0, 300, 300, 300); r.addColorStop(0, '#fffbe0'); r.addColorStop(.18, '#ffe9a8'); r.addColorStop(.55, 'rgba(255,190,100,.35)'); r.addColorStop(1, 'rgba(255,170,80,0)'); g.fillStyle = r; g.fillRect(0, 0, w, h); } });
  S.sheet({ z: -.13, col: P.far2, trans: .5, light: '#ffcf80', lp: [760, 1100], lr: 900, shadow: 10, draw: g => X.skyline(g, { y: 1230, seed: 33, hMin: 160, hMax: 420, lit: .1, x0: -80, x1: 1160 }) });
  S.sheet({ z: -.1, col: P.mid, trans: .3, light: '#ffcf80', lp: [760, 1100], lr: 800, shadow: 18, draw: g => { g.fillRect(-100, 1200, 1300, 1000); g.fillRect(-100, 280, 120, 1000); g.fillRect(1000, 280, 180, 1000); g.fillRect(-100, 230, 1300, 70); X.racks(g, { x: 60, y: 760, w: 300, h: 440, bays: 2, levels: 2, seed: 41 }); X.racks(g, { x: 820, y: 760, w: 200, h: 440, bays: 1, levels: 2, seed: 42 }); } });
  S.dyn({ z: -.06, x0: 0, y0: 0, w: W, h: H, draw: (g, t) => { drawFigure(g, { who: 'aaron', x: 330, y: 1450, h: 980, face: 1, col: '#0e0a14', rim: 'rgba(255,215,150,.9)', pose: { lean: 1, tilt: -3 + 2 * Math.sin(t * .8), hand1: [4, -52], hand2: [2, -50], bob: Math.sin(t * 1.1) * .2 } }); } });
  S.sheet({ z: -.03, col: P.near, shadow: 14, draw: g => { g.fillRect(-100, 1450, 1300, 700); X.boxes(g, { x: 650, y: 1460, w: 400, rows: 3, seed: 9 }); } });
  darkBand(S, P, 1620); return S;
};

// ---------- navy: the end card ground ----------
BUILD.navy = (E) => {
  const P = X.PAL.navy, S = stage('navy', P, t => ({ x: 4 * Math.sin(t * .4), y: 0, d: .02 * ss(t / 8) }), { vig: .55, bloom: .4 });
  S.sheet({ z: -.15, col: P.far, trans: .9, light: '#ffd9a0', lp: [540, 160], lr: 1000, shadow: false, edge: 0, draw: g => g.fillRect(-100, -100, 1300, 2200) });
  S.sheet({ z: -.1, col: P.far2, trans: .3, light: '#ffd9a0', lp: [540, 260], lr: 900, shadow: 14, draw: g => { g.beginPath(); g.moveTo(-100, 1380); g.bezierCurveTo(200, 1250, 500, 1420, 1200, 1280); g.lineTo(1200, 2100); g.lineTo(-100, 2100); g.fill(); } });
  S.sheet({ z: -.06, col: P.mid, shadow: 18, draw: g => { g.beginPath(); g.moveTo(-100, 1520); g.bezierCurveTo(300, 1450, 700, 1580, 1200, 1460); g.lineTo(1200, 2100); g.lineTo(-100, 2100); g.fill(); } });
  S.sheet({ z: -.03, col: P.mid2, shadow: 18, draw: g => { g.beginPath(); g.moveTo(-100, 1640); g.bezierCurveTo(300, 1600, 800, 1700, 1200, 1620); g.lineTo(1200, 2100); g.lineTo(-100, 2100); g.fill(); } });
  const r = mulberry(3); for (let i = 0; i < 14; i++) S.emit({ z: -.1, x0: 60 + r() * 960, y0: 120 + r() * 900, w: 12, h: 12, blur: 8, glowGain: .6, gain: .5, I: t => .3 + .3 * Math.sin(t * (.6 + r()) + i), draw: (g, w, h) => { g.fillStyle = '#ffe2a8'; g.beginPath(); g.arc(6, 6, 3, 0, 7); g.fill(); } });
  darkBand(S, P, 1700); return S;
};
