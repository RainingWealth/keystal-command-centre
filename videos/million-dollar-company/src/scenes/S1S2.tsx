import React from 'react';
import {AbsoluteFill} from 'remotion';
import {C, FONT, W} from '../config/theme';
import {COPY} from '../config/copy';
import {FIG, sgd, MARGIN} from '../config/figures';
import {OfficeWorld, STAFF_X} from '../components/environment/Office';
import {FounderStanding} from '../components/characters/Founder';
import {Counter, Label, Reveal} from '../components/Text';
import {Glass, Pill, Ring, Scrim} from '../components/UI';
import {appear, easeInOut, easeOut, keys, prog, tween} from '../lib/anim';
import {SCENE, SEG, wordFrame, wordEnd} from '../lib/timeline';
import {useClock} from '../lib/scene';

const S1 = SCENE.S1, S2 = SCENE.S2;

/** One camera path for the shared day-office world, driven by the global frame (S1 + S2 are one continuous shot). */
export const dayCam = (g: number) => {
  const a = S1.end; // push-through ends here
  const cx = keys(g, [[0, 540], [150, 520], [a, 360], [a + 14, 360], [a + 66, 640]]);
  const cy = keys(g, [[0, 1010], [150, 1000], [a, 985], [a + 14, 985], [a + 66, 1130]]);
  const z = keys(g, [[0, 1.0], [150, 1.1], [a, 1.95], [a + 14, 1.95], [a + 66, 1.42], [S2.end, 1.5]]);
  return {cx, cy, z};
};

const blink = (t: number, period = 118, off = 40) => {
  const k = (t + off) % period;
  return k < 5 ? 1 - Math.sin((k / 5) * Math.PI) * 0.92 : 1;
};

const Founder: React.FC<{t: number; smile: number; arms?: 'cross' | 'pockets'}> = ({t, smile, arms = 'cross'}) => (
  <g transform="translate(810 1620)">
    <FounderStanding smile={smile} arms={arms} open={blink(t)} sway={Math.sin(t / 50) * 0.35} rim="#BFF3FA" rimOpacity={0.5} />
  </g>
);

const OrderChips: React.FC<{t: number}> = ({t}) => (
  <g>
    {Array.from({length: 12}).map((_, i) => {
      const s = 26 + i * 13;
      const p = prog(t, s, 40, easeOut);
      if (t < s || t > s + 46) return null;
      const x = STAFF_X[i % 4] + (i % 2 ? 24 : -24);
      const op = Math.min(1, p * 4) * (1 - prog(t, s + 28, 16));
      return (
        <g key={i} transform={`translate(${x} ${1262 - p * 70})`} opacity={op}>
          <rect x={-62} y={-20} width={124} height={40} rx={20} fill={C.cyan} />
          <text x={0} y={8} textAnchor="middle" fontFamily={FONT.text} fontWeight={800} fontSize={21} letterSpacing={1.5} fill={C.navy}>+ ORDER</text>
        </g>
      );
    })}
  </g>
);

export const Scene1: React.FC = () => {
  const {t, g} = useClock();
  const cam = dayCam(g);
  const rev0 = wordFrame('s1a', /over/) - S1.start;
  const titleOut = 1 - prog(t, 78, 14);
  const figOut = 1 - prog(t, 148, 22);
  return (
    <AbsoluteFill>
      <OfficeWorld variant="day" cam={cam} t={t} dashT={t} actors={<><Founder t={t} smile={0.9} /><OrderChips t={t} /></>} />
      <div style={{position: 'absolute', left: 0, right: 0, top: 250, height: 600, background: 'rgba(10,18,34,0.46)', opacity: 1 - prog(t, 150, 25)}} />
      <div style={{opacity: 1 - prog(t, 150, 58, easeInOut)}}><Scrim height={700} strength={0.9} /></div>
      <div style={{position: 'absolute', left: 0, right: 0, top: 232, textAlign: 'center', opacity: appear(t, 4, 14, 0).opacity * (1 - prog(t, 168, 36))}}>
        <div style={{fontFamily: FONT.text, fontWeight: 700, fontSize: 24, letterSpacing: '0.08em', color: C.mute2}}>{COPY.hypothetical}</div>
      </div>
      <div style={{position: 'absolute', left: 0, right: 0, top: 292, opacity: titleOut}}>
        <Reveal text={COPY.titleTop} t={t} start={8} size={46} stagger={2} weight={800} letter={0.01} />
        <Reveal text={COPY.titleBottom} t={t} start={22} size={46} color={'#FF9A9A'} stagger={2} weight={800} letter={0.01} style={{marginTop: 4}} />
      </div>
      <div style={{position: 'absolute', left: 0, right: 0, top: 430, textAlign: 'center', opacity: figOut}}>
        <Label text={COPY.revenueLabel} t={t} start={rev0 - 6} size={34} color={C.cyan} letter={0.22} />
        <div style={{marginTop: 4, textShadow: '0 6px 30px rgba(5,10,20,0.6)', opacity: appear(t, rev0 - 4, 10, 0).opacity}}>
          <Counter to={FIG.revenue} t={t} start={rev0} dur={96} format={sgd} size={134} />
        </div>
      </div>
    </AbsoluteFill>
  );
};

