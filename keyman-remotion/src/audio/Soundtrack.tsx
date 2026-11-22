// Audio: the original film's score + foley as one bed, and each narration line placed on its original start time.
import React from 'react';
import {Audio, Sequence, staticFile, useVideoConfig} from 'remotion';
import {TL} from '../data/timing';

export const Soundtrack: React.FC = () => {
  const {fps} = useVideoConfig();
  return (
    <>
      <Audio src={staticFile('audio/bed.wav')} />
      {TL.lines.map((l) => (
        <Sequence key={l.id} from={Math.round(l.t * fps)} layout="none">
          <Audio src={staticFile(`audio/vo/${l.id}.wav`)} />
        </Sequence>
      ))}
    </>
  );
};
