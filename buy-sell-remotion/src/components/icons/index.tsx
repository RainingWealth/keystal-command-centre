import React from 'react';
import {C, FONT_DISPLAY, FONT_TEXT} from '../../styles/theme';

type G = {x: number; y: number; size: number; color?: string; opacity?: number; rotate?: number; scale?: number};
const wrap = (p: G, children: React.ReactNode) => (
  <g transform={`translate(${p.x} ${p.y}) rotate(${p.rotate ?? 0}) scale(${p.scale ?? 1})`} opacity={p.opacity ?? 1}>
    {children}
  </g>
);

/** Partner bust. size = height of the bust box. */
export const Person: React.FC<G & {stroke?: string; sw?: number; fill?: string}> = (p) => {
  const s = p.size;
  const color = p.color ?? C.off;
  return wrap(
    p,
    <g fill={p.fill ?? color} stroke={p.stroke ?? 'none'} strokeWidth={p.sw ?? 0}>
      <circle cx={0} cy={-0.2 * s} r={0.2 * s} />
      <path d={`M ${-0.4 * s} ${0.5 * s} C ${-0.4 * s} ${0.08 * s}, ${-0.2 * s} ${0.04 * s}, 0 ${0.04 * s} C ${0.2 * s} ${0.04 * s}, ${0.4 * s} ${0.08 * s}, ${0.4 * s} ${0.5 * s} Z`} />
    </g>,
  );
};

export const Family: React.FC<G & {fill?: string; stroke?: string; sw?: number}> = (p) => {
  const s = p.size;
  return wrap(
    p,
    <g>
      <Person x={-0.36 * s} y={0.06 * s} size={0.78 * s} color={p.color} fill={p.fill} stroke={p.stroke} sw={p.sw} />
      <Person x={0.36 * s} y={0.06 * s} size={0.78 * s} color={p.color} fill={p.fill} stroke={p.stroke} sw={p.sw} />
      <Person x={0} y={0.2 * s} size={0.56 * s} color={p.color} fill={p.fill} stroke={p.stroke} sw={p.sw} />
    </g>,
  );
};

/** Document with folded corner and text rules (estate / agreement). */
export const DocIcon: React.FC<G & {lines?: number; seal?: boolean; fill?: string}> = (p) => {
  const s = p.size;
  const color = p.color ?? C.off;
  const w = 0.74 * s;
  const h = 0.96 * s;
  const lines = p.lines ?? 3;
  return wrap(
    p,
    <g>
      <path
        d={`M ${-w / 2} ${-h / 2} H ${w / 2 - 0.22 * s} L ${w / 2} ${-h / 2 + 0.22 * s} V ${h / 2} H ${-w / 2} Z`}
        fill={p.fill ?? 'none'}
        stroke={color}
        strokeWidth={0.045 * s}
        strokeLinejoin="round"
      />
      <path d={`M ${w / 2 - 0.22 * s} ${-h / 2} V ${-h / 2 + 0.22 * s} H ${w / 2}`} fill="none" stroke={color} strokeWidth={0.045 * s} strokeLinejoin="round" />
      {Array.from({length: lines}).map((_, i) => (
        <line key={i} x1={-w / 2 + 0.12 * s} x2={w / 2 - (i === lines - 1 ? 0.3 : 0.14) * s} y1={-0.12 * s + i * 0.17 * s} y2={-0.12 * s + i * 0.17 * s} stroke={color} strokeWidth={0.04 * s} strokeLinecap="round" />
      ))}
      {p.seal && <circle cx={w / 2 - 0.2 * s} cy={h / 2 - 0.2 * s} r={0.1 * s} fill={color} />}
    </g>,
  );
};

export const Building: React.FC<G> = (p) => {
  const s = p.size;
  const color = p.color ?? C.off;
  return wrap(
    p,
    <g fill="none" stroke={color} strokeWidth={0.05 * s} strokeLinejoin="round">
      <rect x={-0.3 * s} y={-0.5 * s} width={0.6 * s} height={s} />
      {[-0.3, -0.1, 0.1].map((yy) =>
        [-0.13, 0.13].map((xx) => <rect key={`${xx}${yy}`} x={xx * s - 0.05 * s} y={yy * s} width={0.1 * s} height={0.1 * s} fill={color} stroke="none" />),
      )}
      <rect x={-0.07 * s} y={0.3 * s} width={0.14 * s} height={0.2 * s} fill={color} stroke="none" />
    </g>,
  );
};

export const ShieldIcon: React.FC<G & {check?: number; fill?: string}> = (p) => {
  const s = p.size;
  const color = p.color ?? C.teal;
  return wrap(
    p,
    <g>
      <path
        d={`M 0 ${-0.5 * s} L ${0.4 * s} ${-0.36 * s} V ${0.04 * s} C ${0.4 * s} ${0.3 * s}, ${0.2 * s} ${0.44 * s}, 0 ${0.52 * s} C ${-0.2 * s} ${0.44 * s}, ${-0.4 * s} ${0.3 * s}, ${-0.4 * s} ${0.04 * s} V ${-0.36 * s} Z`}
        fill={p.fill ?? 'none'}
        stroke={color}
        strokeWidth={0.06 * s}
        strokeLinejoin="round"
      />
      {(p.check ?? 1) > 0 && (
        <path
          d={`M ${-0.17 * s} 0 L ${-0.04 * s} ${0.13 * s} L ${0.2 * s} ${-0.13 * s}`}
          fill="none"
          stroke={color}
          strokeWidth={0.07 * s}
          strokeLinecap="round"
          strokeLinejoin="round"
          pathLength={1}
          strokeDasharray={1}
          strokeDashoffset={1 - (p.check ?? 1)}
        />
      )}
    </g>,
  );
};

