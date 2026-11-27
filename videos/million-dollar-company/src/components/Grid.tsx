import React from 'react';

export const Grid: React.FC<{id?: string}> = ({id = 'g'}) => (
  <svg width={1080} height={1920} style={{position: 'absolute', inset: 0}}>
    <defs>
      <pattern id={`${id}p`} width={60} height={60} patternUnits="userSpaceOnUse"><path d="M 60 0 L 0 0 0 60" fill="none" stroke="#fff" strokeWidth={1} opacity={0.045} /></pattern>
      <radialGradient id={`${id}v`} cx="50%" cy="38%" r="70%"><stop offset="0" stopColor="#1A2A46" stopOpacity={0.9} /><stop offset="1" stopColor="#0B1220" stopOpacity={1} /></radialGradient>
    </defs>
    <rect width={1080} height={1920} fill={`url(#${id}v)`} />
    <rect width={1080} height={1920} fill={`url(#${id}p)`} />
  </svg>
);
