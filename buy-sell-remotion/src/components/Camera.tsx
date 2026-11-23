import React from 'react';
import {interpolate, useCurrentFrame} from 'remotion';
import {CX, EASE_IN_OUT, H} from '../styles/theme';

export type CamKey = {f: number; s?: number; x?: number; y?: number};
export type Shake = {at: number; dur?: number; amp?: number};

/** Keyframed push-in / drift camera (scale, translate) with optional impact shakes. Frame-accurate. */
export const Camera: React.FC<{
  keys: CamKey[];
  origin?: {x: number; y: number};
  shakes?: Shake[];
  children: React.ReactNode;
}> = ({keys, origin = {x: CX, y: H / 2}, shakes = [], children}) => {
  const frame = useCurrentFrame();
  const fs = keys.map((k) => k.f);
  const opt = {extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: EASE_IN_OUT} as const;
  const s = fs.length > 1 ? interpolate(frame, fs, keys.map((k) => k.s ?? 1), opt) : keys[0]?.s ?? 1;
  let x = fs.length > 1 ? interpolate(frame, fs, keys.map((k) => k.x ?? 0), opt) : keys[0]?.x ?? 0;
  let y = fs.length > 1 ? interpolate(frame, fs, keys.map((k) => k.y ?? 0), opt) : keys[0]?.y ?? 0;
  for (const sh of shakes) {
    const d = sh.dur ?? 9;
    const t = frame - sh.at;
    if (t >= 0 && t < d) {
      const decay = 1 - t / d;
      const a = (sh.amp ?? 8) * decay;
      x += Math.sin(t * 5.1) * a;
      y += Math.cos(t * 6.3) * a;
    }
  }
  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        transformOrigin: `${origin.x}px ${origin.y}px`,
        transform: `translate(${x}px, ${y}px) scale(${s})`,
      }}
    >
      {children}
    </div>
  );
};
