// The lightbox compositor. A Shot is a stack of baked paper sheets (back to front) seen by a small camera.
// Parallax follows the style's box geometry: sheets sit at z in [-0.14, 0] m, camera at C0 = 0.40 m, so a dolly or a lateral move
// shifts near sheets more than far ones. Everything is a pure function of the shot's local time t (any frame renders alone).
import { W, H, mk, bakeSheet, bakeShadow, blurred, bakeGlow } from './paper.js';
import { clamp, lerp } from '/core/lib.js';
export { W, H, mk };
const C0 = .40;

export class Shot {
  constructor(id, o = {}) {
    this.id = id; this.layers = []; this.emits = []; this.bg = o.bg || '#05080f';
    this.cam = o.cam || (() => ({ x: 0, y: 0, d: 0 }));
    this.fx = o.fx || (() => ({}));               // t -> {exp, flick, tint:[css,alpha], bloom, vig}
    this.bloom = o.bloom ?? .35; this.vig = o.vig ?? .5; this.dur = o.dur || 4;
  }
  // sheet: baked once. opts: z, w,h,x0,y0, col, draw, trans, light, lp, lr, shadow(blur), shDx, shDy, shA, anim(t), blurPx
  sheet(o) {
    const w = Math.round(o.w ?? W * 1.12), h = Math.round(o.h ?? H * 1.06);
    const x0 = o.x0 ?? (W - w) / 2, y0 = o.y0 ?? (H - h) / 2;
    const lp = o.lp ? [o.lp[0] - x0, o.lp[1] - y0] : undefined;
    let c = bakeSheet({ ...o, w, h, lp, draw: (g, ww, hh, col) => { g.save(); g.translate(-x0, -y0); o.draw(g, ww, hh, col); g.restore(); } });
    if (o.blurPx) c = blurred(c, o.blurPx);
    const L = { z: o.z ?? 0, c, x0, y0, w, h, anim: o.anim, name: o.name,
      sh: o.shadow === false ? null : bakeShadow(c, o.shadow || 12), shDx: o.shDx ?? 10, shDy: o.shDy ?? 16, shA: o.shA ?? .5 };
    this.layers.push(L); return L;
  }
  // dynamic sheet: redrawn each frame (figures). draw(g, t, w, h)
  dyn(o) {
    const w = Math.round(o.w), h = Math.round(o.h), c = mk(w, h);
    const L = { z: o.z ?? 0, c, x0: o.x0, y0: o.y0, w, h, anim: o.anim, dynDraw: o.draw, name: o.name,
      sh: o.shadow === false ? null : mk(w / 3, h / 3), shDx: o.shDx ?? 10, shDy: o.shDy ?? 16, shA: o.shA ?? .45 };
    this.layers.push(L); return L;
  }
  // emissive sprite (windows, lamps, phone screen). After the given layer it adds light; I(t) in 0..1
  emit(o) {
    const { core, glow } = bakeGlow(o.w, o.h, o.draw, o.blur || 22);
    const E = { after: o.after, z: o.z ?? (o.after ? o.after.z : 0), core, glow, x0: o.x0, y0: o.y0, w: o.w, h: o.h, I: o.I || (() => 1), gain: o.gain ?? 1, glowGain: o.glowGain ?? .8 };
    this.emits.push(E); return E;
  }
}

let vigC = null, small = null, tmp = null;
function vignette() {
  if (vigC) return vigC; vigC = mk(W, H); const g = vigC.getContext('2d');
  const gr = g.createRadialGradient(W / 2, H * .47, H * .18, W / 2, H * .5, H * .72);
  gr.addColorStop(0, 'rgba(0,0,0,0)'); gr.addColorStop(1, 'rgba(0,0,0,1)'); g.fillStyle = gr; g.fillRect(0, 0, W, H); return vigC;
}

function place(L, cam, an) {
  const Cc = C0 - (cam.d || 0), s0 = (C0 - L.z) / (Cc - L.z), k = C0 / (Cc - L.z);
  const sc = s0 * (an?.sc ?? 1);
  const X = W / 2 + ((L.x0 + (an?.dx || 0)) - W / 2) * s0 - cam.x * k + (L.w * s0 - L.w * sc) / 2;
  const Y = H / 2 + ((L.y0 + (an?.dy || 0)) - H / 2) * s0 - cam.y * k + (L.h * s0 - L.h * sc) / 2;
  return { X, Y, w: L.w * sc, h: L.h * sc, s0, sc };
}

