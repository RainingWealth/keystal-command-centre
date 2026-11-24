import React from 'react';
import {Composition} from 'remotion';
import './fonts';
import {Video, VideoProps} from './Video';
import {Lab, LabOffice} from './Lab';
import {TL} from './lib/timeline';
import {H, W} from './config/theme';

export const Root: React.FC = () => (
  <>
  <Composition id="LabDay" component={LabOffice} defaultProps={{variant: 'day' as const}} durationInFrames={30} fps={30} width={W} height={H} />
  <Composition id="Lab" component={Lab} durationInFrames={30} fps={30} width={W} height={H} />
  <Composition
    id="Main"
    component={Video}
    durationInFrames={TL.totalFrames}
    fps={TL.fps}
    width={W}
    height={H}
    defaultProps={{debug: false, audio: true} satisfies VideoProps}
  />
  </>
);
