// Scenes 1 + 2 (hook, problem): 0 - 19 s. One continuous grid; camera push / pull, knife cuts, ripple, wipe.
import React from 'react';
import {A, E, lin, rin, rout, seg} from '../lib/anim';
import {C, H, MIDY, W, WINDOW} from '../design/tokens';
import {K, tickT} from '../data/timing';
import {Clip, Knife, R, Rise} from '../components/primitives';
import {NetWorld} from './network';

const camS = (t: number) => (t < 6.25 ? 1 + 2 * E(seg(t, K.pushA, K.pushB)) : 3 - 2 * E(seg(t, K.pullA, K.pullB)));

const Numeral: React.FC<{t: number}> = ({t}) => {
  const draw = (
    <>
      <Rise s="FILES BACKED UP" x={72} y={238} o={{size: 28, weight: 700, color: A(0.6), track: 0.06}} pin={1} />
      {Array.from({length: 10}, (_, n) => {
        const t0 = n === 0 ? -99 : tickT(n - 1);
        const t1 = n < 9 ? tickT(n) : 1e9;
        return (
          <Rise
            key={n}
            s={`${n}/9`}
            x={66}
            y={440}
            o={{size: 230, weight: 800, color: C.ink, ct: 0.74}}
            pin={n === 0 ? 1 : rin(t, t0)}
            pout={n < 9 ? E(seg(t, t1 - 0.125, t1)) : 0}
          />
        );
      })}
    </>
  );
  return t < 3.0 ? draw : (
    <Knife t={t} t0={3.0} x={72} y={190} w={700} h={290}>
      {draw}
    </Knife>
  );
};

const Heads: React.FC<{t: number}> = ({t}) => {
  const o = {size: 88, weight: 800, color: C.ink};
  return (
    <>
      <Numeral t={t} />
      <Rise s="YOUR BIGGEST" x={72} y={330} o={o} pin={rin(t, 4.5)} pout={rout(t, 8.25)} />
      <Rise s="BUSINESS RISK?" x={72} y={424} o={o} pin={rin(t, 4.75)} pout={rout(t, 8.375)} />
      <Rise s="ONE PERSON." x={72} y={262} o={{size: 80, weight: 800, color: C.cy}} pin={rin(t, 8.5)} />
      <Rise s="MULTIPLE" x={72} y={350} o={{size: 80, weight: 800, color: C.or}} pin={rin(t, 12.0)} />
      <Rise s="BUSINESS RISKS." x={72} y={438} o={{size: 80, weight: 800, color: C.or}} pin={rin(t, 12.125)} />
    </>
  );
};

const Body: React.FC<{t: number}> = ({t}) => {
  const s = camS(t);
  return (
    <>
      <Heads t={t} />
      <Clip x={WINDOW.x} y={WINDOW.y} w={WINDOW.w} h={WINDOW.h}>
        <g transform={`translate(540 ${MIDY}) scale(${s}) translate(-540 ${-MIDY})`}>
          <NetWorld t={t} mode="a" />
        </g>
      </Clip>
    </>
  );
};

export const S12: React.FC<{t: number}> = ({t}) => {
  if (t < K.wipeA) return <Body t={t} />;
  const y = H * lin(t, K.wipeA, K.wipeB);
  return (
    <>
      <Clip x={0} y={y} w={W} h={H - y}>
        <Body t={t} />
      </Clip>
      <R x={0} y={y - 2} w={W} h={4} fill={C.cy} />
    </>
  );
};
