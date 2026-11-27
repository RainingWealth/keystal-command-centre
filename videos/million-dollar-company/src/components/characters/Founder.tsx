import React from 'react';
import {C} from '../../config/theme';
import {hexMix} from '../../lib/anim';

export type FounderLook = {
  smile?: number; // -1 (frown) .. 1 (broad smile)
  worry?: number; // 0..1  raised inner brows, tension
  open?: number; // 0..1 eye openness (blink)
  gx?: number; gy?: number; // gaze offset
  tilt?: number; // head tilt (deg)
  dim?: number; // 0..1 darken for night
  rim?: string; rimOpacity?: number; // rim light colour
  glow?: string; glowOpacity?: number; // screen light on the lower face
  sweat?: number; // 0..1
};

/** The founder's head. Local origin = head centre; head is ~144 wide, ~205 tall. */
export const FounderHead: React.FC<FounderLook> = ({smile = 0.6, worry = 0, open = 1, gx = 0, gy = 0, tilt = 0, dim = 0, rim, rimOpacity = 0.55, glow, glowOpacity = 0, sweat = 0}) => {
  const uid = React.useId().replace(/:/g, '');
  const d = (c: string) => (dim ? hexMix(c, '#0A1020', dim) : c);
  const skin = d(C.skin), shade = d(C.skinShade), hair = d(C.hair), grey = d(C.grey);
  const FACE = 'M -72 -30 C -72 -92 -42 -112 0 -112 C 42 -112 72 -92 72 -30 C 72 20 66 52 46 72 C 30 88 12 94 0 94 C -12 94 -30 88 -46 72 C -66 52 -72 20 -72 -30 Z';
  const eye = (cx: number, sign: number) => {
    const o = Math.max(0.06, open) * (1 + worry * 0.18);
    const almond = `M ${cx - 13} -10 Q ${cx} ${-10 - 9 * o} ${cx + 13} -10 Q ${cx} ${-10 + 6.5 * o} ${cx - 13} -10 Z`;
    const id = `eye${sign > 0 ? 'R' : 'L'}${uid}`;
    return (
      <g key={id}>
        <clipPath id={id}><path d={almond} /></clipPath>
        <path d={almond} fill={d('#F4EFEA')} />
        <g clipPath={`url(#${id})`}>
          <circle cx={cx + gx} cy={-10 + gy} r={6} fill={d('#2B1F1B')} />
          <circle cx={cx + gx + 1.8} cy={-12 + gy} r={1.6} fill="#fff" opacity={0.9} />
        </g>
        <path d={`M ${cx - 14} -10 Q ${cx} ${-10 - 10 * o} ${cx + 14} -10`} stroke={d('#3A2A24')} strokeWidth={2.6} fill="none" strokeLinecap="round" />
      </g>
    );
  };
  const w = worry;
  const browL = `M -51 ${-31 + 3 * w} Q -33 ${-42 - 2 * w} -14 ${-34 - 10 * w}`;
  const browR = `M 51 ${-31 + 3 * w} Q 33 ${-42 - 2 * w} 14 ${-34 - 10 * w}`;
  const s = smile;
  const mouth = s >= 0 ? `M -22 45 Q 0 ${45 + 17 * s} 22 45` : `M -18 50 Q 0 ${50 + 15 * s} 18 50`;
  return (
    <g transform={`rotate(${tilt})`}>
      {/* ears */}
      <ellipse cx={-73} cy={-6} rx={10} ry={19} fill={shade} />
      <ellipse cx={73} cy={-6} rx={10} ry={19} fill={shade} />
      {/* face */}
      <path d="M -72 -30 C -72 -92 -42 -112 0 -112 C 42 -112 72 -92 72 -30 C 72 20 66 52 46 72 C 30 88 12 94 0 94 C -12 94 -30 88 -46 72 C -66 52 -72 20 -72 -30 Z" fill={skin} />
      <path d="M -46 72 C -30 88 -12 94 0 94 C 12 94 30 88 46 72 C 36 82 20 88 0 88 C -20 88 -36 82 -46 72 Z" fill={shade} opacity={0.55} />
      <clipPath id={`face${uid}`}><path d={FACE} /></clipPath>
      <clipPath id={`right${uid}`}><rect x={40} y={-120} width={60} height={230} /></clipPath>
      {rim ? (
        <g clipPath={`url(#face${uid})`}><g clipPath={`url(#right${uid})`}><path d={FACE} stroke={rim} strokeWidth={9} fill="none" opacity={rimOpacity} /></g></g>
      ) : null}
      {/* screen glow on the lower face (soft radial, clipped to the face) */}
      {glow ? (
        <g clipPath={`url(#face${uid})`}>
          <radialGradient id={`glow${uid}`} cx="50%" cy="100%" r="75%" gradientUnits="objectBoundingBox">
            <stop offset="0" stopColor={glow} stopOpacity={glowOpacity} />
            <stop offset="1" stopColor={glow} stopOpacity={0} />
          </radialGradient>
          <rect x={-80} y={-120} width={160} height={220} fill={`url(#glow${uid})`} />
        </g>
      ) : null}
      {/* hair */}
      <path d="M -76 -36 C -84 -98 -44 -130 2 -130 C 48 -130 86 -100 76 -36 C 70 -62 56 -80 30 -85 C 6 -90 -30 -82 -52 -71 C -63 -66 -71 -54 -76 -36 Z" fill={hair} />
      <path d="M -60 -96 C -34 -118 20 -122 52 -100" stroke="#2E3442" strokeWidth={4} fill="none" opacity={0.7} strokeLinecap="round" />
      <path d="M -76 -38 C -78 -58 -69 -70 -57 -75 C -58 -62 -62 -50 -67 -38 Z" fill={grey} />
      <path d="M 76 -38 C 78 -58 69 -70 57 -75 C 58 -62 62 -50 67 -38 Z" fill={grey} />
      {/* forehead worry lines */}
      {w > 0.05 ? <g stroke={shade} strokeWidth={2.4} fill="none" opacity={w * 0.55} strokeLinecap="round"><path d="M -26 -64 Q 0 -70 26 -64" /><path d="M -18 -55 Q 0 -59 18 -55" /></g> : null}
      {/* brows */}
      <path d={browL} stroke={hair} strokeWidth={6} fill="none" strokeLinecap="round" />
      <path d={browR} stroke={hair} strokeWidth={6} fill="none" strokeLinecap="round" />
      {eye(-30, -1)}
      {eye(30, 1)}
      {/* under-eye tiredness */}
      {w > 0.3 ? <g stroke={shade} strokeWidth={2.4} fill="none" opacity={w * 0.6} strokeLinecap="round"><path d="M -44 2 Q -30 10 -16 3" /><path d="M 16 3 Q 30 10 44 2" /></g> : null}
      {/* glasses */}
      <g stroke={d('#262D3B')} strokeWidth={3.6} fill="none">
        <rect x={-55} y={-27} width={47} height={33} rx={10} fill="rgba(200,230,255,0.10)" />
        <rect x={8} y={-27} width={47} height={33} rx={10} fill="rgba(200,230,255,0.10)" />
        <path d="M -8 -14 Q 0 -19 8 -14" />
        <path d="M -55 -17 L -73 -14" />
        <path d="M 55 -17 L 73 -14" />
      </g>
      <path d="M -49 -22 L -38 -22 M 14 -22 L 25 -22" stroke="#fff" strokeWidth={2.4} opacity={0.35} strokeLinecap="round" />
      {/* nose + smile lines */}
      <path d="M 1 -4 C 5 12 9 22 5 28 Q 0 31 -7 28" stroke={shade} strokeWidth={3} fill="none" strokeLinecap="round" />
      <path d="M -27 20 Q -31 34 -24 46 M 27 20 Q 31 34 24 46" stroke={shade} strokeWidth={2.2} fill="none" opacity={0.45} strokeLinecap="round" />
      {/* mouth */}
      <path d={mouth} stroke={d('#8E4A43')} strokeWidth={4.4} fill="none" strokeLinecap="round" />
      {s > 0.35 ? <path d={`M -26 41 q 2 5 6 6 M 26 41 q -2 5 -6 6`} stroke={shade} strokeWidth={2} fill="none" opacity={0.6} strokeLinecap="round" /> : null}
      {sweat > 0.02 ? (
        <path d="M 62 -60 q 7 12 0 20 q -9 -4 0 -20 Z" fill={C.cyanSoft} opacity={sweat * 0.9} />
      ) : null}
    </g>
  );
};

