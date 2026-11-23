// Paper layers: each layer is one cut sheet of card, baked once per shot into a canvas, then composited per frame by engine.js.
// Look (STYLE.md): flat colour sheet, fibre grain, warm rim on the top edge, dark band on the bottom edge, backlight bleeding through the paper.
import { mulberry, clamp } from '/core/lib.js';
export const W = 1080, H = 1920;
export const mk = (w, h) => { const c = document.createElement('canvas'); c.width = Math.max(1, w | 0); c.height = Math.max(1, h | 0); return c; };

let _grain = null, _mottle = null;
function grainTile() {
  if (_grain) return _grain;
  const c = mk(256, 256), g = c.getContext('2d'), r = mulberry(11);
  for (let i = 0; i < 1400; i++) {            // paper fibres
    const x = r() * 256, y = r() * 256, a = r() * Math.PI, l = 3 + r() * 11;
    g.strokeStyle = r() < .5 ? 'rgba(255,248,230,.10)' : 'rgba(20,10,0,.09)'; g.lineWidth = .6 + r() * .6;
    g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l); g.stroke();
  }
  for (let i = 0; i < 2600; i++) { g.fillStyle = r() < .5 ? 'rgba(255,255,255,.06)' : 'rgba(0,0,0,.06)'; g.fillRect(r() * 256, r() * 256, 1, 1); }
  return _grain = c;
}
function mottleTile() {
  if (_mottle) return _mottle;
  const c = mk(512, 512), g = c.getContext('2d'), r = mulberry(23);
  for (let i = 0; i < 90; i++) {              // pulp clouds: soft light/dark blobs
    const x = r() * 512, y = r() * 512, R = 30 + r() * 90, lit = r() < .5;
    const gr = g.createRadialGradient(x, y, 0, x, y, R);
    gr.addColorStop(0, lit ? 'rgba(255,240,210,.10)' : 'rgba(10,5,0,.09)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = gr; g.fillRect(x - R, y - R, R * 2, R * 2);
  }
  return _mottle = c;
}

// Cut a rim (top edge) and a shade (bottom edge) into the sheet's own alpha
function edges(c, rimCol, shadeCol, rimA, shadeA, px = 3) {
  const w = c.width, h = c.height, t = mk(w, h), g = t.getContext('2d'), cg = c.getContext('2d');
  g.drawImage(c, 0, 0); g.globalCompositeOperation = 'destination-out'; g.drawImage(c, 0, px);
  g.globalCompositeOperation = 'source-in'; g.fillStyle = rimCol; g.fillRect(0, 0, w, h);
  cg.save(); cg.globalCompositeOperation = 'source-atop'; cg.globalAlpha = rimA; cg.drawImage(t, 0, 0); cg.restore();
  g.globalCompositeOperation = 'source-over'; g.clearRect(0, 0, w, h);
  g.drawImage(c, 0, 0); g.globalCompositeOperation = 'destination-out'; g.drawImage(c, 0, -px);
  g.globalCompositeOperation = 'source-in'; g.fillStyle = shadeCol; g.fillRect(0, 0, w, h);
  cg.save(); cg.globalCompositeOperation = 'source-atop'; cg.globalAlpha = shadeA; cg.drawImage(t, 0, 0); cg.restore();
}

// Bake one sheet. draw(g,w,h,col) paints the shape (holes with destination-out); spec: {w,h,col,trans,light,lp:[x,y],lr}
export function bakeSheet(s) {
  const { w, h, col = '#222', draw, trans = 0, light = '#ffd9a0', lp = [w / 2, h * .4], lr = Math.max(w, h) * .7,
    rim = 'rgba(255,225,170,1)', shade = 'rgba(0,0,0,1)', rimA = .55, shadeA = .5, grain = true, edge = 3 } = s;
  const c = mk(w, h), g = c.getContext('2d');
  g.fillStyle = col; g.strokeStyle = col; draw(g, w, h, col);
  if (trans > 0) {                              // backlight through the paper
    g.save(); g.globalCompositeOperation = 'source-atop';
    const gr = g.createRadialGradient(lp[0], lp[1], 0, lp[0], lp[1], lr);
    gr.addColorStop(0, light); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.globalAlpha = clamp(trans); g.fillStyle = gr; g.fillRect(0, 0, w, h); g.restore();
  }
  if (grain) {
    g.save(); g.globalCompositeOperation = 'source-atop';
    g.fillStyle = g.createPattern(grainTile(), 'repeat'); g.fillRect(0, 0, w, h);
    g.globalAlpha = .9; g.drawImage(mottleTile(), 0, 0, w, h); g.restore();
  }
  if (edge) edges(c, rim, shade, rimA, shadeA, edge);
  return c;
}

// Soft cast shadow (half resolution): black silhouette of the sheet, blurred
export function bakeShadow(c, blur = 12, scale = .5) {
  const s = mk(c.width * scale, c.height * scale), g = s.getContext('2d');
  g.filter = `blur(${blur * scale}px)`; g.drawImage(c, 0, 0, s.width, s.height); g.filter = 'none';
  g.globalCompositeOperation = 'source-in'; g.fillStyle = '#000'; g.fillRect(0, 0, s.width, s.height);
  return s;
}
// Out-of-focus copy
export function blurred(c, px) {
  const s = mk(c.width, c.height), g = s.getContext('2d'); g.filter = `blur(${px}px)`; g.drawImage(c, 0, 0); g.filter = 'none'; return s;
}
// Glowing sprite for emissive windows/lamps: returns {core, glow}
export function bakeGlow(w, h, draw, blur = 22) {
  const core = mk(w, h), g = core.getContext('2d'); draw(g, w, h);
  const glow = mk(w, h), q = glow.getContext('2d'); q.filter = `blur(${blur}px)`; q.drawImage(core, 0, 0); q.filter = `blur(${blur * 2.6}px)`; q.globalAlpha = .8; q.drawImage(core, 0, 0);
  return { core, glow };
}