export const Scene2: React.FC = () => {
  const {t, g} = useClock();
  const cam = dayCam(g);
  const a = wordFrame('s2a', /^one point/) - S2.start;
  const aEnd = wordEnd('s2a', /^one point/) - S2.start;
  const b = wordFrame('s2b', /hundred/) - S2.start;
  const bEnd = wordEnd('s2b', /hundred/) - S2.start;
  const labelA = wordFrame('s2a', /^annual/) - S2.start;
  const labelB = wordFrame('s2b', /^reported/) - S2.start;
  const ringStart = b + 4;
  const ring = prog(t, ringStart, 42, easeInOut) * (MARGIN / 100);
    const happy = 1 - prog(t, S2.dur - 70, 40) * 0.6;
  const darken = keys(t, [[0, 0], [10, 0.3], [S2.dur - 54, 0.3], [S2.dur - 30, 0.6], [S2.dur - 4, 1]]);
  const cardIn = prog(t, 8, 22, easeOut);
  const bar = (p: number, c: string, frac: number) => (
    <div style={{height: 10, borderRadius: 6, background: 'rgba(255,255,255,0.10)', marginTop: 12, overflow: 'hidden'}}>
      <div style={{height: '100%', width: `${p * frac * 100}%`, background: c, borderRadius: 6}} />
    </div>
  );
  return (
    <AbsoluteFill>
      <OfficeWorld variant="day" cam={cam} t={S1.dur + t} dashT={S1.dur + t} actors={<Founder t={S1.dur + t} smile={happy} />} />
      <div style={{position: 'absolute', inset: 0, background: `rgba(8,13,24,${darken * 0.62})`}} />
      <Glass x={60} y={286 + (1 - cardIn) * 40} w={600} h={700} r={34} opacity={cardIn}>
        <div style={{padding: '34px 40px'}}>
          <div style={{fontFamily: FONT.text, fontWeight: 700, fontSize: 24, letterSpacing: '0.12em', color: C.mute2}}>{COPY.stmtTitle}</div>
          <div style={{marginTop: 30, opacity: appear(t, labelA - 2, 10, 10).opacity}}>
            <div style={{fontFamily: FONT.text, fontWeight: 600, fontSize: 30, color: C.mute2}}>{COPY.stmtRevenue}</div>
            <Counter to={FIG.revenue} t={t} start={a} dur={Math.max(24, aEnd - a)} format={sgd} size={68} />
            {bar(prog(t, a, 40), C.cyan, 1)}
          </div>
          <div style={{marginTop: 26, opacity: appear(t, labelB - 2, 10, 10).opacity}}>
            <div style={{fontFamily: FONT.text, fontWeight: 600, fontSize: 30, color: C.mute2}}>{COPY.stmtProfit}</div>
            <Counter to={FIG.profit} t={t} start={b} dur={Math.max(24, bEnd - b)} format={sgd} size={68} color={C.cyan} />
            {bar(prog(t, b, 40), C.cyan, FIG.profit / FIG.revenue)}
          </div>
          <div style={{marginTop: 30, display: 'flex', alignItems: 'center', gap: 26, opacity: prog(t, ringStart - 6, 12)}}>
            <Ring size={128} value={ring} color={C.cyan} stroke={15}>
              <Counter to={MARGIN} t={t} start={ringStart} dur={42} format={(n) => `${Math.round(n)}%`} size={38} />
            </Ring>
            <div>
              <div style={{fontFamily: FONT.text, fontWeight: 600, fontSize: 28, color: C.mute2}}>{COPY.stmtMargin}</div>
              <div style={{marginTop: 10, transform: `scale(${0.9 + 0.1 * prog(t, ringStart + 42, 14)})`, transformOrigin: 'left center', opacity: prog(t, ringStart + 42, 12)}}>
                <Pill text={COPY.stmtPill} color={C.cyan} size={26} icon={<span style={{fontSize: 28}}>✓</span>} />
              </div>
            </div>
          </div>
          <div style={{marginTop: 26, fontFamily: FONT.text, fontWeight: 500, fontSize: 26, lineHeight: 1.35, color: C.mute2, opacity: appear(t, b + 10, 18, 8).opacity}}>{COPY.stmtFoot}</div>
        </div>
      </Glass>
      <div style={{position: 'absolute', inset: 0, background: '#05080F', opacity: prog(t, S2.dur - 20, 17, easeInOut)}} />
    </AbsoluteFill>
  );
};
