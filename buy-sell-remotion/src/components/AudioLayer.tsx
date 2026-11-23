import React from 'react';
import {Audio, interpolate, Sequence, staticFile} from 'remotion';
import {timeline} from '../data/timeline';

const LOW = 0.15; // music level under narration
const HIGH = 0.34; // music level in the gaps
const BASE = 0.9;

/** Music gain at an absolute frame: ducks under each VO line, fades in/out. */
export const musicGain = (frame: number) => {
  let duck = HIGH;
  for (const s of timeline.scenes) {
    const d = interpolate(frame, [s.voStart - 10, s.voStart - 2, s.voEnd + 2, s.voEnd + 14], [HIGH, LOW, LOW, HIGH], {
      extrapolateLeft: 'clamp',
      extrapolateRight: 'clamp',
    });
    duck = Math.min(duck, d);
  }
  const fadeIn = interpolate(frame, [0, 24], [0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'});
  const fadeOut = interpolate(frame, [timeline.totalFrames - 50, timeline.totalFrames - 2], [1, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  return duck * BASE * fadeIn * fadeOut;
};

export const AudioLayer: React.FC = () => (
  <>
    <Audio src={staticFile('audio/music/bed.mp3')} volume={musicGain} />
    {timeline.scenes.map((s) => (
      <Sequence key={s.id} from={s.voStart} durationInFrames={s.voFrames + 2} layout="none">
        <Audio src={staticFile(`audio/vo/${s.id}.wav`)} volume={1} />
      </Sequence>
    ))}
  </>
);
