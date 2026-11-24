import React from 'react';
import {AbsoluteFill} from 'remotion';
import {C, FONT, H, W} from '../config/theme';
import {COPY} from '../config/copy';
import {FIG, SHORTFALL, sgd} from '../config/figures';
import {OfficeWorld} from '../components/environment/Office';
import {FounderBust} from '../components/characters/Founder';
import {CalendarIcon} from '../components/props/Props';
import {Counter} from '../components/Text';
import {Glass} from '../components/UI';
import {appear, easeInOut, easeOut, hexMix, keys, prog} from '../lib/anim';
import {SCENE, SEG, wordFrame} from '../lib/timeline';
import {useClock} from '../lib/scene';

const S3 = SCENE.S3;
export const T3 = {
  ping: SEG.s3c.start - Math.round(0.35 * 30) - S3.start, // notification lands (scene frames)
  fig: wordFrame('s3b', /^fourteen/) - S3.start,
  shortfall: SEG.s3c.start + SEG.s3c.dur - S3.start - 6,
};

const blink = (t: number, period = 104, off = 30) => {
  const k = (t + off) % period;
  return k < 5 ? 1 - Math.sin((k / 5) * Math.PI) * 0.92 : 1;
};

const NightDesk: React.FC<{t: number}> = ({t}) => (
  <g>
    <defs>
      <radialGradient id="lampPool" cx="50%" cy="50%" r="50%"><stop offset="0" stopColor="#FFD28A" stopOpacity={0.5} /><stop offset="1" stopColor="#FFD28A" stopOpacity={0} /></radialGradient>
    </defs>
    <ellipse cx={900} cy={1300} rx={330} ry={150} fill="url(#lampPool)" />
    <g transform="translate(780 1150) scale(0.62)"><FounderBust smile={0.25} worry={0.1} open={blink(t)} gy={5} dim={0.3} rim="#FFD28A" rimOpacity={0.5} glow="#BFE9FF" glowOpacity={0.18} breathe={Math.sin(t / 22) * 2} /></g>
    <g transform="translate(780 1300)">
      <rect x={-112} y={-62} width={224} height={134} rx={10} fill="#1B2640" />
      <rect x={-104} y={-54} width={208} height={118} rx={6} fill="#223052" />
      <circle cx={0} cy={5} r={9} fill="#7FE3EC" opacity={0.55} />
    </g>
    <g transform="translate(965 1316)">
      <path d="M 0 0 L -4 -90 L 26 -150" stroke="#3B4D66" strokeWidth={9} fill="none" strokeLinecap="round" />
      <path d="M 10 -150 L 56 -140 L 44 -172 Z" fill="#FFD28A" />
      <rect x={-26} y={-8} width={50} height={9} rx={4} fill="#3B4D66" />
    </g>
  </g>
);

