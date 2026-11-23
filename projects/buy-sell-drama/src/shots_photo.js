// Photoreal look (?look=photo): each shot is a generated still with a slow cinematic camera move (push, pull, drift), light pulses and a few
// composited details (phone glow, the far window going dark). The paper-text overlay and captions are the same as in the paper version.
import { Shot, W, H } from './engine.js';
import { clamp, lerp, seg, ss, eio, mulberry } from '/core/lib.js';
import { BUILDP, IRIS, IMGS } from './registry.js';

// draw `name` cover-fitted with centre (cx,cy) in image fractions and zoom z (1 = whole frame); returns the source rect for mapping points
function kb(g, name, cx, cy, z, t = 0, drift = 1) {
  const im = IMGS[name], iw = im.naturalWidth, ih = im.naturalHeight, cover = Math.max(W / iw, H / ih), sw = W / (cover * z), sh = H / (cover * z);
  const dx = (Math.sin(t * .9) * .0016 + Math.sin(t * 2.3 + 1) * .0007) * iw * drift, dy = (Math.sin(t * .7 + 2) * .0012) * ih * drift;
  const sx = clamp(cx * iw - sw / 2 + dx, 0, iw - sw), sy = clamp(cy * ih - sh / 2 + dy, 0, ih - sh);
  g.drawImage(im, sx, sy, sw, sh, 0, 0, W, H);
  return { sx, sy, sw, sh, iw, ih, pt: (u, v) => [(u * iw - sx) / sw * W, (v * ih - sy) / sh * H], len: (px) => px / sw * W };
}
const glow = (g, x, y, r, rgb, a) => { if (a <= .002) return; const gr = g.createRadialGradient(x, y, 0, x, y, r); gr.addColorStop(0, `rgba(${rgb},${a})`); gr.addColorStop(.35, `rgba(${rgb},${a * .35})`); gr.addColorStop(1, `rgba(${rgb},0)`);
  g.save(); g.globalCompositeOperation = 'lighter'; g.fillStyle = gr; g.fillRect(x - r, y - r, r * 2, r * 2); g.restore(); };

// generic still with a Kens-Burns path. o: {img, c0:[cx,cy], c1, z0, z1, dur, ease, fx, glows:[{u,v,r,rgb,I(t)}], dim(t)->0..1 darkness, drift}
function photo(id, E, o) {
  const dur = o.dur || E.shotInfo.t1 - E.shotInfo.t0, S = new Shot(id, { bg: '#000', vig: o.vig ?? .34, bloom: o.bloom ?? .1, cam: () => ({ x: 0, y: 0, d: 0 }), fx: o.fx });
  S.dyn({ z: -.07, x0: 0, y0: 0, w: W, h: H, shadow: false, draw: (g, t) => {
    const k = (o.ease || eio)(clamp(t / dur)), c = [lerp(o.c0[0], o.c1?.[0] ?? o.c0[0], k), lerp(o.c0[1], o.c1?.[1] ?? o.c0[1], k)];
    const m = kb(g, o.img, c[0], c[1], lerp(o.z0 ?? 1.02, o.z1 ?? 1.18, k), t, o.drift ?? 1);
    if (o.draw) o.draw(g, t, m);
    for (const gl of o.glows || []) { const [x, y] = m.pt(gl.u, gl.v); glow(g, x, y, m.len(gl.r), gl.rgb || '200,225,255', gl.I(t)); }
    const dm = o.dim ? o.dim(t) : 0; if (dm > .002) { g.fillStyle = `rgba(0,0,0,${dm})`; g.fillRect(0, 0, W, H); }
    if (o.flick) { const f = o.flick(t); if (f > .002) { g.fillStyle = `rgba(0,0,0,${f})`; g.fillRect(0, 0, W, H); } }
  } });
  return S;
}
const P = (id, o) => { BUILDP[id] = (E) => photo(id, E, { img: id, ...o }); };

