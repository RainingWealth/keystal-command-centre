// Scene 5 — stable network, ? becomes a tick, call to action (37.5 - 52 s; final card holds static).
import React from 'react';
import {A, E, lin, rin, seg, snap} from '../lib/anim';
import {C, MIDY, W, WINDOW} from '../design/tokens';
import {Clip, PolyDraw, R, Rise} from '../components/primitives';
import {NetWorld} from './network';

export const S5: React.FC<{t: number}> = ({t}) => {
  const o = {size: 88, weight: 800, color: C.ink};
  const kIn = E(seg(t, 37.5, 38.0));
  const kOut = E(seg(t, 43.875, 44.25));
  const k = Math.min(kIn, 1 - kOut);
  const s = 1 + 0.35 * E(seg(t, 38.5, 39.5)) - 0.35 * E(seg(t, 40.5, 41.5));
  const bw = W * snap(t, 44.5, 0.25);
  return (
    <>
      <Rise s="PROTECT YOUR" x={72} y={268} o={o} pin={rin(t, 41.5)} />
      <Rise s="BUSINESS" x={72} y={358} o={o} pin={rin(t, 41.625)} />
      <Rise s="CONTINUITY" x={72} y={448} o={o} pin={rin(t, 41.75)} />
      {k > 0 ? (
        <Clip x={WINDOW.x} y={WINDOW.y} w={WINDOW.w} h={WINDOW.h}>
          <g transform={`translate(0 ${MIDY}) scale(1 ${k}) translate(0 ${-MIDY})`}>
            <g transform={`translate(540 ${MIDY}) scale(${s}) translate(-540 ${-MIDY})`}>
              <NetWorld t={t} mode="s5" />
            </g>
            <PolyDraw
              pts={[[48, 488], [1032, 488], [1032, 1192], [48, 1192], [48, 488]]}
              p={lin(t, 41.75, 43.25)}
              stroke={C.cy}
              lw={7}
            />
          </g>
        </Clip>
      ) : null}
      {t >= 43.75 && t < 44.25 ? <R x={0} y={MIDY - 1} w={W * lin(t, 43.75, 43.875)} h={2} fill={C.ink} /> : null}
      {bw > 0 ? <R x={0} y={620} w={bw} h={340} fill={C.cy} /> : null}
      <Rise s="DM 'KEYMAN'" x={72} y={780} o={{size: 120, weight: 800, color: C.bg}} pin={rin(t, 44.5)} />
      <Rise s="TO FIND OUT MORE" x={72} y={880} o={{size: 56, weight: 800, color: C.bg, track: 0.01}} pin={rin(t, 44.75)} />
      <Rise s="Rain | SME Risk & Business Advisory" x={72} y={1072} o={{size: 38, weight: 600, color: C.ink}} pin={rin(t, 45.5)} />
      <Rise s="General information only, not financial advice." x={72} y={1166} o={{size: 26, weight: 500, color: A(0.6)}} pin={rin(t, 46.25)} />
      <Rise s="Benefits depend on policy terms and conditions." x={72} y={1202} o={{size: 26, weight: 500, color: A(0.6)}} pin={rin(t, 46.375)} />
    </>
  );
};
