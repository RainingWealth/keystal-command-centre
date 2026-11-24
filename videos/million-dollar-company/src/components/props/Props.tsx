import React from 'react';
import {C, FONT} from '../../config/theme';

type Tone = 'amber' | 'cyan' | 'red' | 'white';
const TONE: Record<Tone, string> = {amber: C.amber, cyan: C.cyan, red: C.red, white: C.mute2};

/** Paper invoice / notice. Origin = centre, 130 x 170. */
export const Paper: React.FC<{tone?: Tone; stamp?: string; head?: string; scale?: number; rot?: number; dim?: number; opacity?: number}> = ({tone = 'amber', stamp, head = 'INVOICE', scale = 1, rot = 0, opacity = 1}) => {
  const col = TONE[tone];
  return (
    <g transform={`rotate(${rot}) scale(${scale})`} opacity={opacity}>
      <rect x={-65} y={-85} width={130} height={170} rx={10} fill="#000" opacity={0.22} transform="translate(5 8)" />
      <rect x={-65} y={-85} width={130} height={170} rx={10} fill={C.white} />
      <rect x={-65} y={-85} width={130} height={34} rx={10} fill={col} />
      <rect x={-65} y={-66} width={130} height={15} fill={col} />
      <text x={-50} y={-61} fontFamily={FONT.text} fontWeight={800} fontSize={15} letterSpacing={2} fill={C.navy}>{head}</text>
      {[-30, -10, 10, 30].map((y, i) => <rect key={i} x={-50} y={y} width={i % 2 ? 70 : 100} height={7} rx={3.5} fill="#C5CEDB" />)}
      <rect x={-50} y={56} width={52} height={10} rx={4} fill={col} opacity={0.9} />
      {stamp ? (
        <g transform="rotate(-14) translate(4 16)">
          <rect x={-52} y={-17} width={104} height={34} rx={6} fill="none" stroke={col} strokeWidth={4} />
          <text x={0} y={8} textAnchor="middle" fontFamily={FONT.display} fontWeight={900} fontSize={22} letterSpacing={2} fill={col}>{stamp}</text>
        </g>
      ) : null}
    </g>
  );
};

export const Coin: React.FC<{r?: number; tone?: Tone; glyph?: string}> = ({r = 30, tone = 'cyan', glyph = '$'}) => {
  const col = TONE[tone] === C.mute2 ? C.mute2 : TONE[tone];
  return (
    <g>
      <circle r={r} fill={col} />
      <circle r={r * 0.78} fill="none" stroke={C.navy} strokeWidth={r * 0.1} opacity={0.35} />
      <text y={r * 0.34} textAnchor="middle" fontFamily={FONT.display} fontWeight={900} fontSize={r * 1.0} fill={C.navy} opacity={0.75}>{glyph}</text>
    </g>
  );
};

export const Note: React.FC<{w?: number; tone?: Tone}> = ({w = 90, tone = 'cyan'}) => {
  const h = w * 0.52; const col = TONE[tone];
  return (
    <g>
      <rect x={-w / 2} y={-h / 2} width={w} height={h} rx={7} fill={col} />
      <rect x={-w / 2 + 6} y={-h / 2 + 6} width={w - 12} height={h - 12} rx={4} fill="none" stroke={C.navy} strokeWidth={2} opacity={0.35} />
      <circle r={h * 0.26} fill="none" stroke={C.navy} strokeWidth={3} opacity={0.4} />
    </g>
  );
};

export const Clock: React.FC<{r?: number; minute?: number; hour?: number; color?: string; face?: string; ticks?: boolean}> = ({r = 60, minute = 0, hour = 0, color = C.navy, face = C.white, ticks = true}) => (
  <g>
    <circle r={r} fill={face} stroke={color} strokeWidth={r * 0.09} />
    {ticks ? Array.from({length: 12}).map((_, i) => (
      <line key={i} x1={0} y1={-r * 0.8} x2={0} y2={-r * (i % 3 === 0 ? 0.64 : 0.72)} stroke={color} strokeWidth={r * 0.05} strokeLinecap="round" transform={`rotate(${i * 30})`} />
    )) : null}
    <line x1={0} y1={0} x2={0} y2={-r * 0.5} stroke={color} strokeWidth={r * 0.1} strokeLinecap="round" transform={`rotate(${hour})`} />
    <line x1={0} y1={0} x2={0} y2={-r * 0.72} stroke={color} strokeWidth={r * 0.07} strokeLinecap="round" transform={`rotate(${minute})`} />
    <circle r={r * 0.07} fill={color} />
  </g>
);

export const Padlock: React.FC<{size?: number; color?: string; open?: number}> = ({size = 60, color = C.amber, open = 0}) => (
  <g transform={`scale(${size / 60})`}>
    <path d={`M -16 -6 L -16 -22 C -16 -42 16 -42 16 -22 L 16 ${-6 - open * 14}`} fill="none" stroke={C.mute2} strokeWidth={8} strokeLinecap="round" />
    <rect x={-26} y={-8} width={52} height={42} rx={9} fill={color} />
    <circle cx={0} cy={11} r={6} fill={C.navy} opacity={0.8} />
    <rect x={-2.5} y={13} width={5} height={12} rx={2.5} fill={C.navy} opacity={0.8} />
  </g>
);

