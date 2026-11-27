import React from 'react';
import {AbsoluteFill} from 'remotion';
import {C} from './config/theme';
import {FounderBust, FounderStanding} from './components/characters/Founder';
import {WORKERS, Worker} from './components/characters/Worker';
import {OfficeWorld} from './components/environment/Office';

export const Lab: React.FC = () => (
  <AbsoluteFill style={{background: '#26344B'}}>
    <svg width={1080} height={1920} viewBox="0 0 1080 1920">
      <g transform="translate(270 300) scale(1.0)"><FounderBust smile={1} worry={0} /></g>
      <g transform="translate(810 300) scale(1.0)"><FounderBust smile={-0.8} worry={1} gy={4} sweat={1} glow="#BFE9FF" glowOpacity={0.25} /></g>
      <g transform="translate(270 800) scale(0.9)"><FounderBust smile={0.2} worry={0.3} dim={0.35} rim={C.cyan} /></g>
      <g transform="translate(810 800) scale(0.9)"><FounderBust smile={-0.3} worry={0.7} open={0.1} /></g>
      <g transform="translate(200 1450) scale(0.9)"><FounderStanding smile={0.8} arms="cross" /></g>
      <g transform="translate(500 1450) scale(0.9)"><FounderStanding smile={0.2} arms="pockets" /></g>
      {WORKERS.map((w, i) => (
        <g key={i} transform={`translate(${700 + (i % 2) * 150} ${1250 + Math.floor(i / 2) * 200}) scale(0.9)`}><Worker look={w} /></g>
      ))}
    </svg>
  </AbsoluteFill>
);

export const LabOffice: React.FC<{variant: 'day' | 'dawn' | 'night'}> = ({variant}) => (
  <AbsoluteFill style={{background: '#000'}}>
    <OfficeWorld variant={variant} cam={{cx: 540, cy: 960, z: 1}} t={20} dashT={80} staff={variant !== 'night'} dashOn={variant === 'night' ? 0.2 : 1}
      actors={<g transform="translate(810 1620)"><FounderStanding smile={0.8} arms="cross" dim={variant === 'night' ? 0.5 : 0} rim={variant === 'day' ? '#BFF3FA' : undefined} /></g>} />
  </AbsoluteFill>
);
