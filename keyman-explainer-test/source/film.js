// Keyman explainer — Swiss Motion Graphics, 1080x1920. Everything is a pure function of t (deterministic).
// Two curves only: the precise ease cubic-bezier(.7,0,.2,1) and linear. No fades, no bounce.
export const W = 1080, H = 1920;
export let DUR = 52;
const C = { bg: '#0B1220', panel: '#17243A', ink: '#FFFFFF', cy: '#00D9E8', or: '#FF9A3C', link: '#4C586B' };
const A = a => `rgba(255,255,255,${a})`;
const clamp = (x, a = 0, b = 1) => Math.max(a, Math.min(b, x)), lerp = (a, b, t) => a + (b - a) * t, seg = (t, a, b) => clamp((t - a) / (b - a));
function cubicBezier(x1, y1, x2, y2) {
  const bx = u => 3 * (1 - u) * (1 - u) * u * x1 + 3 * (1 - u) * u * u * x2 + u * u * u;
  const by = u => 3 * (1 - u) * (1 - u) * u * y1 + 3 * (1 - u) * u * u * y2 + u * u * u;
  return t => { if (t <= 0) return 0; if (t >= 1) return 1; let lo = 0, hi = 1, u = t;
    for (let i = 0; i < 30; i++) { const x = bx(u); if (Math.abs(x - t) < 1e-6) break; if (x < t) lo = u; else hi = u; u = (lo + hi) / 2; } return by(u); };
}
const E = cubicBezier(.7, 0, .2, 1);
const snap = (t, t1, d = .25) => E(seg(t, t1 - d, t1));          // starts d early, LANDS at t1
const lin = seg;
const steps = (t, a, b, n) => { const p = seg(t, a, b) * n, i = Math.floor(p); return i >= n ? 1 : (i + E(p - i)) / n; };
const hex = c => [1, 3, 5].map(i => parseInt(c.slice(i, i + 2), 16));
const mix = (a, b, t) => { const x = hex(a), y = hex(b); return `rgb(${x.map((v, i) => Math.round(lerp(v, y[i], t))).join(',')})`; };

let TL = null, TX = null;                                            // timeline json, text collector (readcheck)
export function init(tl) { TL = tl; DUR = tl.dur; }
const wt = (id, i) => TL.lines.find(l => l.id === id).wt[i];         // absolute time of word i of line id
const CUES = () => TL.cues;

// ---------- text
function F(g, size, weight, track) { g.font = `${weight} ${size}px Archivo`; g.letterSpacing = ((track ?? (size >= 90 ? -.02 : 0)) * size) + 'px'; }
function tw(g, s, o) { F(g, o.size, o.weight, o.track); return g.measureText(s).width; }
function text(g, s, x, y, o) { F(g, o.size, o.weight || 700, o.track); g.fillStyle = o.color || C.ink; g.textBaseline = 'alphabetic'; g.fillText(s, x, y); }
// clip-reveal: rises from below the baseline (pin 0->1), leaves upward (pout 0->1)
function rise(g, s, x, y, o, pin, pout = 0, tag) {
  o = { weight: 700, ...o };
  if (pin <= 0 || pout >= 1) return;
  const w = tw(g, s, o), lh = o.size * 1.08;
  if (TX && tag) TX.push({ id: tag, text: s, x0: x, y0: y - o.size * .8, x1: x + w, y1: y + o.size * .2, pass: !!o.pass });
  g.save(); g.beginPath(); g.rect(x - 8, y - o.size * (o.ct ?? .95), w + 16, o.size * (o.ct ?? .95) + o.size * .3); g.clip();
  text(g, s, x, y + (1 - pin) * lh - pout * lh, o); g.restore();
}
const rin = (t, t1) => snap(t, t1, .125), rout = (t, t0) => E(seg(t, t0, t0 + .25));

// ---------- shapes
function person(g, cx, cy, s, o = {}) {                                  // flat pictogram, height ≈ s
  const { fill = C.cy, stroke = null, dash = null, lw = 4 } = o;
  g.save(); if (dash) g.setLineDash(dash); g.lineWidth = lw; g.fillStyle = fill || 'transparent'; g.strokeStyle = stroke || fill;
  g.beginPath(); g.arc(cx, cy - .27 * s, .17 * s, 0, 7); fill ? g.fill() : g.stroke();
  const w = .68 * s, r = .24 * s, x = cx - w / 2, y = cy - .02 * s, b = cy + .5 * s;
  g.beginPath(); g.moveTo(x, b); g.lineTo(x, y + r); g.quadraticCurveTo(x, y, x + r, y); g.lineTo(x + w - r, y); g.quadraticCurveTo(x + w, y, x + w, y + r); g.lineTo(x + w, b); g.closePath();
  fill ? g.fill() : g.stroke(); g.restore();
}
function check(g, x, y, s, p, color, lw) {                               // check mark, drawn linearly p 0..1
  if (p <= 0) return; const pts = [[.18, .55], [.42, .78], [.84, .26]], L = [Math.hypot(.24, .23), Math.hypot(.42, .52)], tot = L[0] + L[1];
  g.save(); g.strokeStyle = color; g.lineWidth = lw || s * .13; g.lineCap = 'butt'; g.lineJoin = 'miter'; g.beginPath(); g.moveTo(x + pts[0][0] * s, y + pts[0][1] * s);
  const d = p * tot; if (d <= L[0]) { const q = d / L[0]; g.lineTo(x + (pts[0][0] + (pts[1][0] - pts[0][0]) * q) * s, y + (pts[0][1] + (pts[1][1] - pts[0][1]) * q) * s); }
  else { g.lineTo(x + pts[1][0] * s, y + pts[1][1] * s); const q = (d - L[0]) / L[1]; g.lineTo(x + (pts[1][0] + (pts[2][0] - pts[1][0]) * q) * s, y + (pts[1][1] + (pts[2][1] - pts[1][1]) * q) * s); }
  g.stroke(); g.restore();
}
function polyPartial(g, pts, p) {                                        // stroke a polyline up to fraction p of its length
  const L = pts.slice(1).map((q, i) => Math.hypot(q[0] - pts[i][0], q[1] - pts[i][1])), tot = L.reduce((a, b) => a + b, 0); let d = p * tot;
  g.beginPath(); g.moveTo(pts[0][0], pts[0][1]);
  for (let i = 0; i < L.length; i++) { if (d >= L[i]) { g.lineTo(pts[i + 1][0], pts[i + 1][1]); d -= L[i]; } else { const q = d / L[i]; g.lineTo(lerp(pts[i][0], pts[i + 1][0], q), lerp(pts[i][1], pts[i + 1][1], q)); break; } }
  g.stroke();
}
// knife cut: a 2 px line crosses (1/16), then the element collapses to its midline (3/16). returns false when gone.
function knife(g, t, t0, x, y, w, h, draw) {
  const pk = lin(t, t0, t0 + .125), pc = E(seg(t, t0 + .125, t0 + .5));
  if (pc >= 1) return false; const ym = y + h / 2;
  g.save(); g.translate(0, ym); g.scale(1, 1 - pc); g.translate(0, -ym); draw(); g.restore();
  if (pk > 0) { g.fillStyle = C.ink; g.fillRect(x, ym - 1, w * pk, 2); } return true;
}
const xcol = i => 72 + i * 160;

