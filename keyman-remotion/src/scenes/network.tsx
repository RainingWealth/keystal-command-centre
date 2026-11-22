// The 3x3 module grid ("the programme"): file tiles, key-person cell, links, live department cells.
import React from 'react';
import {measureText} from '@remotion/layout-utils';
import {A, E, lerp, lin, mix, seg, snap, steps, rin} from '../lib/anim';
import {C, CH, CW, FONT, MIDY} from '../design/tokens';
import {CELLS, Cell, K, LINKS, ROLES, ord, tickT} from '../data/timing';
import {Check, Clip, Knife, Person, R, Rise, SR, Txt} from '../components/primitives';
import {MINI} from './minis';

type Mode = 'a' | 's1' | 's2' | 's5';

const Panel: React.FC<{c: Cell; w: number}> = ({c, w}) => <R x={c.x} y={c.y} w={w} h={CH} fill={C.panel} />;

const CellLabel: React.FC<{c: Cell; t: number; tIn: number}> = ({c, t, tIn}) => (
  <Rise s={c.label} x={c.x + 18} y={c.y + 44} o={{size: 26, weight: 700, color: C.ink, track: 0.04}} pin={rin(t, tIn)} />
);

export const FileTile: React.FC<{c: Cell; t: number}> = ({c, t}) => {
  const land = K.land(c.i);
  const wv = CW * snap(t, land, 0.25);
  if (wv <= 0) return null;
  const fx = c.x + 22;
  const fy = c.y + 64;
  return (
    <Clip x={c.x} y={c.y} w={wv} h={CH}>
      <Panel c={c} w={CW} />
      <path
        d={`M${fx} ${fy}L${fx + 28} ${fy}L${fx + 44} ${fy + 16}L${fx + 44} ${fy + 58}L${fx} ${fy + 58}Z`}
        fill="none"
        stroke={A(0.85)}
        strokeWidth={4}
        strokeMiterlimit={10}
      />
      <R x={fx + 9} y={fy + 28} w={26} h={4} fill={A(0.5)} />
      <R x={fx + 9} y={fy + 40} w={18} h={4} fill={A(0.5)} />
      <Txt s={'FILE 0' + (c.i + 1)} x={c.x + 18} y={c.y + 40} o={{size: 24, weight: 700, color: A(0.9), track: 0.06}} />
      <R x={c.x + 86} y={c.y + 100} w={CW - 112} h={14} fill={A(0.14)} />
      <R x={c.x + 86} y={c.y + 100} w={(CW - 112) * lin(t, land, land + 0.25)} h={14} fill={C.cy} />
      <Txt s="BACKED UP" x={c.x + 86} y={c.y + 146} o={{size: 20, weight: 600, color: A(0.6), track: 0.08}} />
      <Check x={c.x + CW - 60} y={c.y + 12} s={44} p={lin(t, land + 0.25, land + 0.375)} color={C.cy} lw={7} />
    </Clip>
  );
};

/** giant "?" behind the person, climbing in steps */
const BigQ: React.FC<{c: Cell; k: number; color: string}> = ({c, k, color}) => {
  if (k <= 0) return null;
  const size = 250;
  const gw = measureText({text: '?', fontFamily: FONT, fontSize: size, fontWeight: 800, letterSpacing: `${-0.02 * size}px`}).width;
  const base = c.y + CH - 6;
  return (
    <Clip x={c.x} y={base - size * 0.74 * k - 2} w={CW} h={size * 0.74 * k + 12}>
      <Txt s="?" x={c.x + (CW - gw) / 2} y={base} o={{size, weight: 800, color, track: -0.02}} />
    </Clip>
  );
};

