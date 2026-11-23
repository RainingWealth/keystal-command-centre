// Palettes (colour ladders: back sheets bright and translucent, front sheets dark) and reusable paper motifs. Draw in frame coordinates.
import { mulberry, clamp } from '/core/lib.js';
const hex = (h) => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
export const shade = (c, k) => { const [r, g, b] = hex(c).map(v => Math.round(clamp(v * k, 0, 255))); return `rgb(${r},${g},${b})`; };
export const mix = (a, b, t) => { const A = hex(a), B = hex(b); return `rgb(${A.map((v, i) => Math.round(v + (B[i] - v) * t)).join(',')})`; };
export const PAL = {
  hospital: { sky: '#0b1a20', far: '#9ccfcf', far2: '#78aeb2', mid: '#4f858d', mid2: '#2f5d68', near: '#17353f', front: '#050c10', light: '#d7f2f2', win: '#cfe9ff', rim: 'rgba(190,225,255,.7)' },
  night:    { sky: '#0a1330', far: '#6a86c2', far2: '#506fa8', mid: '#3f5a92', mid2: '#26396b', near: '#162347', front: '#070d1b', light: '#ffd9a0', win: '#ffb862', rim: 'rgba(170,200,255,.55)' },
  warm:     { sky: '#f3cf8c', far: '#f6d9a0', far2: '#e7b972', mid: '#c4883f', mid2: '#8e5a28', near: '#51301a', front: '#2a1608', light: '#ffe2a0', win: '#ffd27a', rim: 'rgba(255,226,170,.85)' },
  dusk:     { sky: '#141b27', far: '#566b84', far2: '#3f536b', mid: '#2c3c52', mid2: '#1d2a3c', near: '#121b29', front: '#06090f', light: '#ffcf94', win: '#ffc27a', rim: 'rgba(255,205,150,.5)' },
  hope:     { sky: '#fff0c8', far: '#fbe6ae', far2: '#f1c987', mid: '#cc9657', mid2: '#92622f', near: '#54331a', front: '#26150a', light: '#fff2c0', win: '#fff0b0', rim: 'rgba(255,240,200,.9)' },
  home:     { sky: '#2a2038', far: '#7a5565', far2: '#a06a5a', mid: '#6d4a4f', mid2: '#3f2c3d', near: '#241b2c', front: '#0d0a13', light: '#ffc98a', win: '#ffc27a', rim: 'rgba(255,200,150,.6)' },
  dawn:     { sky: '#1d3557', far: '#f4b26a', far2: '#d98a52', mid: '#8a5a4a', mid2: '#4a3040', near: '#2a1f33', front: '#0e0a14', light: '#ffd69a', win: '#ffcf80', rim: 'rgba(255,205,140,.8)' },
  navy:     { sky: '#071226', far: '#17305c', far2: '#122653', mid: '#0f2048', mid2: '#0b1a3a', near: '#091630', front: '#050c1c', light: '#ffd9a0', win: '#ffcf80', rim: 'rgba(255,225,170,.5)' },
};
export const cut = (g, fn) => { g.save(); g.globalCompositeOperation = 'destination-out'; g.fillStyle = '#000'; g.strokeStyle = '#000'; fn(g); g.restore(); };
export function rr(g, x, y, w, h, r) { g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); }
export function arch(g, x, y, w, h) { g.beginPath(); g.moveTo(x, y + h); g.lineTo(x, y + w / 2); g.arc(x + w / 2, y + w / 2, w / 2, Math.PI, 0); g.lineTo(x + w, y + h); g.closePath(); g.fill(); }

