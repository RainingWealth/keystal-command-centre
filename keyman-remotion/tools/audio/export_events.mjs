// Export sound events from the original film.js (a copy at work/film.mjs). Writes work/events.json = {dur, ev}.
import fs from 'fs'; import path from 'path'; import { fileURLToPath } from 'url';
const here = path.dirname(fileURLToPath(import.meta.url));
const ORIG = process.env.ORIG || '';
const tlPath = fs.existsSync(path.join(here, 'work/timeline.json')) ? path.join(here, 'work/timeline.json') : path.join(ORIG, 'source/timeline.json');
const { init, events, DUR } = await import(path.join(here, 'work/film.mjs'));
const tl = JSON.parse(fs.readFileSync(tlPath, 'utf8'));
init(tl);
const mod = await import(path.join(here, 'work/film.mjs'));
const ev = events();
fs.writeFileSync(path.join(here, 'work/events.json'), JSON.stringify({ dur: mod.DUR, ev }));
console.log('events', ev.length, 'dur', mod.DUR);