// ---------- the module grid (the "programme"): 3 x 3 cells
const CW = 272, CH = 180, CGX = 60, CGY = 70, GX = 72, GY = 500, MIDY = 840;
const CELLS = [['sales', 'SALES'], ['projects', 'PROJECTS'], ['clients', 'CLIENTS'], ['ops', 'OPERATIONS'], ['key', 'KEY PERSON'], ['finance', 'FINANCE'], ['team', 'TEAM'], ['cash', 'CASH FLOW'], ['suppliers', 'SUPPLIERS']]
  .map(([id, label], i) => ({ id, label, i, c: i % 3, r: (i / 3) | 0, x: GX + (i % 3) * (CW + CGX), y: GY + ((i / 3) | 0) * (CH + CGY), ring: Math.abs((i % 3) - 1) + Math.abs(((i / 3) | 0) - 1) }));
const RING1 = [1, 3, 5, 7], RING2 = [0, 2, 6, 8];
const ord = i => (CELLS[i].ring === 1 ? RING1 : RING2).indexOf(i);
// timeline constants (seconds)
const K = {
  land: i => .25 * (i + 1),                        // file tile i lands; bar fills; check on land+.25
  knife: i => (CELLS[i].ring === 1 ? 3.0 : 3.25) + .125 * ord(i),
  slot: i => (CELLS[i].ring === 1 ? 3.75 : 4.0) + .125 * ord(i),
  live: i => (CELLS[i].ring === 1 ? 7.5 : 8.0) + .125 * ord(i),
  personIn: 3.25, qStart: 4.0, qEnd: 5.0, pushA: 5.0, pushB: 6.0, pullA: 6.5, pullB: 7.5,
  cut: 10.5, linksOut: 10.75, ripple1: 11.0, ripple2: 11.5, stall: 12.5, worry: 14.5, cashDrop: 16.5, wipeA: 18.5, wipeB: 19.0,
  gd: i => (CELLS[i].ring === 1 ? 11.0 : 11.5) + .125 * ord(i),
};
const camS = t => t < 6.25 ? 1 + 2 * E(seg(t, K.pushA, K.pushB)) : 3 - 2 * E(seg(t, K.pullA, K.pullB));

function bigQ(g, x, y, w, h, k, color) {                                 // giant "?" behind the person, climbing in steps
  if (k <= 0) return; const size = 250; F(g, size, 800, -.02); const gw = g.measureText('?').width, base = y + h - 6;
  g.save(); g.beginPath(); g.rect(x, base - size * .74 * k - 2, w, size * .74 * k + 12); g.clip(); text(g, '?', x + (w - gw) / 2, base, { size, weight: 800, color, track: -.02 }); g.restore();
}
function bigCheck(g, x, y, w, h, p, color) { const s = 150; check(g, x + (w - s) / 2, y + (h - s) / 2 + 4, s, p, color, 24); }

