import React from 'react';
import {Audio, Sequence, staticFile} from 'remotion';

/** One-shot sound effect at a (scene-relative) frame. Files live in public/audio/sfx/<name>.wav */
export const Sfx: React.FC<{name: string; at: number; volume?: number}> = ({name, at, volume = 0.6}) => (
  <Sequence from={Math.max(0, Math.round(at))} durationInFrames={90} layout="none">
    <Audio src={staticFile(`audio/sfx/${name}.wav`)} volume={volume} />
  </Sequence>
);
