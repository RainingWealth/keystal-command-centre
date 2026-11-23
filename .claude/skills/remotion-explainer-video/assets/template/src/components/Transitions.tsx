import React from 'react';
import {useCurrentFrame} from 'remotion';
import {C, EASE_IN_OUT, H, W} from '../styles/theme';
import {timeline} from '../data/timeline';

const BARS = 6;
const IN = 9;
const OUT = 9;
const STAG = 1.2;

/** Venetian block wipe: 6 grid-aligned bars rise to cover the cut (frame b), then lift away. */
export const BlockWipes: React.FC<{colors?: string[]}> = ({colors = [C.orange, C.cobalt, C.red, C.teal, C.cobalt]}) => {
  const frame = useCurrentFrame();
  const bounds = timeline.scenes.slice(1).map((s) => s.start);
  const out: React.ReactNode[] = [];
  bounds.forEach((b, bi) => {
    if (frame < b - 20 || frame > b + 24) return;
    const color = colors[bi % colors.length];
    for (let i = 0; i < BARS; i++) {
      const enterStart = b - IN - (BARS - 1) * STAG + i * STAG;
      const exitStart = b + 1 + i * STAG;
      const e1 = EASE_IN_OUT(Math.min(1, Math.max(0, (frame - enterStart) / IN)));
      const e2 = EASE_IN_OUT(Math.min(1, Math.max(0, (frame - exitStart) / OUT)));
      const top = H * (1 - e1);
      const height = H * (e1 - e2);
      if (height <= 0.5) continue;
      const w = W / BARS;
      out.push(
        <div key={`${bi}-${i}`} style={{position: 'absolute', left: i * w - 0.5, top, width: w + 1, height, background: color}}>
          <div style={{position: 'absolute', left: 0, right: 0, bottom: 0, height: 6, background: C.off, opacity: 0.9}} />
        </div>,
      );
    }
  });
  return <>{out}</>;
};

/** Absolute frame where a cover bar finishes entering for boundary index (for sfx timing). */
export const wipeSfxFrame = (boundary: number) => boundary - 16;