// mini graphics: (cell rect, grow k, generic damage gd, specific sp, time, extra)
const grow = (k, i, n = 6) => E(clamp(k * (n * .35 + 1) - i * .35));
const MINI = {
  sales(g, x, y, w, h, k, gd) { const col = mix('#FFFFFF', C.or, gd), hs = [.34, .5, .44, .7, .92];
    hs.forEach((v, i) => { const hh = v * 92 * (1 - .42 * gd) * grow(k, i, 5); g.fillStyle = col; g.fillRect(x + 20 + i * 48, y + h - 18 - hh, 34, hh); }); },
  projects(g, x, y, w, h, k, gd, sp, t, fp) { const col = mix('#FFFFFF', C.or, gd);
    g.fillStyle = A(.14); g.fillRect(x + 18, y + 118, w - 36, 24); g.fillStyle = col; g.fillRect(x + 18, y + 118, (w - 36) * fp * E(k), 24);
    g.fillStyle = A(.35); for (let i = 1; i <= 3; i++) g.fillRect(x + 18 + (w - 36) * i / 4 - 2, y + 100, 4, 8);
    if (sp > 0) { const cw = 150 * E(sp); g.save(); g.beginPath(); g.rect(x + 18, y + 62, cw, 34); g.clip(); g.fillStyle = C.or; g.fillRect(x + 18, y + 62, 150, 34); text(g, 'STALLED', x + 30, y + 87, { size: 22, weight: 800, color: C.bg, track: .06 }); g.restore(); } },
  clients(g, x, y, w, h, k, gd, sp, t, tD) { const col = mix('#FFFFFF', C.or, gd);
    g.save(); g.beginPath(); g.rect(x, y, w, h); g.clip();
    for (let i = 0; i < 5; i++) { let off = 0; if (i >= 2) off = lin(t, tD + (i - 2) * .25, tD + (i - 2) * .25 + 1.1) * 300; if (off > 280) continue;
      const sc = grow(k, i, 5); g.fillStyle = col; g.beginPath(); g.arc(x + 40 + i * 48 + off, y + 118, 17 * sc, 0, 7); g.fill(); g.fillRect(x + 40 + i * 48 + off - 17 * sc, y + 118 + 24, 34 * sc, 5); }
    g.restore(); },
  ops(g, x, y, w, h, k, gd) { const col = mix('#FFFFFF', C.or, gd), xs = [0, 50, 96], ws = [160, 150, 130];
    xs.forEach((o, i) => { g.fillStyle = col; g.fillRect(x + 18 + o, y + 76 + i * 32, ws[i] * (1 - .45 * gd) * E(clamp(k * 1.5 - i * .25)), 18); }); },
  finance(g, x, y, w, h, k, gd) { const col = mix('#FFFFFF', C.or, gd), ax = x + 20, ay = y + 74, aw = w - 40, ah = h - 100;
    const H0 = [[0, .72], [.2, .62], [.4, .66], [.6, .42], [.8, .34], [1, .12]], H1 = [[0, .72], [.2, .62], [.4, .66], [.6, .42], [.8, .62], [1, .92]];
    const pts = H0.map((p, i) => [ax + p[0] * aw, ay + lerp(p[1], H1[i][1], gd) * ah]);
    g.fillStyle = A(.14); g.fillRect(ax, ay + ah + 8, aw, 3); g.strokeStyle = col; g.lineWidth = 7; g.lineJoin = 'round'; polyPartial(g, pts, E(k)); },
  team(g, x, y, w, h, k, gd) { for (let i = 0; i < 6; i++) { const bad = (i === 1 || i === 4) ? gd : 0; person(g, x + 52 + (i % 3) * 84, y + 100 + ((i / 3) | 0) * 56 - 8, 40 * grow(k, i, 6), { fill: mix('#FFFFFF', C.or, bad) }); } },
  cash(g, x, y, w, h, k, gd, sp, t) { const col = mix('#FFFFFF', C.or, gd), up = [.26, .36, .32, .55, .7, .9], dn = [.16, .12, .09, .06, .04, .03];
    for (let i = 0; i < 6; i++) { const f = E(seg(sp, i * .08, i * .08 + .5)), v = lerp(up[i], dn[i], f); const hh = v * 94 * grow(k, i, 6); g.fillStyle = col; g.fillRect(x + 20 + i * 36, y + h - 18 - hh, 26, hh); }
    if (sp > 0) { const q = E(seg(sp, .3, .6)); g.fillStyle = C.or; g.beginPath(); g.moveTo(x + w - 66, y + 74); g.lineTo(x + w - 18, y + 74); g.lineTo(x + w - 42, y + 74 + 48 * q); g.closePath(); g.fill(); } },
  suppliers(g, x, y, w, h, k, gd) { for (let i = 0; i < 3; i++) { const s = 52 * grow(k, i, 3), bx = x + 24 + i * 78; g.fillStyle = mix('#FFFFFF', C.or, gd); g.fillRect(bx, y + 96, s, s); g.fillStyle = C.panel; g.fillRect(bx + 10, y + 106, s - 20 > 0 ? s - 20 : 0, s - 20 > 0 ? s - 20 : 0); } },
};

function drawPanel(g, c, w) { g.fillStyle = C.panel; g.fillRect(c.x, c.y, w, CH); }
function cellLabel(g, c, t, tIn, s = C.ink, tag) { rise(g, c.label, c.x + 18, c.y + 44, { size: 26, weight: 700, color: s, track: .04, pass: true }, rin(t, tIn), 0, tag || ('cell-' + c.id)); }

// S1 file tile
function fileTile(g, c, t) {
  const land = K.land(c.i), wv = CW * snap(t, land, .25); if (wv <= 0) return;
  g.save(); g.beginPath(); g.rect(c.x, c.y, wv, CH); g.clip(); drawPanel(g, c, CW);
  // file icon
  const fx = c.x + 22, fy = c.y + 64; g.strokeStyle = A(.85); g.lineWidth = 4; g.beginPath(); g.moveTo(fx, fy); g.lineTo(fx + 28, fy); g.lineTo(fx + 44, fy + 16); g.lineTo(fx + 44, fy + 58); g.lineTo(fx, fy + 58); g.closePath(); g.stroke();
  g.fillStyle = A(.5); g.fillRect(fx + 9, fy + 28, 26, 4); g.fillRect(fx + 9, fy + 40, 18, 4);
  text(g, 'FILE 0' + (c.i + 1), c.x + 18, c.y + 40, { size: 24, weight: 700, color: A(.9), track: .06 });
  // backup bar + check
  g.fillStyle = A(.14); g.fillRect(c.x + 86, c.y + 100, CW - 112, 14); g.fillStyle = C.cy; g.fillRect(c.x + 86, c.y + 100, (CW - 112) * lin(t, land, land + .25), 14);
  text(g, 'BACKED UP', c.x + 86, c.y + 146, { size: 20, weight: 600, color: A(.6), track: .08 });
  check(g, c.x + CW - 60, c.y + 12, 44, lin(t, land + .25, land + .375), C.cy, 7);
  g.restore();
}
const tickT = i => K.land(i) + .25;
const nDone = t => CELLS.filter(c => t >= tickT(c.i)).length;