// ---- Scene 1: the friendship
BUILDP.corridor = (E) => {
  const phone = [.659, .345], buzz = E.hit.buzz;
  const S = photo('corridor', E, { img: 'corridor', c0: [.5, .5], c1: [.62, .4], z0: 1.0, z1: 1.28, dur: 2.7, bloom: .14, vig: .45,
    flick: t => .06 * Math.max(0, Math.sin(t * 31) * Math.sin(t * 7.3)) * (t > 1.6 ? 1.6 : .5),
    glows: [{ u: phone[0], v: phone[1], r: 260, rgb: '170,215,255', I: t => { let i = 0; for (const x of buzz) i = Math.max(i, Math.max(0, 1 - Math.abs(t - (x + .18)) / .42)); return Math.max(i * .7, ss(seg(t, 1.9, 2.6)) * .95); } }] });
  const k = eio(1), cx = lerp(.5, .62, k), cy = lerp(.5, .4, k), z = 1.28, im = IMGS.corridor, iw = im.naturalWidth, ih = im.naturalHeight, cover = Math.max(W / iw, H / ih), sw = W / (cover * z), sh = H / (cover * z);
  const sx = clamp(cx * iw - sw / 2, 0, iw - sw), sy = clamp(cy * ih - sh / 2, 0, ih - sh); IRIS.contract = [(phone[0] * iw - sx) / sw * W, (phone[1] * ih - sy) / sh * H];
  return S;
};
P('contract', { c0: [.5, .5], c1: [.5, .46], z0: 1.0, z1: 1.2, fx: () => ({ tint: ['#ffe1a8', .08, 'multiply'] }) });
BUILDP.growth = (E) => {
  const D = 3.6, S = new Shot('growth', { bg: '#000', vig: .34, bloom: .1, cam: () => ({ x: 0, y: 0, d: 0 }) });
  S.dyn({ z: -.07, x0: 0, y0: 0, w: W, h: H, shadow: false, draw: (g, t) => { const k = clamp(t / D), x = ss(seg(t, 1.5, 2.1));
    kb(g, 'growth1', lerp(.45, .6, k), lerp(.56, .5, k), lerp(1.05, 1.22, k), t); if (x > 0) { g.globalAlpha = x; kb(g, 'growth2', lerp(.35, .55, k), .6, lerp(1.08, 1.0, k), t); g.globalAlpha = 1; } } });
  return S;
};
P('toast', { c0: [.5, .55], c1: [.5, .5], z0: 1.0, z1: 1.22, fx: () => ({ tint: ['#ffd9a0', .06, 'multiply'] }) });

