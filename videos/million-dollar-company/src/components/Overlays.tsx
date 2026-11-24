import React from 'react';
import {AbsoluteFill, staticFile, useCurrentFrame} from 'remotion';
import {CAP, H, SAFE, W} from '../config/theme';

export const Grain: React.FC<{opacity?: number}> = ({opacity = 0.07}) => {
  const f = useCurrentFrame();
  return (
    <AbsoluteFill style={{backgroundImage: `url(${staticFile('textures/grain.png')})`, backgroundSize: '512px 512px', backgroundPosition: `${(f * 137) % 512}px ${(f * 71) % 512}px`, mixBlendMode: 'overlay', opacity, pointerEvents: 'none'}} />
  );
};

export const Vignette: React.FC<{strength?: number}> = ({strength = 0.5}) => (
  <AbsoluteFill style={{background: `radial-gradient(ellipse 85% 70% at 50% 46%, rgba(0,0,0,0) 55%, rgba(4,8,16,${strength}) 100%)`, pointerEvents: 'none'}} />
);

/** Debug overlay: safe area, caption band, bottom UI zone and right rail. */
export const SafeZones: React.FC = () => (
  <AbsoluteFill style={{pointerEvents: 'none'}}>
    <div style={{position: 'absolute', left: SAFE.left, top: SAFE.top, width: SAFE.right - SAFE.left, height: SAFE.bottom - SAFE.top, border: '3px dashed rgba(33,198,215,0.9)'}} />
    <div style={{position: 'absolute', left: 0, top: CAP.top, width: W, height: CAP.bottom - CAP.top, background: 'rgba(255,190,85,0.18)', border: '2px solid rgba(255,190,85,0.8)'}} />
    <div style={{position: 'absolute', left: 0, top: H - 490, width: W, height: 490, background: 'rgba(240,98,98,0.10)', borderTop: '2px solid rgba(240,98,98,0.7)'}} />
    <div style={{position: 'absolute', left: W - 120, top: 900, width: 120, height: 600, background: 'rgba(240,98,98,0.12)'}} />
    <div style={{position: 'absolute', left: 0, top: 0, width: W, height: 220, background: 'rgba(240,98,98,0.10)', borderBottom: '2px solid rgba(240,98,98,0.7)'}} />
  </AbsoluteFill>
);
