import React from 'react';
import {C, FONT} from '../config/theme';
import {appear, easeOut, prog} from '../lib/anim';

/** Masked line reveal: each word rises out of a clip box. t = current scene frame. */
export const Reveal: React.FC<{
  text: string; t: number; start: number; size: number; color?: string; weight?: number; stagger?: number; dur?: number;
  align?: 'left' | 'center' | 'right'; letter?: number; family?: string; lineHeight?: number; style?: React.CSSProperties; maxWidth?: number;
}> = ({text, t, start, size, color = C.white, weight = 800, stagger = 3, dur = 16, align = 'center', letter = -0.02, family = FONT.display, lineHeight = 1.08, style, maxWidth}) => {
  const words = text.split(' ');
  return (
    <div style={{fontFamily: family, fontSize: size, fontWeight: weight, color, textAlign: align, letterSpacing: `${letter}em`, lineHeight, maxWidth, ...style}}>
      {words.map((w, i) => {
        const p = prog(t, start + i * stagger, dur, easeOut);
        return (
          <span key={i} style={{display: 'inline-block', overflow: 'hidden', verticalAlign: 'top', paddingBottom: '0.12em', marginRight: i < words.length - 1 ? '0.26em' : 0}}>
            <span style={{display: 'inline-block', transform: `translateY(${(1 - p) * 105}%)`, opacity: Math.min(1, p * 2.4)}}>{w}</span>
          </span>
        );
      })}
    </div>
  );
};

export const Label: React.FC<{text: string; t: number; start: number; size?: number; color?: string; letter?: number; weight?: number; style?: React.CSSProperties; align?: 'left' | 'center' | 'right'}> = ({
  text, t, start, size = 30, color = C.mute2, letter = 0.16, weight = 700, style, align = 'center',
}) => {
  const a = appear(t, start, 14, 14);
  return (
    <div style={{fontFamily: FONT.text, fontSize: size, fontWeight: weight, letterSpacing: `${letter}em`, color, textAlign: align, opacity: a.opacity, transform: `translateY(${a.y}px)`, ...style}}>{text}</div>
  );
};

/** Counter with tabular numerals, ease-out. */
export const Counter: React.FC<{from?: number; to: number; t: number; start: number; dur: number; format: (n: number) => string; size: number; color?: string; weight?: number; style?: React.CSSProperties; letter?: number}> = ({
  from = 0, to, t, start, dur, format, size, color = C.white, weight = 800, style, letter = -0.03,
}) => {
  const p = prog(t, start, dur, easeOut);
  return (
    <span style={{fontFamily: FONT.display, fontSize: size, fontWeight: weight, color, fontVariantNumeric: 'tabular-nums', letterSpacing: `${letter}em`, ...style}}>
      {format(from + (to - from) * p)}
    </span>
  );
};