/** Head + shoulders. Origin = head centre. ~500 wide. */
export const FounderBust: React.FC<FounderLook & {breathe?: number}> = ({breathe = 0, ...look}) => {
  const dim = look.dim ?? 0;
  const d = (c: string) => (dim ? hexMix(c, '#0A1020', dim) : c);
  return (
    <g>
      <g transform={`translate(0 ${breathe})`}>
        <path d="M -250 340 C -250 250 -190 205 -110 185 L -44 160 L 44 160 L 110 185 C 190 205 250 250 250 340 Z" fill={d(C.blazer)} />
        <path d="M -44 150 L 44 150 L 0 300 Z" fill={d(C.shirt)} />
        <path d="M -46 152 L -98 194 L -72 300 L 0 304 Z" fill={d('#25365A')} />
        <path d="M 46 152 L 98 194 L 72 300 L 0 304 Z" fill={d('#25365A')} />
        <path d="M -50 148 L -10 156 L -40 196 Z" fill={d('#E8F1FA')} />
        <path d="M 50 148 L 10 156 L 40 196 Z" fill={d('#E8F1FA')} />
        {look.rim ? <path d="M 110 186 C 190 206 246 250 250 336" stroke={look.rim} strokeWidth={5} fill="none" opacity={(look.rimOpacity ?? 0.5) * 0.8} strokeLinecap="round" /> : null}
        <rect x={-28} y={70} width={56} height={92} rx={22} fill={d(C.skinShade)} />
        <path d="M -28 100 Q 0 128 28 100 L 28 88 L -28 88 Z" fill={d('#A9744F')} opacity={0.5} />
      </g>
      <g transform={`translate(0 ${breathe * 0.6})`}>
        <FounderHead {...look} />
      </g>
    </g>
  );
};

