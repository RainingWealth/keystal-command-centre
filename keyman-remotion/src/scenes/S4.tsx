// Scene 4 — what the payout can fund (28.5 - 37.5 s): three equal rows, staggered on the narration.
import React from 'react';
import {A, lin, q4, rin, snap, steps} from '../lib/anim';
import {C} from '../design/tokens';
import {wt} from '../data/timing';
import {Clip, PolyDraw, Person, R, Rise, SR} from '../components/primitives';

export const S4: React.FC<{t: number}> = ({t}) => {
  const rows = [
    {n: '01', lab: ['RECRUITMENT'], at: q4(wt('l08', 9))},
    {n: '02', lab: ['OPERATING', 'EXPENSES'], at: q4(wt('l08', 11))},
    {n: '03', lab: ['RECOVERY TIME'], at: q4(wt('l08', 17))},
  ];
  // A recruitment
  const p = rin(t, 31.5);
  const cyA = 300 + 224;
  // B operating expenses
  const hs = [40, 64, 52, 76, 58];
  const baseB = 600 + 262;
  // C runway
  const y0C = 900;
  const baseC = y0C + 262;
  const pr = lin(t, 35.5, 37.0);
  const scC = snap(t, 30.25, 0.25);
  const ptsC: [number, number][] = [[372, baseC - 6], [450, baseC - 14], [530, baseC - 34], [610, baseC - 62], [690, baseC - 76], [780, baseC - 80], [900, baseC - 80]];
  return (
    <>
      <Rise s="DEPENDING ON THE POLICY" x={72} y={248} o={{size: 30, weight: 700, color: A(0.6), track: 0.06}} pin={rin(t, 28.75)} />
      {rows.map((r, i) => {
        const y0 = 300 + 300 * i;
        const a = 29.0 + 0.25 * i;
        return (
          <g key={i}>
            <R x={72} y={y0} w={936 * lin(t, a - 0.25, a + 0.25)} h={2} fill={A(0.28)} />
            <Rise s={r.n} x={66} y={y0 + 232} o={{size: 210, weight: 800}} pin={steps(t, a, a + 0.5, 4)} />
            {r.lab.map((s, k) => (
              <Rise key={k} s={s} x={372} y={r.lab.length === 1 ? y0 + 118 : y0 + 90 + 58 * k} o={{size: 56, weight: 800}} pin={rin(t, r.at + 0.125 * k)} />
            ))}
          </g>
        );
      })}
      {[0, 1, 2, 3, 4].map((i) => {
        const cx = 372 + i * 100 + 36;
        const sc = snap(t, 29.5 + 0.125 * i, 0.25);
        if (i < 4) return sc > 0 ? <Person key={i} cx={cx} cy={cyA} s={64 * sc} fill={A(0.5)} /> : null;
        return (
          <g key={i}>
            {sc > 0 ? <Person cx={cx} cy={cyA} s={64} fill={null} stroke={A(0.55)} dash={[8, 7]} lw={3} /> : null}
            {p > 0 ? (
              <Clip x={cx - 40} y={cyA - 40} w={80} h={80}>
                <g transform={`translate(0 ${(1 - p) * 80})`}>
                  <Person cx={cx} cy={cyA} s={64} fill={C.cy} />
                </g>
              </Clip>
            ) : null}
          </g>
        );
      })}
      {hs.map((h, i) => {
        const x = 372 + i * 100;
        const sc = snap(t, 29.75 + 0.125 * i, 0.25);
        if (sc <= 0) return null;
        const f = steps(t, 33.5 + 0.125 * i, 34.0 + 0.125 * i, 3);
        return (
          <g key={i}>
            <SR x={x + 1.5} y={baseB - h * sc + 1.5} w={69} h={h * sc - 3} stroke={A(0.4)} lw={3} />
            <R x={x} y={baseB - h * f} w={72} h={h * f} fill={C.cy} />
          </g>
        );
      })}
      {scC > 0 ? (
        <>
          <R x={372} y={baseC} w={528 * scC} h={3} fill={A(0.3)} />
          {Array.from({length: 13}, (_, m) => (
            <R key={m} x={372 + m * 44 - 1} y={baseC - 10} w={3} h={10 * scC} fill={A(0.3)} />
          ))}
          <PolyDraw pts={ptsC} p={pr} stroke={C.cy} lw={8} join="round" />
          {pr > 0 && pr < 1 ? <R x={372 + 528 * pr - 1.5} y={y0C + 168} w={3} h={94} fill={A(0.85)} /> : null}
        </>
      ) : null}
    </>
  );
};