// the person (cyan) in the key cell; role label cycles on the spoken words (founder / lead operator / top salesperson)
const ROLES = [[-99, 'KEY PERSON'], [7.0, 'FOUNDER'], [8.0, 'LEAD OPERATOR'], [9.0, 'TOP SALESPERSON'], [10.0, 'KEY PERSON']];
function keyCell(g, t, mode) {            // mode 's1' (hook) | 's2' (problem) | 's5' (return)
  const c = CELLS[4]; drawPanel(g, c, CW);
  const cx = c.x + CW / 2, cy = c.y + 118, qcol = A(.16);
  if (mode === 's5') {                                           // bookend: the "?" is knife-cut, a check replaces it
    if (t < 41.5) bigQ(g, c.x, c.y, CW, CH, 1, qcol);
    else { knife(g, t, 41.5, c.x, c.y, CW, CH, () => bigQ(g, c.x, c.y, CW, CH, 1, qcol)); bigCheck(g, c.x, c.y, CW, CH, lin(t, 42.0, 42.5), A(.26)); }
  } else bigQ(g, c.x, c.y, CW, CH, steps(t, K.qStart, K.qEnd, 4), qcol);
  if (mode === 's1') rise(g, 'KEY PERSON', c.x + 18, c.y + 44, { size: 26, weight: 700, color: C.ink, track: .03, pass: true }, rin(t, K.personIn + .25), 0, 'cell-key');
  else if (mode === 's5') rise(g, 'KEY PERSON', c.x + 18, c.y + 44, { size: 26, weight: 700, color: C.ink, track: .03, pass: true }, 1, 0, 'cell-key');
  else ROLES.forEach(([tt, lab], i) => { const nx = ROLES[i + 1] ? ROLES[i + 1][0] : null;
    rise(g, lab, c.x + 18, c.y + 44, { size: lab.length > 11 ? 21 : 26, weight: 700, color: C.ink, track: .03, pass: true }, i === 0 ? 1 : rin(t, tt), nx ? E(seg(t, nx - .125, nx)) : 0, 'cell-key-' + i); });
  const draw = () => { const p = mode === 's1' ? rin(t, K.personIn + .25) : 1; if (p <= 0) return; g.save(); g.beginPath(); g.rect(c.x, c.y + 56, CW, CH - 56); g.clip(); g.translate(0, (1 - p) * 110); person(g, cx, cy, 96, { fill: C.cy }); g.restore(); };
  if (mode === 's2' && t >= K.cut) knife(g, t, K.cut, c.x + 40, c.y + 56, CW - 80, 110, draw); else draw();
}

function linksList() {
  const L = []; for (const a of CELLS) for (const b of CELLS) { if (b.i <= a.i) continue; const dx = Math.abs(a.c - b.c), dy = Math.abs(a.r - b.r); if (dx + dy !== 1) continue; L.push({ a, b, center: a.i === 4 || b.i === 4 }); } return L;
}
const LINKS = linksList();
function drawLinks(g, t, mode) {
  LINKS.forEach((l, n) => {
    const { a, b } = l, horiz = a.r === b.r;
    let x0, y0, x1, y1;
    if (horiz) { x0 = a.x + CW; y0 = a.y + CH / 2; x1 = b.x; y1 = y0; } else { x0 = a.x + CW / 2; y0 = a.y + CH; x1 = x0; y1 = b.y; }
    let from = l.a.i === 4 ? 0 : (l.b.i === 4 ? 1 : 0);               // draw direction starts at the centre cell for centre links
    if (l.center && l.b.i === 4) { [x0, y0, x1, y1] = [x1, y1, x0, y0]; }
    let p = 1, q0 = 0;
    let col = C.link;
    if (mode === 's5') { col = C.cy; }
    else {
      const other = l.center ? (l.a.i === 4 ? l.b : l.a) : (l.a.ring === 2 ? l.a : l.b);
      const tD = l.center ? 3.75 + .125 * ord(other.i) : 4.25 + .125 * (n % 4);
      p = lin(t, tD, tD + .5);
      if (l.center && t >= K.linksOut) q0 = lin(t, K.linksOut, K.linksOut + .25);   // retract from the centre outward
      if (!l.center) { const gd = snap(t, K.gd(other.i)); col = mix(C.link, C.or, gd); }
    }
    if (p <= 0 || q0 >= 1) return;
    const sx = lerp(x0, x1, q0), sy = lerp(y0, y1, q0), ex = lerp(x0, x1, p), ey = lerp(y0, y1, p);
    g.strokeStyle = col; g.lineWidth = 5; g.beginPath(); g.moveTo(sx, sy); g.lineTo(ex, ey); g.stroke();
    // pulses along centre links while healthy
    const live = mode === 's5' ? t >= 38.0 : (t >= 7.75 && t < K.cut + .25);
    if (l.center && live) { const per = 1.0, ph = ((t - 7.75) % per + per) % per / .5; if (ph < 1) { const px = lerp(x0, x1, ph), py = lerp(y0, y1, ph); g.fillStyle = C.cy; g.fillRect(px - 7, py - 7, 14, 14); } }
  });
}

function drawLive(g, t, c, mode) {
  const i = c.i; if (i === 4) return;
  const tl = mode === 's5' ? 37.5 : K.live(i), wv = mode === 's5' ? CW : CW * snap(t, tl, .25); if (wv <= 0) return;
  const gdT = mode === 's5' ? 1e9 : K.gd(i), gd = snap(t, gdT, .125);
  const k = mode === 's5' ? 1 : E(seg(t, tl, tl + .625));
  g.save(); g.beginPath(); g.rect(c.x, c.y, wv, CH); g.clip(); drawPanel(g, c, CW);
  if (gd > 0) { g.fillStyle = C.or; g.fillRect(c.x, c.y, 6, CH * gd); }
  cellLabel(g, c, t, tl + .0);
  const sp = mode === 's5' ? 0 : ({ projects: lin(t, K.stall, K.stall + .5), clients: 0, cash: lin(t, K.cashDrop, K.cashDrop + 1.0) })[c.id] || 0;
  const fp = mode === 's5' ? Math.min(.9, .55 + .02 * (t - 37.5)) : Math.min(.5, .22 + .05 * Math.max(0, t - 7.5));
  MINI[c.id](g, c.x, c.y, CW, CH, k, gd, sp, t, c.id === 'projects' ? fp : (mode === 's5' ? 1e9 : K.worry));
  g.restore();
}
function drawNetWorld(g, t, mode) {
  drawLinks(g, t, mode);
  for (const c of CELLS) {
    if (c.i === 4) {
      if (mode === 's5') keyCell(g, t, 's5'); else if (t < 3.0) fileTile(g, c, t); else keyCell(g, t, t < 6.0 ? 's1' : 's2');
      continue;
    }
    if (mode === 'a') {                                            // hook + problem: files -> slots -> live
      if (t < K.live(c.i)) {
        if (t < K.knife(c.i)) fileTile(g, c, t);
        else if (t < K.slot(c.i)) knife(g, t, K.knife(c.i), c.x, c.y, CW, CH, () => fileTile(g, c, t));
        else { const k = E(seg(t, K.slot(c.i), K.slot(c.i) + .25)); if (k > 0) { const ym = c.y + CH / 2; g.save(); g.translate(0, ym); g.scale(1, k); g.translate(0, -ym); g.strokeStyle = A(.22); g.lineWidth = 3; g.strokeRect(c.x + 1.5, c.y + 1.5, CW - 3, CH - 3); g.restore(); } }
      } else { g.strokeStyle = A(.22); g.lineWidth = 3; g.strokeRect(c.x + 1.5, c.y + 1.5, CW - 3, CH - 3); drawLive(g, t, c, 's2'); }
    } else drawLive(g, t, c, mode);
  }
}

