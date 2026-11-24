import React from 'react';
import {AbsoluteFill} from 'remotion';
import {C, FONT} from '../config/theme';
import {COPY} from '../config/copy';
import {FIG} from '../config/figures';
import {Clock, Coin, Padlock, Paper, Truck} from '../components/props/Props';
import {appear, easeInOut, easeOut, lin, prog, tween} from '../lib/anim';
import {SCENE, wordFrame} from '../lib/timeline';
import {useClock} from '../lib/scene';

const S4 = SCENE.S4;
export const T4 = {
  chip: [
    12,
    wordFrame('s4b', /invoicing/) - S4.start - 6,
    wordFrame('s4c', /^suppliers/) - S4.start - 2,
    wordFrame('s4c', /^salaries/) - S4.start - 2,
  ],
  ninety: wordFrame('s4b', /^ninety/) - S4.start,
  pay: wordFrame('s4b', /^pay/) - S4.start,
};
const AX = {x0: 110, x1: 970, y: 790};
const dayX = (d: number) => AX.x0 + ((AX.x1 - AX.x0) * d) / FIG.termDays;
const CHIPS = [
  {y: 330, color: C.cyan, label: COPY.chips[0]},
  {y: 418, color: C.amber, label: COPY.chips[1]},
  {y: 506, color: C.red, label: COPY.chips[2]},
  {y: 594, color: C.red, label: COPY.chips[3]},
];

const Grid: React.FC = () => (
  <svg width={1080} height={1920} style={{position: 'absolute', inset: 0}}>
    <defs>
      <pattern id="g4" width={60} height={60} patternUnits="userSpaceOnUse"><path d="M 60 0 L 0 0 0 60" fill="none" stroke="#fff" strokeWidth={1} opacity={0.045} /></pattern>
      <radialGradient id="v4" cx="50%" cy="38%" r="70%"><stop offset="0" stopColor="#1A2A46" stopOpacity={0.9} /><stop offset="1" stopColor="#0B1220" stopOpacity={1} /></radialGradient>
    </defs>
    <rect width={1080} height={1920} fill="url(#v4)" />
    <rect width={1080} height={1920} fill="url(#g4)" />
  </svg>
);

