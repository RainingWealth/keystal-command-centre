import React from 'react';
import {AbsoluteFill} from 'remotion';
import {C, FONT} from '../config/theme';
import {COPY} from '../config/copy';
import {FounderBust} from '../components/characters/Founder';
import {Padlock, Paper} from '../components/props/Props';
import {Grid} from '../components/Grid';
import {Pill} from '../components/UI';
import {appear, easeInOut, easeOut, keys, lin, prog, rand} from '../lib/anim';
import {SCENE, SEG, wordFrame} from '../lib/timeline';
import {useClock} from '../lib/scene';

const S6 = SCENE.S6;
export const T6 = {
  trap: wordFrame('s6b', /^trapped/) - S6.start,
  zoom: SEG.s6b.start + SEG.s6b.dur - S6.start - 14,
};
const CX = 540, CY = 800, RX = 345, RY = 250;
const ITEMS = Array.from({length: 12}, (_, i) => ({i, kind: i % 4 === 3 ? 'bill' : i % 6 === 5 ? 'pay' : 'inv', a0: (i / 12) * Math.PI * 2}));
const BOX = {x: 60, y: 890};

export const Scene6: React.FC = () => {
  const {t} = useClock();
  const zoomP = prog(t, T6.zoom, 34, easeInOut);
  const sc = 1 - 0.65 * zoomP;
  const op = 1 - prog(t, T6.zoom + 8, 26);
  const worry = keys(t, [[0, 0.55], [60, 0.8], [T6.trap, 0.95]], easeOut);
  const blink = (t + 40) % 100 < 5 ? 0.15 : 1;
  const lock = prog(t, T6.trap + 52, 14);
  const items = ITEMS.map((it) => {
    const ang = it.a0 + t * 0.011;
    const inP = prog(t, 14 + it.i * 6, 22, easeOut);
    let x = CX + Math.cos(ang) * RX * inP + (1 - inP) * 0, y = CY + Math.sin(ang) * RY * inP;
    let s = 0.98 + 0.22 * Math.sin(ang), rot = Math.cos(ang) * 14;
    let o = inP;
    if (it.kind === 'inv' && t > T6.trap) {
      const k = it.i / 2;
      const p = prog(t, T6.trap + k * 5, 26, easeInOut);
      x = x + (BOX.x + 150 + (it.i % 3) * 14 - x) * p; y = y + (BOX.y + 150 + (it.i % 2) * 10 - y) * p; s = s + (0.7 - s) * p; rot = rot * (1 - p);
    }
    return {...it, x, y, s, rot, o, front: Math.sin(ang) > 0.1};
  });
  const renderItem = (it: (typeof items)[number]) => (
    <g key={it.i} transform={`translate(${it.x} ${it.y})`} opacity={it.o}>
      {it.kind === 'pay' ? (
        <g transform={`scale(${it.s * 1.3}) rotate(${it.rot})`}>
          <rect x={-140} y={-34} width={280} height={68} rx={34} fill="#2A1618" stroke={C.red} strokeWidth={3.5} />
          <circle cx={-102} cy={0} r={18} fill={C.red} /><text x={-102} y={8} textAnchor="middle" fontFamily={FONT.display} fontWeight={900} fontSize={24} fill={C.navy}>!</text>
          <text x={-72} y={9} fontFamily={FONT.text} fontWeight={800} fontSize={24} letterSpacing={1} fill={C.white}>PAYROLL DUE</text>
        </g>
      ) : it.kind === 'bill' ? (
        <Paper tone="red" head="OVERDUE" stamp="PAY NOW" scale={it.s} rot={it.rot} />
      ) : (
        <Paper tone="amber" head="INVOICE" stamp={COPY.unpaid} scale={it.s} rot={it.rot} />
      )}
    </g>
  );
  const streamed = Array.from({length: 7}).map((_, k) => {
    const t0 = T6.trap + 18 + k * 15;
    const p = prog(t, t0, 34, (x) => x * x);
    if (t < t0 || p >= 1) return null;
    return <g key={k} transform={`translate(${1120 - p * 560} ${560 + (k % 3) * 120 + p * 170})`} opacity={1 - Math.max(0, p - 0.8) * 5}><Paper tone="red" head="BILL" scale={0.55} rot={-10 + k * 4} /></g>;
  });
  return (
    <AbsoluteFill style={{background: C.navy}}>
      <Grid id="g6" />
      <div style={{position: 'absolute', inset: 0, opacity: op, transform: `scale(${sc})`, transformOrigin: `${CX}px ${CY + 60}px`}}>
        <svg width={1080} height={1920} style={{position: 'absolute', inset: 0}}>
          <ellipse cx={CX} cy={CY} rx={RX} ry={RY} fill="none" stroke="#fff" strokeWidth={2} opacity={0.06} strokeDasharray="6 14" />
          {items.filter((i) => !i.front).map(renderItem)}
          <g transform={`translate(${CX} ${1010}) scale(0.95)`}>
            <FounderBust smile={-0.7} worry={worry} open={blink} gy={2} tilt={-3} sweat={prog(t, 40, 20)} rim={C.red} rimOpacity={0.3} breathe={Math.sin(t / 18) * 2} />
          </g>
          {items.filter((i) => i.front).map(renderItem)}
          {streamed}
          {/* trapped box */}
          <g opacity={prog(t, T6.trap - 6, 14)}>
            <rect x={BOX.x} y={BOX.y} width={300} height={250} rx={30} fill="rgba(255,190,85,0.10)" stroke={C.amber} strokeWidth={4} />
            <g transform={`translate(${BOX.x + 150} ${BOX.y + 36})`}><Padlock size={64} color={C.amber} open={1 - lock} /></g>
          </g>
        </svg>
        <div style={{position: 'absolute', left: 70, top: 256, opacity: appear(t, 26, 16, 10).opacity}}>
          <Pill text={COPY.profitTag} color={C.cyan} size={32} />
          <div style={{fontFamily: FONT.text, fontWeight: 600, fontSize: 26, letterSpacing: '0.12em', color: C.mute2, marginTop: 10, paddingLeft: 6}}>ON PAPER, NOT IN THE BANK</div>
        </div>
        <div style={{position: 'absolute', left: BOX.x, top: BOX.y + 262, width: 300, textAlign: 'center', fontFamily: FONT.text, fontWeight: 800, fontSize: 25, letterSpacing: '0.08em', lineHeight: 1.3, color: C.amber, opacity: prog(t, T6.trap, 14)}}>{COPY.trapped}</div>
        <div style={{position: 'absolute', left: 560, top: 1190, width: 460, textAlign: 'right', fontFamily: FONT.text, fontWeight: 800, fontSize: 25, letterSpacing: '0.08em', lineHeight: 1.3, color: C.red, opacity: prog(t, T6.trap + 20, 14)}}>{COPY.realBills}</div>
      </div>
    </AbsoluteFill>
  );
};
