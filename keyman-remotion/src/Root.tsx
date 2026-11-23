import React from 'react';
import {Composition} from 'remotion';
import {KeymanVideo} from './KeymanVideo';
import {DURATION_FRAMES, FPS, H, W} from './design/tokens';

export const Root: React.FC = () => (
  <Composition id="KeymanRemotion" component={KeymanVideo} durationInFrames={DURATION_FRAMES} fps={FPS} width={W} height={H} />
);
