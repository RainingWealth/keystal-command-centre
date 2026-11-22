import React from 'react';
import {AbsoluteFill, useCurrentFrame, useVideoConfig} from 'remotion';
import {C, EASE_IN_OUT, FONT_DISPLAY, FONT_TEXT, H, prog, sp, W} from '../styles/theme';
import {useCues} from '../hooks/useCue';
import {Camera} from '../components/Camera';
import {SceneLabel} from '../components/SceneLabel';
import {Footnote} from '../components/Footnote';
import {Headline} from '../components/AnimatedTypography';
import {ShareholderDonut} from '../components/ShareholderDiagram';
import {Building, Coin, Cross, DocIcon, Family, Person, ShareToken} from '../components/icons';
import {FlowPath} from '../components/FlowPath';
import {Sfx} from '../components/Sfx';

const DX = 316;
const DY = 930;
const DR = 118;
const DT = 52;
const RX = 770; // right column centre

const Badge: React.FC<{x: number; y: number; s: number; t: string; color?: string; rot?: number}> = ({x, y, s, t, color = C.orange, rot = 0}) => (
  <g transform={`translate(${x} ${y}) rotate(${rot}) scale(${s})`} opacity={Math.min(1, s)}>
    <circle r={22} fill={color} />
    <text textAnchor="middle" dominantBaseline="central" y={2} fontFamily={FONT_DISPLAY} fontWeight={900} fontSize={30} fill={C.deep}>
      {t}
    </text>
  </g>
);

