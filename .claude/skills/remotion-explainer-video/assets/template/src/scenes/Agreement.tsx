import React from 'react';
import {AbsoluteFill, useCurrentFrame, useVideoConfig} from 'remotion';
import {C, EASE_IN_OUT, FONT_DISPLAY, FONT_TEXT, H, prog, sp, W} from '../styles/theme';
import {useCues} from '../hooks/useCue';
import {Camera} from '../components/Camera';
import {SceneLabel} from '../components/SceneLabel';
import {Headline} from '../components/AnimatedTypography';
import {NodeCard} from '../components/NodeCard';
import {CheckMark, DocIcon, Person, ShareToken} from '../components/icons';
import {FlowPath, line} from '../components/FlowPath';
import {Sfx} from '../components/Sfx';

const DOC = {x: 72, y: 720, w: 280, h: 480};
const CARD_X = 392;
const CARD_W = 578;
const SPINE_X = 372;

/** Scene 3 — the agreement: trigger → valuation → transfer. */
export const Agreement: React.FC = () => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const cue = useCues();
  const cA = cue('agreement');
  const cEv = cue('event');
  const cBuy = cue('buy');
  const cPr = cue('price');
  const cTe = cue('terms');
  const cTr = cue('transfer');

  const docIn = prog(frame, cA - 14, 16);
  const frameDraw = prog(frame, cA - 14, 26, EASE_IN_OUT);
  const rules = [0, 1, 2, 3, 4, 5].map((i) => prog(frame, cA + 4 + i * 5, 14));
  const sig = prog(frame, cEv - 28, 24, EASE_IN_OUT);
  const seal = sp(frame, fps, cEv - 2, 'slam');
  const spine = prog(frame, cEv - 12, 40, EASE_IN_OUT);

  const c1 = prog(frame, cEv - 6, 14);
  const c1hi = prog(frame, cEv, 8) * (1 - prog(frame, cEv + 40, 20));
  const c2 = prog(frame, cPr - 6, 14);
  const c2hi = prog(frame, cPr, 8) * (1 - prog(frame, cPr + 40, 20));
  const c3 = prog(frame, cBuy - 8, 14); // ghost card with buyer
  const c3solid = prog(frame, cTe - 4, 12);
  const c3hi = prog(frame, cTr, 8);
  const buyer = sp(frame, fps, cBuy, 'pop');
  const buyerHi = prog(frame, cBuy, 8) * (1 - prog(frame, cBuy + 45, 20)) + c3solid * 0.35;
  const estate = prog(frame, cTe, 12);
  const arrow = prog(frame, cTe + 6, 14, EASE_IN_OUT);
  const tok = prog(frame, cTr - 2, 34, EASE_IN_OUT);

  const c3y = 980;
  const rowY = c3y + 146;
  const estX = CARD_X + 80;
  const buyX = CARD_X + CARD_W - 90;
  const tokPath = line({x: estX + 50, y: rowY}, {x: buyX - 54, y: rowY});

  return (
    <AbsoluteFill>
      <SceneLabel label="03 — THE AGREEMENT" color={C.cobaltLight} index={3} />

      <Camera keys={[{f: 0, s: 1}, {f: cTe, s: 1}, {f: cTr + 50, s: 1.025}]} origin={{x: 540, y: 960}}>
        <svg width={W} height={H} style={{position: 'absolute', inset: 0}}>
          {/* the agreement document */}
          <g opacity={docIn}>
            <rect x={DOC.x} y={DOC.y} width={DOC.w} height={DOC.h} rx={20} fill={C.panel} fillOpacity={frameDraw} />
            <rect x={DOC.x} y={DOC.y} width={DOC.w} height={DOC.h} rx={20} fill="none" stroke={C.cobaltLight} strokeWidth={4} pathLength={1} strokeDasharray={1} strokeDashoffset={1 - frameDraw} />
            <text x={DOC.x + 28} y={DOC.y + 70} fontFamily={FONT_DISPLAY} fontWeight={900} fontSize={40} letterSpacing="-0.02em" wordSpacing="0.14em" fill={C.off} opacity={prog(frame, cA - 6, 12)}>
              BUY-SELL
            </text>
            <text x={DOC.x + 28} y={DOC.y + 116} fontFamily={FONT_DISPLAY} fontWeight={900} fontSize={34} letterSpacing="-0.01em" wordSpacing="0.14em" fill={C.cobaltLight} opacity={prog(frame, cA - 2, 12)}>
              AGREEMENT
            </text>
            {rules.map((r, i) => (
              <rect key={i} x={DOC.x + 28} y={DOC.y + 160 + i * 38} width={(i % 3 === 2 ? 150 : 224) * r} height={10} rx={5} fill={C.off} opacity={0.28} />
            ))}
            {/* signature */}
            <line x1={DOC.x + 28} x2={DOC.x + 190} y1={DOC.y + 426} y2={DOC.y + 426} stroke={C.slate} strokeWidth={3} opacity={prog(frame, cEv - 30, 10)} />
            <path
              d={`M ${DOC.x + 34} ${DOC.y + 410} c 14 -34 28 -34 24 -2 s 18 22 26 -14 s 14 26 24 2 s 18 -22 30 -4`}
              fill="none"
              stroke={C.tealLight}
              strokeWidth={5}
              strokeLinecap="round"
              pathLength={1}
              strokeDasharray={1}
              strokeDashoffset={1 - sig}
            />
            <g transform={`translate(${DOC.x + 222} ${DOC.y + 400}) scale(${seal}) rotate(${(1 - Math.min(1, seal)) * -24})`} opacity={Math.min(1, seal)}>
              <circle r={36} fill={C.teal} />
              <circle r={28} fill="none" stroke={C.deep} strokeOpacity={0.4} strokeWidth={3} />
              <CheckMark x={0} y={2} size={34} color={C.deep} sw={7} />
            </g>
          </g>

          {/* spine + stubs */}
          <path d={`M ${SPINE_X} 775 V 1090`} stroke={C.cobaltLight} strokeWidth={4} strokeOpacity={0.6} pathLength={1} strokeDasharray={1} strokeDashoffset={1 - spine} fill="none" />
          <path d={`M ${DOC.x + DOC.w} 960 H ${SPINE_X}`} stroke={C.cobaltLight} strokeWidth={4} strokeOpacity={0.6} pathLength={1} strokeDasharray={1} strokeDashoffset={1 - prog(frame, cEv - 20, 14)} fill="none" />

          {/* 01 triggering event */}
          <NodeCard x={CARD_X} y={720} w={CARD_W} h={116} num="01" title="TRIGGERING EVENT" sub="what sets the transfer in motion" color={C.orange} appear={c1} hi={c1hi} />
          {/* 02 share valuation */}
          <NodeCard x={CARD_X} y={850} w={CARD_W} h={116} num="02" title="SHARE VALUATION" sub="how the price is worked out" color={C.cobaltLight} appear={c2} hi={c2hi} />
          {/* 03 ownership transfer (ghost with buyer first, then solid) */}
          <g opacity={c3}>
            <rect x={CARD_X} y={c3y} width={CARD_W} height={236} rx={22} fill={C.panel} fillOpacity={c3solid} stroke={C.teal} strokeOpacity={0.35 + 0.65 * Math.max(c3solid, c3hi)} strokeWidth={3 + 2 * c3hi} strokeDasharray={c3solid > 0.5 ? undefined : '12 10'} />
            <g opacity={c3solid}>
              <rect x={CARD_X} y={c3y + 18} width={10} height={64} fill={C.teal} />
              <text x={CARD_X + 38} y={c3y + 58} fontFamily={FONT_DISPLAY} fontWeight={900} fontSize={34} fill={C.tealLight}>
                03
              </text>
              <text x={CARD_X + 104} y={c3y + 58} fontFamily={FONT_TEXT} fontWeight={700} fontSize={31} letterSpacing="0.1em" fill={C.off}>
                OWNERSHIP TRANSFER
              </text>
            </g>
            {/* buyer */}
            <circle cx={buyX} cy={rowY} r={50} fill={C.cobalt} opacity={buyerHi * 0.35} />
            <Person x={buyX} y={rowY + 4} size={78} color={C.off} scale={buyer} opacity={Math.min(1, buyer)} />
            <text x={buyX} y={c3y + 204} textAnchor="middle" fontFamily={FONT_TEXT} fontWeight={700} fontSize={24} letterSpacing="0.12em" fill={buyerHi > 0.2 && c3solid < 0.5 ? C.tealLight : C.off} opacity={Math.min(1, buyer)}>
              {c3solid < 0.5 ? 'WHO CAN BUY' : 'BUYER'}
            </text>
            {/* estate */}
            <g opacity={estate}>
              <DocIcon x={estX} y={rowY} size={70} color={C.off} lines={2} />
              <text x={estX} y={c3y + 204} textAnchor="middle" fontFamily={FONT_TEXT} fontWeight={700} fontSize={24} letterSpacing="0.12em" fill={C.off}>
                ESTATE
              </text>
            </g>
            <g opacity={estate}>
              <FlowPath pts={tokPath} draw={arrow} color={C.tealLight} width={4} flow={frame * 1.2} token={tok > 0 && tok < 1 ? tok : undefined} track>
                {(p) => <ShareToken x={p.x} y={p.y} size={46} color={C.cobaltLight} pct={0.5} />}
              </FlowPath>
              <text x={(estX + buyX) / 2} y={c3y + 98} textAnchor="middle" fontFamily={FONT_TEXT} fontWeight={600} fontSize={24} letterSpacing="0.12em" fill={C.tealLight} opacity={arrow}>
                UNDER THE AGREED TERMS
              </text>
            </g>
          </g>
        </svg>
      </Camera>

      <Headline lines={[[{t: 'BUY-SELL'}], [{t: 'AGREEMENT', c: C.cobaltLight}]]} from={cA - 6} exit={cTe - 4} maxSize={190} />
      <Headline lines={[[{t: 'PLAN THE TRANSFER'}], [{t: 'BEFORE A CRISIS', c: C.cobaltLight}]]} from={cTe} maxSize={150} stagger={6} />

      <Sfx name="pop" at={cA - 14} volume={0.45} />
      <Sfx name="tick" at={cA + 4} volume={0.35} />
      <Sfx name="tick" at={cA + 14} volume={0.3} />
      <Sfx name="tick" at={cA + 24} volume={0.3} />
      <Sfx name="hit_soft" at={cEv - 2} volume={0.6} />
      <Sfx name="pop" at={cEv - 6} volume={0.5} />
      <Sfx name="pop" at={cBuy} volume={0.5} />
      <Sfx name="pop" at={cPr - 6} volume={0.5} />
      <Sfx name="hit_soft" at={cTe} volume={0.55} />
      <Sfx name="whoosh" at={cTr - 2} volume={0.4} />
      <Sfx name="chime_resolve" at={cTr + 30} volume={0.35} />
    </AbsoluteFill>
  );
};