export const Scene4: React.FC = () => {
  const {t} = useClock();
  const axisP = prog(t, 14, 44, easeInOut);
  const crawl = prog(t, T4.pay + 4, S4.dur - T4.pay - 4, lin) * 0.9;
  const crawlX = dayX(FIG.termDays * crawl);
  const out1 = prog(t, T4.chip[2] + 6, 12, easeOut) * 0.5;
  const out2 = prog(t, T4.chip[3] + 6, 12, easeOut) * 0.5;
  const outFill = out1 + out2;
  const boxIn = prog(t, T4.ninety - 4, 20, easeOut);
  const flyCoins = (cue: number, fromY: number, key: string) =>
    Array.from({length: 7}).map((_, k) => {
      const t0 = cue + k * 3;
      const p = prog(t, t0, 24, easeInOut);
      if (t < t0 || p >= 1) return null;
      const sx = 660, sy = fromY, ex = 150 + k * 110 + (key === 'b' ? 40 : 0), ey = 1012;
      return (
        <g key={`${key}${k}`} transform={`translate(${sx + (ex - sx) * p} ${sy + (ey - sy) * p - Math.sin(Math.PI * p) * 70}) scale(${0.9 - 0.2 * p})`} opacity={Math.min(1, p * 8) * (1 - Math.max(0, p - 0.85) * 6)}>
          <Coin r={24} tone="red" />
        </g>
      );
    });
  return (
    <AbsoluteFill style={{background: C.navy}}>
      <Grid />
      <svg width={1080} height={1920} style={{position: 'absolute', inset: 0}}>
        <defs>
          <linearGradient id="axg" x1="0" x2="1"><stop offset="0" stopColor={C.red} /><stop offset="0.5" stopColor={C.amber} /><stop offset="1" stopColor={C.cyan} /></linearGradient>
        </defs>
        {/* stem + axis */}
        <line x1={AX.x0} y1={330} x2={AX.x0} y2={AX.y} stroke={C.red} strokeWidth={5} strokeLinecap="round" strokeDasharray={460} strokeDashoffset={460 * (1 - prog(t, 6, 30))} opacity={0.8} />
        <line x1={AX.x0} y1={AX.y} x2={AX.x0 + (AX.x1 - AX.x0) * axisP} y2={AX.y} stroke="url(#axg)" strokeWidth={8} strokeLinecap="round" />
        {[0, 30, 60, 90].map((d, i) => (
          <g key={d} opacity={prog(t, 20 + i * 8, 10)}>
            <line x1={dayX(d)} y1={AX.y - 12} x2={dayX(d)} y2={AX.y + 12} stroke={C.mute2} strokeWidth={4} strokeLinecap="round" />
            <text x={dayX(d)} y={AX.y + 52} textAnchor={d === 0 ? 'start' : d === 90 ? 'end' : 'middle'} fontFamily={FONT.text} fontWeight={800} fontSize={d % 90 === 0 ? 30 : 26} letterSpacing={3} fill={d === 0 ? C.red : d === 90 ? C.cyan : C.mute}>{d === 0 ? COPY.day0 : d === 90 ? COPY.day90 : d}</text>
          </g>
        ))}
        <circle cx={AX.x0} cy={AX.y} r={13} fill={C.red} opacity={prog(t, 10, 8)} />
        {/* Day 90 vault: customer cash locked behind a clock */}
        <g opacity={boxIn} transform={`translate(0 ${(1 - boxIn) * 30})`}>
          <line x1={dayX(90)} y1={640} x2={dayX(90)} y2={AX.y} stroke={C.cyan} strokeWidth={3} strokeDasharray="6 10" opacity={0.7} />
          <rect x={738} y={420} width={232} height={216} rx={30} fill="#16233B" stroke={C.cyan} strokeWidth={3} strokeOpacity={0.6} />
          {[0, 1, 2].map((i) => <g key={i} transform={`translate(${810 + i * 30} ${590 - i * 16})`}><Coin r={30} tone="cyan" /></g>)}
          <g transform="translate(854 520)"><Padlock size={78} color={C.amber} /></g>
          <g transform="translate(944 438)"><Clock r={46} minute={t * 14} hour={t * 1.2} color={C.navy} face={C.white} /></g>
          <text x={854} y={682} textAnchor="middle" fontFamily={FONT.text} fontWeight={700} fontSize={28} letterSpacing={1.5} fill={C.mute2}>{COPY.customerPays}</text>
        </g>
        {/* crawling customer payment */}
        {t > T4.pay ? (
          <g transform={`translate(${crawlX} ${AX.y})`}>
            <circle r={20} fill={C.cyan} /><circle r={34} fill="none" stroke={C.cyan} strokeWidth={3} opacity={0.4} />
            <text y={-52} textAnchor="middle" fontFamily={FONT.text} fontWeight={800} fontSize={26} letterSpacing={2} fill={C.cyan}>DAY {Math.round(FIG.termDays * crawl)}</text>
          </g>
        ) : null}
        {/* chips */}
        {CHIPS.map((c, i) => {
          const p = prog(t, T4.chip[i], 14, easeOut);
          return (
            <g key={i} opacity={p} transform={`translate(${(1 - p) * -60} 0)`}>
              <line x1={AX.x0} y1={c.y + 36} x2={150} y2={c.y + 36} stroke={c.color} strokeWidth={3} opacity={0.6} />
              <rect x={150} y={c.y} width={520} height={72} rx={36} fill="#16233B" stroke={c.color} strokeWidth={2.5} />
              <circle cx={AX.x0} cy={c.y + 36} r={9} fill={c.color} />
              <g transform={`translate(204 ${c.y + 36})`}>
                {i === 0 ? <g transform="scale(0.22)"><Truck wheel={t * 20} /></g> : null}
                {i === 1 ? <g transform="scale(0.3)"><Paper tone="amber" head="" /></g> : null}
                {i >= 2 ? <Coin r={20} tone="red" /> : null}
              </g>
              <text x={252} y={c.y + 47} fontFamily={FONT.text} fontWeight={700} fontSize={32} fill={C.white}>{c.label}</text>
            </g>
          );
        })}
        {/* flying outflow coins */}
        {flyCoins(T4.chip[2], 542, 'a')}
        {flyCoins(T4.chip[3], 630, 'b')}
      </svg>
      {/* CASH OUT / CASH IN */}
      <div style={{position: 'absolute', left: 110, top: 890, width: 860, opacity: prog(t, T4.chip[2] + 2, 10)}}>
        <div style={{fontFamily: FONT.display, fontWeight: 900, fontSize: 72, letterSpacing: '-0.02em', color: C.red, transform: `scale(${1 + 0.06 * (1 - prog(t, T4.chip[2], 14, easeOut))})`, transformOrigin: 'left'}}>{COPY.cashOut}</div>
        <div style={{marginTop: 16, height: 40, borderRadius: 20, background: 'rgba(255,255,255,0.08)', overflow: 'hidden'}}><div style={{height: '100%', width: `${outFill * 100}%`, background: C.red, borderRadius: 20}} /></div>
      </div>
      <div style={{position: 'absolute', left: 110, top: 1080, width: 860, opacity: prog(t, T4.ninety, 12)}}>
        <div style={{fontFamily: FONT.display, fontWeight: 900, fontSize: 72, letterSpacing: '-0.02em', color: C.cyan}}>{COPY.cashIn}</div>
        <div style={{marginTop: 16, height: 40, borderRadius: 20, border: `2px dashed ${C.cyan}`, background: 'rgba(33,198,215,0.05)', position: 'relative'}}>
          <div style={{position: 'absolute', left: 12, top: 5, width: crawl * 820, height: 26, borderRadius: 13, background: 'repeating-linear-gradient(135deg, rgba(255,190,85,0.85) 0 10px, rgba(255,190,85,0.45) 10px 20px)'}} />
        </div>
      </div>
    </AbsoluteFill>
  );
};
