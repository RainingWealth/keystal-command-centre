import React from 'react';
import {AbsoluteFill, useCurrentFrame, useVideoConfig} from 'remotion';
import {C, EASE_IN_OUT, EASE_OUT, FONT_DISPLAY, FONT_TEXT, H, prog, sp, W} from '../styles/theme';
import {useCues} from '../hooks/useCue';
import {Camera} from '../components/Camera';
import {SceneLabel} from '../components/SceneLabel';
import {Footnote} from '../components/Footnote';
import {Headline} from '../components/AnimatedTypography';
import {BarGauge} from '../components/BarGauge';
import {CheckMark, DocIcon} from '../components/icons';
import {Sfx} from '../components/Sfx';

const BX = 72;
const BW = 898;
const money = (n: number) => 'S$' + Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');

/** Scene 4 — AGREEMENT ≠ FUNDING. A purchase obligation meets a bank balance that cannot cover it. */
export const FundingGap: React.FC = () => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const cue = useCues();
  const cO = cue('overlook');
  const cA = cue('agreement');
  const cD = cue('doesnt');
  const cC = cue('cash');
  const cB = cue('buy');

  const chip = sp(frame, fps, 10, 'pop');
  const chipBump = sp(frame, fps, cA, 'pop') * 0.06 * (1 - prog(frame, cA + 12, 12));
  const check = prog(frame, 18, 14);

  const b1in = prog(frame, cO - 6, 12);
  const b1 = prog(frame, cO + 2, 34, EASE_IN_OUT);
  const b2in = prog(frame, cC - 12, 12);
  const b2start = cC - 4;
  const b2 = 0.2 * prog(frame, b2start, 24, EASE_OUT);
  const b2end = b2start + 24;
  const flick = frame > b2end && frame < b2end + 26 ? 1 - 0.55 * Math.abs(Math.sin((frame - b2end) * 0.85)) : 1;
  const gapIn = prog(frame, b2end + 2, 12);
  const gapSlam = sp(frame, fps, b2end + 2, 'slam');
  const bracket = prog(frame, b2end + 4, 16, EASE_IN_OUT);
  const gapPulse = gapIn * (0.8 + 0.2 * Math.sin(frame * 0.3));

  const redFlash = frame >= cD + 3 ? 0.16 * (1 - prog(frame, cD + 3, 10)) : 0;

  const bar1Y = 872;
  const bar2Y = 1030;
  const gapX0 = BX + BW * 0.2;

  return (
    <AbsoluteFill>
      <SceneLabel label="04 — THE FUNDING PROBLEM" color={C.red} index={4} />

      <Camera keys={[{f: 0, s: 1}, {f: cD, s: 1}, {f: cD + 8, s: 1.02}]} shakes={[{at: cD + 3, amp: 11, dur: 10}, {at: b2end + 2, amp: 6, dur: 8}]} origin={{x: 540, y: 960}}>
        <svg width={W} height={H} style={{position: 'absolute', inset: 0}}>
          {/* agreement in place */}
          <g transform={`translate(${BX} 702) scale(${chip + chipBump})`} opacity={Math.min(1, chip)} style={{transformOrigin: `${BX}px 735px`}}>
            <rect width={520} height={66} rx={33} fill={C.teal} fillOpacity={0.14} stroke={C.teal} strokeWidth={3} />
            <DocIcon x={40} y={33} size={38} color={C.tealLight} lines={2} />
            <text x={78} y={44} fontFamily={FONT_TEXT} fontWeight={700} fontSize={27} letterSpacing="0.1em" fill={C.off}>
              AGREEMENT IN PLACE
            </text>
            <circle cx={478} cy={33} r={22} fill={C.teal} />
            <CheckMark x={478} y={34} size={26} color={C.deep} sw={5} progress={check} />
          </g>

          <BarGauge x={BX} y={bar1Y} w={BW} label="PURCHASE OBLIGATION" value={money(1500000 * b1)} fill={b1} color={C.cobalt} valueColor={C.cobaltLight} opacity={b1in} />
          <BarGauge
            x={BX}
            y={bar2Y}
            w={BW}
            label="AVAILABLE CASH"
            value={money(1500000 * b2)}
            fill={b2}
            color={C.off}
            valueColor={C.off}
            opacity={b2in}
            hatchFrom={0.2}
            hatchOpacity={gapPulse}
            hatchColor={C.red}
            flicker={flick}
          />

          {/* funding gap bracket */}
          <g opacity={gapIn}>
            <path d={`M ${gapX0} 1124 v 16 H ${BX + BW} v -16`} fill="none" stroke={C.red} strokeWidth={5} strokeLinecap="round" strokeLinejoin="round" pathLength={1} strokeDasharray={1} strokeDashoffset={1 - bracket} />
            <g transform={`translate(${(gapX0 + BX + BW) / 2} 1186) scale(${gapSlam})`}>
              <text textAnchor="middle" fontFamily={FONT_DISPLAY} fontWeight={900} fontSize={46} letterSpacing="-0.01em" wordSpacing="0.14em" fill={C.red}>
                FUNDING GAP · {money(1200000)}
              </text>
            </g>
          </g>
        </svg>
      </Camera>

      <AbsoluteFill style={{background: C.red, opacity: redFlash, pointerEvents: 'none'}} />

      <Headline lines={[[{t: 'WHAT MANY'}], [{t: 'OVERLOOK', c: C.orange}]]} from={cO - 4} exit={cD - 6} maxSize={190} />
      <Headline lines={[[{t: 'AGREEMENT'}], [{t: '≠ ', c: C.red}, {t: 'FUNDING'}]]} from={cD} maxSize={186} stagger={7} />

      <Footnote text="Illustrative figures only." from={cC} />

      <Sfx name="pop" at={10} volume={0.5} />
      <Sfx name="chime_resolve" at={18} volume={0.28} />
      <Sfx name="whoosh" at={cO + 2} volume={0.35} />
      <Sfx name="riser" at={cD - 26} volume={0.5} />
      <Sfx name="thud_low" at={cD + 2} volume={0.85} />
      <Sfx name="glitch" at={cD + 3} volume={0.4} />
      <Sfx name="tick" at={b2start + 4} volume={0.4} />
      <Sfx name="tick" at={b2end + 4} volume={0.45} />
      <Sfx name="tick" at={b2end + 12} volume={0.4} />
      <Sfx name="thud_low" at={b2end + 3} volume={0.6} />
    </AbsoluteFill>
  );
};