export function skyline(g, o) {                       // CBD towers (generic, not a real skyline); windows are holes
  const r = mulberry(o.seed || 1); let x = o.x0 ?? -80; const x1 = o.x1 ?? 1160;
  while (x < x1) { const w = (o.wMin || 70) + r() * ((o.wMax || 170) - (o.wMin || 70)), h = (o.hMin || 260) + r() * ((o.hMax || 700) - (o.hMin || 260));
    g.fillRect(x, o.y - h, w, h + 3000); if (r() < .45) g.fillRect(x + w * .18, o.y - h - 26 - r() * 30, w * .64, 40); if (r() < .3) g.fillRect(x + w * .5 - 2, o.y - h - 110 - r() * 60, 4, 140);
    if (o.win !== false) cut(g, () => { for (let yy = o.y - h + 26; yy < o.y - 20 && yy < 1700; yy += 30) for (let xx = x + 10; xx < x + w - 14; xx += 20) if (r() < (o.lit ?? .3)) g.fillRect(xx, yy, 9, 14); });
    x += w + 4 + r() * 14; }
}
export function hdb(g, o) {                           // slab block with window grid holes and balcony bands
  const { x, y, w, h } = o, r = mulberry(o.seed || 3), cols = o.cols || 10, rows = o.rows || Math.floor(h / 52), cw = w / cols;
  g.fillRect(x, y, w, h); g.fillRect(x - 8, y - 14, w + 16, 16);
  cut(g, () => { for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) if (r() < (o.lit ?? .8)) g.fillRect(x + i * cw + cw * .2, y + 20 + j * 52, cw * .5, 26); });
}
export function shophouse(g, o) {                     // two-storey shophouse: arches below, shuttered windows above, tiled roof
  const { x, y, w, h } = o, fl = h * .5; g.fillRect(x, y, w, h); g.beginPath(); g.moveTo(x - 14, y + 4); g.lineTo(x + w * .5, y - 78); g.lineTo(x + w + 14, y + 4); g.closePath(); g.fill();
  cut(g, () => { const n = o.n || 2, aw = w / n * .55; for (let i = 0; i < n; i++) { const ax = x + (i + .5) * w / n - aw / 2; arch(g, ax, y + 18, aw, fl * .78); g.fillRect(ax, y + fl + 24, aw, fl * .6); }
    arch(g, x + w * .4, y + h * .55, w * .2, h * .45); });
}
export function desk(g, o) { g.fillRect(o.x, o.y, o.w, 26); g.fillRect(o.x + 16, o.y + 26, o.w - 32, o.h - 26); cut(g, () => { g.fillRect(o.x + 40, o.y + 56, o.w * .28, 8); g.fillRect(o.x + 40, o.y + 110, o.w * .28, 8); }); }
export function table(g, o) { g.fillRect(o.x, o.y, o.w, 30); g.fillRect(o.x + 50, o.y + 30, o.w - 100, 40); g.fillRect(o.x + 70, o.y + 70, 22, o.h); g.fillRect(o.x + o.w - 92, o.y + 70, 22, o.h); }
export function monitor(g, o) { g.fillRect(o.x, o.y, o.w, o.h); g.fillRect(o.x + o.w / 2 - 12, o.y + o.h, 24, 40); g.fillRect(o.x + o.w / 2 - 70, o.y + o.h + 40, 140, 12); }
export function lampDesk(g, o) { const k = o.k || 1, f = o.flip || 1; g.save(); g.translate(o.x, o.y); g.scale(f * k, k); g.beginPath(); g.ellipse(0, 0, 60, 14, 0, 0, 7); g.fill(); g.lineWidth = 11; g.lineCap = 'round'; g.beginPath(); g.moveTo(0, -8); g.lineTo(46, -150); g.lineTo(-30, -250); g.stroke();
  g.beginPath(); g.moveTo(-70, -236); g.lineTo(10, -236); g.lineTo(34, -190); g.lineTo(-96, -190); g.closePath(); g.fill(); g.restore(); }
export function chairOffice(g, o) { const k = o.k || 1, f = o.face || 1; g.save(); g.translate(o.x, o.y); g.scale(f * k, k); rr(g, -92, -330, 36, 290, 14); g.fill(); rr(g, -78, -62, 190, 34, 12); g.fill(); g.fillRect(8, -30, 18, 120); g.fillRect(-60, 90, 148, 14); g.restore(); }
export function pendant(g, o) { g.fillRect(o.x - 2, o.y - 1200, 4, 1200 + o.len); g.beginPath(); g.moveTo(o.x - o.r, o.y + o.len + 44); g.quadraticCurveTo(o.x - o.r * .9, o.y + o.len - 30, o.x, o.y + o.len - 36); g.quadraticCurveTo(o.x + o.r * .9, o.y + o.len - 30, o.x + o.r, o.y + o.len + 44); g.closePath(); g.fill(); }
export function frameWin(g, o) { cut(g, () => g.fillRect(o.x, o.y, o.w, o.h)); const n = o.mull || 0; for (let i = 1; i <= n; i++) g.fillRect(o.x + i * o.w / (n + 1) - 4, o.y, 8, o.h); if (o.cross) g.fillRect(o.x, o.y + o.h / 2 - 4, o.w, 8); }
export function blinds(g, o) { cut(g, () => { for (let yy = o.y; yy < o.y + o.h; yy += o.step || 30) g.fillRect(o.x, yy, o.w, (o.step || 30) * .62); }); }
export function boxes(g, o) { const r = mulberry(o.seed || 2); let yy = o.y; const rows = o.rows || 3; for (let j = 0; j < rows; j++) { let xx = o.x; const hh = 70 + r() * 34; const n = Math.max(1, Math.floor(o.w / 120) - j); xx += j * 60; for (let i = 0; i < n; i++) { const ww = 96 + r() * 44; g.fillRect(xx, yy - hh, ww, hh - 3); cut(g, () => g.fillRect(xx + ww / 2 - 3, yy - hh, 6, hh * .45)); xx += ww + 6; } yy -= hh + 2; } }
export function racks(g, o) { const r = mulberry(o.seed || 4), bays = o.bays || 3, lv = o.levels || 3, bw = o.w / bays, lh = o.h / lv; g.fillStyle = g.fillStyle;
  for (let i = 0; i <= bays; i++) g.fillRect(o.x + i * bw - 7, o.y, 14, o.h);
  for (let j = 0; j <= lv; j++) g.fillRect(o.x, o.y + j * lh - 7, o.w, 14);
  for (let j = 0; j < lv; j++) for (let i = 0; i < bays; i++) if (r() < .85) boxes(g, { x: o.x + i * bw + 16, y: o.y + (j + 1) * lh - 8, w: bw - 32, rows: 1 + (r() < .4 ? 1 : 0), seed: Math.floor(r() * 99) }); }