/** Scene 2 — shares drift to the estate; family wants cash, not shares. */
export const OwnershipRisk: React.FC = () => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const cue = useCues();
  const cE = cue('estate');
  const cS = cue('sharing');
  const cP = cue('people');
  const cI = cue('involved');
  const cF = cue('family');
  const cC = cue('cash');
  const cN = cue('notShares');

  const dIn = prog(frame, 2, 22);
  const pulse = 0.55 + 0.45 * Math.sin(frame * 0.22);
  const fill = prog(frame, cS + 8, 24, EASE_IN_OUT);
  const estIcon = sp(frame, fps, cE - 8, 'pop');
  const t1 = prog(frame, cE + 4, 34, EASE_IN_OUT);
  const t2 = prog(frame, cS + 2, 30, EASE_IN_OUT);
  const famIcon = sp(frame, fps, cS + 10, 'pop');
  const q = [0, 1, 2].map((i) => sp(frame, fps, cP + i * 6, 'pop'));
  const lab = prog(frame, cP + 4, 12);
  const youIn = sp(frame, fps, 10, 'pop');
  const worry = prog(frame, cI - 6, 10);
  const shake = Math.sin(frame * 1.9) * 3 * worry * (1 - prog(frame, cI + 40, 20));
  const coin = sp(frame, fps, cC, 'pop');
  const wedge = sp(frame, fps, cN - 4, 'pop');
  const cross = prog(frame, cN + 6, 10);
  const estGlow = prog(frame, cE + 34, 10) * (1 - prog(frame, cE + 70, 30));
  const famHalo = (prog(frame, cF, 10) * (0.6 + 0.4 * Math.sin(frame * 0.3))) * (1 - prog(frame, cC + 20, 14));

  const p1: [{x: number; y: number}, {x: number; y: number}, {x: number; y: number}, {x: number; y: number}] = [
    {x: DX + DR + DT / 2 + 14, y: DY - 40},
    {x: 560, y: DY - 130},
    {x: 640, y: 770},
    {x: RX - 66, y: 752},
  ];
  const p2: [{x: number; y: number}, {x: number; y: number}, {x: number; y: number}, {x: number; y: number}] = [
    {x: RX + 62, y: 782},
    {x: RX + 150, y: 800},
    {x: RX + 150, y: 930},
    {x: RX + 80, y: 960},
  ];

  return (
    <AbsoluteFill>
      <SceneLabel label="02 — THE PROBLEM" color={C.orange} index={2} />

      <Camera keys={[{f: 0, s: 1}, {f: cE, s: 1}, {f: cC + 40, s: 1.035}]} origin={{x: 540, y: 960}}>
        <svg width={W} height={H} style={{position: 'absolute', inset: 0}}>
          {/* donut: left half YOU, right half orphaned → estate/family */}
          <g opacity={dIn}>
            <ShareholderDonut cx={DX} cy={DY} r={DR} thickness={DT} segments={[{pct: 50, color: 'transparent'}, {pct: 50, color: C.cobalt}]}>
              <Building x={DX} y={DY - 6} size={70} color={C.off} opacity={0.9} />
            </ShareholderDonut>
          </g>
          <ShareholderDonut
            cx={DX}
            cy={DY}
            r={DR}
            thickness={DT}
            segments={[{pct: 50, color: 'transparent', hollow: true, opacity: dIn * (0.45 + 0.55 * pulse) * (1 - fill), dashOffset: -frame * 0.9}, {pct: 50, color: 'transparent', opacity: 0}]}
          />
          <ShareholderDonut cx={DX} cy={DY} r={DR} thickness={DT} draw={fill * 0.5} segments={[{pct: 50, color: C.orange}, {pct: 50, color: 'transparent', opacity: 0}]} />

          {/* legend under the donut */}
          <g opacity={youIn}>
            <g transform={`translate(${shake} 0)`}>
              <Person x={104} y={1128} size={66} color={C.off} />
              <Badge x={138} y={1096} s={worry} t="!" rot={shake * 2} />
            </g>
            <text x={168} y={1140} fontFamily={FONT_TEXT} fontWeight={700} fontSize={28} letterSpacing="0.1em" fill={C.cobaltLight}>
              YOU · 50%
            </text>
          </g>
          <g opacity={fill}>
            <rect x={72} y={1176} width={22} height={22} fill={C.orange} />
            <text x={110} y={1196} fontFamily={FONT_TEXT} fontWeight={700} fontSize={28} letterSpacing="0.1em" fill={C.orange}>
              ESTATE / FAMILY · 50%
            </text>
          </g>

          {/* estate */}
          <g opacity={Math.min(1, estIcon)}>
            <circle cx={RX} cy={752} r={74} fill={C.orange} opacity={estGlow * 0.25} />
            <DocIcon x={RX} y={748} size={104} color={C.off} seal scale={estIcon} />
            <text x={RX} y={840} textAnchor="middle" fontFamily={FONT_DISPLAY} fontWeight={900} fontSize={40} letterSpacing="0.02em" fill={C.off}>
              ESTATE
            </text>
          </g>
          <FlowPath pts={p1} draw={prog(frame, cE, 20)} color={C.orange} width={5} flow={frame * 1.4} token={t1 > 0 && t1 < 1 ? t1 : undefined}>
            {(p) => <ShareToken x={p.x} y={p.y} size={52} color={C.orange} pct={0.5} />}
          </FlowPath>
          <FlowPath pts={p2} draw={prog(frame, cS, 18)} color={C.orange} width={5} flow={frame * 1.4} token={t2 > 0 && t2 < 1 ? t2 : undefined}>
            {(p) => <ShareToken x={p.x} y={p.y} size={46} color={C.orange} pct={0.5} />}
          </FlowPath>

          {/* family / unplanned co-owners */}
          <g opacity={Math.min(1, famIcon)}>
            <circle cx={RX} cy={985} r={96} fill="none" stroke={C.orange} strokeWidth={4} strokeDasharray="10 10" opacity={famHalo * 0.9} />
            <Family x={RX} y={992} size={140} color={C.orange} scale={famIcon} />
            <text x={RX} y={1100} textAnchor="middle" fontFamily={FONT_DISPLAY} fontWeight={900} fontSize={40} letterSpacing="0.02em" fill={C.off}>
              FAMILY
            </text>
            <text x={RX} y={1130} textAnchor="middle" fontFamily={FONT_TEXT} fontWeight={500} fontSize={25} fill={C.slate} opacity={lab}>
              unplanned co-owners
            </text>
          </g>
          {[-52, 0, 52].map((dx, i) => (
            <Badge key={i} x={RX + dx} y={906 - (i === 1 ? 8 : 0)} s={q[i]} t="?" rot={(i - 1) * 8} />
          ))}

          {/* cash, not shares */}
          <g>
            <circle cx={640} cy={1174} r={52} fill={C.teal} opacity={0.22 * coin * (0.6 + 0.4 * Math.sin(frame * 0.3))} />
            <Coin x={640} y={1174} size={64} color={C.teal} scale={coin} opacity={Math.min(1, coin)} />
            <text x={684} y={1184} fontFamily={FONT_TEXT} fontWeight={700} fontSize={28} letterSpacing="0.1em" fill={C.tealLight} opacity={Math.min(1, coin)}>
              CASH
            </text>
            <ShareToken x={826} y={1174} size={64} color={C.orange} pct={0.5} scale={wedge} opacity={Math.min(1, wedge) * (1 - 0.45 * cross)} />
            <Cross x={826} y={1174} size={58} color={C.red} progress={cross} />
            <text x={870} y={1184} fontFamily={FONT_TEXT} fontWeight={700} fontSize={28} letterSpacing="0.1em" fill={C.off} opacity={Math.min(1, wedge) * (1 - 0.5 * cross)}>
              SHARES
            </text>
          </g>
        </svg>
      </Camera>

      <Headline lines={[[{t: 'THEIR'}], [{t: 'SHARES', c: C.orange}]]} from={6} exit={cE - 4} maxSize={190} />
      <Headline lines={[[{t: 'MAY PASS TO'}], [{t: 'THE '}, {t: 'ESTATE', c: C.orange}]]} from={cE} exit={cS - 4} maxSize={170} />
      <Headline lines={[[{t: 'UNPLANNED'}], [{t: 'CO-OWNERS'}, {t: '?', c: C.orange}]]} from={cS} exit={cC - 4} maxSize={170} />
      <Headline lines={[[{t: 'OWNERSHIP RISK', c: C.orange}], [{t: '+ CASH FLOW'}], [{t: 'PRESSURE', c: C.red}]]} from={cC} maxSize={150} stagger={5} />

      <Footnote text="Outcomes depend on the company's constitution, shareholder arrangements and applicable law." from={cE + 10} />

      <Sfx name="pop" at={10} volume={0.4} />
      <Sfx name="pop" at={cE - 8} volume={0.5} />
      <Sfx name="whoosh" at={cE + 4} volume={0.4} />
      <Sfx name="glitch" at={cS} volume={0.45} />
      <Sfx name="hit_soft" at={cS + 12} volume={0.5} />
      <Sfx name="pop" at={cP} volume={0.45} />
      <Sfx name="pop" at={cP + 6} volume={0.4} />
      <Sfx name="pop" at={cP + 12} volume={0.4} />
      <Sfx name="tick" at={cI} volume={0.5} />
      <Sfx name="pop" at={cC} volume={0.55} />
      <Sfx name="thud_low" at={cC + 2} volume={0.6} />
      <Sfx name="glitch" at={cN + 6} volume={0.4} />
    </AbsoluteFill>
  );
};