export const Truck: React.FC<{wheel?: number}> = ({wheel = 0}) => (
  <g>
    <rect x={-110} y={-62} width={140} height={86} rx={8} fill="#E9EEF6" />
    <rect x={-110} y={-18} width={140} height={10} fill={C.cyan} />
    <path d="M 36 -40 L 78 -40 L 104 -8 L 104 24 L 36 24 Z" fill={C.cyan} />
    <path d="M 46 -32 L 74 -32 L 94 -8 L 46 -8 Z" fill={C.navy} opacity={0.8} />
    <rect x={-112} y={24} width={218} height={9} rx={4} fill={C.charcoal} />
    {[-68, 62].map((x, i) => (
      <g key={i} transform={`translate(${x} 36)`}>
        <circle r={20} fill={C.navy} stroke={C.charcoal} strokeWidth={4} />
        <circle r={7} fill={C.mute2} />
        <line x1={-14} y1={0} x2={14} y2={0} stroke={C.mute2} strokeWidth={3} transform={`rotate(${wheel})`} />
      </g>
    ))}
  </g>
);

export const CalendarIcon: React.FC<{size?: number; tone?: Tone; day?: string}> = ({size = 80, tone = 'red', day = '!'}) => (
  <g transform={`scale(${size / 80})`}>
    <rect x={-36} y={-34} width={72} height={70} rx={12} fill={C.white} />
    <path d="M -36 -22 Q -36 -34 -24 -34 L 24 -34 Q 36 -34 36 -22 L 36 -6 L -36 -6 Z" fill={TONE[tone]} />
    <rect x={-20} y={-44} width={8} height={18} rx={4} fill={C.navy} />
    <rect x={12} y={-44} width={8} height={18} rx={4} fill={C.navy} />
    <text y={26} textAnchor="middle" fontFamily={FONT.display} fontWeight={900} fontSize={34} fill={C.navy}>{day}</text>
  </g>
);

/** Action icons (line style on a 120 box, origin = centre). */
const LINE = {fill: 'none', strokeWidth: 5.5, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const};
export const IconForecast: React.FC<{p: number; color?: string}> = ({p, color = C.cyan}) => (
  <g stroke={color} {...LINE}>
    <rect x={-52} y={-48} width={104} height={92} rx={14} />
    <path d="M -52 -22 L 52 -22" />
    <path d="M -28 -58 L -28 -40 M 28 -58 L 28 -40" />
    <path d="M -34 28 L -12 4 L 6 16 L 36 -8" strokeDasharray="160" strokeDashoffset={160 * (1 - p)} stroke={C.amber} />
    <circle cx={36} cy={-8} r={5} fill={C.amber} stroke="none" opacity={p} />
  </g>
);
export const IconCollect: React.FC<{p: number; color?: string}> = ({p, color = C.cyan}) => (
  <g stroke={color} {...LINE}>
    <g transform={`translate(${-14 - 6 * p} 0)`}><rect x={-34} y={-46} width={68} height={92} rx={9} stroke={C.amber} /><path d="M -18 -22 L 18 -22 M -18 -6 L 8 -6 M -18 10 L 18 10" stroke={C.amber} /></g>
    <path d={`M 22 -4 L ${60 - 4 * (1 - p)} -4`} /><path d="M 48 -16 L 60 -4 L 48 8" />
    <g transform="translate(42 34)"><circle r={15} fill={C.cyan} stroke="none" opacity={0.25 + 0.75 * p} /><path d="M -6 0 L -1 5 L 7 -5" stroke={C.cyan} /></g>
  </g>
);
export const IconNegotiate: React.FC<{p: number; color?: string}> = ({p, color = C.cyan}) => (
  <g stroke={color} {...LINE}>
    <path d="M -56 -44 H 6 A 12 12 0 0 1 18 -32 V -6 A 12 12 0 0 1 6 6 H -26 L -42 22 V 6 H -56 A 12 12 0 0 1 -68 -6 V -32 A 12 12 0 0 1 -56 -44 Z" transform="translate(4 0)" />
    <path d="M 28 4 H 56 A 12 12 0 0 1 68 16 V 40 A 12 12 0 0 1 56 52 H 52 V 66 L 36 52 H 28 A 12 12 0 0 1 16 40 V 16 A 12 12 0 0 1 28 4 Z" transform="translate(-2 -10)" stroke={C.amber} />
    <path d="M -36 -18 L -10 -18" strokeDasharray="30" strokeDashoffset={30 * (1 - p)} />
    <path d="M 26 10 L 52 10 M 26 24 L 44 24" stroke={C.amber} strokeDasharray="40" strokeDashoffset={40 * (1 - p)} />
  </g>
);
export const IconBuffer: React.FC<{p: number; color?: string}> = ({p, color = C.cyan}) => (
  <g stroke={color} {...LINE}>
    <path d="M 0 -58 L 46 -40 L 46 6 C 46 34 24 52 0 62 C -24 52 -46 34 -46 6 L -46 -40 Z" />
    {[0, 1, 2].map((i) => (
      <ellipse key={i} cx={0} cy={26 - i * 14 * p - (1 - p) * 0} rx={20} ry={7} fill={C.cyan} fillOpacity={0.35} stroke={C.cyan} opacity={Math.min(1, p * 3 - i * 0.6 + 0.2)} />
    ))}
  </g>
);
