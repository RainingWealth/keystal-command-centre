import React from 'react';
import {AbsoluteFill, useCurrentFrame, useVideoConfig} from 'remotion';
import {C, CX, EASE_IN_OUT, EASE_OUT, FONT_DISPLAY, FONT_TEXT, H, prog, rand, sp, W} from '../styles/theme';
import {useCues} from '../hooks/useCue';
import {Camera} from '../components/Camera';
import {SceneLabel} from '../components/SceneLabel';
import {Headline} from '../components/AnimatedTypography';
import {ShareholderDonut} from '../components/ShareholderDiagram';
import {Building, Person} from '../components/icons';
import {Sfx} from '../components/Sfx';

const CY = 960;
const R = 165;
const TH = 62;
const YOU_X = 190;
const PARTNER_X = 890;

/** Scene 1 — the hook: 50/50 company, one partner disappears, "WHO GETS THEIR 50%?" */
export const Hook: React.FC = () => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const cue = useCues();
  const cPassed = cue('passed');
  const cWho = cue('who');

  const flash = 1 - prog(frame, 0, 12, EASE_OUT);
  const avYou = sp(frame, fps, 4, 'pop');
  const avPartner = sp(frame, fps, 8, 'pop');
  const draw = prog(frame, 10, 30, EASE_IN_OUT);
  const link = prog(frame, 26, 14);
  const d = prog(frame, cPassed, 22, EASE_IN_OUT); // partner dissolves
  const halo = prog(frame, cPassed + 8, 16);
  const qPop = sp(frame, fps, cPassed + 10, 'pop');
  const pulse = 0.6 + 0.4 * Math.sin(frame * 0.22);

  const partnerLabelWord = frame < cPassed + 8 ? '50%' : '?';

  return (
    <AbsoluteFill>
      <SceneLabel label="01 — THE QUESTION" color={C.orange} index={1} />

      <Camera
        keys={[
          {f: 0, s: 1},
          {f: cPassed - 4, s: 1.0},
          {f: cPassed + 34, s: 1.04},
          {f: cWho + 44, s: 1.08},
        ]}
        origin={{x: 620, y: CY}}
      >
        <svg width={W} height={H} style={{position: 'absolute', inset: 0}}>
          {/* company label */}
          <text x={CX} y={742} textAnchor="middle" fontFamily={FONT_TEXT} fontWeight={600} fontSize={26} letterSpacing="0.16em" fill={C.slate} opacity={prog(frame, 8, 12)}>
            YOUR COMPANY · 100%
          </text>

          {/* connectors */}
          <line x1={YOU_X + 78} y1={CY} x2={CX - R - TH / 2 - 14} y2={CY} stroke={C.cobalt} strokeWidth={5} strokeDasharray="10 10" strokeLinecap="round" opacity={link * 0.8} />
          <line x1={PARTNER_X - 78} y1={CY} x2={CX + R + TH / 2 + 14} y2={CY} stroke={C.cobaltLight} strokeWidth={5} strokeDasharray="10 10" strokeLinecap="round" opacity={link * (1 - d) * 0.8} />

          {/* donut: partner half (right, clockwise from top) + you half (left) */}
          <ShareholderDonut
            cx={CX}
            cy={CY}
            r={R}
            thickness={TH}
            draw={draw}
            segments={[
              {pct: 50, color: C.cobaltLight, opacity: 1 - d},
              {pct: 50, color: C.cobalt},
            ]}
          >
            <Building x={CX} y={CY - 12} size={96} color={C.off} opacity={prog(frame, 22, 14)} />
            <text x={CX} y={CY + 72} textAnchor="middle" fontFamily={FONT_TEXT} fontWeight={600} fontSize={22} letterSpacing="0.14em" fill={C.off} opacity={prog(frame, 24, 12) * 0.7}>
              COMPANY
            </text>
          </ShareholderDonut>
          {/* the vanished half becomes a hollow dashed ring */}
          <ShareholderDonut
            cx={CX}
            cy={CY}
            r={R}
            thickness={TH}
            segments={[
              {pct: 50, color: 'transparent', hollow: true, opacity: d * pulse + d * 0.35, dashOffset: -frame * 0.9},
              {pct: 50, color: 'transparent', opacity: 0},
            ]}
          />

          {/* YOU */}
          <circle cx={YOU_X} cy={CY + 4} r={90} fill="none" stroke={C.off} strokeWidth={4} opacity={halo * (0.55 + 0.35 * Math.sin(frame * 0.2))} />
          <Person x={YOU_X} y={CY + 6} size={140} color={C.off} scale={avYou} opacity={Math.min(1, avYou)} />
          <text x={YOU_X} y={CY + 138} textAnchor="middle" fontFamily={FONT_TEXT} fontWeight={700} fontSize={30} letterSpacing="0.14em" fill={C.off} opacity={avYou}>
            YOU
          </text>
          <text x={YOU_X} y={CY + 212} textAnchor="middle" fontFamily={FONT_DISPLAY} fontWeight={900} fontSize={76} letterSpacing="-0.03em" wordSpacing="0.14em" fill={C.cobaltLight} opacity={avYou}>
            50%
          </text>

          {/* PARTNER (disappears) */}
          <Person x={PARTNER_X} y={CY + 6} size={140} color={C.cobaltLight} scale={avPartner * (1 - 0.1 * d)} opacity={Math.min(1, avPartner) * (1 - d)} />
          <Person x={PARTNER_X} y={CY + 6} size={140} fill="none" stroke={C.orange} sw={4} scale={1} opacity={d * 0.85} />
          {Array.from({length: 18}).map((_, i) => {
            const ang = (-100 + rand(i + 3) * 200) * (Math.PI / 180) - Math.PI / 2 + Math.PI / 2;
            const dist = 50 + rand(i + 9) * 150;
            const e = EASE_OUT(prog(frame, cPassed, 30, (t) => t));
            const px = PARTNER_X + Math.cos(ang) * dist * e * 0.8 + 30 * e;
            const py = CY + Math.sin(ang) * dist * e - 40 * e;
            return <circle key={i} cx={px} cy={py} r={5 + rand(i + 21) * 8} fill={i % 3 === 0 ? C.orange : C.cobaltLight} opacity={e > 0 ? (1 - e) * 0.9 : 0} />;
          })}
          <text x={PARTNER_X} y={CY + 138} textAnchor="middle" fontFamily={FONT_TEXT} fontWeight={700} fontSize={30} letterSpacing="0.14em" fill={d > 0.4 ? C.orange : C.off} opacity={avPartner}>
            PARTNER
          </text>
          <text
            x={PARTNER_X}
            y={CY + 212}
            textAnchor="middle"
            fontFamily={FONT_DISPLAY}
            fontWeight={900}
            fontSize={76}
            letterSpacing="-0.03em"
            fill={partnerLabelWord === '?' ? C.orange : C.cobaltLight}
            opacity={avPartner}
            transform={partnerLabelWord === '?' ? `translate(${PARTNER_X} ${CY + 187}) scale(${qPop}) translate(${-PARTNER_X} ${-(CY + 187)})` : undefined}
          >
            {partnerLabelWord}
          </text>
        </svg>
      </Camera>

      {/* top zone: "50 / 50" then the question */}
      <Headline lines={[[{t: '50'}, {t: ' / ', c: C.slate}, {t: '50'}]]} from={cue('built')} exit={cWho - 4} maxSize={230} />
      <Headline lines={[[{t: 'WHO GETS'}], [{t: 'THEIR '}, {t: '50%?', c: C.orange}]]} from={cWho} maxSize={168} stagger={6} />

      {/* opening cobalt flash-cut */}
      <AbsoluteFill style={{background: C.cobalt, opacity: flash}} />

      <Sfx name="whoosh" at={0} volume={0.55} />
      <Sfx name="pop" at={4} volume={0.5} />
      <Sfx name="pop" at={8} volume={0.5} />
      <Sfx name="hit_soft" at={14} volume={0.5} />
      <Sfx name="glitch" at={cPassed} volume={0.55} />
      <Sfx name="thud_low" at={cPassed + 3} volume={0.7} />
      <Sfx name="riser" at={cWho - 26} volume={0.45} />
      <Sfx name="hit_soft" at={cWho + 2} volume={0.6} />
    </AbsoluteFill>
  );
};