// ---- Scene 2: the call
const lit = [.40, .31], far = [.899, .549];
function tower(id, E, out) {
  const T0 = E.shotInfo.t0, off = E.hit.farwin_off - T0, ring = E.hit.ring.map(x => x - T0), D = out ? 2.1 : 4.2;
  // colour around Daniel's window, to paint it dark again
  const im = IMGS.tower, iw = im.naturalWidth, ih = im.naturalHeight, cv = document.createElement('canvas'); cv.width = 80; cv.height = 80; const cg = cv.getContext('2d');
  cg.drawImage(im, far[0] * iw - 40, far[1] * ih - 40, 80, 80, 0, 0, 80, 80); const d = cg.getImageData(0, 0, 80, 80).data; let r = 0, gg = 0, b = 0, n = 0;
  for (let y = 0; y < 80; y++) for (let x = 0; x < 80; x++) { if (Math.abs(x - 40) < 16 && Math.abs(y - 40) < 16) continue; const i = (y * 80 + x) * 4; const l = d[i] + d[i + 1] + d[i + 2]; if (l < 300) { r += d[i]; gg += d[i + 1]; b += d[i + 2]; n++; } }
  const col = n ? `rgb(${r / n | 0},${gg / n | 0},${b / n | 0})` : '#0a1020';
  return photo(id, E, { img: 'tower', c0: out ? [.46, .42] : [.5, .5], c1: out ? [.62, .55] : lit, z0: out ? 1.55 : 1.0, z1: out ? 1.0 : 1.7, dur: D, bloom: .16, vig: .45,
    glows: [{ u: lit[0], v: lit[1], r: 520, rgb: '255,190,110', I: t => .18 + .75 * Math.max(...ring.map(x => Math.max(0, 1 - Math.abs(t - x) / .3))) * (out ? 0 : 1) }],
    draw: (g, t, m) => { if (!out) return; const a = ss(seg(t, off - .05, off + .22)); if (a <= .002) return; const [x, y] = m.pt(far[0], far[1]), s = m.len(46); g.save(); g.globalAlpha = a; g.fillStyle = col; g.shadowColor = col; g.shadowBlur = s * .6; g.fillRect(x - s / 2, y - s / 2, s, s); g.restore(); } });
}
BUILDP.tower = (E) => tower('tower', E, false);
BUILDP.window = (E) => tower('window', E, true);
BUILDP.call = (E) => { const T0 = E.shotInfo.t0, sil = E.hit.silence0 - T0, ring = E.hit.ring.map(x => x - T0);
  return photo('call', E, { img: 'call', c0: [.5, .46], c1: [.52, .4], z0: 1.0, z1: 1.3, dur: 5.2, vig: .5, bloom: .1, dim: t => .28 * ss(seg(t, sil, sil + 1.6)),
    glows: [{ u: .6, v: .36, r: 220, rgb: '180,215,255', I: t => Math.max(...ring.map(x => Math.max(0, 1 - Math.abs(t - x) / .35))) * .6 }] }); };

// ---- Scene 3 and 4: the problem and the crisis (cool, subdued)
P('meetwide', { c0: [.5, .52], c1: [.5, .5], z0: 1.0, z1: 1.18 });
P('sarah', { c0: [.55, .5], c1: [.6, .5], z0: 1.0, z1: 1.28 });
P('estate', { c0: [.5, .55], c1: [.52, .5], z0: 1.0, z1: 1.25 });
P('aaronclose', { c0: [.45, .5], c1: [.45, .42], z0: 1.0, z1: 1.3 });
P('accounts', { c0: [.5, .55], c1: [.5, .5], z0: 1.0, z1: 1.2 });
P('accountant', { c0: [.55, .5], c1: [.57, .44], z0: 1.0, z1: 1.28 });
P('latedesk', { c0: [.5, .45], c1: [.5, .5], z0: 1.3, z1: 1.0 });
P('photos', { c0: [.55, .5], c1: [.72, .38], z0: 1.0, z1: 1.35 });
P('employees', { c0: [.5, .75], c1: [.55, .6], z0: 1.25, z1: 1.0 });
P('loandoc', { c0: [.5, .5], c1: [.46, .38], z0: 1.0, z1: 1.25 });
P('register', { c0: [.55, .5], c1: [.55, .42], z0: 1.0, z1: 1.2, dur: 1.7 });

// ---- Scene 6 and 7: the plan and the calm (warm, bright)
P('advisers', { c0: [.5, .55], c1: [.5, .48], z0: 1.0, z1: 1.2, fx: () => ({ tint: ['#fff0c8', .05, 'multiply'] }) });
P('steps', { c0: [.5, .6], c1: [.52, .55], z0: 1.0, z1: 1.18, dur: 8.2 });
P('example', { c0: [.5, .5], c1: [.5, .45], z0: 1.0, z1: 1.15, dur: 4.4 });
P('buyout', { c0: [.5, .55], c1: [.55, .5], z0: 1.0, z1: 1.2, fx: () => ({ tint: ['#fff0c8', .05, 'multiply'] }) });
P('workers', { c0: [.36, .6], c1: [.6, .55], z0: 1.2, z1: 1.2, dur: 2.8 });
P('home', { c0: [.5, .45], c1: [.5, .5], z0: 1.4, z1: 1.0, dur: 3.1 });
P('sunrise', { c0: [.5, .55], c1: [.62, .4], z0: 1.0, z1: 1.3, dur: 3.1, bloom: .14 });