const Phone: React.FC<{t: number}> = ({t}) => {
  const ping = T3.ping;
  const red = prog(t, ping, 10);
  const cardIn = prog(t, 76, 26, easeOut);
  const banner = prog(t, ping, 12, easeOut) * (1 - prog(t, T3.shortfall - 30, 12, easeInOut));
  const bankFade = 1 - prog(t, T3.shortfall - 30, 10);
  const cmp = prog(t, T3.shortfall - 26, 12, easeOut);
  const bars = prog(t, T3.shortfall - 18, 16, easeOut);
  const hatch = prog(t, T3.shortfall + 6, 14);
  const big = prog(t, T3.shortfall + 16, 14, easeOut);
  const shake = t >= ping && t < ping + 12 ? Math.sin((t - ping) * 2.6) * 4 * (1 - (t - ping) / 12) : 0;
  const numColor = hexMix('#F4F6FA', '#F06262', red);
  const W0 = 760;
  return (
    <Glass x={100} y={250 + (1 - cardIn) * 120} w={880} h={580} r={46} opacity={cardIn} bg="linear-gradient(180deg, #16233B 0%, #0F192D 100%)" border={red > 0.5 ? 'rgba(240,98,98,0.55)' : 'rgba(255,255,255,0.14)'} style={{transform: `translateX(${shake}px)`}}>
      <div style={{position: 'absolute', left: 340, top: 14, width: 200, height: 16, borderRadius: 10, background: '#05080F'}} />
      <div style={{position: 'absolute', left: 44, top: 46, right: 44, display: 'flex', justifyContent: 'space-between', fontFamily: FONT.text, fontWeight: 600, fontSize: 26, color: C.mute2}}>
        <span>11:42</span><span>5G  ▂▃▅</span>
      </div>
      <div style={{position: 'absolute', inset: 0, opacity: bankFade}}>
        <div style={{position: 'absolute', left: 50, top: 116, fontFamily: FONT.text, fontWeight: 700, fontSize: 26, letterSpacing: '0.14em', color: C.mute}}>{COPY.bankHeader}</div>
        <div style={{position: 'absolute', left: 50, top: 190, fontFamily: FONT.text, fontWeight: 700, fontSize: 32, letterSpacing: '0.12em', color: C.mute2, opacity: appear(t, T3.fig - 14, 12, 8).opacity}}>{COPY.bankLabel}</div>
        <div style={{position: 'absolute', left: 44, top: 236, color: numColor, opacity: prog(t, T3.fig - 4, 8), transform: `scale(${0.94 + 0.06 * prog(t, T3.fig - 4, 14, easeOut)})`, transformOrigin: 'left center'}}>
          <Counter to={FIG.cash} t={t} start={0} dur={1} format={sgd} size={168} color={numColor} />
        </div>
        <div style={{position: 'absolute', left: 50, top: 450, fontFamily: FONT.text, fontWeight: 500, fontSize: 28, color: C.mute, opacity: appear(t, T3.fig + 8, 12, 6).opacity}}>{COPY.bankAsAt}</div>
      </div>
      <div style={{position: 'absolute', left: 30, top: 18, width: 820, height: 150, borderRadius: 30, background: 'rgba(60,22,26,0.97)', border: '2px solid rgba(240,98,98,0.75)', boxShadow: '0 20px 50px rgba(0,0,0,0.5)', transform: `translateY(${-(1 - Math.min(1, banner * 1.6)) * 220}px)`, opacity: Math.min(1, banner * 2), display: 'flex', alignItems: 'center', gap: 26, padding: '0 34px'}}>
        <svg width={92} height={92} viewBox="-46 -46 92 92"><CalendarIcon size={84} tone="red" day="!" /></svg>
        <div>
          <div style={{fontFamily: FONT.text, fontWeight: 800, fontSize: 32, letterSpacing: '0.06em', color: C.white}}>{COPY.notifTitle}</div>
          <div style={{fontFamily: FONT.display, fontWeight: 800, fontSize: 60, color: C.red, lineHeight: 1.05}}>{COPY.notifAmount}</div>
        </div>
      </div>
      <div style={{position: 'absolute', inset: 0, opacity: cmp}}>
        <div style={{position: 'absolute', left: 60, top: 96, width: W0, display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', fontFamily: FONT.text}}>
          <span style={{fontWeight: 700, fontSize: 30, color: C.mute2}}>{COPY.barPayroll}</span><span style={{fontFamily: FONT.display, fontWeight: 800, fontSize: 46, color: C.red}}>{sgd(FIG.payroll)}</span>
        </div>
        <div style={{position: 'absolute', left: 60, top: 160, width: W0 * bars, height: 30, borderRadius: 15, background: C.red}} />
        <div style={{position: 'absolute', left: 60, top: 226, width: W0, display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', fontFamily: FONT.text}}>
          <span style={{fontWeight: 700, fontSize: 30, color: C.mute2}}>{COPY.barCash}</span><span style={{fontFamily: FONT.display, fontWeight: 800, fontSize: 46, color: C.white}}>{sgd(FIG.cash)}</span>
        </div>
        <div style={{position: 'absolute', left: 60, top: 290, width: W0, height: 30, borderRadius: 15, background: 'rgba(255,255,255,0.08)'}} />
        <div style={{position: 'absolute', left: 60, top: 290, width: W0 * (FIG.cash / FIG.payroll) * bars, height: 30, borderRadius: '15px 4px 4px 15px', background: C.white}} />
        <div style={{position: 'absolute', left: 60 + W0 * (FIG.cash / FIG.payroll), top: 290, width: W0 * (1 - FIG.cash / FIG.payroll) * hatch, height: 30, borderRadius: '4px 15px 15px 4px', background: 'repeating-linear-gradient(135deg, rgba(240,98,98,0.95) 0 9px, rgba(240,98,98,0.25) 9px 18px)', border: '2px solid #F06262'}} />
        <div style={{position: 'absolute', left: 60, top: 350, width: W0, textAlign: 'center', opacity: big, transform: `scale(${0.9 + 0.1 * big})`}}>
          <div style={{fontFamily: FONT.text, fontWeight: 800, fontSize: 34, letterSpacing: '0.22em', color: C.red}}>{COPY.shortfallLabel}</div>
          <div style={{fontFamily: FONT.display, fontWeight: 900, fontSize: 146, letterSpacing: '-0.03em', color: C.red, lineHeight: 1.0}}>{COPY.shortfallAmount}</div>
        </div>
      </div>
    </Glass>
  );
};

export const Scene3: React.FC = () => {
  const {t, g} = useClock();
  const ping = T3.ping;
  const cam = {
    cx: keys(t, [[0, 540], [96, 740], [240, 760]]),
    cy: keys(t, [[0, 1000], [96, 1130], [240, 1150]]),
    z: keys(t, [[0, 1.0], [96, 1.7], [240, 1.9]]),
  };
  const fadeUp = prog(t, 0, 24);
  const closeIn = prog(t, 72, 26, easeInOut);
  const worry = keys(t, [[T3.fig - 4, 0.1], [T3.fig + 30, 0.35], [ping - 1, 0.4], [ping + 12, 0.95]], easeOut);
  const smile = keys(t, [[T3.fig - 4, 0.25], [T3.fig + 30, -0.1], [ping - 1, -0.15], [ping + 12, -0.95]], easeOut);
  const red = prog(t, ping, 12);
  const glowCol = red > 0.5 ? '#FF8A8A' : '#BFE9FF';
  const bust = prog(t, 78, 22, easeOut);
  const shake = t >= ping && t < ping + 12 ? Math.sin((t - ping) * 2.6) * 4 * (1 - (t - ping) / 12) : 0;
  return (
    <AbsoluteFill>
      {t < 104 ? <OfficeWorld variant="night" cam={cam} t={t} staff={false} dashOn={0.2} dashT={400} hidePlant actors={<NightDesk t={t} />} /> : null}
      <div style={{position: 'absolute', inset: 0, background: `rgba(5,9,17,${closeIn})`}} />
      <div style={{position: 'absolute', left: 0, top: 0, width: W, height: H, opacity: bust, transform: `translate(${shake}px, ${(1 - bust) * 70}px)`}}>
        <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`}>
          <defs>
            <linearGradient id="beam" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor={glowCol} stopOpacity={0.16} /><stop offset="1" stopColor={glowCol} stopOpacity={0} /></linearGradient>
          </defs>
          <path d="M 300 830 L 780 830 L 640 1160 L 440 1160 Z" fill="url(#beam)" />
          <g transform="translate(540 1130) scale(1.22)">
            <FounderBust smile={smile} worry={worry} open={blink(t)} gy={6} tilt={-2 * worry} dim={0.1} rim={glowCol} rimOpacity={0.35} glow={glowCol} glowOpacity={0.12 + 0.2 * (1 - 0)} sweat={prog(t, ping + 10, 14)} breathe={Math.sin(t / 20) * 2.5} />
          </g>
        </svg>
      </div>
      <div style={{position: 'absolute', left: 0, right: 0, top: 1390, height: 300, background: 'linear-gradient(180deg, rgba(5,9,17,0) 0%, rgba(5,9,17,1) 50%)', opacity: bust}} />
      <Phone t={t} />
      <div style={{position: 'absolute', inset: 0, background: `radial-gradient(ellipse 80% 70% at 50% 45%, rgba(240,98,98,0) 40%, rgba(240,98,98,${0.38 * (prog(t, ping, 6) * (1 - prog(t, ping + 6, 40)))}) 100%)`}} />
      <div style={{position: 'absolute', inset: 0, background: '#05080F', opacity: 1 - fadeUp}} />
    </AbsoluteFill>
  );
};