const KeyCell: React.FC<{t: number; mode: 's1' | 's2' | 's5'}> = ({t, mode}) => {
  const c = CELLS[4];
  const cx = c.x + CW / 2;
  const cy = c.y + 118;
  const qcol = A(0.16);
  const lab = {size: 26, weight: 700, color: C.ink, track: 0.03};
  const person = (p: number) =>
    p <= 0 ? null : (
      <Clip x={c.x} y={c.y + 56} w={CW} h={CH - 56}>
        <g transform={`translate(0 ${(1 - p) * 110})`}>
          <Person cx={cx} cy={cy} s={96} fill={C.cy} />
        </g>
      </Clip>
    );
  return (
    <>
      <Panel c={c} w={CW} />
      {mode === 's5' ? (
        t < 41.5 ? (
          <BigQ c={c} k={1} color={qcol} />
        ) : (
          <>
            <Knife t={t} t0={41.5} x={c.x} y={c.y} w={CW} h={CH}>
              <BigQ c={c} k={1} color={qcol} />
            </Knife>
            <Check x={c.x + (CW - 150) / 2} y={c.y + (CH - 150) / 2 + 4} s={150} p={lin(t, 42.0, 42.5)} color={A(0.26)} lw={24} />
          </>
        )
      ) : (
        <BigQ c={c} k={steps(t, K.qStart, K.qEnd, 4)} color={qcol} />
      )}
      {mode === 's1' ? <Rise s="KEY PERSON" x={c.x + 18} y={c.y + 44} o={lab} pin={rin(t, K.personIn + 0.25)} /> : null}
      {mode === 's5' ? <Rise s="KEY PERSON" x={c.x + 18} y={c.y + 44} o={lab} pin={1} /> : null}
      {mode === 's2'
        ? ROLES.map(([tt, label], i) => {
            const nx = ROLES[i + 1] ? ROLES[i + 1][0] : null;
            return (
              <Rise
                key={i}
                s={label}
                x={c.x + 18}
                y={c.y + 44}
                o={{...lab, size: label.length > 11 ? 21 : 26}}
                pin={i === 0 ? 1 : rin(t, tt)}
                pout={nx !== null ? E(seg(t, nx - 0.125, nx)) : 0}
              />
            );
          })
        : null}
      {mode === 's2' && t >= K.cut ? (
        <Knife t={t} t0={K.cut} x={c.x + 40} y={c.y + 56} w={CW - 80} h={110}>
          {person(1)}
        </Knife>
      ) : (
        person(mode === 's1' ? rin(t, K.personIn + 0.25) : 1)
      )}
    </>
  );
};

const Links: React.FC<{t: number; mode: Mode}> = ({t, mode}) => (
  <>
    {LINKS.map((l, n) => {
      const {a, b} = l;
      const horiz = a.r === b.r;
      let x0: number, y0: number, x1: number, y1: number;
      if (horiz) {
        x0 = a.x + CW;
        y0 = a.y + CH / 2;
        x1 = b.x;
        y1 = y0;
      } else {
        x0 = a.x + CW / 2;
        y0 = a.y + CH;
        x1 = x0;
        y1 = b.y;
      }
      if (l.center && b.i === 4) [x0, y0, x1, y1] = [x1, y1, x0, y0];
      let p = 1;
      let q0 = 0;
      let col: string = C.link;
      if (mode === 's5') col = C.cy;
      else {
        const other = l.center ? (a.i === 4 ? b : a) : a.ring === 2 ? a : b;
        const tD = l.center ? 3.75 + 0.125 * ord(other.i) : 4.25 + 0.125 * (n % 4);
        p = lin(t, tD, tD + 0.5);
        if (l.center && t >= K.linksOut) q0 = lin(t, K.linksOut, K.linksOut + 0.25);
        if (!l.center) col = mix(C.link, C.or, snap(t, K.gd(other.i)));
      }
      if (p <= 0 || q0 >= 1) return null;
      const sx = lerp(x0, x1, q0);
      const sy = lerp(y0, y1, q0);
      const ex = lerp(x0, x1, p);
      const ey = lerp(y0, y1, p);
      const live = mode === 's5' ? t >= 38.0 : t >= 7.75 && t < K.cut + 0.25;
      let pulse: React.ReactNode = null;
      if (l.center && live) {
        const per = 1.0;
        const ph = ((((t - 7.75) % per) + per) % per) / 0.5;
        if (ph < 1) pulse = <R x={lerp(x0, x1, ph) - 7} y={lerp(y0, y1, ph) - 7} w={14} h={14} fill={C.cy} />;
      }
      return (
        <g key={n}>
          <line x1={sx} y1={sy} x2={ex} y2={ey} stroke={col} strokeWidth={5} />
          {pulse}
        </g>
      );
    })}
  </>
);

