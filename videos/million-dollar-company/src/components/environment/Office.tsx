import React from 'react';
import {C, FONT, H, W} from '../../config/theme';
import {Camera, Layer} from '../Camera';
import {PAL, Skyline, Variant} from './Skyline';
import {Worker, WORKERS} from '../characters/Worker';
import {sgdShort, FIG} from '../../config/figures';
import {easeOut, prog} from '../../lib/anim';

export const WALL = {x: 120, y: 866, w: 840, h: 226}; // wall dashboard rectangle (stage coords)
export const STAFF_X = [140, 390, 640, 930];
export const MON_Y = 1196;

const Shell = React.memo(({variant}: {variant: Variant}) => {
  const p = PAL[variant];
  const night = variant === 'night';
  return (
    <g>
      {/* ceiling + beams */}
      <rect x={-400} y={-400} width={1900} height={650} fill={p.ceil} />
      {[110, 170, 224].map((y, i) => <rect key={i} x={-400} y={y} width={1900} height={i === 2 ? 3 : 7} fill={night ? '#1A2B48' : '#F4FAFF'} opacity={night ? 0.5 : 0.18 + i * 0.05} />)}
      {/* window frame: pillars + mullions + sill */}
      <rect x={-400} y={250} width={430} height={620} fill={p.wall} />
      <rect x={1050} y={250} width={430} height={620} fill={p.wall} />
      <rect x={350} y={250} width={30} height={620} fill={p.wall} />
      <rect x={700} y={250} width={30} height={620} fill={p.wall} />
      <rect x={-400} y={250} width={1900} height={22} fill={p.ceil} />
      <rect x={-400} y={846} width={1900} height={26} fill={p.wallHi} />
      {/* glass sheen */}
      <g opacity={night ? 0.08 : 0.16} fill="#fff">
        <path d="M 60 272 L 140 272 L 20 846 L -60 846 Z" /><path d="M 410 272 L 490 272 L 370 846 L 290 846 Z" /><path d="M 760 272 L 840 272 L 720 846 L 640 846 Z" />
      </g>
      {/* back wall */}
      <rect x={-400} y={872} width={1900} height={470} fill={p.wall} />
      <rect x={-400} y={1300} width={1900} height={42} fill={p.wallHi} />
      {[0, 1, 2, 3, 4, 5].map((i) => <rect key={i} x={-300 + i * 330} y={872} width={3} height={430} fill="#000" opacity={0.18} />)}
      {/* floor */}
      <defs>
        <linearGradient id={`floor-${variant}`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor={p.floorHi} /><stop offset="1" stopColor={p.floor} /></linearGradient>
      </defs>
      <rect x={-400} y={1342} width={1900} height={1100} fill={`url(#floor-${variant})`} />
      {Array.from({length: 11}).map((_, i) => <line key={i} x1={540} y1={1342} x2={540 + (i - 5) * 420} y2={2300} stroke="#fff" strokeWidth={2} opacity={0.045} />)}
      {[1400, 1480, 1590, 1740, 1930].map((y) => <line key={y} x1={-400} y1={y} x2={1480} y2={y} stroke="#fff" strokeWidth={2} opacity={0.04} />)}
      {/* daylight shafts across the floor */}
      {!night ? (
        <g fill={variant === 'dawn' ? '#FFD2A0' : '#E8FAFF'} opacity={variant === 'dawn' ? 0.1 : 0.08}>
          <path d="M 40 1342 L 340 1342 L 700 2000 L 120 2000 Z" /><path d="M 390 1342 L 690 1342 L 1180 2000 L 560 2000 Z" /><path d="M 740 1342 L 1040 1342 L 1660 2000 L 1000 2000 Z" />
        </g>
      ) : null}
    </g>
  );
});

/** Wall-mounted financial dashboard. `t` is a frame count that drives the build-in. */
export const WallDashboard: React.FC<{t: number; on?: number}> = ({t, on = 1}) => {
  const {x, y, w, h} = WALL;
  const grow = (i: number) => prog(t, 20 + i * 5, 34, easeOut);
  const bars = [0.18, 0.22, 0.3, 0.28, 0.4, 0.46, 0.55, 0.5, 0.66, 0.74, 0.84, 1];
  const linePts = bars.map((b, i) => `${640 + i * 16},${h - 30 - b * 120 * grow(i)}`).join(' ');
  return (
    <g transform={`translate(${x} ${y})`} opacity={0.35 + 0.65 * on}>
      <rect x={-10} y={-10} width={w + 20} height={h + 20} rx={20} fill="#0A111E" />
      <rect width={w} height={h} rx={14} fill="#0F1A2E" stroke="#2A3F5E" strokeWidth={3} />
      <rect x={0} y={0} width={w} height={40} rx={14} fill="#16253F" />
      <rect x={0} y={26} width={w} height={14} fill="#16253F" />
      {[0, 1, 2].map((i) => <circle key={i} cx={24 + i * 20} cy={20} r={5} fill={[C.red, C.amber, C.cyan][i]} opacity={0.9} />)}
      <text x={w - 24} y={27} textAnchor="end" fontFamily={FONT.text} fontWeight={700} fontSize={16} letterSpacing={3} fill={C.mute}>FINANCE  ·  LIVE</text>
      <rect x={20} y={58} width={230} height={150} rx={12} fill="#13233D" />
      <text x={38} y={90} fontFamily={FONT.text} fontWeight={700} fontSize={15} letterSpacing={2.5} fill={C.mute2}>REVENUE</text>
      <text x={38} y={146} fontFamily={FONT.display} fontWeight={800} fontSize={58} fill={C.white} letterSpacing={-1.5}>{sgdShort(FIG.revenue)}</text>
      <path d="M 38 198 L 80 190 L 120 194 L 160 180 L 200 172 L 232 158" stroke={C.cyan} strokeWidth={5} fill="none" strokeLinecap="round" strokeDasharray="260" strokeDashoffset={260 * (1 - prog(t, 30, 50))} />
      <rect x={270} y={58} width={340} height={150} rx={12} fill="#13233D" />
      {bars.map((b, i) => <rect key={i} x={288 + i * 26} y={190 - b * 110 * grow(i)} width={16} height={b * 110 * grow(i)} rx={4} fill={i === 11 ? C.cyan : '#3C7F94'} />)}
      <rect x={630} y={58} width={190} height={150} rx={12} fill="#13233D" />
      <text x={646} y={86} fontFamily={FONT.text} fontWeight={700} fontSize={15} letterSpacing={2.5} fill={C.mute2}>ORDERS</text>
      <polyline points={linePts} fill="none" stroke={C.amber} strokeWidth={4} strokeLinejoin="round" strokeLinecap="round" />
    </g>
  );
};

/** Back-of-monitor + staff. `typing` drives subtle motion; `staff` toggles people (night = empty). */
const DeskRow: React.FC<{t: number; staff: boolean; variant: Variant}> = ({t, staff, variant}) => {
  const dim = variant === 'night' ? 0.55 : 0;
  const lit = variant !== 'night';
  return (
    <g>
      {STAFF_X.map((x, i) => (
        <g key={i}>
          {staff ? <g transform={`translate(${x} 1132) scale(0.95)`}><Worker look={WORKERS[i]} t={t} phase={i} dim={dim} /></g> : (
            <g transform={`translate(${x} 1190)`}><rect x={-36} y={-30} width={72} height={90} rx={18} fill="#0E1626" opacity={0.9} /></g>
          )}
          <g transform={`translate(${x} ${MON_Y})`}>
            <rect x={-90} y={-8} width={180} height={116} rx={10} fill="#18233A" />
            <rect x={-84} y={-2} width={168} height={104} rx={7} fill="#1E2C47" />
            {lit ? <rect x={-92} y={-10} width={184} height={120} rx={11} fill="none" stroke={C.cyan} strokeWidth={2} opacity={0.22} /> : null}
            <circle cx={0} cy={92} r={3.2} fill={lit ? C.cyan : '#1E2C47'} opacity={0.9} />
            <rect x={-16} y={108} width={32} height={26} fill="#121B2D" />
          </g>
        </g>
      ))}
      <rect x={-400} y={1316} width={1900} height={30} fill="#33445F" />
      <rect x={-400} y={1316} width={1900} height={4} fill="#5C7192" opacity={0.7} />
      <rect x={-400} y={1346} width={1900} height={150} fill="#16213A" />
      <rect x={-400} y={1346} width={1900} height={10} fill="#000" opacity={0.25} />
    </g>
  );
};

const Plant: React.FC<{x: number; y: number; s: number; sway: number; dim?: number}> = ({x, y, s, sway, dim = 0}) => (
  <g transform={`translate(${x} ${y}) scale(${s})`} opacity={1 - dim * 0.35}>
    <path d="M -46 0 L 46 0 L 38 120 L -38 120 Z" fill="#E9EEF6" /><path d="M -46 0 L 46 0 L 44 18 L -44 18 Z" fill="#C5CEDB" />
    {[-52, -26, 0, 26, 52].map((a, i) => (
      <g key={i} transform={`rotate(${a + Math.sin(sway / 40 + i) * 1.2})`}>
        <path d="M 0 0 C -30 -80 -22 -190 0 -250 C 22 -190 30 -80 0 0 Z" fill={i % 2 ? '#2F9C8C' : '#1F7A72'} />
        <path d="M 0 0 L 0 -230" stroke="#0F4F4C" strokeWidth={3} opacity={0.5} />
      </g>
    ))}
  </g>
);

export type OfficeProps = {
  variant: Variant; cam: {cx: number; cy: number; z: number}; t: number; staff?: boolean; dashT?: number; dashOn?: number;
  actors?: React.ReactNode; fg?: React.ReactNode; wallExtra?: React.ReactNode; hidePlant?: boolean;
};

export const OfficeWorld: React.FC<OfficeProps> = ({variant, cam, t, staff = true, dashT = 0, dashOn = 1, actors, fg, wallExtra, hidePlant}) => (
  <Camera {...cam}>
    <Layer depth={0.22}><svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} style={{overflow: 'visible'}}><Skyline variant={variant} /></svg></Layer>
    <Layer depth={0.7}>
      <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} style={{overflow: 'visible'}}>
        <Shell variant={variant} />
        <WallDashboard t={dashT} on={dashOn} />
        {wallExtra}
      </svg>
    </Layer>
    <Layer depth={0.9}><svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} style={{overflow: 'visible'}}><DeskRow t={t} staff={staff} variant={variant} /></svg></Layer>
    <Layer depth={1}><svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} style={{overflow: 'visible'}}>{actors}</svg></Layer>
    <Layer depth={1.4}>
      <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} style={{overflow: 'visible'}}>
        {hidePlant ? null : <Plant x={90} y={1560} s={1.25} sway={t} dim={variant === 'night' ? 1 : 0} />}
        {fg}
      </svg>
    </Layer>
  </Camera>
);