// ---------- backdrop, headlines, captions
const q4 = x => Math.round(x * 4) / 4;
function backdrop(g, t) {
  g.fillStyle = A(.07);
  for (let i = 0; i <= 6; i++) { const x = i < 6 ? xcol(i) : 1008, p = lin(t, .0 + i * .0625, .5 + i * .0625); g.fillRect(x - .5, 190, 1, 1290 * p); }
}
function numeralBlock(g, t) {                                      // S1: giant counter, knife-cut at 3.0
  const draw = () => {
    rise(g, 'FILES BACKED UP', 72, 238, { size: 28, weight: 700, color: A(.6), track: .06, pass: true }, 1, 0, 'n-label');
    for (let n = 0; n <= 9; n++) { const t0 = n === 0 ? -99 : tickT(n - 1), t1 = n < 9 ? tickT(n) : 1e9;
      rise(g, `${n}/9`, 66, 440, { size: 230, weight: 800, color: C.ink, pass: true, ct: .74 }, n === 0 ? 1 : rin(t, t0), n < 9 ? E(seg(t, t1 - .125, t1)) : 0, 'n-' + n); } };
  if (t < 3.0) draw(); else knife(g, t, 3.0, 72, 190, 700, 290, draw);
}
function heads12(g, t) {
  numeralBlock(g, t);
  const o = { size: 88, weight: 800, color: C.ink };
  rise(g, 'YOUR BIGGEST', 72, 330, o, rin(t, 4.5), rout(t, 8.25), 'h1a'); rise(g, 'BUSINESS RISK?', 72, 424, o, rin(t, 4.75), rout(t, 8.375), 'h1b');
  rise(g, 'ONE PERSON.', 72, 262, { size: 80, weight: 800, color: C.cy }, rin(t, 8.5), 0, 'h2a');
  rise(g, 'MULTIPLE', 72, 350, { size: 80, weight: 800, color: C.or }, rin(t, 12.0), 0, 'h2b'); rise(g, 'BUSINESS RISKS.', 72, 438, { size: 80, weight: 800, color: C.or }, rin(t, 12.125), 0, 'h2c');
}
const WINDOW = [0, 480, W, 720];
function drawS12(g, t) {
  heads12(g, t);
  g.save(); g.beginPath(); g.rect(...WINDOW); g.clip();
  const s = camS(t); g.translate(540, MIDY); g.scale(s, s); g.translate(-540, -MIDY);
  drawNetWorld(g, t, 'a'); g.restore();
}

// ---------- S3 Keyman insurance
const SHIELD = (() => { const pts = [[292, 596], [512, 626], [512, 880]];
  const bez = (p0, p1, p2, p3, n) => { for (let i = 1; i <= n; i++) { const u = i / n, v = 1 - u; pts.push([v ** 3 * p0[0] + 3 * v * v * u * p1[0] + 3 * v * u * u * p2[0] + u ** 3 * p3[0], v ** 3 * p0[1] + 3 * v * v * u * p1[1] + 3 * v * u * u * p2[1] + u ** 3 * p3[1]]); } };
  bez([512, 880], [512, 1040], [400, 1120], [292, 1166], 40); bez([292, 1166], [184, 1120], [72, 1040], [72, 880], 40); pts.push([72, 626], [292, 596]); return pts; })();
