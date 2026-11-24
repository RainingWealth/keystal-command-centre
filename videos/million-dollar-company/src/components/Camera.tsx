import React, {createContext, useContext} from 'react';
import {AbsoluteFill} from 'remotion';
import {H, W} from '../config/theme';

type Cam = {cx: number; cy: number; z: number};
const CamCtx = createContext<Cam>({cx: W / 2, cy: H / 2, z: 1});

/** Virtual camera: focus point (cx, cy) in stage coordinates and zoom z (>= 1). Children use <Layer depth> for parallax. */
export const Camera: React.FC<Cam & {children: React.ReactNode}> = ({cx, cy, z, children}) => (
  <CamCtx.Provider value={{cx, cy, z}}>
    <AbsoluteFill>{children}</AbsoluteFill>
  </CamCtx.Provider>
);

export const useCam = () => useContext(CamCtx);

/** depth: 0 = infinitely far (never moves), 1 = the action plane, >1 = foreground (moves more than the action plane) */
export const Layer: React.FC<{depth?: number; children: React.ReactNode; style?: React.CSSProperties}> = ({depth = 1, children, style}) => {
  const {cx, cy, z} = useCam();
  const s = 1 + (z - 1) * depth;
  const ox = (cx - W / 2) * depth;
  const oy = (cy - H / 2) * depth;
  const tx = W / 2 - (W / 2 + ox) * s;
  const ty = H / 2 - (H / 2 + oy) * s;
  return (
    <AbsoluteFill style={{transformOrigin: '0 0', transform: `translate(${tx}px, ${ty}px) scale(${s})`, ...style}}>{children}</AbsoluteFill>
  );
};
