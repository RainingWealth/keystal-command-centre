import React from 'react';
import {C, FONT} from '../config/theme';

export const Glass: React.FC<{x: number; y: number; w: number; h: number; r?: number; opacity?: number; children?: React.ReactNode; border?: string; bg?: string; style?: React.CSSProperties}> = ({
  x, y, w, h, r = 30, opacity = 1, children, border = 'rgba(255,255,255,0.12)', bg = 'rgba(18,29,50,0.9)', style,
}) => (
  <div style={{position: 'absolute', left: x, top: y, width: w, height: h, borderRadius: r, background: bg, border: `2px solid ${border}`, boxShadow: '0 30px 70px rgba(0,0,0,0.45)', opacity, ...style}}>{children}</div>
);

export const Pill: React.FC<{text: string; color: string; fg?: string; size?: number; style?: React.CSSProperties; icon?: React.ReactNode}> = ({text, color, fg = C.navy, size = 28, style, icon}) => (
  <div style={{display: 'inline-flex', alignItems: 'center', gap: 10, padding: `${size * 0.32}px ${size * 0.7}px`, borderRadius: 999, background: color, color: fg, fontFamily: FONT.text, fontWeight: 800, fontSize: size, letterSpacing: '0.06em', ...style}}>{icon}{text}</div>
);

export const Ring: React.FC<{size: number; value: number; color: string; track?: string; stroke?: number; children?: React.ReactNode}> = ({size, value, color, track = 'rgba(255,255,255,0.12)', stroke = 16, children}) => {
  const r = (size - stroke) / 2, c = 2 * Math.PI * r;
  return (
    <div style={{position: 'relative', width: size, height: size}}>
      <svg width={size} height={size} style={{transform: 'rotate(-90deg)'}}>
        <circle cx={size / 2} cy={size / 2} r={r} stroke={track} strokeWidth={stroke} fill="none" />
        <circle cx={size / 2} cy={size / 2} r={r} stroke={color} strokeWidth={stroke} fill="none" strokeDasharray={c} strokeDashoffset={c * (1 - value)} strokeLinecap="round" />
      </svg>
      <div style={{position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center'}}>{children}</div>
    </div>
  );
};

export const Scrim: React.FC<{top?: number; height: number; strength?: number; direction?: 'down' | 'up' | 'both'}> = ({top = 0, height, strength = 0.7, direction = 'down'}) => {
  const g = direction === 'down' ? `linear-gradient(180deg, rgba(8,13,24,${strength}) 0%, rgba(8,13,24,0) 100%)`
    : direction === 'up' ? `linear-gradient(0deg, rgba(8,13,24,${strength}) 0%, rgba(8,13,24,0) 100%)`
    : `linear-gradient(180deg, rgba(8,13,24,0) 0%, rgba(8,13,24,${strength}) 50%, rgba(8,13,24,0) 100%)`;
  return <div style={{position: 'absolute', left: 0, right: 0, top, height, background: g, pointerEvents: 'none'}} />;
};
