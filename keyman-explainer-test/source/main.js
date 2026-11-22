import { init, renderFilm, events, texts, DUR } from './film.js';
const cv = document.getElementById('c'), g = cv.getContext('2d');
cv.width = innerWidth; cv.height = innerHeight;   // render tools set the viewport to --size WxH
await Promise.all(['500', '600', '700', '800'].map(w => document.fonts.load(`${w} 40px Archivo`)));
const TL = await (await fetch('timeline.json')).json();
init(TL);
window.DUR = DUR;
window.EV = events();
const Q = new URLSearchParams(location.search);
window.render = t => renderFilm(g, t, { nocap: Q.has('nocap') });
window.TEXTS = t => texts(g, t);
window.READY = true;
