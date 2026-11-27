import React from 'react';
import {AbsoluteFill, useCurrentFrame} from 'remotion';
import {C, FONT} from '../config/theme';
import {COPY} from '../config/copy';
import {SCENE, SEG, wordFrame} from '../lib/timeline';
import {easeInOut, easeOut, hexMix, keys, prog} from '../lib/anim';

const S6 = SCENE.S6, S7 = SCENE.S7;
export const D = {
  start: SEG.s6b.start + SEG.s6b.dur - 6, // diagram starts building once "...keep arriving" lands
  toTop: S7.start + 8,
  cues: [wordFrame('s7a', /^forecasting/), wordFrame('s7a', /^collecting/), wordFrame('s7a', /^negotiating/), wordFrame('s7a', /^maintaining/)],
  end: S7.end,
};
export const gapFrac = (g: number) => {
  const c = D.cues; const steps = [1, 0.78, 0.58, 0.42, 0.3];
  const k: Array<[number, number]> = [[0, 1], [c[0] - 4, 1], [c[0] + 18, steps[1]], [c[1] - 4, steps[1]], [c[1] + 18, steps[2]], [c[2] - 4, steps[2]], [c[2] + 18, steps[3]], [c[3] - 4, steps[3]], [c[3] + 18, steps[4]]];
  return keys(g, k, easeOut);
};

/** Cash Inflows -> Timing Gap -> Cash Outflows. Persists from S6 into S7 (layout 0 = centre, 1 = compact top). */
export const GapDiagram: React.FC = () => {
  const g = useCurrentFrame();
  if (g < D.start - 2 || g > D.end + 2) return null;
  const build = prog(g, D.start, 30, easeOut);
  const lay = prog(g, D.toTop, 30, easeInOut);
  const gf = gapFrac(g);
  const fadeOut = 1 - prog(g, D.end - 16, 16);
  const scale = 1 - 0.2 * lay;
  const cy = 600 - 228 * lay;
  const pulse = 0.75 + 0.25 * Math.sin(g / 6);
  const amber = prog(g, D.cues[3], 40);
  const gapCol = hexMix(C.red, C.amber, amber * 0.85);
  const gw = 290 * gf;
  const mid = 540;
  const bh = 210;
  const stroke = gapCol;
  const textIn = prog(g, D.start + 30, 16);
  const subIn = prog(g, D.start + 50, 16);
  return (
    <AbsoluteFill style={{opacity: fadeOut, pointerEvents: 'none'}}>
      <svg width={1080} height={1920} style={{position: 'absolute', inset: 0}}>
        <defs>
          <pattern id="hatch" width={20} height={20} patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width={20} height={20} fill={gapCol} opacity={0.18} /><rect width={10} height={20} fill={gapCol} opacity={0.75} /></pattern>
        </defs>
        <g transform={`translate(540 ${cy}) scale(${scale}) translate(-540 0)`} opacity={build}>
          {/* inflows */}
          <g transform={`translate(0 ${(1 - build) * 40})`}>
            <rect x={90} y={-bh / 2} width={270} height={bh} rx={30} fill="rgba(33,198,215,0.14)" stroke={C.cyan} strokeWidth={4} />
            <path d="M 225 20 L 225 -50 M 195 -22 L 225 -52 L 255 -22" stroke={C.cyan} strokeWidth={9} fill="none" strokeLinecap="round" strokeLinejoin="round" />
            <text x={225} y={72} textAnchor="middle" fontFamily={FONT.text} fontWeight={800} fontSize={24} letterSpacing={1.2} fill={C.cyan}>{COPY.inflows}</text>
            {/* outflows */}
            <rect x={720} y={-bh / 2} width={270} height={bh} rx={30} fill="rgba(240,98,98,0.14)" stroke={C.red} strokeWidth={4} />
            <path d="M 855 -50 L 855 20 M 825 -8 L 855 22 L 885 -8" stroke={C.red} strokeWidth={9} fill="none" strokeLinecap="round" strokeLinejoin="round" />
            <text x={855} y={72} textAnchor="middle" fontFamily={FONT.text} fontWeight={800} fontSize={24} letterSpacing={1.2} fill={C.red}>{COPY.outflows}</text>
            {/* arrows */}
            <line x1={364} y1={0} x2={mid - gw / 2 - 8} y2={0} stroke={C.cyan} strokeWidth={7} strokeLinecap="round" strokeDasharray="4 14" />
            <line x1={mid + gw / 2 + 8} y1={0} x2={716} y2={0} stroke={C.red} strokeWidth={7} strokeLinecap="round" strokeDasharray="4 14" />
            {/* gap */}
            <rect x={mid - gw / 2} y={-bh / 2 - 14} width={gw} height={bh + 28} rx={22} fill="url(#hatch)" stroke={stroke} strokeWidth={5} opacity={pulse} />
            <text x={mid} y={-bh / 2 - 40} textAnchor="middle" fontFamily={FONT.text} fontWeight={900} fontSize={28} letterSpacing={3} fill={gapCol}>{COPY.gap}</text>
          </g>
        </g>
      </svg>
      <div style={{position: 'absolute', left: 0, right: 0, top: 800, textAlign: 'center', opacity: textIn * (1 - lay)}}>
        <div style={{fontFamily: FONT.display, fontWeight: 900, fontSize: 128, letterSpacing: '-0.03em', color: C.white, transform: `scale(${0.92 + 0.08 * textIn})`}}>{COPY.profitNotCash}</div>
      </div>
      <div style={{position: 'absolute', left: 90, right: 90, top: 1000, textAlign: 'center', fontFamily: FONT.text, fontWeight: 500, fontSize: 34, lineHeight: 1.35, color: C.mute2, opacity: subIn * (1 - lay)}}>{COPY.profitNotCashSub}</div>
    </AbsoluteFill>
  );
};
