import React, {useEffect, useState} from 'react';
import {AbsoluteFill, Sequence, useDelayRender} from 'remotion';
import {timeline} from './data/timeline';
import {fontsReady} from './styles/fonts';
import {Background} from './components/Background';
import {Captions} from './components/Captions';
import {BlockWipes} from './components/Transitions';
import {AudioLayer} from './components/AudioLayer';
import {Sfx} from './components/Sfx';
import {SceneProvider} from './hooks/useCue';
import {Hook} from './scenes/Hook';
import {OwnershipRisk} from './scenes/OwnershipRisk';
import {Agreement} from './scenes/Agreement';
import {FundingGap} from './scenes/FundingGap';
import {InsuranceSolution} from './scenes/InsuranceSolution';
import {CallToAction} from './scenes/CallToAction';

const SCENES: Record<string, React.FC> = {
  s1: Hook,
  s2: OwnershipRisk,
  s3: Agreement,
  s4: FundingGap,
  s5: InsuranceSolution,
  s6: CallToAction,
};

/** Blocks the first render until every font file is loaded so fitText measures real glyphs. */
const FontGate: React.FC<{children: React.ReactNode}> = ({children}) => {
  const [ready, setReady] = useState(false);
  const {delayRender, continueRender} = useDelayRender();
  useEffect(() => {
    const h = delayRender('Loading fonts');
    fontsReady.then(() => {
      setReady(true);
      continueRender(h);
    });
  }, [delayRender, continueRender]);
  return ready ? <>{children}</> : null;
};

export const ExplainerVideo: React.FC = () => (
  <AbsoluteFill style={{backgroundColor: '#071226'}}>
    <FontGate>
      <Background />
      {timeline.scenes.map((s) => {
        const Scene = SCENES[s.id];
        return (
          <Sequence key={s.id} from={s.start} durationInFrames={s.duration} name={s.name}>
            <SceneProvider scene={s}>
              <Scene />
            </SceneProvider>
          </Sequence>
        );
      })}
      <Captions />
      <BlockWipes />
      {timeline.scenes.slice(1).map((s) => (
        <Sfx key={`w${s.id}`} name="whoosh" at={s.start - 15} volume={0.5} />
      ))}
      <AudioLayer />
    </FontGate>
  </AbsoluteFill>
);
