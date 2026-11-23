import React from 'react';
import {C, FONT_DISPLAY, FONT_TEXT} from '../styles/theme';

/** Numbered step card (SVG). `appear` 0..1 scales/fades it in, `hi` 0..1 lights the border. */
export const NodeCard: React.FC<{
  x: number;
  y: number;
  w: number;
  h: number;
  num: string;
  title: string;
  sub?: string;
  color: string;
  appear: number;
  hi?: number;
  children?: React.ReactNode;
}> = ({x, y, w, h, num, title, sub, color, appear, hi = 0, children}) => {
  const s = 0.94 + 0.06 * appear;
  return (
    <g transform={`translate(${x + w / 2} ${y + h / 2}) scale(${s}) translate(${-w / 2} ${-h / 2 + (1 - appear) * 22})`} opacity={appear}>
      <rect width={w} height={h} rx={22} fill={C.panel} stroke={color} strokeOpacity={0.35 + 0.65 * hi} strokeWidth={3 + 2 * hi} />
      <rect width={10} height={h - 36} x={0} y={18} fill={color} />
      <text x={38} y={58} fontFamily={FONT_DISPLAY} fontWeight={900} fontSize={34} fill={color} letterSpacing="0.02em">
        {num}
      </text>
      <text x={104} y={58} fontFamily={FONT_TEXT} fontWeight={700} fontSize={31} letterSpacing="0.1em" fill={C.off}>
        {title}
      </text>
      {sub && (
        <text x={104} y={98} fontFamily={FONT_TEXT} fontWeight={500} fontSize={26} fill={C.slate}>
          {sub}
        </text>
      )}
      {children}
    </g>
  );
};
