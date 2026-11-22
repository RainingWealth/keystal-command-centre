import React from 'react';
import {R} from './primitives';
import {A, lin} from '../lib/anim';
import {xcol} from '../design/tokens';

/** six column hairlines + right margin line draw down the frame in the first half second */
export const Backdrop: React.FC<{t: number}> = ({t}) => (
  <>
    {Array.from({length: 7}, (_, i) => {
      const x = i < 6 ? xcol(i) : 1008;
      const p = lin(t, 0 + i * 0.0625, 0.5 + i * 0.0625);
      return <R key={i} x={x - 0.5} y={190} w={1} h={1290 * p} fill={A(0.07)} />;
    })}
  </>
);
