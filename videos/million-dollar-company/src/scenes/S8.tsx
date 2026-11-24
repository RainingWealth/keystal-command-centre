import React from 'react';
import {AbsoluteFill} from 'remotion';
import {C, FONT} from '../config/theme';
import {COPY} from '../config/copy';
import {OfficeWorld} from '../components/environment/Office';
import {FounderStanding} from '../components/characters/Founder';
import {Scrim} from '../components/UI';
import {easeInOut, easeOut, lin, prog, tween} from '../lib/anim';
import {SCENE, SEG, wordFrame} from '../lib/timeline';
import {useClock} from '../lib/scene';

const S8 = SCENE.S8;
export const T8 = {
  rev: wordFrame('s8a', /revenue/) - S8.start,
  prof: wordFrame('s8b', /profit/) - S8.start,
  cash: wordFrame('s8c', /^cash/) - S8.start,
  fin: SEG.s8d.start - S8.start,
  q: SEG.s8e.start - S8.start,
};

export const Scene8: React.FC = () => {
  const {t} = useClock();
  const cam = {cx: 540, cy: 1000, z: tween(t, 0, S8.dur, 1.0, 1.07, lin)};
  const blink = (t + 20) % 110 < 5 ? 0.15 : 1;
  const wordStyle = (appearAt: number, dimAt: number | null, size: number, color: string): React.CSSProperties => {
    const p = prog(t, appearAt, 16, easeOut);
    const dim = dimAt === null ? 0 : prog(t, dimAt, 18);
    return {fontFamily: FONT.display, fontWeight: 900, fontSize: size, letterSpacing: '-0.03em', lineHeight: 1, color, opacity: p * (1 - 0.78 * dim), transform: `translateY(${(1 - p) * 40}px) scale(${1 - 0.06 * dim})`, textAlign: 'center'};
  };
  const cashP = prog(t, T8.cash, 16, easeOut);
  const finOp = prog(t, T8.fin, 14) * (1 - prog(t, T8.q - 8, 12));
  const qOp = prog(t, T8.q, 16);
  return (
    <AbsoluteFill>
      <OfficeWorld variant="dawn" cam={cam} t={t} staff={false} dashOn={-0.45} dashT={400} hidePlant
        actors={<g transform="translate(540 1790) scale(1.15)"><FounderStanding smile={0.45} arms="pockets" open={blink} rim="#FFD6A6" rimOpacity={0.6} sway={Math.sin(t / 60) * 0.3} /></g>} />
      <Scrim top={230} height={900} strength={0.62} />
      <div style={{position: 'absolute', left: 0, right: 0, top: 262}}>
        <div style={wordStyle(T8.rev, T8.prof, 108, C.white)}>{COPY.revenueWord}</div>
        <div style={{...wordStyle(T8.prof, T8.cash, 108, C.white), marginTop: 10}}>{COPY.profitWord}</div>
        <div style={{position: 'relative', marginTop: 18}}>
          <div style={{position: 'absolute', left: 140, right: 140, top: -10, height: 250, borderRadius: 125, background: `radial-gradient(ellipse at center, rgba(33,198,215,${0.35 * cashP}) 0%, rgba(33,198,215,0) 70%)`}} />
          <div style={{...wordStyle(T8.cash, null, 236, C.cyan), transform: `scale(${1.22 - 0.22 * cashP})`, position: 'relative', textShadow: '0 8px 40px rgba(33,198,215,0.45)'}}>{COPY.cashWord}</div>
        </div>
      </div>
      <div style={{position: 'absolute', left: 60, right: 60, top: 806, height: 300, borderRadius: 40, background: 'rgba(10,17,30,0.88)', opacity: Math.max(finOp, qOp) }} />
      <div style={{position: 'absolute', left: 90, right: 90, top: 818, height: 230, display: 'flex', alignItems: 'center', justifyContent: 'center', textAlign: 'center', fontFamily: FONT.display, fontWeight: 800, fontSize: 68, lineHeight: 1.12, letterSpacing: '-0.02em', color: C.white, opacity: finOp, transform: `translateY(${(1 - prog(t, T8.fin, 18, easeOut)) * 24}px)`}}>
        <span>A profitable business can still run out of <span style={{color: C.cyan}}>cash.</span></span>
      </div>
      <div style={{position: 'absolute', left: 90, right: 90, top: 818, height: 230, display: 'flex', alignItems: 'center', justifyContent: 'center', textAlign: 'center', fontFamily: FONT.display, fontWeight: 800, fontSize: 62, lineHeight: 1.15, letterSpacing: '-0.015em', color: C.amberSoft, opacity: qOp, transform: `translateY(${(1 - qOp) * 24}px)`}}>
        <span>Is your business ready for a <span style={{color: C.amber, whiteSpace: 'nowrap'}}>90-day</span> payment delay?</span>
      </div>
      <div style={{position: 'absolute', left: 70, right: 70, top: 1054, textAlign: 'center', fontFamily: FONT.text, fontWeight: 500, fontSize: 25, letterSpacing: '0.04em', color: C.mute2, opacity: prog(t, T8.q + 24, 20)}}>{COPY.disclaimer}</div>
      <div style={{position: 'absolute', inset: 0, background: '#04060C', opacity: prog(t, S8.dur - 52, 48, easeInOut)}} />
    </AbsoluteFill>
  );
};
