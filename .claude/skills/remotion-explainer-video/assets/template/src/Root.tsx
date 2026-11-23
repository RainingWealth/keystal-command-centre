import React from 'react';
import {Composition} from 'remotion';
import {ExplainerVideo} from './ExplainerVideo';
import {timeline} from './data/timeline';

export const RemotionRoot: React.FC = () => (
  <Composition
    id="Explainer"
    component={ExplainerVideo}
    durationInFrames={timeline.totalFrames}
    fps={timeline.fps}
    width={timeline.width}
    height={timeline.height}
  />
);
