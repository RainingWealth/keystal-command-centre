// Everything the viewer reads: paper text strips, the money cards, the step tags, the end card, and the burned-in captions.
// Text is paper (cream strips, ink lettering) growing from an anchor edge, as the style asks; captions are quiet warm serif on a dark band.
import { W, H, mk } from './engine.js';
import { clamp, seg, ss, eo, mulberry } from '/core/lib.js';
const FONT = "'Corm', 'Cormorant Garamond', Georgia, serif";
const PAPER = '#f1e7d0', INK = '#2a1a0e', RED = '#b3261e', GOLD = '#e9bd68', CREAM = '#fbf1da';
let grainPat = null;
function grain(g) { if (!grainPat) { const c = mk(128, 128), q = c.getContext('2d'), r = mulberry(5);
  for (let i = 0; i < 500; i++) { q.strokeStyle = r() < .5 ? 'rgba(120,90,50,.10)' : 'rgba(255,255,255,.14)'; q.lineWidth = .7; const x = r() * 128, y = r() * 128, a = r() * 3.14; q.beginPath(); q.moveTo(x, y); q.lineTo(x + Math.cos(a) * 8, y + Math.sin(a) * 8); q.stroke(); }
  grainPat = g.createPattern(c, 'repeat'); } return grainPat; }
const jit = (seed, n) => { const r = mulberry(seed); return Array.from({ length: n }, () => (r() - .5) * 5); };
const hashStr = s => { let h = 7; for (const ch of s) h = (h * 31 + ch.charCodeAt(0)) | 0; return h; };

// cut paper bar with slightly uneven ends; grows from the anchor; text is revealed with it
function bar(g, x, y, w, h, p, anchor, draw, seed = 1) {
  if (p <= .002) return; const vw = Math.max(2, w * p), x0 = anchor === 'center' ? x + (w - vw) / 2 : x;
  const j = jit(seed, 8);
  g.save(); g.translate(x0, y); g.rotate(((seed % 7) - 3) * .0016);
  g.shadowColor = 'rgba(0,0,0,.5)'; g.shadowBlur = 20; g.shadowOffsetY = 11;
  g.beginPath(); g.moveTo(j[0], j[1]); g.lineTo(vw + j[2], j[3]); g.lineTo(vw + j[4], h + j[5]); g.lineTo(j[6], h + j[7]); g.closePath();
  const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, '#f7eddb'); gr.addColorStop(1, '#e3d4b6'); g.fillStyle = gr; g.fill();
  g.shadowColor = 'transparent'; g.save(); g.clip(); g.fillStyle = grain(g); g.fillRect(0, 0, vw, h);
  g.fillStyle = 'rgba(255,255,255,.55)'; g.fillRect(0, 0, vw, 2.5); g.fillStyle = 'rgba(70,40,10,.28)'; g.fillRect(0, h - 3, vw, 3);
  g.translate(-(anchor === 'center' ? (w - vw) / 2 : 0), 0); draw(g, w, h); g.restore(); g.restore();
}
function wrap(g, text, maxW) { const out = []; let cur = ''; for (const wd of text.split(' ')) { const t = cur ? cur + ' ' + wd : wd; if (g.measureText(t).width > maxW && cur) { out.push(cur); cur = wd; } else cur = t; } if (cur) out.push(cur); return out; }

