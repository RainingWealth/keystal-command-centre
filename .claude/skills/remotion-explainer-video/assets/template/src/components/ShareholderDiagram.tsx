import React from 'react';
import {C} from '../styles/theme';

export type DonutSeg = {
  pct: number; // 0..100
  color: string;
  opacity?: number;
  hollow?: boolean; // dashed outline only
  hollowColor?: string;
  dashOffset?: number; // animates the dashed outline
};

const polar = (cx: number, cy: number, r: number, deg: number) => {
  const a = (deg * Math.PI) / 180;
  return [cx + r * Math.sin(a), cy - r * Math.cos(a)] as const;
};

/** Annular sector path (angles in degrees clockwise from 12 o'clock). */
export const sectorPath = (cx: number, cy: number, r0: number, r1: number, a0: number, a1: number) => {
  const [x0, y0] = polar(cx, cy, r1, a0);
  const [x1, y1] = polar(cx, cy, r1, a1);
  const [x2, y2] = polar(cx, cy, r0, a1);
  const [x3, y3] = polar(cx, cy, r0, a0);
  const large = a1 - a0 > 180 ? 1 : 0;
  return `M ${x0} ${y0} A ${r1} ${r1} 0 ${large} 1 ${x1} ${y1} L ${x2} ${y2} A ${r0} ${r0} 0 ${large} 0 ${x3} ${y3} Z`;
};

/**
 * Company ownership donut. Segments run clockwise from 12 o'clock.
 * `draw` (0..1) sweeps the solid segments in. Children render in the donut centre.
 */
export const ShareholderDonut: React.FC<{
  cx: number;
  cy: number;
  r: number;
  thickness: number;
  segments: DonutSeg[];
  draw?: number;
  gap?: number;
  children?: React.ReactNode;
}> = ({cx, cy, r, thickness, segments, draw = 1, gap = 1.2, children}) => {
  let cum = 0;
  const r0 = r - thickness / 2;
  const r1 = r + thickness / 2;
  return (
    <g>
      <circle cx={cx} cy={cy} r={r} fill="none" stroke="rgba(244,241,234,0.06)" strokeWidth={thickness} />
      {segments.map((seg, i) => {
        const start = cum;
        cum += seg.pct;
        if (seg.hollow) {
          const a0 = (start / 100) * 360 + (gap / 100) * 180;
          const a1 = ((start + seg.pct) / 100) * 360 - (gap / 100) * 180;
          return (
            <path
              key={i}
              d={sectorPath(cx, cy, r0, r1, a0, a1)}
              fill={seg.hollowColor ?? C.orange}
              fillOpacity={0.1 * (seg.opacity ?? 1)}
              stroke={seg.hollowColor ?? C.orange}
              strokeOpacity={seg.opacity ?? 1}
              strokeWidth={4}
              strokeDasharray="14 12"
              strokeDashoffset={seg.dashOffset ?? 0}
              strokeLinejoin="round"
            />
          );
        }
        const vis = Math.max(0, Math.min(seg.pct - gap, draw * 100 - start - gap / 2));
        return (
          <circle
            key={i}
            cx={cx}
            cy={cy}
            r={r}
            fill="none"
            stroke={seg.color}
            strokeOpacity={seg.opacity ?? 1}
            strokeWidth={thickness}
            pathLength={100}
            strokeDasharray={`${vis} ${100 - vis}`}
            strokeDashoffset={-(start + gap / 2)}
            transform={`rotate(-90 ${cx} ${cy})`}
          />
        );
      })}
      {children}
    </g>
  );
};
