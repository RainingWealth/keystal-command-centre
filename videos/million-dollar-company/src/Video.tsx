import React from 'react';
import {AbsoluteFill} from 'remotion';
import {C} from './config/theme';
import {Captions} from './components/Captions';
import {Grain, SafeZones, Vignette} from './components/Overlays';
import {SceneWindow} from './lib/scene';
import {Scene1, Scene2} from './scenes/S1S2';
import {Scene3} from './scenes/S3';
import {Scene4} from './scenes/S4';
import {Scene5} from './scenes/S5';
import {Scene6} from './scenes/S6';
import {Scene7} from './scenes/S7';
import {Scene8} from './scenes/S8';
import {GapDiagram} from './scenes/Diagram';
import {AudioLayer} from './lib/audio';

export type VideoProps = {debug: boolean; audio: boolean};

export const Video: React.FC<VideoProps> = ({debug, audio}) => (
  <AbsoluteFill style={{background: C.navy}}>
    <SceneWindow id="S1"><Scene1 /></SceneWindow>
    <SceneWindow id="S2"><Scene2 /></SceneWindow>
    <SceneWindow id="S3"><Scene3 /></SceneWindow>
    <SceneWindow id="S4" pre={12} post={18} enter="fade" exit="slide"><Scene4 /></SceneWindow>
    <SceneWindow id="S5" pre={18} post={15} enter="slide" exit="fade"><Scene5 /></SceneWindow>
    <SceneWindow id="S6" pre={15} enter="fade"><Scene6 /></SceneWindow>
    <SceneWindow id="S7" pre={10} enter="fade" post={20} exit="fade"><Scene7 /></SceneWindow>
    <GapDiagram />
    <SceneWindow id="S8" pre={20} enter="fade"><Scene8 /></SceneWindow>
    <Captions />
    <Vignette strength={0.42} />
    <Grain opacity={0.055} />
    {debug ? <SafeZones /> : null}
    {audio ? <AudioLayer /> : null}
  </AbsoluteFill>
);