const S3T = { title: 19.0, tower: [20.0, 20.25, 20.5], shield: [20.5, 22.25], card: 22.5, tag: 23.0, cond: 24.25, tick: 26.5, pay: [27.0, 27.75] };
function drawS3(g, t) {
  rise(g, 'KEYMAN', 72, 300, { size: 120, weight: 800 }, rin(t, S3T.title), 0, 'h3a'); rise(g, 'INSURANCE', 72, 430, { size: 120, weight: 800 }, rin(t, S3T.title + .25), 0, 'h3b');
  rise(g, 'FINANCIAL PROTECTION FOR THE BUSINESS', 72, 494, { size: 30, weight: 700, color: C.cy, track: .03 }, rin(t, 19.75), 0, 'h3c');
  // the business: three blocks (financial position)
  const blocks = [['CASH', 720], ['OPERATIONS', 830], ['PAYROLL', 940]], fillP = E(seg(t, 27.5, 27.9));
  blocks.forEach(([lab, y], i) => { const tt = S3T.tower[2 - i], w = 304 * snap(t, tt, .25); if (w <= 0) return;
    g.save(); g.beginPath(); g.rect(140, y, w, 94); g.clip(); g.fillStyle = C.panel; g.fillRect(140, y, 304, 94);
    if (i === 0 && fillP > 0) { g.fillStyle = C.cy; g.fillRect(444 - 304 * fillP, y, 304 * fillP, 94); }
    text(g, lab, 164, y + 58, { size: 28, weight: 700, color: i === 0 && fillP > .6 ? C.bg : C.ink, track: .04 }); g.restore(); });
  // shield, drawn linearly
  const ps = lin(t, S3T.shield[0], S3T.shield[1]); if (ps > 0) { g.strokeStyle = C.cy; g.lineWidth = 9; g.lineJoin = 'miter'; polyPartial(g, SHIELD, ps); }
  // insured key person tag
  const X = 560, Wd = 340, tg = snap(t, S3T.tag, .25);
  if (tg > 0) { g.save(); g.beginPath(); g.rect(X, 600, Wd * tg, 96); g.clip(); g.fillStyle = C.panel; g.fillRect(X, 600, Wd, 96); person(g, X + 48, 648, 62, { fill: C.cy });
    text(g, 'INSURED', X + 100, 640, { size: 26, weight: 700, track: .04 }); text(g, 'KEY PERSON', X + 100, 674, { size: 26, weight: 700, track: .04 }); g.restore(); }
  // policy card
  const cd = snap(t, S3T.card, .25);
  if (cd > 0) { g.save(); g.beginPath(); g.rect(X, 730, Wd * cd, 190); g.clip(); g.fillStyle = C.panel; g.fillRect(X, 730, Wd, 190);
    g.strokeStyle = C.cy; g.lineWidth = 5; const fx = X + 26, fy = 764; g.beginPath(); g.moveTo(fx, fy); g.lineTo(fx + 34, fy); g.lineTo(fx + 52, fy + 18); g.lineTo(fx + 52, fy + 70); g.lineTo(fx, fy + 70); g.closePath(); g.stroke();
    g.fillStyle = C.cy; g.fillRect(fx + 11, fy + 36, 30, 5); g.fillRect(fx + 11, fy + 50, 20, 5);
    text(g, 'POLICY', X + 100, 802, { size: 32, weight: 800, track: .04 }); g.fillStyle = A(.25); g.fillRect(X + 100, 826, 190, 8); g.fillRect(X + 100, 848, 130, 8);
    g.fillStyle = C.cy; g.beginPath(); g.arc(X + Wd - 52, 870, 24, 0, 7); g.fill(); check(g, X + Wd - 52 - 17, 870 - 18, 34, lin(t, S3T.card, S3T.card + .25), C.bg, 5); g.restore(); }
  g.fillStyle = C.cy; g.fillRect(X + 40, 696, 4, 34 * lin(t, 23.25, 23.5));                     // person -> policy
  g.fillRect(X + 40, 920, 4, 30 * lin(t, 24.0, 24.25));                                          // policy -> condition
  // condition: a covered event (conditional!)
  const cn = snap(t, S3T.cond, .25);
  if (cn > 0) { g.save(); g.beginPath(); g.rect(X, 950, Wd * cn, 80); g.clip(); g.fillStyle = C.panel; g.fillRect(X, 950, Wd, 80);
    const tk = snap(t, S3T.tick, .125); g.lineWidth = 4; g.strokeStyle = A(.7); g.strokeRect(X + 20, 968, 44, 44); if (tk > 0) { g.fillStyle = C.cy; g.fillRect(X + 20, 968, 44, 44); check(g, X + 20, 968, 44, lin(t, S3T.tick - .125, S3T.tick), C.bg, 6); }
    text(g, 'COVERED EVENT*', X + 80, 999, { size: 25, weight: 700, track: .02 }); g.restore();
    rise(g, '*SUBJECT TO POLICY TERMS', X, 1066, { size: 22, weight: 600, color: A(.6), track: .04, pass: true }, rin(t, 24.5), 0, 'fn3'); }
  // payout: the one element that travels linearly (the exception), only after the covered-event tick
  const pp = lin(t, S3T.pay[0], S3T.pay[1]);
  if (pp > 0 && fillP < 1) { const px = lerp(640, 292, pp), py = 767; g.save(); g.beginPath(); g.rect(0, 700, 560 + (px < 560 ? 0 : 0) + 600, 140); g.clip();
    g.fillStyle = C.cy; g.fillRect(px - 75, py - 26, 150, 52); text(g, 'PAYOUT', px - 52, py + 8, { size: 24, weight: 800, color: C.bg, track: .06 }); g.restore(); }
}

// ---------- S4 business recovery: three equal rows
function drawS4(g, t) {
  rise(g, 'DEPENDING ON THE POLICY', 72, 248, { size: 30, weight: 700, color: A(.6), track: .06 }, rin(t, 28.75), 0, 'h4');
  const rows = [{ n: '01', lab: ['RECRUITMENT'], at: q4(wt('l08', 9)) }, { n: '02', lab: ['OPERATING', 'EXPENSES'], at: q4(wt('l08', 11)) }, { n: '03', lab: ['RECOVERY TIME'], at: q4(wt('l08', 17)) }];
  rows.forEach((r, i) => { const y0 = 300 + 300 * i, a = 29.0 + .25 * i;
    g.fillStyle = A(.28); g.fillRect(72, y0, 936 * lin(t, a - .25, a + .25), 2);
    rise(g, r.n, 66, y0 + 232, { size: 210, weight: 800, pass: true }, steps(t, a, a + .5, 4), 0, 'n4-' + i);
    r.lab.forEach((s, k) => rise(g, s, 372, r.lab.length === 1 ? y0 + 118 : y0 + 90 + 58 * k, { size: 56, weight: 800 }, rin(t, r.at + .125 * k), 0, 'l4-' + i + '-' + k)); });
  // A recruitment: an empty slot is filled by a new person
  { const y0 = 300, p = rin(t, 31.5), cy = y0 + 224;
    for (let i = 0; i < 5; i++) { const cx = 372 + i * 100 + 36, sc = snap(t, 29.5 + .125 * i, .25);
      if (i < 4) { if (sc > 0) person(g, cx, cy, 64 * sc, { fill: A(.5) }); }
      else { if (sc > 0) person(g, cx, cy, 64, { fill: null, stroke: A(.55), dash: [8, 7], lw: 3 }); if (p > 0) { g.save(); g.beginPath(); g.rect(cx - 40, cy - 40, 80, 80); g.clip(); g.translate(0, (1 - p) * 80); person(g, cx, cy, 64, { fill: C.cy }); g.restore(); } } } }
  // B operating expenses: bars fill from below
  { const y0 = 600, hs = [40, 64, 52, 76, 58], base = y0 + 262;
    hs.forEach((h, i) => { const x = 372 + i * 100, sc = snap(t, 29.75 + .125 * i, .25); if (sc <= 0) return; g.strokeStyle = A(.4); g.lineWidth = 3; g.strokeRect(x + 1.5, base - h * sc + 1.5, 69, h * sc - 3);
      const f = steps(t, 33.5 + .125 * i, 34.0 + .125 * i, 3); g.fillStyle = C.cy; g.fillRect(x, base - h * f, 72, h * f); }); }
  // C recovery time: a runway; the playhead runs, the line settles
  { const y0 = 900, base = y0 + 262, pr = lin(t, 35.5, 37.0), sc = snap(t, 30.25, .25);
    if (sc > 0) { g.fillStyle = A(.3); g.fillRect(372, base, 528 * sc, 3); for (let m = 0; m <= 12; m++) g.fillRect(372 + m * 44 - 1, base - 10, 3, 10 * sc);
      const pts = [[372, base - 6], [450, base - 14], [530, base - 34], [610, base - 62], [690, base - 76], [780, base - 80], [900, base - 80]];
      g.strokeStyle = C.cy; g.lineWidth = 8; g.lineJoin = 'round'; if (pr > 0) polyPartial(g, pts, pr);
      if (pr > 0 && pr < 1) { g.fillStyle = A(.85); g.fillRect(372 + 528 * pr - 1.5, y0 + 168, 3, 94); } } }
}