export const CheckMark: React.FC<G & {progress?: number; sw?: number}> = (p) => {
  const s = p.size;
  return wrap(
    p,
    <path
      d={`M ${-0.4 * s} ${0.02 * s} L ${-0.12 * s} ${0.3 * s} L ${0.42 * s} ${-0.3 * s}`}
      fill="none"
      stroke={p.color ?? C.teal}
      strokeWidth={p.sw ?? 0.16 * s}
      strokeLinecap="round"
      strokeLinejoin="round"
      pathLength={1}
      strokeDasharray={1}
      strokeDashoffset={1 - (p.progress ?? 1)}
    />,
  );
};

export const Coin: React.FC<G & {label?: string}> = (p) => {
  const s = p.size;
  const color = p.color ?? C.teal;
  return wrap(
    p,
    <g>
      <circle r={0.5 * s} fill={color} />
      <circle r={0.4 * s} fill="none" stroke={C.deep} strokeOpacity={0.35} strokeWidth={0.04 * s} />
      <text textAnchor="middle" dominantBaseline="central" y={0.02 * s} fontFamily={FONT_DISPLAY} fontWeight={900} fontSize={0.52 * s} fill={C.deep}>
        {p.label ?? '$'}
      </text>
    </g>,
  );
};

/** A share of ownership drawn as a pie-wedge token. */
export const ShareToken: React.FC<G & {pct?: number}> = (p) => {
  const s = p.size;
  const color = p.color ?? C.cobaltLight;
  const pct = p.pct ?? 0.5;
  const a = pct * Math.PI * 2;
  const r = 0.5 * s;
  const x = r * Math.sin(a);
  const y = -r * Math.cos(a);
  return wrap(
    p,
    <g>
      <circle r={r} fill="rgba(7,18,38,0.85)" stroke={color} strokeWidth={0.06 * s} />
      <path d={`M 0 0 L 0 ${-r * 0.82} A ${r * 0.82} ${r * 0.82} 0 ${pct > 0.5 ? 1 : 0} 1 ${x * 0.82} ${y * 0.82} Z`} fill={color} />
    </g>,
  );
};

export const Gear: React.FC<G> = (p) => {
  const s = p.size;
  const color = p.color ?? C.off;
  return wrap(
    p,
    <g fill={color}>
      {Array.from({length: 8}).map((_, i) => (
        <rect key={i} x={-0.07 * s} y={-0.5 * s} width={0.14 * s} height={0.22 * s} rx={0.02 * s} transform={`rotate(${i * 45})`} />
      ))}
      <circle r={0.36 * s} />
      <circle r={0.15 * s} fill={C.navy} />
    </g>,
  );
};

export const Bubble: React.FC<{x: number; y: number; w: number; h: number; text: string; color: string; textColor?: string; opacity?: number; scale?: number; tail?: 'left' | 'right' | 'down'; size?: number}> = ({
  x,
  y,
  w,
  h,
  text,
  color,
  textColor = C.deep,
  opacity = 1,
  scale = 1,
  tail = 'down',
  size = 30,
}) => (
  <g transform={`translate(${x} ${y}) scale(${scale})`} opacity={opacity}>
    <rect x={-w / 2} y={-h / 2} width={w} height={h} rx={h / 2} fill={color} />
    {tail === 'down' && <path d={`M ${-14} ${h / 2 - 2} L 0 ${h / 2 + 16} L ${14} ${h / 2 - 2} Z`} fill={color} />}
    {tail === 'left' && <path d={`M ${-w / 2 + 6} ${h / 2 - 8} L ${-w / 2 - 14} ${h / 2 + 12} L ${-w / 2 + 34} ${h / 2 - 4} Z`} fill={color} />}
    <text textAnchor="middle" dominantBaseline="central" fontFamily={FONT_TEXT} fontWeight={700} fontSize={size} letterSpacing="0.06em" fill={textColor}>
      {text}
    </text>
  </g>
);

export const Cross: React.FC<G & {progress?: number}> = (p) => {
  const s = p.size;
  const pr = p.progress ?? 1;
  return wrap(
    p,
    <g stroke={p.color ?? C.red} strokeWidth={0.12 * s} strokeLinecap="round">
      <line x1={-0.5 * s} y1={-0.5 * s} x2={-0.5 * s + s * pr} y2={-0.5 * s + s * pr} />
      <line x1={0.5 * s} y1={-0.5 * s} x2={0.5 * s - s * pr} y2={-0.5 * s + s * pr} />
    </g>,
  );
};
