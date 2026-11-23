import React from 'react';
import {Composition} from 'remotion';
import {BuySellVideo} from './BuySellVideo';
import {timeline} from './data/timeline';

export const RemotionRoot: React.FC = () => (
  <Composition
    id="BuySell"
    component={BuySellVideo}
    durationInFrames={timeline.totalFrames}
    fps={timeline.fps}
    width={timeline.width}
    height={timeline.height}
  />
);