// ---------- S5 return + call to action
function drawS5(g, t) {
  const o = { size: 88, weight: 800 };
  rise(g, 'PROTECT YOUR', 72, 268, o, rin(t, 41.5), 0, 'h5a'); rise(g, 'BUSINESS', 72, 358, o, rin(t, 41.625), 0, 'h5b'); rise(g, 'CONTINUITY', 72, 448, o, rin(t, 41.75), 0, 'h5c');
  // network, stable; expands from the midline, collapses at the CTA
  const kIn = E(seg(t, 37.5, 38.0)), kOut = E(seg(t, 43.875, 44.25)), k = Math.min(kIn, 1 - kOut);
  if (k > 0) { g.save(); g.beginPath(); g.rect(...WINDOW); g.clip(); g.translate(0, MIDY); g.scale(1, k); g.translate(0, -MIDY);
    g.save(); const s = 1 + .35 * E(seg(t, 38.5, 39.5)) - .35 * E(seg(t, 40.5, 41.5)); g.translate(540, MIDY); g.scale(s, s); g.translate(-540, -MIDY); drawNetWorld(g, t, 's5'); g.restore();
    const pf = lin(t, 41.75, 43.25); if (pf > 0) { g.strokeStyle = C.cy; g.lineWidth = 7; g.lineJoin = 'miter'; polyPartial(g, [[48, 488], [1032, 488], [1032, 1192], [48, 1192], [48, 488]], pf); }
    g.restore(); }
  if (t >= 43.75 && t < 44.25) { g.fillStyle = C.ink; g.fillRect(0, MIDY - 1, W * lin(t, 43.75, 43.875), 2); }
  // closing card: cyan block (type overprinted in ink), byline, fine print
  const bw = W * snap(t, 44.5, .25); if (bw > 0) { g.fillStyle = C.cy; g.fillRect(0, 620, bw, 340); }
  rise(g, "DM 'KEYMAN'", 72, 780, { size: 120, weight: 800, color: C.bg }, rin(t, 44.5), 0, 'cta1'); rise(g, 'TO FIND OUT MORE', 72, 880, { size: 56, weight: 800, color: C.bg, track: .01 }, rin(t, 44.75), 0, 'cta2');
  rise(g, 'Rain | SME Risk & Business Advisory', 72, 1072, { size: 38, weight: 600, color: C.ink }, rin(t, 45.5), 0, 'by');
  rise(g, 'General information only, not financial advice.', 72, 1166, { size: 26, weight: 500, color: A(.6), pass: true }, rin(t, 46.25), 0, 'fp1');
  rise(g, 'Benefits depend on policy terms and conditions.', 72, 1202, { size: 26, weight: 500, color: A(.6), pass: true }, rin(t, 46.375), 0, 'fp2');
}

// ---------- captions: part of the layout, flush left at column 1, words clip-reveal on their Whisper timestamps
const CAP = { x: 72, maxW: 828, size: 54, weight: 600, y: 1312, lh: 66 };
const capCache = new Map();
function capLines(g, c) {
  if (capCache.has(c.t0)) return capCache.get(c.t0);
  const words = c.text.split(' '); F(g, CAP.size, CAP.weight, 0); const sp = g.measureText(' ').width; const lines = [[]]; let x = 0;
  words.forEach((w, i) => { const ww = g.measureText(w).width; if (x + ww > CAP.maxW && lines[lines.length - 1].length) { lines.push([]); x = 0; } lines[lines.length - 1].push({ w, i, x, ww }); x += ww + sp; });
  if (lines.length > 2) throw new Error('caption wraps to >2 lines: ' + c.text);
  capCache.set(c.t0, lines); return lines;
}
function captions(g, t) {
  if (t < 47.6) { g.fillStyle = A(.2); g.fillRect(72, 1226, 936 * (t < 47.0 ? 1 : 1 - lin(t, 47.0, 47.6)), 2); }
  for (const c of CUES()) {
    if (t < c.t0 - .2 || t > c.t1 + .01) continue; const lines = capLines(g, c), pout = E(seg(t, c.t1 - .125, c.t1));
    lines.forEach((ln, li) => ln.forEach(wd => rise(g, wd.w, CAP.x + wd.x, CAP.y + li * CAP.lh, { size: CAP.size, weight: CAP.weight, color: C.ink, track: 0 }, snap(t, c.words[wd.i], .125), pout)));
  }
}

