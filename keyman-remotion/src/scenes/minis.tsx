// Mini graphics inside each department cell (sales bars, project bar, client dots, ...). Ported from film.js MINI.
import React from 'react';
import {A, E, clamp, lerp, lin, mix, seg} from '../lib/anim';
import {C} from '../design/tokens';
import {Clip, PolyDraw, Person, R, Txt} from '../components/primitives';

const grow = (k: number, i: number, n = 6) => E(clamp(k * (n * 0.35 + 1) - i * 0.35));
const W0 = '#FFFFFF';

export type MiniProps = {x: number; y: number; w: number; h: number; k: number; gd: number; sp: number; t: number; extra: number};

export const Sales: React.FC<MiniProps> = ({x, y, h, k, gd}) => {
  const col = mix(W0, C.or, gd);
  return (
    <>
      {[0.34, 0.5, 0.44, 0.7, 0.92].map((v, i) => {
        const hh = v * 92 * (1 - 0.42 * gd) * grow(k, i, 5);
        return <R key={i} x={x + 20 + i * 48} y={y + h - 18 - hh} w={34} h={hh} fill={col} />;
      })}
    </>
  );
};

export const Projects: React.FC<MiniProps> = ({x, y, w, k, gd, sp, extra: fp}) => {
  const col = mix(W0, C.or, gd);
  const cw = 150 * E(sp);
  return (
    <>
      <R x={x + 18} y={y + 118} w={w - 36} h={24} fill={A(0.14)} />
      <R x={x + 18} y={y + 118} w={(w - 36) * fp * E(k)} h={24} fill={col} />
      {[1, 2, 3].map((i) => (
        <R key={i} x={x + 18 + ((w - 36) * i) / 4 - 2} y={y + 100} w={4} h={8} fill={A(0.35)} />
      ))}
      {sp > 0 ? (
        <Clip x={x + 18} y={y + 62} w={cw} h={34}>
          <R x={x + 18} y={y + 62} w={150} h={34} fill={C.or} />
          <Txt s="STALLED" x={x + 30} y={y + 87} o={{size: 22, weight: 800, color: C.bg, track: 0.06}} />
        </Clip>
      ) : null}
    </>
  );
};

export const Clients: React.FC<MiniProps> = ({x, y, w, h, k, gd, t, extra: tD}) => {
  const col = mix(W0, C.or, gd);
  return (
    <Clip x={x} y={y} w={w} h={h}>
      {[0, 1, 2, 3, 4].map((i) => {
        let off = 0;
        if (i >= 2) off = lin(t, tD + (i - 2) * 0.25, tD + (i - 2) * 0.25 + 1.1) * 300;
        if (off > 280) return null;
        const sc = grow(k, i, 5);
        const cx = x + 40 + i * 48 + off;
        return (
          <g key={i}>
            {sc > 0 ? <circle cx={cx} cy={y + 118} r={17 * sc} fill={col} /> : null}
            <R x={cx - 17 * sc} y={y + 118 + 24} w={34 * sc} h={5} fill={col} />
          </g>
        );
      })}
    </Clip>
  );
};

export const Ops: React.FC<MiniProps> = ({x, y, k, gd}) => {
  const col = mix(W0, C.or, gd);
  const xs = [0, 50, 96];
  const ws = [160, 150, 130];
  return (
    <>
      {xs.map((o, i) => (
        <R key={i} x={x + 18 + o} y={y + 76 + i * 32} w={ws[i] * (1 - 0.45 * gd) * E(clamp(k * 1.5 - i * 0.25))} h={18} fill={col} />
      ))}
    </>
  );
};

export const Finance: React.FC<MiniProps> = ({x, y, w, h, k, gd}) => {
  const col = mix(W0, C.or, gd);
  const ax = x + 20;
  const ay = y + 74;
  const aw = w - 40;
  const ah = h - 100;
  const H0 = [[0, 0.72], [0.2, 0.62], [0.4, 0.66], [0.6, 0.42], [0.8, 0.34], [1, 0.12]];
  const H1 = [[0, 0.72], [0.2, 0.62], [0.4, 0.66], [0.6, 0.42], [0.8, 0.62], [1, 0.92]];
  const pts = H0.map((p, i) => [ax + p[0] * aw, ay + lerp(p[1], H1[i][1], gd) * ah] as [number, number]);
  return (
    <>
      <R x={ax} y={ay + ah + 8} w={aw} h={3} fill={A(0.14)} />
      <PolyDraw pts={pts} p={E(k)} stroke={col} lw={7} join="round" />
    </>
  );
};

export const Team: React.FC<MiniProps> = ({x, y, k, gd}) => (
  <>
    {[0, 1, 2, 3, 4, 5].map((i) => {
      const bad = i === 1 || i === 4 ? gd : 0;
      return <Person key={i} cx={x + 52 + (i % 3) * 84} cy={y + 100 + ((i / 3) | 0) * 56 - 8} s={40 * grow(k, i, 6)} fill={mix(W0, C.or, bad)} />;
    })}
  </>
);

export const Cash: React.FC<MiniProps> = ({x, y, w, h, k, gd, sp}) => {
  const col = mix(W0, C.or, gd);
  const up = [0.26, 0.36, 0.32, 0.55, 0.7, 0.9];
  const dn = [0.16, 0.12, 0.09, 0.06, 0.04, 0.03];
  const q = E(seg(sp, 0.3, 0.6));
  return (
    <>
      {up.map((u, i) => {
        const f = E(seg(sp, i * 0.08, i * 0.08 + 0.5));
        const v = lerp(u, dn[i], f);
        const hh = v * 94 * grow(k, i, 6);
        return <R key={i} x={x + 20 + i * 36} y={y + h - 18 - hh} w={26} h={hh} fill={col} />;
      })}
      {sp > 0 ? <polygon points={`${x + w - 66},${y + 74} ${x + w - 18},${y + 74} ${x + w - 42},${y + 74 + 48 * q}`} fill={C.or} /> : null}
    </>
  );
};

export const Suppliers: React.FC<MiniProps> = ({x, y, k, gd}) => (
  <>
    {[0, 1, 2].map((i) => {
      const s = 52 * grow(k, i, 3);
      const bx = x + 24 + i * 78;
      const inner = s - 20 > 0 ? s - 20 : 0;
      return (
        <g key={i}>
          <R x={bx} y={y + 96} w={s} h={s} fill={mix(W0, C.or, gd)} />
          <R x={bx + 10} y={y + 106} w={inner} h={inner} fill={C.panel} />
        </g>
      );
    })}
  </>
);

export const MINI: Record<string, React.FC<MiniProps>> = {
  sales: Sales,
  projects: Projects,
  clients: Clients,
  ops: Ops,
  finance: Finance,
  team: Team,
  cash: Cash,
  suppliers: Suppliers,
};
