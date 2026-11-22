// SVG primitives that reproduce the original film's canvas helpers (rect, clip, text, rise, person, check,
// partial polyline, knife cut). Everything is declarative: props in -> SVG out, no imperative drawing state.
import React from 'react';
import {C, FONT} from '../design/tokens';
import {E, lerp, lin, seg} from '../lib/anim';

/** filled rect; accepts negative width/height like canvas fillRect */
export const R: React.FC<{x: number; y: number; w: number; h: number; fill: string}> = ({x, y, w, h, fill}) => {
  if (w < 0) {
    x += w;
    w = -w;
  }
  if (h < 0) {
    y += h;
    h = -h;
  }
  if (w <= 0 || h <= 0) return null;
  return <rect x={x} y={y} width={w} height={h} fill={fill} />;
};

/** stroked (outline) rect, like canvas strokeRect */
export const SR: React.FC<{x: number; y: number; w: number; h: number; stroke: string; lw: number}> = ({x, y, w, h, stroke, lw}) => {
  if (w < 0) {
    x += w;
    w = -w;
  }
  if (h < 0) {
    y += h;
    h = -h;
  }
  if (w <= 0 || h <= 0) return null;
  return <rect x={x} y={y} width={w} height={h} fill="none" stroke={stroke} strokeWidth={lw} />;
};

/** rectangular clip — a nested <svg> viewport (clips to its box, needs no ids, composes with parent transforms) */
export const Clip: React.FC<{x: number; y: number; w: number; h: number; children?: React.ReactNode}> = ({x, y, w, h, children}) => {
  if (w <= 0 || h <= 0) return null;
  return (
    <svg x={x} y={y} width={w} height={h} viewBox={`${x} ${y} ${w} ${h}`} overflow="hidden">
      {children}
    </svg>
  );
};

export type TextOpts = {size: number; weight?: number; color?: string; track?: number; ct?: number};

export const Txt: React.FC<{s: string; x: number; y: number; o: TextOpts}> = ({s, x, y, o}) => (
  <text
    x={x}
    y={y}
    fontFamily={FONT}
    fontSize={o.size}
    fontWeight={o.weight || 700}
    letterSpacing={(o.track ?? (o.size >= 90 ? -0.02 : 0)) * o.size}
    fill={o.color ?? C.ink}
  >
    {s}
  </text>
);

const WIDE = 1600; // clip width for type reveals: only the vertical edge matters

/** clip-reveal: type rises from below its baseline (pin 0->1) and leaves upward (pout 0->1) */
export const Rise: React.FC<{s: string; x: number; y: number; o: TextOpts; pin: number; pout?: number}> = ({s, x, y, o, pin, pout = 0}) => {
  if (pin <= 0 || pout >= 1) return null;
  const lh = o.size * 1.08;
  const ct = o.ct ?? 0.95;
  return (
    <Clip x={x - 8} y={y - o.size * ct} w={WIDE} h={o.size * ct + o.size * 0.3}>
      <Txt s={s} x={x} y={y + (1 - pin) * lh - pout * lh} o={o} />
    </Clip>
  );
};

/** flat person pictogram, height ~ s. fill => solid; fill=null => dashed/solid outline */
export const Person: React.FC<{cx: number; cy: number; s: number; fill?: string | null; stroke?: string | null; dash?: number[] | null; lw?: number}> = ({
  cx,
  cy,
  s,
  fill = C.cy,
  stroke = null,
  dash = null,
  lw = 4,
}) => {
  if (s <= 0) return null;
  const w = 0.68 * s;
  const r = 0.24 * s;
  const x = cx - w / 2;
  const y = cy - 0.02 * s;
  const b = cy + 0.5 * s;
  const d = `M${x} ${b}L${x} ${y + r}Q${x} ${y} ${x + r} ${y}L${x + w - r} ${y}Q${x + w} ${y} ${x + w} ${y + r}L${x + w} ${b}Z`;
  const paint = fill
    ? {fill, stroke: 'none'}
    : {fill: 'none', stroke: stroke ?? undefined, strokeWidth: lw, strokeDasharray: dash ? dash.join(' ') : undefined};
  return (
    <g {...paint}>
      <circle cx={cx} cy={cy - 0.27 * s} r={0.17 * s} />
      <path d={d} />
    </g>
  );
};