export function drawOverlay(g, t, TL, texts) {
  for (const S of TL.strips) {
    if (S.only && S.only !== TL.look) continue;
    if (t < S.t0 || t > S.t1 + .4) continue;
    const p = ss(seg(t, S.t0, S.t0 + .75)), out = 1 - seg(t, S.t1 - .1, S.t1 + .35); if (out <= 0) continue;
    g.save(); g.globalAlpha = out; const seed = hashStr(S.id);
    if (S.kind === 'strip') {
      const sz = S.size, lh = sz * 1.32; g.font = `600 ${sz}px ${FONT}`; const ws = S.lines.map(l => g.measureText(l).width), bw = Math.max(...ws) + 80;
      S.lines.forEach((l, i) => { const y = S.y + i * (lh + 10), w = ws[i] + 80, x = S.anchor === 'center' ? 540 - w / 2 : 540 - bw / 2;
        const q = ss(seg(t, S.t0 + i * .35, S.t0 + .75 + i * .35));
        bar(g, x, y, w, lh, q, S.anchor === 'center' ? 'center' : 'left', (g2, ww, hh) => { g2.font = `600 ${sz}px ${FONT}`; g2.fillStyle = INK; g2.textBaseline = 'alphabetic'; g2.fillText(l, 40, hh * .74); }, seed + i); });
      texts.push({ id: S.id, text: S.lines.join(' '), x0: 540 - bw / 2, y0: S.y, x1: 540 + bw / 2, y1: S.y + S.lines.length * (lh + 10), pass: false });
    }
    if (S.kind === 'card') {
      const w = S.w, h = 150, x = 540 - w / 2;
      bar(g, x, S.y, w, h, p, 'left', (g2) => { g2.fillStyle = INK; g2.font = `500 36px ${FONT}`; g2.globalAlpha = .78; g2.fillText(S.label, 40, 56); g2.globalAlpha = 1;
        g2.font = `700 ${S.red ? 76 : 80}px ${FONT}`; g2.fillStyle = S.red ? RED : INK; g2.fillText(S.value, 40, 128); if (S.red) { g2.strokeStyle = RED; g2.lineWidth = 3; g2.globalAlpha = .8; g2.beginPath(); g2.arc(w - 78, 75, 40, 0, 7); g2.stroke(); g2.font = `700 56px ${FONT}`; g2.fillStyle = RED; g2.fillText('!', w - 87, 95); g2.globalAlpha = 1; } }, seed);
      texts.push({ id: S.id, text: S.label + ' ' + S.value, x0: x, y0: S.y, x1: x + w, y1: S.y + h });
    }
    if (S.kind === 'step') {
      g.font = `400 36px ${FONT}`; const lines = wrap(g, S.sub, S.w - 200), h = 100 + lines.length * 44 + 14, x = 540 - S.w / 2;
      bar(g, x, S.y, S.w, h, p, 'left', (g2, ww) => { g2.fillStyle = RED; g2.beginPath(); g2.arc(78, 78, 42, 0, 7); g2.fill(); g2.strokeStyle = 'rgba(255,230,200,.5)'; g2.lineWidth = 2; g2.beginPath(); g2.arc(78, 78, 35, 0, 7); g2.stroke();
        g2.fillStyle = CREAM; g2.font = `700 54px ${FONT}`; g2.textAlign = 'center'; g2.fillText(S.n, 78, 97); g2.textAlign = 'left';
        g2.fillStyle = INK; g2.font = `700 50px ${FONT}`; g2.fillText(S.head.split('').join(' '), 150, 74); g2.font = `500 36px ${FONT}`; g2.globalAlpha = .88;
        lines.forEach((l, i) => g2.fillText(l, 150, 124 + i * 44)); g2.globalAlpha = 1; }, seed);
      texts.push({ id: S.id, text: S.head + ' ' + S.sub, x0: x, y0: S.y, x1: x + S.w, y1: S.y + h });
    }
    if (S.kind === 'example') {
      const w = S.w, h = 330, x = 540 - w / 2;
      bar(g, x, S.y, w, h, p, 'left', (g2) => { S.lines.forEach((r, i) => { const y = 78 + i * 76; g2.fillStyle = INK; g2.font = `500 40px ${FONT}`; g2.globalAlpha = .85; g2.fillText(r[0], 40, y); g2.globalAlpha = 1; g2.font = `700 56px ${FONT}`; g2.textAlign = 'right'; g2.fillText(r[1], w - 40, y + 4); g2.textAlign = 'left';
          if (i < 2) { g2.strokeStyle = 'rgba(42,26,14,.25)'; g2.lineWidth = 1.5; g2.beginPath(); g2.moveTo(40, y + 28); g2.lineTo(w - 40, y + 28); g2.stroke(); } });
        g2.font = `italic 400 30px ${FONT}`; g2.fillStyle = INK; g2.globalAlpha = .7; g2.fillText(S.note, 40, h - 26); g2.globalAlpha = 1; }, seed);
      texts.push({ id: S.id, text: S.lines.map(r => r.join(' ')).join(' '), x0: x, y0: S.y, x1: x + w, y1: S.y + h - 60 }, { id: S.id + 'n', text: S.note, x0: x, y0: S.y + h - 60, x1: x + w, y1: S.y + h, pass: true });
    }
    if (S.kind === 'reg') {
      const w = S.w, h = 250, x = 540 - w / 2, fade = 1 - .72 * ss(seg(t, S.t0 + .3, S.t0 + 1.5));
      bar(g, x, S.y, w, h, p, 'left', (g2) => { g2.fillStyle = INK; g2.font = `700 66px ${FONT}`; g2.globalAlpha = fade; g2.fillText('DANIEL', 40, 90); g2.textAlign = 'right'; g2.fillText('50%', w - 40, 90); g2.textAlign = 'left'; g2.globalAlpha = 1;
        g2.fillText('AARON', 40, 170); g2.textAlign = 'right'; g2.fillText('50%', w - 40, 170); g2.textAlign = 'left'; g2.globalAlpha = .55 + .2 * Math.sin(t * 3); g2.font = `italic 400 56px ${FONT}`; g2.fillText('?', 40, 232); g2.textAlign = 'right'; g2.fillText('?', w - 40, 232); g2.textAlign = 'left'; g2.globalAlpha = 1; }, seed);
      texts.push({ id: S.id, text: 'DANIEL 50% AARON 50% ?', x0: x, y0: S.y, x1: x + w, y1: S.y + h });
    }
    if (S.kind === 'endq') {
      g.font = `600 ${S.size}px ${FONT}`; g.fillStyle = CREAM; g.textAlign = 'center'; g.shadowColor = 'rgba(255,190,100,.55)'; g.shadowBlur = 26;
      S.lines.forEach((l, i) => { const q = ss(seg(t, S.t0 + i * .45, S.t0 + .9 + i * .45)); g.globalAlpha = out * q; g.fillText(l, 540, S.y + i * 84 + (1 - q) * 14); });
      texts.push({ id: S.id, text: S.lines.join(' '), x0: 90, y0: S.y - 60, x1: 990, y1: S.y + 110 });
    }
    if (S.kind === 'endcard') {
      const a = (d) => ss(seg(t, S.t0 + d, S.t0 + d + .7)); g.textAlign = 'center';
      g.globalAlpha = a(0); g.fillStyle = GOLD; const tt = S.title.split('').join(' '); let fs = 50; g.font = `600 ${fs}px ${FONT}`; while (g.measureText(tt).width > 880 && fs > 24) { fs -= 2; g.font = `600 ${fs}px ${FONT}`; }
      g.shadowColor = 'rgba(233,189,104,.5)'; g.shadowBlur = 22; g.fillText(tt, 540, S.y);
      g.shadowBlur = 0; g.strokeStyle = GOLD; g.lineWidth = 2; g.globalAlpha = a(.3) * .8; g.beginPath(); g.moveTo(380, S.y + 34); g.lineTo(700, S.y + 34); g.stroke();
      g.globalAlpha = a(.9); g.fillStyle = CREAM; g.font = `italic 500 44px ${FONT}`; const tl = wrap(g, S.tag, 860); tl.forEach((l, i) => g.fillText(l, 540, S.y + 110 + i * 56));
      const by = S.y + 110 + tl.length * 56 + 70, bw = 760; g.globalAlpha = a(1.9);
      bar(g, 540 - bw / 2, by, bw, 104, a(1.9), 'center', (g2) => { g2.fillStyle = INK; g2.font = `700 44px ${FONT}`; g2.textAlign = 'center'; g2.fillText(S.cta, bw / 2, 68); }, seed);
      texts.push({ id: 'e3a', text: S.title, x0: 90, y0: S.y - 50, x1: 990, y1: S.y + 10 }, { id: 'e3b', text: S.tag, x0: 90, y0: S.y + 70, x1: 990, y1: S.y + 190 }, { id: 'e3c', text: S.cta, x0: 160, y0: by, x1: 920, y1: by + 104 });
    }
    if (S.kind === 'fine') {
      g.font = `600 34px ${FONT}`; g.fillStyle = CREAM; g.globalAlpha = out * .9 * ss(seg(t, S.t0, S.t0 + .8)); g.textAlign = 'center';
      S.lines.forEach((l, i) => g.fillText(l, 540, S.y + i * 44));
      texts.push({ id: S.id, text: S.lines.join(' '), x0: 60, y0: S.y - 30, x1: 1020, y1: S.y + 100, pass: true });
    }
    g.restore();
  }
}

