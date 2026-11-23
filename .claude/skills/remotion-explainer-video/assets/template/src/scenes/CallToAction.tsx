import React from 'react';
import {AbsoluteFill, useCurrentFrame, useVideoConfig} from 'remotion';
import {C, EASE_IN_OUT, EASE_OUT, FONT_DISPLAY, FONT_TEXT, H, prog, sp, W} from '../styles/theme';
import {useCues, useScene} from '../hooks/useCue';
import {config} from '../config';
import {Camera} from '../components/Camera';
import {SceneLabel} from '../components/SceneLabel';
import {Footnote} from '../components/Footnote';
import {Headline} from '../components/AnimatedTypography';
import {ShareholderDonut} from '../components/ShareholderDiagram';
import {Building, Gear} from '../components/icons';
import {Sfx} from '../components/Sfx';

const DX = 240;
const DY = 818;
const DR = 100;
const DT = 44;
const CHART = [
  [640, 906],
  [716, 868],
  [790, 882],
  [862, 814],
  [944, 746],
] as const;

/** Scene 6 — the business has a future; does your agreement? End card with the CTA. */
export const CallToAction: React.FC = () => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const cue = useCues();
  const scene = useScene();
  const cSh = cue('shareholders');
  const cSu = cue('succession');
  const cBook = cue('book');
  const cRev = cue('review');
  const end = scene.duration;

  const draw = prog(frame, 6, 30, EASE_IN_OUT);
  const rim = prog(frame, 24, 32, EASE_IN_OUT);
  const gearIn = sp(frame, fps, 18, 'pop');
  const chart = prog(frame, cSh - 6, 44, EASE_IN_OUT);
  const chartLabel = prog(frame, cSh + 36, 14);
  const dim = 1 - 0.5 * prog(frame, cBook - 4, 14);
  const block = sp(frame, fps, cBook, 'slam');
  const sweep = ((frame - cBook - 20) % 70) / 70;
  const nudge = Math.sin(frame * 0.2) * 5;
  const fadeOut = 1 - prog(frame, end - 12, 12);
  const pulse = 1 + 0.01 * Math.sin(frame * 0.18) * prog(frame, cBook + 20, 10);

  const pts = CHART.map(([x, y]) => `${x},${y}`).join(' ');

  return (
    <AbsoluteFill style={{opacity: fadeOut}}>
      <SceneLabel label="06 — NEXT STEP" color={C.teal} index={6} />

      <Camera keys={[{f: 0, s: 1}, {f: cBook, s: 1}, {f: end, s: 1.02}]} origin={{x: 540, y: 960}}>
        <svg width={W} height={H} style={{position: 'absolute', inset: 0}}>
          <g opacity={dim}>
            {/* whole, protected ownership */}
            <ShareholderDonut cx={DX} cy={DY} r={DR} thickness={DT} draw={draw} segments={[{pct: 50, color: C.cobaltLight}, {pct: 50, color: C.cobalt}]}>
              <Building x={DX} y={DY - 4} size={64} color={C.off} opacity={prog(frame, 20, 12)} />
            </ShareholderDonut>
            <circle cx={DX} cy={DY} r={DR + DT / 2 + 16} fill="none" stroke={C.teal} strokeWidth={7} pathLength={100} strokeDasharray={`${100 * rim} 100`} transform={`rotate(-90 ${DX} ${DY})`} strokeLinecap="round" />
            {/* operations continue */}
            <Gear x={500} y={DY - 6} size={104} color={C.off} rotate={frame * 1.1} scale={gearIn} opacity={Math.min(1, gearIn) * 0.95} />
            <line x1={630} y1={936} x2={970} y2={936} stroke={C.slate} strokeWidth={3} opacity={chart} />
            <polyline points={pts} fill="none" stroke={C.teal} strokeWidth={8} strokeLinecap="round" strokeLinejoin="round" pathLength={1} strokeDasharray={1} strokeDashoffset={1 - chart} />
            {CHART.map(([x, y], i) => (
              <circle key={i} cx={x} cy={y} r={9} fill={C.tealLight} opacity={prog(frame, cSh - 6 + (i / 4) * 40, 6)} />
            ))}
            <text x={DX} y={DY + DR + DT / 2 + 50} textAnchor="middle" fontFamily={FONT_TEXT} fontWeight={700} fontSize={22} letterSpacing="0.14em" fill={C.slate} opacity={chartLabel}>
              OWNERSHIP
            </text>
            <text x={805} y={978} textAnchor="middle" fontFamily={FONT_TEXT} fontWeight={700} fontSize={22} letterSpacing="0.14em" fill={C.tealLight} opacity={chartLabel}>
              BUSINESS CONTINUES
            </text>
          </g>

          {/* CTA block */}
          <g transform={`translate(540 1128) scale(${block * pulse}) translate(-540 -1128)`} opacity={Math.min(1, block)}>
            <defs>
              <clipPath id="ctaClip">
                <rect x={72} y={1040} width={898} height={176} rx={28} />
              </clipPath>
            </defs>
            <rect x={72} y={1040} width={898} height={176} rx={28} fill={C.teal} />
            <g clipPath="url(#ctaClip)">
              <rect x={72 + sweep * 1300 - 300} y={1020} width={90} height={220} fill="#fff" opacity={0.22} transform={`skewX(-18)`} />
            </g>
            <text x={112} y={1102} fontFamily={FONT_DISPLAY} fontWeight={900} fontSize={58} letterSpacing="-0.03em" wordSpacing="0.14em" fill={C.deep}>
              {config.cta.lead}
            </text>
            <text x={112} y={1146} fontFamily={FONT_DISPLAY} fontWeight={900} fontSize={37} letterSpacing="-0.02em" wordSpacing="0.14em" fill={C.deep}>
              {config.cta.main}
            </text>
            <text x={112} y={1194} fontFamily={FONT_TEXT} fontWeight={700} fontSize={26} letterSpacing="0.16em" fill={C.deep} opacity={0.82}>
              {config.cta.action}
            </text>
            <g transform={`translate(${902 + nudge} 1182)`}>
              <path d="M -34 0 H 28 M 6 -20 L 28 0 L 6 20" fill="none" stroke={C.deep} strokeWidth={8} strokeLinecap="round" strokeLinejoin="round" />
            </g>
          </g>
        </svg>
      </Camera>

      <Headline lines={[[{t: 'YOUR BUSINESS'}], [{t: 'HAS A '}, {t: 'FUTURE.', c: C.teal}]]} from={6} exit={cSu - 4} maxSize={170} />
      <Headline lines={[[{t: 'DOES YOUR'}], [{t: 'SHAREHOLDER'}], [{t: 'AGREEMENT?', c: C.teal}]]} from={cSu - 2} maxSize={128} stagger={6} />

      <Footnote text={`${config.disclaimer}${config.brand ? '  ·  ' + config.brand : ''}`} from={cBook + 14} top={1236} />

      <Sfx name="hit_soft" at={8} volume={0.45} />
      <Sfx name="pop" at={18} volume={0.4} />
      <Sfx name="chime_resolve" at={cSh + 30} volume={0.4} />
      <Sfx name="hit_soft" at={cSu} volume={0.5} />
      <Sfx name="riser" at={cBook - 22} volume={0.4} />
      <Sfx name="thud_low" at={cBook + 1} volume={0.7} />
      <Sfx name="chime_resolve" at={cBook + 6} volume={0.55} />
    </AbsoluteFill>
  );
};
