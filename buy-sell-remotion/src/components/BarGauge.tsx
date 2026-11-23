import React from 'react';
import {C, FONT_DISPLAY, FONT_TEXT} from '../styles/theme';

/**
 * Horizontal gauge (obligation vs cash). All values are driven by the scene:
 * `fill` 0..1 of the track, optional `ghost` (dashed outline of the target) and `extra` (a second
 * coloured block starting at `fill`, e.g. insurance proceeds filling a gap).
 */
export const BarGauge: React.FC<{
  x: number;
  y: number;
  w: number;
  h?: number;
  label: string;
  value: string;
  fill: number;
  color: string;
  valueColor?: string;
  opacity?: number;
  hatchFrom?: number; // fraction where a hatched "gap" region starts
  hatchOpacity?: number;
  hatchColor?: string;
  extra?: {from: number; to: number; color: string};
  flicker?: number; // 0..1 multiplier on fill opacity
}> = ({x, y, w, h = 70, label, value, fill, color, valueColor, opacity = 1, hatchFrom, hatchOpacity = 0, hatchColor = C.red, extra, flicker = 1}) => {
  const id = `hatch-${label.replace(/\W/g, '')}`;
  return (
    <g transform={`translate(${x} ${y})`} opacity={opacity}>
      <defs>
        <pattern id={id} width="22" height="22" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <rect width="22" height="22" fill={hatchColor} fillOpacity={0.16} />
          <rect width="9" height="22" fill={hatchColor} fillOpacity={0.85} />
        </pattern>
      </defs>
      <text x={0} y={-18} fontFamily={FONT_TEXT} fontWeight={600} fontSize={27} letterSpacing="0.12em" fill={C.off}>
        {label}
      </text>
      <text x={w} y={-14} textAnchor="end" fontFamily={FONT_DISPLAY} fontWeight={900} fontSize={42} letterSpacing="-0.02em" wordSpacing="0.14em" fill={valueColor ?? color}>
        {value}
      </text>
      <rect x={0} y={0} width={w} height={h} rx={10} fill="rgba(244,241,234,0.07)" stroke="rgba(244,241,234,0.22)" strokeWidth={2} />
      {hatchFrom !== undefined && hatchOpacity > 0 && (
        <rect x={w * hatchFrom} y={0} width={w * (1 - hatchFrom)} height={h} rx={10} fill={`url(#${id})`} opacity={hatchOpacity} />
      )}
      {fill > 0 && <rect x={0} y={0} width={Math.max(0, w * fill)} height={h} rx={10} fill={color} opacity={flicker} />}
      {extra && extra.to > extra.from && (
        <rect x={w * extra.from} y={0} width={w * (extra.to - extra.from)} height={h} rx={0} fill={extra.color} />
      )}
    </g>
  );
};