// Burned-in captions: warm off-white serif, soft shadow, on a faint dark band, inside the social safe zone (clear of the bottom 20% and right 12%)
export function drawCaption(g, t, TL) {
  const c = TL.cues.find(c => t >= c.t0 && t <= c.t1); if (!c) return;
  const a = Math.min(seg(t, c.t0, c.t0 + .12), 1 - seg(t, c.t1 - .12, c.t1)); if (a <= 0) return;
  g.save(); g.font = `700 54px ${FONT}`; const lines = wrap(g, c.text, 900), lh = 62, y0 = 1372 - (lines.length - 1) * lh / 2 + (c.who ? 18 : 0);
  const top = y0 - 74 - (c.who ? 30 : 0), bot = y0 + lines.length * lh + 6;
  const gr = g.createLinearGradient(0, top - 40, 0, bot + 40); gr.addColorStop(0, 'rgba(4,6,12,0)'); gr.addColorStop(.25, 'rgba(4,6,12,.74)'); gr.addColorStop(.75, 'rgba(4,6,12,.74)'); gr.addColorStop(1, 'rgba(4,6,12,0)');
  g.globalAlpha = a; g.fillStyle = gr; g.fillRect(0, top - 40, W, bot - top + 80);
  g.textAlign = 'center'; g.shadowColor = 'rgba(0,0,0,.85)'; g.shadowBlur = 10; g.shadowOffsetY = 2;
  g.lineJoin = 'round'; g.strokeStyle = 'rgba(8,5,3,.8)';
  if (c.who) { g.font = `700 30px ${FONT}`; g.fillStyle = GOLD; const tg = c.who.toUpperCase().split('').join(' '); g.lineWidth = 6; g.strokeText(tg, 540, y0 - 64); g.fillText(tg, 540, y0 - 64); }
  g.font = `700 54px ${FONT}`; g.fillStyle = CREAM; g.lineWidth = 8; lines.forEach((l, i) => { g.strokeText(l, 540, y0 + i * lh); g.fillText(l, 540, y0 + i * lh); }); g.restore();
}

