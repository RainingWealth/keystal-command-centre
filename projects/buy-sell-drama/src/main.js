// Page contract (core/README.md): window.DUR, window.render(t), window.READY, window.TEXTS(t). Everything is a pure function of t.
import { compose, W, H, mk } from './engine.js';
import { drawOverlay, drawCaption, drawThumb } from './overlay.js';
import * as SH from './shots.js';
import { BUILDP, IMGS } from './registry.js';
import './shots_photo.js';
import { clamp, seg, ss, eo } from '/core/lib.js';

const q = new URLSearchParams(location.search);
const TL = await (await fetch('timeline.json')).json();
const LOOK = q.get('look') === 'photo' ? 'photo' : 'paper'; TL.look = LOOK;
if (LOOK === 'photo') { const names = ['corridor','contract','growth1','growth2','toast','tower','call','meetwide','sarah','estate','aaronclose','accounts','accountant','latedesk','photos','employees','loandoc','register','advisers','steps','example','buyout','workers','home','sunrise'];
  await Promise.all(names.map(n => new Promise((res, rej) => { const im = new Image(); im.onload = () => res(); im.onerror = () => rej(new Error('missing image ' + n)); im.src = `assets/photo/${n}.jpg`; IMGS[n] = im; }))); }
await Promise.all(["600 40px Corm", "700 40px Corm", "500 40px Corm", "400 40px Corm", "italic 500 40px Corm"].map(f => document.fonts.load(f)));
const cv = document.getElementById('c'), g = cv.getContext('2d'); cv.width = W; cv.height = H;
const A = mk(W, H), B = mk(W, H), gA = A.getContext('2d'), gB = B.getContext('2d');
const dummy = mk(8, 8).getContext('2d');
const byId = Object.fromEntries(TL.shots.map(s => [s.id, s]));

const cache = new Map();                                   // built shots (baking is the expensive part), small LRU
function getShot(id) {
  if (cache.has(id)) { const s = cache.get(id); cache.delete(id); cache.set(id, s); return s; }
  const mod = (LOOK === 'photo' && BUILDP[id]) || SH.BUILD[id] || SH.placeholder(id, 'night');
  const shot = mod({ TL, hit: TL.hit, shotInfo: byId[id], film: (ctx, t) => film(ctx, t), drawShot: (ctx, id, t) => drawShot(ctx, id, t) });
  cache.set(id, shot); while (cache.size > 6) cache.delete(cache.keys().next().value); return shot;
}
function drawShot(ctx, id, t) { const s = byId[id]; compose(getShot(id), t - s.t0, ctx); }

// picture without overlays: one shot, or two during a transition. Transition into shot k is centred on its t0.
function film(ctx, t) {
  const sh = TL.shots;
  for (let k = 1; k < sh.length; k++) {
    const s = sh[k], d = s.tr.d; if (!(d > 0) || Math.abs(t - s.t0) > d / 2) continue;
    const kk = clamp((t - (s.t0 - d / 2)) / d), prev = sh[k - 1].id;
    if (s.tr.type === 'dissolve') { drawShot(ctx, prev, t); drawShot(gB, s.id, t); ctx.globalAlpha = ss(kk); ctx.drawImage(B, 0, 0); ctx.globalAlpha = 1; return; }
    if (s.tr.type === 'dark') { ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, H); const first = kk < .5; drawShot(gA, first ? prev : s.id, t); ctx.globalAlpha = first ? 1 - ss(kk * 2) : ss((kk - .5) * 2); ctx.drawImage(A, 0, 0); ctx.globalAlpha = 1; return; }
    if (s.tr.type === 'iris') {
      drawShot(ctx, prev, t); drawShot(gB, s.id, t); const c = (SH.IRIS && SH.IRIS[s.id]) || [540, 1000], r = Math.pow(kk, 1.6) * 2300;
      ctx.save(); ctx.beginPath(); ctx.arc(c[0], c[1], r, 0, 7); ctx.clip(); ctx.drawImage(B, 0, 0); ctx.restore();
      ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.strokeStyle = 'rgba(255,210,140,.55)'; ctx.lineWidth = 26; ctx.shadowColor = 'rgba(255,200,120,.9)'; ctx.shadowBlur = 50; ctx.globalAlpha = 1 - kk; ctx.beginPath(); ctx.arc(c[0], c[1], r, 0, 7); ctx.stroke(); ctx.restore(); return;
    }
  }
  let i = 0; for (let k = 0; k < sh.length; k++) if (t >= sh[k].t0) i = k;
  drawShot(ctx, sh[i].id, t);
}

window.DUR = TL.dur;
window.TEXTS = (t) => { const out = []; drawOverlay(dummy, t, TL, out); return out; };
window.render = (t) => {
  if (q.get('thumb')) { film(g, t); drawThumb(g); return; }
  if (q.get('shot')) { const id = q.get('shot'), s = byId[id]; compose(getShot(id), t, g); return; }            // debug: t is local to the shot
  film(g, t);
  if (q.get('nosub') !== '1') { const texts = []; drawOverlay(g, t, TL, texts); drawCaption(g, t, TL); }
};
window.READY = true;
