import React from 'react';
import {C} from '../styles/theme';

export type P = {x: number; y: number};

export const bez = (a: P, b: P, c: P, d: P, t: number): P => {
  const u = 1 - t;
  return {
    x: u * u * u * a.x + 3 * u * u * t * b.x + 3 * u * t * t * c.x + t * t * t * d.x,
    y: u * u * u * a.y + 3 * u * u * t * b.y + 3 * u * t * t * c.y + t * t * t * d.y,
  };
};

/** Straight line as a degenerate cubic, so tokens use the same maths. */
export const line = (a: P, d: P): [P, P, P, P] => [a, {x: a.x + (d.x - a.x) / 3, y: a.y + (d.y - a.y) / 3}, {x: a.x + (2 * (d.x - a.x)) / 3, y: a.y + (2 * (d.y - a.y)) / 3}, d];

/**
 * Animated connector. `draw` (0..1) strokes the line in (sampled polyline, so dashes can flow);
 * `flow` (px) offsets the dashes so they travel along the path; `token` (0..1) renders
 * `children` at that point on the path (with its heading angle).
 */
export const FlowPath: React.FC<{
  pts: [P, P, P, P];
  draw?: number;
  color?: string;
  width?: number;
  dashed?: boolean;
  flow?: number;
  arrow?: boolean;
  opacity?: number;
  track?: boolean;
  token?: number;
  children?: (p: P, angle: number) => React.ReactNode;
}> = ({pts, draw = 1, color = C.off, width = 5, dashed = true, flow = 0, arrow = true, opacity = 1, track = true, token, children}) => {
  const [a, b, c, d] = pts;
  const full = `M ${a.x} ${a.y} C ${b.x} ${b.y}, ${c.x} ${c.y}, ${d.x} ${d.y}`;
  const N = 48;
  const upto = Math.max(0, Math.min(1, draw));
  let vis = '';
  for (let i = 0; i <= N; i++) {
    const t = (i / N) * upto;
    const p = bez(a, b, c, d, t);
    vis += `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.y.toFixed(1)} `;
  }
  const tipT = upto;
  const tip = bez(a, b, c, d, tipT);
  const before = bez(a, b, c, d, Math.max(0, tipT - 0.03));
  const ang = (Math.atan2(tip.y - before.y, tip.x - before.x) * 180) / Math.PI;
  const tp = token !== undefined ? bez(a, b, c, d, token) : null;
  const tp2 = token !== undefined ? bez(a, b, c, d, Math.min(1, token + 0.02)) : null;
  const tang = tp && tp2 ? (Math.atan2(tp2.y - tp.y, tp2.x - tp.x) * 180) / Math.PI : 0;
  return (
    <g opacity={opacity}>
      {track && <path d={full} fill="none" stroke={color} strokeOpacity={0.16} strokeWidth={width} strokeLinecap="round" />}
      {upto > 0.005 && (
        <path d={vis} fill="none" stroke={color} strokeWidth={width} strokeLinecap="round" strokeLinejoin="round" strokeDasharray={dashed ? `${width * 2.4} ${width * 2}` : undefined} strokeDashoffset={-flow} />
      )}
      {arrow && upto > 0.97 && (
        <path d={`M ${tip.x} ${tip.y} l -24 -15 M ${tip.x} ${tip.y} l -24 15`} fill="none" stroke={color} strokeWidth={width} strokeLinecap="round" transform={`rotate(${ang} ${tip.x} ${tip.y})`} />
      )}
      {tp && children && <g>{children(tp, tang)}</g>}
    </g>
  );
};