export function compose(shot, t, g) {
  const cam = shot.cam(t), fx = shot.fx(t) || {};
  g.save(); g.globalCompositeOperation = 'source-over'; g.globalAlpha = 1; g.fillStyle = shot.bg; g.fillRect(0, 0, W, H);
  const byLayer = new Map(); for (const E of shot.emits) { const k = E.after || null; if (!byLayer.has(k)) byLayer.set(k, []); byLayer.get(k).push(E); }
  const drawEmits = (list) => {
    for (const E of list) {
      const I = clamp(E.I(t) * (fx.flick || 1)); if (I <= .004) continue;
      const p = place(E, cam, null); g.save(); g.globalCompositeOperation = 'lighter';
      g.globalAlpha = I * E.glowGain; g.drawImage(E.glow, p.X, p.Y, p.w, p.h);
      g.globalAlpha = I * E.gain; g.drawImage(E.core, p.X, p.Y, p.w, p.h); g.restore();
    }
  };
  if (byLayer.has(null)) drawEmits(byLayer.get(null));
  for (const L of shot.layers) {
    const an = L.anim ? L.anim(t) : null, a = an && an.a !== undefined ? an.a : 1;
    if (a > .003) {
      if (L.dynDraw) {
        const cg = L.c.getContext('2d'); cg.clearRect(0, 0, L.w, L.h); cg.save(); cg.translate(-L.x0, -L.y0); L.dynDraw(cg, t, W, H); cg.restore();
        if (L.sh) { const sg = L.sh.getContext('2d'); sg.clearRect(0, 0, L.sh.width, L.sh.height); sg.filter = 'blur(3px)'; sg.drawImage(L.c, 0, 0, L.sh.width, L.sh.height); sg.filter = 'none'; sg.globalCompositeOperation = 'source-in'; sg.fillStyle = '#000'; sg.fillRect(0, 0, L.sh.width, L.sh.height); sg.globalCompositeOperation = 'source-over'; }
      }
      const p = place(L, cam, an);
      if (L.sh && L.shA > 0) { g.globalAlpha = L.shA * a; g.drawImage(L.sh, p.X + L.shDx * p.s0, p.Y + L.shDy * p.s0, p.w, p.h); }
      g.globalAlpha = a;
      if (an && an.rot) { g.save(); g.translate(p.X + p.w * (an.px ?? .5), p.Y + p.h * (an.py ?? .5)); g.rotate(an.rot); g.drawImage(L.c, -p.w * (an.px ?? .5), -p.h * (an.py ?? .5), p.w, p.h); g.restore(); }
      else g.drawImage(L.c, p.X, p.Y, p.w, p.h);
      g.globalAlpha = 1;
    }
    if (byLayer.has(L)) drawEmits(byLayer.get(L));
  }
  // bloom: bright areas spill softly (cheap: 1/6 scale blur, contrast to isolate highlights)
  const bl = (fx.bloom ?? shot.bloom);
  if (bl > .01) {
    small = small || mk(W / 6, H / 6); const sg = small.getContext('2d'); sg.clearRect(0, 0, small.width, small.height);
    sg.filter = 'blur(3px) contrast(1.9) brightness(.82)'; sg.drawImage(g.canvas, 0, 0, small.width, small.height); sg.filter = 'none';
    g.save(); g.globalCompositeOperation = 'lighter'; g.globalAlpha = bl; g.imageSmoothingQuality = 'high'; g.drawImage(small, 0, 0, W, H); g.restore();
  }
  if (fx.tint) { g.save(); g.globalCompositeOperation = fx.tintMode || 'multiply'; g.globalAlpha = fx.tint[1]; g.fillStyle = fx.tint[0]; g.fillRect(0, 0, W, H); g.restore(); }
  const v = fx.vig ?? shot.vig; if (v > 0) { g.save(); g.globalAlpha = v; g.drawImage(vignette(), 0, 0); g.restore(); }
  const ex = fx.exp ?? 1; if (ex < 1) { g.fillStyle = `rgba(0,0,0,${clamp(1 - ex)})`; g.fillRect(0, 0, W, H); }
  g.restore();
}