const DrawLive: React.FC<{t: number; c: Cell; mode: 's2' | 's5'}> = ({t, c, mode}) => {
  if (c.i === 4) return null;
  const tl = mode === 's5' ? 37.5 : K.live(c.i);
  const wv = mode === 's5' ? CW : CW * snap(t, tl, 0.25);
  if (wv <= 0) return null;
  const gd = snap(t, mode === 's5' ? 1e9 : K.gd(c.i), 0.125);
  const k = mode === 's5' ? 1 : E(seg(t, tl, tl + 0.625));
  const spMap: Record<string, number> = {projects: lin(t, K.stall, K.stall + 0.5), clients: 0, cash: lin(t, K.cashDrop, K.cashDrop + 1.0)};
  const sp = mode === 's5' ? 0 : spMap[c.id] || 0;
  const fp = mode === 's5' ? Math.min(0.9, 0.55 + 0.02 * (t - 37.5)) : Math.min(0.5, 0.22 + 0.05 * Math.max(0, t - 7.5));
  const extra = c.id === 'projects' ? fp : mode === 's5' ? 1e9 : K.worry;
  const Mini = MINI[c.id];
  return (
    <Clip x={c.x} y={c.y} w={wv} h={CH}>
      <Panel c={c} w={CW} />
      {gd > 0 ? <R x={c.x} y={c.y} w={6} h={CH * gd} fill={C.or} /> : null}
      <CellLabel c={c} t={t} tIn={tl} />
      <Mini x={c.x} y={c.y} w={CW} h={CH} k={k} gd={gd} sp={sp} t={t} extra={extra} />
    </Clip>
  );
};

export const NetWorld: React.FC<{t: number; mode: Mode}> = ({t, mode}) => (
  <>
    <Links t={t} mode={mode} />
    {CELLS.map((c) => {
      if (c.i === 4) {
        if (mode === 's5') return <KeyCell key={c.i} t={t} mode="s5" />;
        if (t < 3.0) return <FileTile key={c.i} c={c} t={t} />;
        return <KeyCell key={c.i} t={t} mode={t < 6.0 ? 's1' : 's2'} />;
      }
      if (mode === 'a') {
        if (t < K.live(c.i)) {
          if (t < K.knife(c.i)) return <FileTile key={c.i} c={c} t={t} />;
          if (t < K.slot(c.i))
            return (
              <Knife key={c.i} t={t} t0={K.knife(c.i)} x={c.x} y={c.y} w={CW} h={CH}>
                <FileTile c={c} t={t} />
              </Knife>
            );
          const k = E(seg(t, K.slot(c.i), K.slot(c.i) + 0.25));
          if (k <= 0) return null;
          const ym = c.y + CH / 2;
          return (
            <g key={c.i} transform={`translate(0 ${ym}) scale(1 ${k}) translate(0 ${-ym})`}>
              <SR x={c.x + 1.5} y={c.y + 1.5} w={CW - 3} h={CH - 3} stroke={A(0.22)} lw={3} />
            </g>
          );
        }
        return (
          <g key={c.i}>
            <SR x={c.x + 1.5} y={c.y + 1.5} w={CW - 3} h={CH - 3} stroke={A(0.22)} lw={3} />
            <DrawLive t={t} c={c} mode="s2" />
          </g>
        );
      }
      return <DrawLive key={c.i} t={t} c={c} mode={mode as 's5'} />;
    })}
  </>
);
export {MIDY, tickT};
