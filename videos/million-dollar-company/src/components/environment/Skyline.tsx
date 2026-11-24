import React from 'react';
import {rand} from '../../lib/anim';

export type Variant = 'day' | 'dawn' | 'night';
export const PAL = {
  day: {skyTop: '#3E93BA', skyMid: '#8FD0E2', skyBot: '#E4F5F8', far: '#79B5C9', near: '#4A89A5', mbs: '#2D6884', wall: '#223249', wallHi: '#2C4160', ceil: '#131D31', floor: '#16223A', floorHi: '#22344F', glass: '#D5F2F7', lit: 0},
  dawn: {skyTop: '#2B3F70', skyMid: '#B6849B', skyBot: '#FFC38B', far: '#6A7399', near: '#434E78', mbs: '#2D3860', wall: '#25304A', wallHi: '#34415F', ceil: '#141C30', floor: '#16213A', floorHi: '#2A3956', glass: '#FFD9B0', lit: 0.25},
  night: {skyTop: '#060B16', skyMid: '#0C1729', skyBot: '#182844', far: '#101D34', near: '#0B1629', mbs: '#08111F', wall: '#0E1626', wallHi: '#16223A', ceil: '#080D18', floor: '#0A111E', floorHi: '#111B2E', glass: '#2C4A7A', lit: 1},
} as const;

type B = {x: number; w: number; h: number; seed: number};
const row = (seed: number, hMin: number, hMax: number, wMin: number, wMax: number): B[] => {
  const out: B[] = []; let x = -160, i = 0;
  while (x < 1260) { const w = wMin + rand(seed + i) * (wMax - wMin); out.push({x, w, h: hMin + rand(seed + i + 50) * (hMax - hMin), seed: seed + i * 3}); x += w + 4 + rand(seed + i + 9) * 8; i++; }
  return out;
};
const FAR = row(11, 130, 400, 60, 120);
const NEAR = row(41, 70, 250, 80, 150);

const Lights: React.FC<{b: B; baseY: number; on: number}> = ({b, baseY, on}) => {
  if (!on) return null;
  const els: React.ReactNode[] = [];
  const cols = Math.floor(b.w / 14), rows = Math.floor(b.h / 20);
  for (let c = 0; c < cols; c++) for (let r = 0; r < rows; r++) {
    const v = rand(b.seed + c * 17 + r * 31);
    if (v < 0.3 * on) els.push(<rect key={`${c}-${r}`} x={b.x + 6 + c * 14} y={baseY - b.h + 8 + r * 20} width={6} height={9} rx={1.5} fill={v < 0.06 ? '#7FE3EC' : v < 0.18 ? '#FFD998' : '#FFF1CF'} opacity={0.55 + 0.4 * rand(b.seed + c + r)} />);
  }
  return <>{els}</>;
};

const MBS: React.FC<{x: number; baseY: number; fill: string; lit: number}> = ({x, baseY, fill, lit}) => (
  <g>
    {[-112, 0, 112].map((dx, i) => (
      <path key={i} d={`M ${x + dx - 34} ${baseY} L ${x + dx - 22 + (i - 1) * -6} ${baseY - 360} L ${x + dx + 22 + (i - 1) * -6} ${baseY - 360} L ${x + dx + 34} ${baseY} Z`} fill={fill} />
    ))}
    <path d={`M ${x - 190} ${baseY - 372} C ${x - 120} ${baseY - 392} ${x + 80} ${baseY - 392} ${x + 215} ${baseY - 360} C ${x + 235} ${baseY - 352} ${x + 215} ${baseY - 340} ${x + 190} ${baseY - 342} L ${x - 150} ${baseY - 346} C ${x - 190} ${baseY - 346} ${x - 205} ${baseY - 360} ${x - 190} ${baseY - 372} Z`} fill={fill} />
    <path d={`M ${x - 190} ${baseY - 372} C ${x - 120} ${baseY - 392} ${x + 80} ${baseY - 392} ${x + 215} ${baseY - 360}`} fill="none" stroke="#9BE8F0" strokeWidth={3} opacity={0.25 + 0.5 * lit} />
    {lit ? Array.from({length: 14}).map((_, i) => <rect key={i} x={x - 150 + i * 24} y={baseY - 372 + 12 * Math.sin(i / 4)} width={10} height={3} fill="#FFD998" opacity={0.7} />) : null}
  </g>
);

/** Window-wall view. Stage coordinates; horizon line at baseY. */
export const Skyline = React.memo(({variant, baseY = 900}: {variant: Variant; baseY?: number}) => {
  const p = PAL[variant];
  const gid = `sky-${variant}`;
  return (
    <g>
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={p.skyTop} /><stop offset="0.55" stopColor={p.skyMid} /><stop offset="1" stopColor={p.skyBot} />
        </linearGradient>
      </defs>
      <rect x={-400} y={-400} width={1900} height={baseY + 400} fill={`url(#${gid})`} />
      {variant === 'dawn' ? <circle cx={300} cy={baseY - 60} r={150} fill="#FFE2B8" opacity={0.55} /> : null}
      {variant === 'night' ? Array.from({length: 38}).map((_, i) => <circle key={i} cx={-100 + rand(i + 3) * 1300} cy={250 + rand(i + 9) * 320} r={0.8 + rand(i) * 1.4} fill="#CFE3FF" opacity={0.25 + 0.5 * rand(i + 5)} />) : null}
      {variant === 'day' ? (
        <g fill="#fff" opacity={0.7}>
          <ellipse cx={230} cy={470} rx={110} ry={24} /><ellipse cx={310} cy={455} rx={70} ry={22} />
          <ellipse cx={820} cy={560} rx={130} ry={22} /><ellipse cx={900} cy={546} rx={74} ry={20} />
        </g>
      ) : null}
      {FAR.map((b, i) => <rect key={`f${i}`} x={b.x} y={baseY - b.h} width={b.w} height={b.h + 40} fill={p.far} />)}
      {FAR.map((b, i) => <Lights key={`fl${i}`} b={b} baseY={baseY} on={p.lit * 0.8} />)}
      <MBS x={790} baseY={baseY + 10} fill={p.mbs} lit={p.lit} />
      {NEAR.map((b, i) => <rect key={`n${i}`} x={b.x} y={baseY - b.h + 30} width={b.w} height={b.h + 40} fill={p.near} />)}
      {NEAR.map((b, i) => <Lights key={`nl${i}`} b={{...b, h: b.h - 30}} baseY={baseY + 30} on={p.lit} />)}
    </g>
  );
});