// ---------- the film
let NOCAP = false;
export function renderFilm(g, t, opt = {}) {
  NOCAP = !!opt.nocap;
  g.setTransform(1, 0, 0, 1, 0, 0); g.fillStyle = C.bg; g.fillRect(0, 0, W, H); backdrop(g, t);
  if (t < K.wipeB) {
    if (t < K.wipeA) drawS12(g, t);
    else { const y = H * lin(t, K.wipeA, K.wipeB); g.save(); g.beginPath(); g.rect(0, y, W, H - y); g.clip(); drawS12(g, t); g.restore(); g.fillStyle = C.cy; g.fillRect(0, y - 2, W, 4); }
  } else if (t < 28.5) {
    const pk = lin(t, 28.0, 28.125), k = 1 - E(seg(t, 28.125, 28.5));
    if (k > 0) { g.save(); g.translate(0, MIDY); g.scale(1, k); g.translate(0, -MIDY); drawS3(g, t); g.restore(); }
    if (pk > 0 && k > 0) { g.fillStyle = C.ink; g.fillRect(0, MIDY - 1, W * pk, 2); }
  } else if (t < 37.5) {
    const kIn = E(seg(t, 28.5, 28.85)), kOut = 1 - E(seg(t, 37.125, 37.5)), k = Math.min(kIn, kOut);
    if (k > 0) { g.save(); g.translate(0, MIDY); g.scale(1, k); g.translate(0, -MIDY); drawS4(g, t); g.restore(); }
    if (t >= 37.0 && k > 0) { g.fillStyle = C.ink; g.fillRect(0, MIDY - 1, W * lin(t, 37.0, 37.125), 2); }
  } else drawS5(g, t);
  if (!NOCAP) captions(g, t);
}
export function texts(g, t) { TX = []; renderFilm(g, t); const r = TX; TX = null; return r; }

// ---------- sound events for the mixer (same constants as the picture)
export function events() {
  const ev = []; const add = (t, type, o = {}) => ev.push({ t: +t.toFixed(3), type, ...o });
  CELLS.forEach(c => { add(K.land(c.i) - .02, 'clack', { i: c.i }); add(tickT(c.i), 'tick', { i: c.i }); }); add(tickT(8) + .02, 'ding', { v: 1 });
  RING1.concat(RING2).forEach(i => add(K.knife(i) + .1, 'snick', { v: .5 }));
  add(3.0 + .1, 'snick', { v: .9 });
  RING1.forEach(i => add(K.slot(i), 'snap', { v: .5 })); RING2.forEach(i => add(K.slot(i), 'snap', { v: .4 }));
  add(3.75, 'tss', { d: .5 }); add(4.25, 'tss', { d: .5 });
  add(K.personIn + .25, 'thunk', { v: .8, f: 150 }); [4.0, 4.25, 4.5, 4.75].forEach((x, n) => add(x, 'thunk', { v: .5, f: 110 + 12 * n }));
  add(4.5, 'clack', { v: .8 }); add(4.75, 'clack', { v: .8 });
  add(5.0, 'whoosh', { d: 1.0, up: 1 }); add(6.0, 'thump', { v: 1 });
  add(6.5, 'whoosh', { d: 1.0, up: 0 });
  RING1.forEach(i => add(K.live(i), 'snap', { v: .6 })); RING2.forEach(i => add(K.live(i), 'snap', { v: .5 }));
  [7.0, 8.0, 9.0].forEach(x => add(x, 'tick', { v: .7 })); add(8.5, 'clack', { v: .9 });
  add(K.cut + .1, 'snick', { v: 1 }); add(K.linksOut, 'tss', { d: .25 });
  RING1.forEach(i => add(K.gd(i), 'drop', { v: .5 })); RING2.forEach(i => add(K.gd(i), 'drop', { v: .4 }));
  add(12.0, 'clack', { v: .9 }); add(K.stall, 'hit', { f: 196 }); add(K.worry, 'hit', { f: 175 }); add(K.cashDrop, 'hit', { f: 147 });
  // silence 17.6 - 19.0 (no events), then the title lands
  add(19.0, 'thunk', { v: 1, f: 120 }); add(19.25, 'thunk', { v: .8, f: 130 }); add(19.75, 'clack', { v: .7 });
  S3T.tower.forEach(x => add(x, 'snap', { v: .6 })); add(S3T.shield[0], 'tss', { d: 1.75 }); add(S3T.card, 'snap', { v: .7 }); add(S3T.tag, 'snap', { v: .6 }); add(S3T.cond, 'snap', { v: .6 });
  add(S3T.tick, 'ding', { v: .8 }); add(S3T.pay[0], 'whoosh', { d: .75, up: 1 }); add(27.9, 'thump', { v: .8 });
  add(28.0 + .1, 'snick', { v: .9 }); [29.0, 29.25, 29.5].forEach(x => add(x, 'thunk', { v: .5, f: 140 }));
  [31.5, 33.0, 35.25].forEach(x => add(x, 'clack', { v: .9 })); add(31.5, 'ding', { v: .6 }); for (let i = 0; i < 5; i++) add(33.5 + .125 * i, 'tick', { v: .5 });
  add(35.5, 'tss', { d: 1.5 }); add(37.0 + .1, 'snick', { v: .9 });
  add(37.5, 'snap', { v: .8 }); add(38.5, 'whoosh', { d: 1.0, up: 1 }); add(40.5, 'whoosh', { d: 1.0, up: 0 });
  add(41.5 + .1, 'snick', { v: 1 }); add(42.0, 'tss', { d: .5 }); add(41.75, 'tss', { d: 1.5 }); [41.5, 41.625, 41.75].forEach(x => add(x, 'clack', { v: .7 }));
  add(43.75 + .1, 'snick', { v: .9 }); add(44.5, 'thump', { v: 1 }); add(44.5, 'clack', { v: 1 }); add(44.75, 'clack', { v: .8 }); add(45.5, 'clack', { v: .6 });
  ev.sort((a, b) => a.t - b.t); return ev;
}
