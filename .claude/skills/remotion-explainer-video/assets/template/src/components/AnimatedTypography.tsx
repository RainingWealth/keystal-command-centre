import React, {useMemo} from 'react';
import {useCurrentFrame} from 'remotion';
import {fitText} from '@remotion/layout-utils';
import {C, CONTENT_W, EASE_IN, EASE_OUT, FONT_DISPLAY, prog, SAFE, ZONE} from '../styles/theme';

export type Seg = {t: string; c?: string};
export type HLine = Seg[];

const plain = (l: HLine) => l.map((s) => s.t).join('');

/**
 * Swiss headline: flush-left caps, every line sized by fitText so nothing can crop,
 * words rise out of a mask (stagger) and exit upward. All timings in scene frames.
 */
export const Headline: React.FC<{
  lines: HLine[];
  from: number;
  exit?: number;
  maxSize?: number;
  top?: number;
  width?: number;
  left?: number;
  stagger?: number;
  color?: string;
  leading?: number;
  align?: 'left' | 'center';
}> = ({lines, from, exit, maxSize = 170, top = ZONE.headTop, width = CONTENT_W, left = SAFE.left, stagger = 4, color = C.off, leading = 0.96, align = 'left'}) => {
  const frame = useCurrentFrame();
  const key = lines.map(plain).join('|');
  const size = useMemo(
    () =>
      Math.min(
        maxSize,
        ...lines.map(
          (l) =>
            fitText({
              text: plain(l),
              withinWidth: width * 0.97,
              fontFamily: 'Buysell Display',
              fontWeight: 900,
              letterSpacing: '-0.03em',
            }).fontSize,
        ),
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [key, maxSize, width],
  );
  const lineH = Math.round(size * leading);
  if (frame < from - 1 || (exit !== undefined && frame > exit + 14 + lines.length * 2)) return null;

  return (
    <div style={{position: 'absolute', left, top, width, textAlign: align}}>
      {lines.map((l, i) => {
        const pin = prog(frame, from + i * stagger, 16, EASE_OUT);
        const pout = exit === undefined ? 0 : prog(frame, exit + i * 2, 10, EASE_IN);
        const y = (1 - pin) * 112 - pout * 112;
        return (
          <div key={i} style={{height: lineH, overflow: 'hidden', position: 'relative'}}>
            <div
              style={{
                transform: `translateY(${y}%)`,
                fontFamily: FONT_DISPLAY,
                fontWeight: 900,
                fontSize: size,
                lineHeight: `${lineH}px`,
                letterSpacing: '-0.035em',
                wordSpacing: '0.1em',
                color,
                whiteSpace: 'nowrap',
              }}
            >
              {l.map((s, j) => (
                <span key={j} style={{color: s.c ?? color}}>
                  {s.t}
                </span>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
};

/** Small caps label (kicker / tag) that fades + slides in. */
export const Tag: React.FC<{text: string; x: number; y: number; from: number; color?: string; size?: number; weight?: number; anchor?: 'start' | 'middle' | 'end'}> = ({
  text,
  x,
  y,
  from,
  color = C.off,
  size = 26,
  weight = 600,
  anchor = 'start',
}) => {
  const frame = useCurrentFrame();
  const p = prog(frame, from, 12);
  return (
    <div
      style={{
        position: 'absolute',
        left: anchor === 'start' ? x : anchor === 'middle' ? x - 400 : x - 800,
        width: anchor === 'start' ? 'auto' : 800,
        top: y + (1 - p) * 10,
        opacity: p,
        textAlign: anchor === 'start' ? 'left' : anchor === 'middle' ? 'center' : 'right',
        fontFamily: '"Buysell Text", Inter, sans-serif',
        fontWeight: weight,
        fontSize: size,
        letterSpacing: '0.12em',
        color,
        whiteSpace: 'nowrap',
      }}
    >
      {text}
    </div>
  );
};
