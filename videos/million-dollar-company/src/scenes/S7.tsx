import React from 'react';
import {AbsoluteFill} from 'remotion';
import {C, FONT} from '../config/theme';
import {COPY} from '../config/copy';
import {Grid} from '../components/Grid';
import {Glass} from '../components/UI';
import {IconBuffer, IconCollect, IconForecast, IconNegotiate} from '../components/props/Props';
import {appear, easeOut, prog} from '../lib/anim';
import {SCENE} from '../lib/timeline';
import {useClock} from '../lib/scene';
import {D} from './Diagram';

const S7 = SCENE.S7;
const CUES = D.cues.map((c) => c - S7.start);
const POS = [{x: 60, y: 480}, {x: 560, y: 480}, {x: 60, y: 830}, {x: 560, y: 830}];
const COL = [C.cyan, C.amber, C.amber, C.cyan];

export const Scene7: React.FC = () => {
  const {t} = useClock();
  const Icons = [IconForecast, IconCollect, IconNegotiate, IconBuffer];
  return (
    <AbsoluteFill style={{background: C.navy}}>
      <Grid id="g7" />
      {POS.map((p, i) => {
        const a = prog(t, CUES[i] - 10, 16, easeOut);
        const act = prog(t, CUES[i], 14);
        const glow = 1 - prog(t, CUES[i] + 6, 34);
        const Icon = Icons[i];
        const ip = prog(t, CUES[i] + 2, 40, easeOut);
        return (
          <div key={i} style={{opacity: a, transform: `translateY(${(1 - a) * 44}px) scale(${0.97 + 0.03 * a})`}}>
            <Glass x={p.x} y={p.y} w={460} h={330} r={36} border={act > 0.4 ? COL[i] : 'rgba(255,255,255,0.12)'} bg="rgba(18,30,52,0.94)" style={{boxShadow: `0 30px 70px rgba(0,0,0,0.45), 0 0 ${40 * glow}px ${COL[i]}66`}}>
              <div style={{position: 'absolute', left: 24, top: 22, width: 52, height: 52, borderRadius: 26, background: COL[i], color: C.navy, fontFamily: FONT.display, fontWeight: 900, fontSize: 30, display: 'flex', alignItems: 'center', justifyContent: 'center'}}>{i + 1}</div>
              <svg width={460} height={200} viewBox="-230 -100 460 200" style={{position: 'absolute', left: 0, top: 30}}>
                <g transform="scale(1.35)"><Icon p={ip} color={COL[i]} /></g>
              </svg>
              <div style={{position: 'absolute', left: 28, right: 28, bottom: 28, textAlign: 'center', fontFamily: FONT.display, fontWeight: 800, fontSize: 41, lineHeight: 1.12, letterSpacing: '-0.01em', color: C.white}}>{COPY.actions[i]}</div>
            </Glass>
          </div>
        );
      })}
      <div style={{position: 'absolute', left: 60, right: 60, top: 1188, textAlign: 'center', fontFamily: FONT.text, fontWeight: 600, fontSize: 30, color: C.mute2, opacity: appear(t, CUES[3] + 36, 18, 8).opacity}}>{COPY.actionsNote}</div>
    </AbsoluteFill>
  );
};