// Thumbnail: the two-window image with the title as cut paper (page query ?thumb=1)
export function drawThumb(g) {
  const gr = g.createLinearGradient(0, 0, 0, 760); gr.addColorStop(0, 'rgba(3,6,14,.78)'); gr.addColorStop(1, 'rgba(3,6,14,0)'); g.fillStyle = gr; g.fillRect(0, 0, W, 760);
  const gb = g.createLinearGradient(0, 1380, 0, H); gb.addColorStop(0, 'rgba(3,6,14,0)'); gb.addColorStop(.35, 'rgba(3,6,14,.85)'); gb.addColorStop(1, 'rgba(3,6,14,.92)'); g.fillStyle = gb; g.fillRect(0, 1380, W, H - 1380);
  const lines = ['THE PARTNER', 'WHO NEVER', 'CAME BACK'], sz = 132; g.font = `700 ${sz}px ${FONT}`;
  lines.forEach((l, i) => { const w = g.measureText(l).width + 90, x = 540 - w / 2 + (i % 2 ? 40 : -40), y = 130 + i * 190; bar(g, x, y, w, 168, 1, 'left', (g2) => { g2.font = `700 ${sz}px ${FONT}`; g2.fillStyle = i === 2 ? RED : INK; g2.fillText(l, 45, 128); }, 11 + i); });
  g.textAlign = 'center'; g.shadowColor = 'rgba(0,0,0,.9)'; g.shadowBlur = 16; g.fillStyle = CREAM; g.font = `italic 600 54px ${FONT}`;
  g.fillText('Your business partner can be replaced.', 540, 1520); g.fillText('Your ownership structure cannot', 540, 1596); g.fillText('be fixed overnight.', 540, 1664);
  g.shadowBlur = 0; g.fillStyle = GOLD; g.font = `600 36px ${FONT}`; g.fillText('SHAREHOLDER BUY-SELL PLANNING'.split('').join(' '), 540, 1760);
}
