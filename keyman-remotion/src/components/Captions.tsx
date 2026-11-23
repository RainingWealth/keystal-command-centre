// Captions are part of the layout: flush-left at column 1, words clip-reveal on their Whisper timestamps.
import React from 'react';
import {measureText} from '@remotion/layout-utils';
import {A, E, lin, seg, snap} from '../lib/anim';
import {C, CAP, FONT} from '../design/tokens';
import {TL} from '../data/timing';
import {R, Rise} from './primitives';

const meas = (text: string) =>
  measureText({text, fontFamily: FONT, fontSize: CAP.size, fontWeight: CAP.weight, letterSpacing: '0px'}).width;

type Word = {w: string; i: number; x: number};
const cache = new Map<number, Word[][]>();
function layout(c: {t0: number; text: string}): Word[][] {
  const hit = cache.get(c.t0);
  if (hit) return hit;
  const words = c.text.split(' ');
  const sp = meas('a a') - meas('aa'); // width of one space (robust to whitespace trimming)
  const lines: Word[][] = [[]];
  let x = 0;
  words.forEach((w, i) => {
    const ww = meas(w);
    if (x + ww > CAP.maxW && lines[lines.length - 1].length) {
      lines.push([]);
      x = 0;
    }
    lines[lines.length - 1].push({w, i, x});
    x += ww + sp;
  });
  if (lines.length > 2) throw new Error('caption wraps to >2 lines: ' + c.text);
  cache.set(c.t0, lines);
  return lines;
}

export const Captions: React.FC<{t: number}> = ({t}) => (
  <>
    {t < 47.6 ? <R x={72} y={1226} w={936 * (t < 47.0 ? 1 : 1 - lin(t, 47.0, 47.6))} h={2} fill={A(0.2)} /> : null}
    {TL.cues.map((c, ci) => {
      if (t < c.t0 - 0.2 || t > c.t1 + 0.01) return null;
      const pout = E(seg(t, c.t1 - 0.125, c.t1));
      return (
        <g key={ci}>
          {layout(c).map((ln, li) =>
            ln.map((wd) => (
              <Rise
                key={wd.i}
                s={wd.w}
                x={CAP.x + wd.x}
                y={CAP.y + li * CAP.lh}
                o={{size: CAP.size, weight: CAP.weight, color: C.ink, track: 0}}
                pin={snap(t, c.words[wd.i], 0.125)}
                pout={pout}
              />
            )),
          )}
        </g>
      );
    })}
  </>
);
