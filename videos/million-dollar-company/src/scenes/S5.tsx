import React from 'react';
import {AbsoluteFill} from 'remotion';
import {C, FONT} from '../config/theme';
import {COPY} from '../config/copy';
import {Coin, Paper} from '../components/props/Props';
import {Grid} from '../components/Grid';
import {Glass} from '../components/UI';
import {appear, easeInOut, easeOut, hexMix, prog} from '../lib/anim';
import {SCENE} from '../lib/timeline';
import {useClock} from '../lib/scene';

export const BEATS = Array.from({length: 10}, (_, i) => 16 + i * 16);
const LEVEL_END = 0.08;
const PAYROLL = 0.42;
export const S5T = SCENE.S5;

export const Scene5: React.FC = () => {
  const {t} = useClock();
  // cash level: steps down per beat
  let level = 1;
  BEATS.forEach((b, i) => { level -= prog(t, b + 4, 9, easeOut) * ((1 - LEVEL_END) / BEATS.length); });
  const below = prog(t, 0, 1) && level < PAYROLL ? 1 : 0;
  const liquid = hexMix(C.cyan, C.red, level < PAYROLL + 0.06 ? 1 - Math.max(0, (level - PAYROLL) / 0.06) : 0);
  const TX = {x: 685, y: 430, w: 220, h: 520};
  return (
    <AbsoluteFill style={{background: C.navy}}>
      <Grid id="g5" />
      {/* LEFT: SALES */}
      <Glass x={60} y={270} w={465} h={930} r={36} border="rgba(33,198,215,0.35)" bg="rgba(16,28,48,0.92)" opacity={1} />
      <Glass x={555} y={270} w={465} h={930} r={36} border="rgba(240,98,98,0.4)" bg="rgba(26,22,36,0.92)" opacity={1} />
      <div style={{position: 'absolute', left: 95, top: 300, fontFamily: FONT.display, fontWeight: 900, fontSize: 70, letterSpacing: '-0.02em', color: C.white, opacity: appear(t, 4, 12, 10).opacity}}>
        SALES <span style={{color: C.cyan}}>↑</span>
      </div>
      <div style={{position: 'absolute', left: 595, top: 300, fontFamily: FONT.display, fontWeight: 900, fontSize: 70, letterSpacing: '-0.02em', color: C.white, opacity: appear(t, 4, 12, 10).opacity}}>
        CASH <span style={{color: C.red}}>↓</span>
      </div>
      <svg width={1080} height={1920} style={{position: 'absolute', inset: 0}}>
        {/* bars */}
        <line x1={70} y1={820} x2={500} y2={820} stroke={C.mute} strokeWidth={3} opacity={0.5} />
        {BEATS.map((b, i) => {
          const h = (60 + i * 33) * prog(t, b, 12, easeOut);
          return <rect key={i} x={74 + i * 42} y={820 - h} width={30} height={h} rx={6} fill={i === 9 ? C.cyanSoft : C.cyan} opacity={0.55 + 0.045 * i} />;
        })}
        {/* orders dropping in */}
        {BEATS.map((b, i) => {
          const p = prog(t, b - 8, 14, easeIn);
          if (t < b - 8 || t > b + 8) return null;
          return <g key={i} transform={`translate(${89 + i * 42} ${400 + p * (360 - (i * 33)) })`} opacity={1 - prog(t, b + 2, 6)}><rect x={-20} y={-13} width={40} height={26} rx={6} fill={C.white} /><rect x={-13} y={-4} width={26} height={4} rx={2} fill={C.cyan} /></g>;
        })}
        {/* unpaid pile */}
        <text x={285} y={888} textAnchor="middle" fontFamily={FONT.text} fontWeight={800} fontSize={28} letterSpacing={3} fill={C.amber} opacity={prog(t, 30, 12)}>UNPAID INVOICES</text>
        {BEATS.map((b, i) => {
          const p = prog(t, b + 4, 12, easeOut);
          if (p <= 0) return null;
          const x = 285 + ((i * 37) % 70) - 35, y = 1050 - i * 6 - (1 - p) * 60;
          return <g key={i} transform={`translate(${x} ${y})`} opacity={p}><Paper tone="amber" stamp={COPY.unpaid} scale={0.78} rot={((i * 53) % 26) - 13} head="INVOICE" /></g>;
        })}
        {/* TANK */}
        <rect x={TX.x} y={TX.y} width={TX.w} height={TX.h} rx={28} fill="rgba(255,255,255,0.05)" stroke={C.mute} strokeWidth={4} />
        <clipPath id="tankClip"><rect x={TX.x + 6} y={TX.y + 6} width={TX.w - 12} height={TX.h - 12} rx={22} /></clipPath>
        <g clipPath="url(#tankClip)">
          <rect x={TX.x} y={TX.y + TX.h - TX.h * level} width={TX.w} height={TX.h * level + 10} fill={liquid} opacity={0.95} />
          <rect x={TX.x} y={TX.y + TX.h - TX.h * level} width={TX.w} height={8} fill="#fff" opacity={0.35} />
        </g>
        <line x1={TX.x - 14} y1={TX.y + TX.h * (1 - PAYROLL)} x2={TX.x + TX.w + 14} y2={TX.y + TX.h * (1 - PAYROLL)} stroke={C.red} strokeWidth={5} strokeDasharray="14 10" />
        <text x={TX.x - 14} y={TX.y + TX.h * (1 - PAYROLL) + 9} textAnchor="end" fontFamily={FONT.text} fontWeight={900} fontSize={26} letterSpacing={3} fill={C.red} opacity={prog(t, 10, 12)}>{COPY.payrollLine}</text>
        <text x={795} y={1010} textAnchor="middle" fontFamily={FONT.text} fontWeight={800} fontSize={30} letterSpacing={4} fill={C.mute2}>CASH BALANCE</text>
        {BEATS.map((b, i) => {
          const p = prog(t, b + 2, 22, easeInOut);
          if (t < b + 2 || p >= 1) return null;
          return <g key={i} transform={`translate(${905 + p * 90} ${900 + p * 150 - Math.sin(Math.PI * p) * 50}) scale(${0.9 - 0.3 * p})`} opacity={1 - p}><Coin r={26} tone="red" /></g>;
        })}
        {level < PAYROLL ? <g transform="translate(795 1100)" opacity={prog(t, BEATS[6], 10)}><text textAnchor="middle" fontFamily={FONT.display} fontWeight={900} fontSize={42} fill={C.red}>BELOW PAYROLL</text></g> : null}
      </svg>
    </AbsoluteFill>
  );
};
const easeIn = (x: number) => x * x;