/** polyline up to fraction p of its total length (exact geometry of the original) */
export function partialPts(pts: [number, number][], p: number): [number, number][] {
  const L = pts.slice(1).map((q, i) => Math.hypot(q[0] - pts[i][0], q[1] - pts[i][1]));
  const tot = L.reduce((a, b) => a + b, 0);
  let d = p * tot;
  const out: [number, number][] = [pts[0]];
  for (let i = 0; i < L.length; i++) {
    if (d >= L[i]) {
      out.push(pts[i + 1]);
      d -= L[i];
    } else {
      const q = d / L[i];
      out.push([lerp(pts[i][0], pts[i + 1][0], q), lerp(pts[i][1], pts[i + 1][1], q)]);
      break;
    }
  }
  return out;
}

export const PolyDraw: React.FC<{pts: [number, number][]; p: number; stroke: string; lw: number; join?: 'miter' | 'round'}> = ({pts, p, stroke, lw, join = 'miter'}) => {
  if (p <= 0) return null;
  const q = partialPts(pts, p);
  return (
    <polyline
      points={q.map((v) => v.join(',')).join(' ')}
      fill="none"
      stroke={stroke}
      strokeWidth={lw}
      strokeLinejoin={join}
      strokeMiterlimit={10}
      strokeLinecap="butt"
    />
  );
};

/** check mark drawn linearly p 0..1 */
export const Check: React.FC<{x: number; y: number; s: number; p: number; color: string; lw?: number}> = ({x, y, s, p, color, lw}) => {
  if (p <= 0) return null;
  const pts: [number, number][] = [
    [0.18, 0.55],
    [0.42, 0.78],
    [0.84, 0.26],
  ];
  const L = [Math.hypot(0.24, 0.23), Math.hypot(0.42, 0.52)];
  const tot = L[0] + L[1];
  const d = p * tot;
  const P = (a: [number, number]): [number, number] => [x + a[0] * s, y + a[1] * s];
  const out: [number, number][] = [P(pts[0])];
  if (d <= L[0]) {
    const q = d / L[0];
    out.push(P([lerp(pts[0][0], pts[1][0], q), lerp(pts[0][1], pts[1][1], q)]));
  } else {
    out.push(P(pts[1]));
    const q = (d - L[0]) / L[1];
    out.push(P([lerp(pts[1][0], pts[2][0], q), lerp(pts[1][1], pts[2][1], q)]));
  }
  return (
    <polyline
      points={out.map((v) => v.join(',')).join(' ')}
      fill="none"
      stroke={color}
      strokeWidth={lw ?? s * 0.13}
      strokeLinecap="butt"
      strokeLinejoin="miter"
      strokeMiterlimit={10}
    />
  );
};

/** knife cut: a 2 px line crosses (1/16 s), then the element collapses to its midline (3/16 s) */
export const Knife: React.FC<{t: number; t0: number; x: number; y: number; w: number; h: number; children?: React.ReactNode}> = ({t, t0, x, y, w, h, children}) => {
  const pk = lin(t, t0, t0 + 0.125);
  const pc = E(seg(t, t0 + 0.125, t0 + 0.5));
  if (pc >= 1) return null;
  const ym = y + h / 2;
  return (
    <>
      <g transform={`translate(0 ${ym}) scale(1 ${1 - pc}) translate(0 ${-ym})`}>{children}</g>
      {pk > 0 ? <R x={x} y={ym - 1} w={w * pk} h={2} fill={C.ink} /> : null}
    </>
  );
};
