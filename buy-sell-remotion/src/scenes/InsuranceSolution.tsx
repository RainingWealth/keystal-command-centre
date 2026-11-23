import React from 'react';
import {AbsoluteFill, useCurrentFrame, useVideoConfig} from 'remotion';
import {C, EASE_IN_OUT, FONT_DISPLAY, FONT_TEXT, H, prog, sp, W} from '../styles/theme';
import {useCues} from '../hooks/useCue';
import {Camera} from '../components/Camera';
import {SceneLabel} from '../components/SceneLabel';
import {Footnote} from '../components/Footnote';
import {Headline} from '../components/AnimatedTypography';
import {CheckMark, Coin, Family, Person, ShareToken, ShieldIcon} from '../components/icons';
import {FlowPath, line} from '../components/FlowPath';
import {Sfx} from '../components/Sfx';

const PX = 72;
const PY = 700;
const PW = 448;
const PH = 150;
const BUYER = {x: 296, y: 1078};
const FAM = {x: 810, y: 1072};
const BAR = {x: 500, y: 925, w: 470, h: 44};

/** Scene 5 — insurance may fund the buyout, subject to conditions. */
export const InsuranceSolution: React.FC = () => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const cue = useCues();
  const cIns = cue('insurance');
  const cFund = cue('fund');
  const cSub = cue('subject');
  const cTerms = cue('terms');
  const cClaims = cue('claims');
  const cArr = cue('arrangement');

  const policy = sp(frame, fps, cIns - 6, 'pop');
  const list = prog(frame, cFund, 14);
  const rowT = [cSub, cTerms, cClaims].map((c) => prog(frame, c, 10));
  const rowPop = [cSub, cTerms, cClaims].map((c) => sp(frame, fps, c, 'pop'));
  const allChecked = prog(frame, cClaims + 6, 12);
  const barIn = prog(frame, cFund + 2, 14);

  const gateOpen = cClaims + 14;
  const proceeds = prog(frame, gateOpen, 26, EASE_IN_OUT);
  const proceedsLine = prog(frame, gateOpen - 6, 12);
  const gapFill = prog(frame, gateOpen + 24, 24, EASE_IN_OUT);
  const buyerGlow = prog(frame, gateOpen + 22, 10) * (1 - prog(frame, gateOpen + 70, 30));

  const f1 = prog(frame, cArr, 14); // lines draw
  const cash = prog(frame, cArr + 6, 32, EASE_IN_OUT);
  const shares = prog(frame, cArr + 16, 32, EASE_IN_OUT);
  const nodes = sp(frame, fps, gateOpen - 10, 'ui');
  const flow = frame * 1.5;

  const proceedsPath = line({x: BUYER.x, y: PY + PH + 10}, {x: BUYER.x, y: 1018});
  const cashPath = line({x: BUYER.x + 80, y: 1066}, {x: FAM.x - 84, y: 1066});
  const sharePath = line({x: FAM.x - 84, y: 1126}, {x: BUYER.x + 80, y: 1126});

  const rowLabels = ['INSURED EVENT', 'POLICY TERMS MET', 'CLAIM ADMITTED'];

  return (
    <AbsoluteFill>
      <SceneLabel label="05 — THE FUNDING" color={C.teal} index={5} />

      <Camera keys={[{f: 0, s: 1}, {f: cArr, s: 1}, {f: cArr + 60, s: 1.02}]} origin={{x: 540, y: 960}}>
        <svg width={W} height={H} style={{position: 'absolute', inset: 0}}>
          {/* policy */}
          <g opacity={Math.min(1, policy)}>
            <rect x={PX} y={PY} width={PW} height={PH} rx={22} fill={C.panel} stroke={C.teal} strokeWidth={3 + 2 * allChecked} strokeOpacity={0.6 + 0.4 * allChecked} />
            <ShieldIcon x={PX + 70} y={PY + 76} size={92} color={C.teal} check={allChecked} scale={policy} />
            <text x={PX + 138} y={PY + 70} fontFamily={FONT_DISPLAY} fontWeight={900} fontSize={36} letterSpacing="-0.01em" wordSpacing="0.14em" fill={C.off}>
              LIFE POLICY
            </text>
            <text x={PX + 138} y={PY + 108} fontFamily={FONT_TEXT} fontWeight={500} fontSize={26} fill={C.slate}>
              for the buy-sell
            </text>
          </g>

          {/* conditions checklist */}
          <g opacity={list}>
            <text x={548} y={PY + 28} fontFamily={FONT_TEXT} fontWeight={700} fontSize={24} letterSpacing="0.16em" fill={C.slate}>
              SUBJECT TO:
            </text>
            {rowLabels.map((t, i) => {
              const y = PY + 76 + i * 40;
              return (
                <g key={t}>
                  <rect x={548} y={y - 24} width={30} height={30} rx={7} fill={C.teal} fillOpacity={rowT[i]} stroke={rowT[i] > 0.5 ? C.teal : C.slate} strokeWidth={3} strokeDasharray={rowT[i] > 0.5 ? undefined : '6 5'} />
                  <CheckMark x={563} y={y - 8} size={24} color={C.deep} sw={4.5} progress={rowT[i]} scale={0.8 + 0.2 * Math.min(1.2, rowPop[i])} />
                  <text x={594} y={y} fontFamily={FONT_TEXT} fontWeight={700} fontSize={28} letterSpacing="0.06em" fill={rowT[i] > 0.5 ? C.off : C.slate}>
                    {t}
                  </text>
                </g>
              );
            })}
          </g>

          {/* illustrative buyout funding bar: cash + gap → gap may be covered */}
          <g opacity={barIn}>
            <text x={BAR.x} y={BAR.y - 14} fontFamily={FONT_TEXT} fontWeight={700} fontSize={25} letterSpacing="0.12em" fill={C.off}>
              BUYOUT FUNDING
            </text>
            <defs>
              <pattern id="gapHatch5" width="20" height="20" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
                <rect width="20" height="20" fill={C.red} fillOpacity={0.16} />
                <rect width="8" height="20" fill={C.red} fillOpacity={0.8} />
              </pattern>
            </defs>
            <rect x={BAR.x} y={BAR.y} width={BAR.w} height={BAR.h} rx={9} fill="rgba(244,241,234,0.07)" stroke="rgba(244,241,234,0.22)" strokeWidth={2} />
            <rect x={BAR.x + BAR.w * 0.2} y={BAR.y} width={BAR.w * 0.8} height={BAR.h} rx={9} fill="url(#gapHatch5)" opacity={1 - gapFill} />
            <rect x={BAR.x} y={BAR.y} width={BAR.w * 0.2} height={BAR.h} rx={9} fill={C.off} />
            <rect x={BAR.x + BAR.w * 0.2} y={BAR.y} width={BAR.w * 0.8 * gapFill} height={BAR.h} fill={C.teal} />
            <text x={BAR.x + BAR.w} y={BAR.y + BAR.h + 32} textAnchor="end" fontFamily={FONT_TEXT} fontWeight={700} fontSize={25} letterSpacing="0.1em" fill={gapFill > 0.95 ? C.tealLight : C.red}>
              {gapFill > 0.95 ? 'GAP MAY BE COVERED' : 'FUNDING GAP'}
            </text>
          </g>

          {/* proceeds: policy → buyer, only after conditions are met */}
          <FlowPath pts={proceedsPath} draw={proceedsLine} opacity={proceedsLine} color={C.teal} width={5} flow={flow} token={proceeds > 0 && proceeds < 1 ? proceeds : undefined}>
            {(p) => <Coin x={p.x} y={p.y} size={40} color={C.teal} />}
          </FlowPath>
          <text x={BUYER.x + 22} y={955} fontFamily={FONT_TEXT} fontWeight={700} fontSize={24} letterSpacing="0.12em" fill={C.tealLight} opacity={proceedsLine}>
            PROCEEDS
          </text>

          {/* buyer ⇄ family */}
          <g opacity={Math.min(1, nodes)}>
            <circle cx={BUYER.x} cy={BUYER.y} r={72} fill={C.teal} opacity={buyerGlow * 0.3} />
            <Person x={BUYER.x} y={BUYER.y} size={104} color={C.off} />
            <text x={BUYER.x} y={1176} textAnchor="middle" fontFamily={FONT_TEXT} fontWeight={700} fontSize={25} letterSpacing="0.12em" fill={C.off}>
              BUYER
            </text>
            <Family x={FAM.x} y={FAM.y} size={118} color={C.orange} />
            <text x={FAM.x} y={1176} textAnchor="middle" fontFamily={FONT_TEXT} fontWeight={700} fontSize={25} letterSpacing="0.08em" fill={C.off}>
              ESTATE / FAMILY
            </text>
          </g>
          <FlowPath pts={cashPath} draw={f1} opacity={f1} color={C.tealLight} width={5} flow={flow} token={cash > 0 && cash < 1 ? cash : undefined}>
            {(p) => <Coin x={p.x} y={p.y} size={42} color={C.teal} />}
          </FlowPath>
          <FlowPath pts={sharePath} draw={f1} opacity={f1} color={C.cobaltLight} width={5} flow={flow} token={shares > 0 && shares < 1 ? shares : undefined}>
            {(p) => <ShareToken x={p.x} y={p.y} size={44} color={C.cobaltLight} pct={0.5} />}
          </FlowPath>
          <text x={(BUYER.x + FAM.x) / 2} y={1040} textAnchor="middle" fontFamily={FONT_TEXT} fontWeight={700} fontSize={24} letterSpacing="0.12em" fill={C.tealLight} opacity={f1}>
            AGREED PRICE
          </text>
          <text x={(BUYER.x + FAM.x) / 2} y={1166} textAnchor="middle" fontFamily={FONT_TEXT} fontWeight={700} fontSize={24} letterSpacing="0.12em" fill={C.cobaltLight} opacity={f1}>
            SHARES
          </text>
        </svg>
      </Camera>

      <Headline lines={[[{t: 'STRUCTURED'}], [{t: 'INSURANCE', c: C.teal}]]} from={6} exit={cArr - 6} maxSize={190} />
      <Headline lines={[[{t: 'AGREEMENT'}], [{t: '+ ', c: C.teal}, {t: 'FUNDING'}], [{t: '= BETTER PREPARED', c: C.teal}]]} from={cArr - 2} maxSize={150} stagger={7} />

      <Footnote text="Payouts depend on the insured event, policy terms and claims assessment." from={cSub} />

      <Sfx name="pop" at={cIns - 6} volume={0.55} />
      <Sfx name="pop" at={cFund} volume={0.35} />
      <Sfx name="chime_resolve" at={cSub} volume={0.45} />
      <Sfx name="chime_resolve" at={cTerms} volume={0.5} />
      <Sfx name="chime_resolve" at={cClaims} volume={0.6} />
      <Sfx name="whoosh" at={gateOpen} volume={0.4} />
      <Sfx name="hit_soft" at={gateOpen + 24} volume={0.5} />
      <Sfx name="whoosh" at={cArr + 6} volume={0.35} />
      <Sfx name="whoosh" at={cArr + 16} volume={0.3} />
      <Sfx name="hit_soft" at={cArr + 40} volume={0.5} />
      <Sfx name="chime_resolve" at={cArr + 44} volume={0.55} />
    </AbsoluteFill>
  );
};
