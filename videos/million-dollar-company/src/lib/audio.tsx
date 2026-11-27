import React from 'react';
import {Audio, Sequence, staticFile} from 'remotion';
import {SCENE, SEG, TL, wordFrame} from './timeline';
import {clamp01} from './anim';
import {BEATS} from '../scenes/S5';
import {T3} from '../scenes/S3';
import {T4} from '../scenes/S4';
import {T6} from '../scenes/S6';
import {D} from '../scenes/Diagram';
import {T8} from '../scenes/S8';

const seg = Object.values(SEG);
const pingG = SCENE.S3.start + T3.ping;
const sm = (x: number) => x * x * (3 - 2 * x);

/** Music level: ducks under narration, drops out completely for the phone notification, fades at the head. */
export const musicVolume = (f: number) => {
  let speak = 0;
  for (const s of seg) {
    const a = sm(clamp01((f - (s.start - 6)) / 8));
    const b = sm(clamp01((s.start + s.dur + 10 - f) / 14));
    speak = Math.max(speak, Math.min(a, b));
  }
  const gap = sm(clamp01((f - (pingG - 12)) / 6)) * sm(clamp01((pingG + 34 - f) / 12));
  return 0.9 * (1 - 0.5 * speak) * (1 - gap) * sm(clamp01(f / 24));
};

type Fx = {src: string; at: number; vol: number; loop?: boolean; dur?: number; fadeIn?: number; fadeOut?: number};
const S = (n: string) => `audio/sfx/${n}.wav`;
const fx: Fx[] = [];
const add = (src: string, at: number, vol: number, o: Partial<Fx> = {}) => fx.push({src: S(src), at: Math.round(at), vol, ...o});
// S1-S2
add('amb_office', 0, 0.2, {loop: true, dur: SCENE.S2.end + 6, fadeIn: 30, fadeOut: 24});
add('whoosh_long', 140, 0.32);
for (let i = 0; i < 12; i++) add('pop', SCENE.S1.start + 26 + i * 13 + 4, 0.1);
add('counter', SCENE.S1.start + wordFrame('s1a', /over/) - 0, 0.2);
add('counter', wordFrame('s2a', /^one point/), 0.18);
add('counter', wordFrame('s2b', /hundred/), 0.18);
add('tick', wordFrame('s2b', /hundred/) + 70, 0.2);
add('lights_off', SCENE.S2.end - 18, 0.5);
// S3
add('amb_night', SCENE.S3.start + 4, 0.26, {loop: true, dur: SCENE.S3.dur + 14, fadeIn: 30, fadeOut: 26});
add('whoosh_soft', SCENE.S3.start + 70, 0.22);
add('chime', pingG, 0.5);
add('buzz', pingG + 6, 0.32);
add('heartbeat', pingG + 40, 0.3, {loop: true, dur: SCENE.S3.end - (pingG + 40) + 6, fadeIn: 14, fadeOut: 10});
add('impact', SCENE.S3.start + T3.shortfall + 12, 0.45);
// S4
add('clock_tick', SCENE.S4.start + T4.pay, 0.24, {loop: true, dur: SCENE.S4.dur - T4.pay + 18, fadeIn: 10, fadeOut: 14});
add('whoosh_soft', SCENE.S4.start + T4.chip[0], 0.12);
add('paper', SCENE.S4.start + T4.chip[1], 0.14);
add('whoosh_soft', SCENE.S4.start + T4.chip[2], 0.16);
add('whoosh_soft', SCENE.S4.start + T4.chip[3], 0.16);
for (let k = 0; k < 6; k++) { add('coin', SCENE.S4.start + T4.chip[2] + 10 + k * 5, 0.13); add('coin', SCENE.S4.start + T4.chip[3] + 10 + k * 5, 0.13); }
add('stamp', SCENE.S4.start + T4.ninety + 6, 0.3);
// S5
add('whoosh_soft', SCENE.S5.start - 18, 0.26);
BEATS.forEach((b, i) => { add('paper', SCENE.S5.start + b, 0.12); add('coin', SCENE.S5.start + b + 4, 0.12 + 0.012 * i); });
// S6
add('whoosh_soft', SCENE.S6.start - 10, 0.16);
for (let k = 0; k < 4; k++) add('paper', SCENE.S6.start + T6.trap + k * 8, 0.12);
add('stamp', SCENE.S6.start + T6.trap + 52, 0.3);
add('whoosh_long', SCENE.S6.start + T6.zoom - 4, 0.22);
add('impact', D.start + 34, 0.4);
// S7
D.cues.forEach((c) => add('pop', c - 6, 0.22));
D.cues.forEach((c) => add('tick', c + 8, 0.15));
// S8
add('whoosh_soft', SCENE.S8.start - 10, 0.15);
add('impact', SCENE.S8.start + T8.cash - 2, 0.5);
add('pop', SCENE.S8.start + T8.q, 0.14);
add('pop', SCENE.S8.start + T8.cta, 0.22);

export const AudioLayer: React.FC = () => (
  <>
    <Audio src={staticFile('audio/music.wav')} volume={musicVolume} />
    {seg.map((s) => (
      <Sequence key={s.id} from={s.start} durationInFrames={Math.ceil(s.durSec * TL.fps) + 6} name={`vo-${s.id}`}>
        <Audio src={staticFile(`audio/narration/${s.id}.wav`)} volume={1} />
      </Sequence>
    ))}
    {fx.map((e, i) => (
      <Sequence key={i} from={e.at} durationInFrames={e.dur ?? (e.loop ? 120 : 240)} name={`fx-${e.src.split('/').pop()}`}>
        <Audio src={staticFile(e.src)} loop={e.loop} volume={(f) => e.vol * clamp01(f / Math.max(1, e.fadeIn ?? 1)) * (e.dur && e.fadeOut ? clamp01((e.dur - f) / e.fadeOut) : 1)} />
      </Sequence>
    ))}
  </>
);
