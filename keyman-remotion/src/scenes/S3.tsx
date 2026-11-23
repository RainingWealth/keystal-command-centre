// Scene 3 — Keyman insurance (19 - 28.5 s): finance tower, shield drawn linearly, policy, conditional covered event, payout.
import React from 'react';
import {A, E, lerp, lin, rin, seg, snap} from '../lib/anim';
import {C} from '../design/tokens';
import {SHIELD, S3T} from '../data/timing';
import {Check, Clip, Person, PolyDraw, R, Rise, SR, Txt} from '../components/primitives';

export const S3: React.FC<{t: number}> = ({t}) => {
  const fillP = E(seg(t, 27.5, 27.9));
  const blocks: [string, number][] = [['CASH', 720], ['OPERATIONS', 830], ['PAYROLL', 940]];
  const X = 560;
  const Wd = 340;
  const tg = snap(t, S3T.tag, 0.25);
  const cd = snap(t, S3T.card, 0.25);
  const cn = snap(t, S3T.cond, 0.25);
  const pp = lin(t, S3T.pay[0], S3T.pay[1]);
  const fx = X + 26;
  const fy = 764;
  const tk = snap(t, S3T.tick, 0.125);
  const px = lerp(640, 292, pp);
  const py = 767;
  const lab = {size: 26, weight: 700, color: C.ink, track: 0.04};
  return (
    <>
      <Rise s="KEYMAN" x={72} y={300} o={{size: 120, weight: 800}} pin={rin(t, S3T.title)} />
      <Rise s="INSURANCE" x={72} y={430} o={{size: 120, weight: 800}} pin={rin(t, S3T.title + 0.25)} />
      <Rise s="FINANCIAL PROTECTION FOR THE BUSINESS" x={72} y={494} o={{size: 30, weight: 700, color: C.cy, track: 0.03}} pin={rin(t, 19.75)} />
      {blocks.map(([label, y], i) => {
        const w = 304 * snap(t, S3T.tower[2 - i], 0.25);
        if (w <= 0) return null;
        return (
          <Clip key={label} x={140} y={y} w={w} h={94}>
            <R x={140} y={y} w={304} h={94} fill={C.panel} />
            {i === 0 && fillP > 0 ? <R x={444 - 304 * fillP} y={y} w={304 * fillP} h={94} fill={C.cy} /> : null}
            <Txt s={label} x={164} y={y + 58} o={{size: 28, weight: 700, color: i === 0 && fillP > 0.6 ? C.bg : C.ink, track: 0.04}} />
          </Clip>
        );
      })}
      <PolyDraw pts={SHIELD} p={lin(t, S3T.shield[0], S3T.shield[1])} stroke={C.cy} lw={9} />
      {tg > 0 ? (
        <Clip x={X} y={600} w={Wd * tg} h={96}>
          <R x={X} y={600} w={Wd} h={96} fill={C.panel} />
          <Person cx={X + 48} cy={648} s={62} fill={C.cy} />
          <Txt s="INSURED" x={X + 100} y={640} o={lab} />
          <Txt s="KEY PERSON" x={X + 100} y={674} o={lab} />
        </Clip>
      ) : null}
      {cd > 0 ? (
        <Clip x={X} y={730} w={Wd * cd} h={190}>
          <R x={X} y={730} w={Wd} h={190} fill={C.panel} />
          <path
            d={`M${fx} ${fy}L${fx + 34} ${fy}L${fx + 52} ${fy + 18}L${fx + 52} ${fy + 70}L${fx} ${fy + 70}Z`}
            fill="none"
            stroke={C.cy}
            strokeWidth={5}
            strokeMiterlimit={10}
          />
          <R x={fx + 11} y={fy + 36} w={30} h={5} fill={C.cy} />
          <R x={fx + 11} y={fy + 50} w={20} h={5} fill={C.cy} />
          <Txt s="POLICY" x={X + 100} y={802} o={{size: 32, weight: 800, color: C.ink, track: 0.04}} />
          <R x={X + 100} y={826} w={190} h={8} fill={A(0.25)} />
          <R x={X + 100} y={848} w={130} h={8} fill={A(0.25)} />
          <circle cx={X + Wd - 52} cy={870} r={24} fill={C.cy} />
          <Check x={X + Wd - 52 - 17} y={870 - 18} s={34} p={lin(t, S3T.card, S3T.card + 0.25)} color={C.bg} lw={5} />
        </Clip>
      ) : null}
      <R x={X + 40} y={696} w={4} h={34 * lin(t, 23.25, 23.5)} fill={C.cy} />
      <R x={X + 40} y={920} w={4} h={30 * lin(t, 24.0, 24.25)} fill={C.cy} />
      {cn > 0 ? (
        <>
          <Clip x={X} y={950} w={Wd * cn} h={80}>
            <R x={X} y={950} w={Wd} h={80} fill={C.panel} />
            <SR x={X + 20} y={968} w={44} h={44} stroke={A(0.7)} lw={4} />
            {tk > 0 ? (
              <>
                <R x={X + 20} y={968} w={44} h={44} fill={C.cy} />
                <Check x={X + 20} y={968} s={44} p={lin(t, S3T.tick - 0.125, S3T.tick)} color={C.bg} lw={6} />
              </>
            ) : null}
            <Txt s="COVERED EVENT*" x={X + 80} y={999} o={{size: 25, weight: 700, color: C.ink, track: 0.02}} />
          </Clip>
          <Rise s="*SUBJECT TO POLICY TERMS" x={X} y={1066} o={{size: 22, weight: 600, color: A(0.6), track: 0.04}} pin={rin(t, 24.5)} />
        </>
      ) : null}
      {pp > 0 && fillP < 1 ? (
        <Clip x={0} y={700} w={1160} h={140}>
          <R x={px - 75} y={py - 26} w={150} h={52} fill={C.cy} />
          <Txt s="PAYOUT" x={px - 52} y={py + 8} o={{size: 24, weight: 800, color: C.bg, track: 0.06}} />
        </Clip>
      ) : null}
    </>
  );
};