export function forklift(g, o) { const k = o.k || 1, f = o.face || 1; g.save(); g.translate(o.x, o.y); g.scale(f * k, k); g.fillRect(-90, -120, 170, 90); g.fillRect(-90, -210, 14, 100); g.fillRect(-90, -210, 110, 14); g.fillRect(60, -330, 14, 330); g.fillRect(74, -40, 90, 12); g.beginPath(); g.arc(-48, -22, 28, 0, 7); g.arc(40, -22, 22, 0, 7); g.fill(); g.restore(); }
export function van(g, o) { const k = o.k || 1; g.save(); g.translate(o.x, o.y); g.scale(k, k); rr(g, 0, -150, 250, 120, 14); g.fill(); g.beginPath(); g.moveTo(250, -150); g.lineTo(330, -150); g.lineTo(380, -90); g.lineTo(380, -30); g.lineTo(250, -30); g.closePath(); g.fill(); g.beginPath(); g.arc(70, -26, 32, 0, 7); g.arc(300, -26, 32, 0, 7); g.fill(); cut(g, () => { g.beginPath(); g.moveTo(262, -138); g.lineTo(322, -138); g.lineTo(358, -96); g.lineTo(262, -96); g.closePath(); g.fill(); }); g.restore(); }
export function plant(g, o) { const r = mulberry(o.seed || 9), k = o.k || 1; g.save(); g.translate(o.x, o.y); g.scale(k, k); g.beginPath(); g.moveTo(-34, 0); g.lineTo(34, 0); g.lineTo(26, -56); g.lineTo(-26, -56); g.closePath(); g.fill();
  for (let i = 0; i < 9; i++) { const a = -Math.PI / 2 + (i - 4) * .34, L = 70 + r() * 60; g.save(); g.translate(0, -52); g.rotate(a + Math.PI / 2); g.beginPath(); g.ellipse(0, -L / 2, 15, L / 2, 0, 0, 7); g.fill(); g.restore(); } g.restore(); }
export function docSheet(g, o) {                      // a paper document: cream sheet with ruled lines (ink)
  g.save(); g.translate(o.x + o.w / 2, o.y + o.h / 2); g.rotate((o.rot || 0) * Math.PI / 180); g.translate(-o.w / 2, -o.h / 2);
  g.fillStyle = o.col || '#efe3c8'; g.fillRect(0, 0, o.w, o.h); const r = mulberry(o.seed || 6); g.fillStyle = o.ink || 'rgba(40,28,16,.55)';
  if (o.head) { g.font = `700 ${o.hs || 30}px 'Corm', serif`; g.fillText(o.head, 26, 20 + (o.hs || 30)); }
  const top = o.head ? 40 + (o.hs || 30) : 34; for (let yy = top; yy < o.h - 28; yy += o.lh || 26) g.fillRect(26, yy, (o.w - 52) * (.55 + r() * .45), 3.2);
  g.restore();
}
export function cup(g, x, y, k = 1) { g.beginPath(); g.moveTo(x - 24 * k, y - 62 * k); g.lineTo(x + 24 * k, y - 62 * k); g.lineTo(x + 17 * k, y); g.lineTo(x - 17 * k, y); g.closePath(); g.fill(); }
export function glow(g, w, h, rgba) { g.fillStyle = rgba; g.fillRect(0, 0, w, h); }
export function chairRow(g, x, y, n, k = 1) {         // waiting-room chairs, seats at y
  for (let i = 0; i < n; i++) { const cx = x + i * 170 * k; g.fillRect(cx, y - 120 * k, 120 * k, 14 * k); g.fillRect(cx + 8 * k, y - 120 * k, 14 * k, 110 * k); g.fillRect(cx + 98 * k, y - 120 * k, 14 * k, 110 * k); g.fillRect(cx, y - 62 * k, 120 * k, 18 * k); g.fillRect(cx + 10 * k, y - 44 * k, 8 * k, 44 * k); g.fillRect(cx + 102 * k, y - 44 * k, 8 * k, 44 * k); }
}
