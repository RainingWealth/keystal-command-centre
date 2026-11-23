import React from 'react';
import {AbsoluteFill, staticFile, useCurrentFrame} from 'remotion';
import {ACCENT, C, CONTENT_W, H, SAFE, W} from '../styles/theme';
import {timeline} from '../data/timeline';

/** Navy field + Swiss 6-column grid with slow drift + film grain. Rendered once at root (absolute frame). */
export const Background: React.FC = () => {
  const frame = useCurrentFrame();
  const scene = [...timeline.scenes].reverse().find((s) => frame >= s.start) ?? timeline.scenes[0];
  const glow = ACCENT[scene.accent];
  const colW = CONTENT_W / 6;
  const rowH = 160;
  const drift = (frame * 0.18) % rowH;
  const grainShift = (frame * 37) % 512;

  return (
    <AbsoluteFill style={{background: `linear-gradient(180deg, ${C.navy} 0%, ${C.deep} 100%)`}}>
      <svg width={W} height={H} style={{position: 'absolute', inset: 0}}>
        <defs>
          <radialGradient id="bgGlow" cx="0.12" cy="0.1" r="0.9">
            <stop offset="0%" stopColor={glow} stopOpacity="0.15" />
            <stop offset="55%" stopColor={glow} stopOpacity="0.03" />
            <stop offset="100%" stopColor={glow} stopOpacity="0" />
          </radialGradient>
        </defs>
        <rect width={W} height={H} fill="url(#bgGlow)" />
        {Array.from({length: 7}).map((_, i) => (
          <line key={`v${i}`} x1={SAFE.left + i * colW} x2={SAFE.left + i * colW} y1={0} y2={H} stroke={C.grid} strokeWidth={1.5} />
        ))}
        {Array.from({length: 14}).map((_, i) => (
          <line key={`h${i}`} x1={0} x2={W} y1={i * rowH + drift - rowH} y2={i * rowH + drift - rowH} stroke={C.grid} strokeWidth={1.5} />
        ))}
      </svg>
      <div
        style={{
          position: 'absolute',
          inset: 0,
          backgroundImage: `url(${staticFile('assets/grain.png')})`,
          backgroundSize: '512px 512px',
          backgroundPosition: `${grainShift}px ${(grainShift * 2) % 512}px`,
          opacity: 0.07,
          mixBlendMode: 'overlay',
        }}
      />
    </AbsoluteFill>
  );
};