/** Full figure, origin = feet centre, ~565 tall. */
export const FounderStanding: React.FC<FounderLook & {arms?: 'cross' | 'pockets'; sway?: number}> = ({arms = 'cross', sway = 0, ...look}) => {
  const dim = look.dim ?? 0;
  const d = (c: string) => (dim ? hexMix(c, '#0A1020', dim) : c);
  const blazer = d(C.blazer), blazerHi = d('#2A3C63');
  return (
    <g transform={`rotate(${sway} 0 0)`}>
      {/* legs + shoes */}
      <path d="M -52 -296 L -6 -296 L -10 -20 L -48 -20 Z" fill={d(C.trouser)} />
      <path d="M 6 -296 L 52 -296 L 48 -20 L 10 -20 Z" fill={d(C.trouser)} />
      <ellipse cx={-30} cy={-9} rx={32} ry={12} fill={d('#0E131C')} />
      <ellipse cx={30} cy={-9} rx={32} ry={12} fill={d('#0E131C')} />
      {/* jacket */}
      <path d="M -80 -440 C -96 -430 -96 -400 -92 -360 L -84 -268 L 84 -268 L 92 -360 C 96 -400 96 -430 80 -440 L 38 -454 L -38 -454 Z" fill={blazer} />
      <path d="M -24 -454 L 0 -352 L 24 -454 Z" fill={d(C.shirt)} />
      <path d="M -26 -454 L -52 -430 L -38 -340 L 0 -346 Z" fill={blazerHi} />
      <path d="M 26 -454 L 52 -430 L 38 -340 L 0 -346 Z" fill={blazerHi} />
      <rect x={-14} y={-476} width={28} height={28} rx={10} fill={d(C.skinShade)} />
      {look.rim ? <path d="M 80 -440 C 96 -430 96 -400 92 -360 L 86 -272" stroke={look.rim} strokeWidth={5} fill="none" opacity={look.rimOpacity ?? 0.5} strokeLinecap="round" /> : null}
      {/* head */}
      <g transform="translate(0 -512) scale(0.52)"><FounderHead {...look} /></g>
      {/* arms */}
      {arms === 'cross' ? (
        <g strokeLinecap="round" fill="none">
          <path d="M -80 -428 L -86 -352" stroke={blazer} strokeWidth={34} />
          <path d="M -86 -352 L 44 -374" stroke={blazerHi} strokeWidth={30} />
          <path d="M 80 -428 L 86 -352" stroke={blazer} strokeWidth={34} />
          <path d="M 86 -352 L -46 -350" stroke={blazer} strokeWidth={30} />
          <path d="M 86 -352 L -46 -350" stroke="#2D426E" strokeWidth={4} opacity={0.6} transform="translate(0 -12)" />
          <ellipse cx={-52} cy={-352} rx={15} ry={12} fill={d(C.skin)} stroke="none" />
          <ellipse cx={52} cy={-374} rx={15} ry={12} fill={d(C.skin)} stroke="none" />
          <path d="M -74 -352 L -66 -352 M 62 -374 L 70 -372" stroke={d('#E8F1FA')} strokeWidth={5} />
        </g>
      ) : (
        <g strokeLinecap="round" fill="none">
          <path d="M -80 -428 L -92 -346" stroke={blazer} strokeWidth={34} />
          <path d="M -92 -346 L -76 -286" stroke={blazerHi} strokeWidth={30} />
          <path d="M 80 -428 L 92 -346" stroke={blazer} strokeWidth={34} />
          <path d="M 92 -346 L 76 -286" stroke={blazerHi} strokeWidth={30} />
          <ellipse cx={-74} cy={-276} rx={13} ry={10} fill={d(C.skin)} stroke="none" />
          <ellipse cx={74} cy={-276} rx={13} ry={10} fill={d(C.skin)} stroke="none" />
        </g>
      )}
    </g>
  );
};
