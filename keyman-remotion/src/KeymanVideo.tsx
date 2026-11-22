import React from 'react';
import {AbsoluteFill, Sequence, useCurrentFrame} from 'remotion';
import {C, FPS, H, W} from './design/tokens';
import {FontGate} from './design/FontGate';
import {Backdrop} from './components/Backdrop';
import {Captions} from './components/Captions';
import {S12} from './scenes/S12';
import {S3} from './scenes/S3';
import {S4} from './scenes/S4';
import {S5} from './scenes/S5';
import {Soundtrack} from './audio/Soundtrack';

// scene boundaries in seconds (all on whole frames at 24 fps)
const SCENES = [
  {from: 0, to: 19, C: S12},
  {from: 19, to: 28.5, C: S3},
  {from: 28.5, to: 37.5, C: S4},
  {from: 37.5, to: 52, C: S5},
];

const Scene: React.FC<{from: number; Comp: React.FC<{t: number}>}> = ({from, Comp}) => {
  const frame = useCurrentFrame(); // relative to the enclosing Sequence
  return <Comp t={(frame + from * FPS) / FPS} />;
};

const Picture: React.FC = () => {
  const t = useCurrentFrame() / FPS;
  return (
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} style={{display: 'block'}}>
      <rect width={W} height={H} fill={C.bg} />
      <Backdrop t={t} />
      {SCENES.map((s) => (
        <Sequence key={s.from} from={s.from * FPS} durationInFrames={(s.to - s.from) * FPS} layout="none">
          <Scene from={s.from} Comp={s.C} />
        </Sequence>
      ))}
      <Captions t={t} />
    </svg>
  );
};

export const KeymanVideo: React.FC = () => (
  <AbsoluteFill style={{background: C.bg}}>
    <FontGate>
      <Picture />
    </FontGate>
    <Soundtrack />
  </AbsoluteFill>
);
