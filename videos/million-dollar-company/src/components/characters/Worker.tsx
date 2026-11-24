import React from 'react';
import {C} from '../../config/theme';
import {hexMix} from '../../lib/anim';

export type WorkerStyle = {skin: string; hair: string; shirt: string; style: 'bob' | 'tudung' | 'short' | 'glasses'; accent?: string};
export const WORKERS: WorkerStyle[] = [
  {skin: '#E9BF9A', hair: '#15171E', shirt: '#2F8FA3', style: 'bob'},
  {skin: '#D9A47C', hair: '#E9E4DC', shirt: '#8C6FC2', style: 'tudung', accent: '#E8DFF5'},
  {skin: '#B97E58', hair: '#12141A', shirt: '#E08A5B', style: 'short'},
  {skin: '#EBC4A2', hair: '#1B1E26', shirt: '#4A6FA8', style: 'glasses'},
];

/** Seated worker, head + shoulders only (the monitor hides the rest). Origin = head centre; ~120 wide. */
export const Worker: React.FC<{look: WorkerStyle; t?: number; phase?: number; dim?: number; bob?: number}> = ({look, t = 0, phase = 0, dim = 0, bob = 3}) => {
  const d = (c: string) => (dim ? hexMix(c, '#0A1020', dim) : c);
  const y = Math.sin((t + phase * 7) / 7) * bob * 0.5;
  const nod = Math.sin((t + phase * 11) / 19) * 1.5;
  return (
    <g transform={`translate(0 ${y})`}>
      <path d="M -62 150 C -62 100 -34 70 0 70 C 34 70 62 100 62 150 Z" fill={d(look.shirt)} />
      <rect x={-12} y={46} width={24} height={34} rx={9} fill={d(look.skin)} opacity={0.9} />
      <g transform={`rotate(${nod})`}>
        {look.style === 'tudung' ? (
          <>
            <path d="M -50 26 C -58 -38 -30 -62 0 -62 C 30 -62 58 -38 50 26 C 50 70 40 92 0 100 C -40 92 -50 70 -50 26 Z" fill={d(look.accent ?? '#E8DFF5')} />
            <ellipse cx={0} cy={4} rx={32} ry={38} fill={d(look.skin)} />
          </>
        ) : (
          <>
            {look.style === 'bob' ? <path d="M -42 -6 C -50 -52 -26 -64 0 -64 C 26 -64 50 -52 42 -6 C 46 30 40 52 30 56 L 24 10 L -24 10 L -30 56 C -40 52 -46 30 -42 -6 Z" fill={d(look.hair)} /> : null}
            <ellipse cx={0} cy={4} rx={34} ry={40} fill={d(look.skin)} />
            {look.style === 'short' || look.style === 'glasses' ? <path d="M -36 -6 C -40 -50 -14 -58 2 -58 C 22 -58 42 -46 36 -6 C 28 -26 12 -34 -4 -32 C -18 -30 -30 -22 -36 -6 Z" fill={d(look.hair)} /> : null}
            {look.style === 'bob' ? <path d="M -36 -10 C -30 -38 8 -46 36 -12 C 22 -24 -12 -22 -36 -10 Z" fill={d(look.hair)} /> : null}
          </>
        )}
        <circle cx={-12} cy={6} r={3.4} fill={d('#2A1F1B')} />
        <circle cx={12} cy={6} r={3.4} fill={d('#2A1F1B')} />
        {look.style === 'glasses' ? <g stroke={d('#222A38')} strokeWidth={2.6} fill="none"><rect x={-24} y={-3} width={19} height={14} rx={5} /><rect x={5} y={-3} width={19} height={14} rx={5} /><path d="M -5 4 L 5 4" /></g> : null}
        <path d="M -9 22 Q 0 29 9 22" stroke={d('#8E4A43')} strokeWidth={2.6} fill="none" strokeLinecap="round" />
      </g>
    </g>
  );
};
