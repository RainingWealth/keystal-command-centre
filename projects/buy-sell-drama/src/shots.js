// Shot registry. Each shots_*.js file registers builders; unfinished ids fall back to a placeholder.
import { Shot } from './engine.js';
import { drawFigure } from './figures.js';
import * as X from './sets.js';
export { BUILD, IRIS } from './registry.js';
import './shots_a.js';
import './shots_b.js';
import './shots_c.js';
export function placeholder(id, ladder) { return (E) => { const P = X.PAL[ladder] || X.PAL.night; const S = new Shot(id, { bg: P.sky });
  S.sheet({ z: -.1, col: P.far, trans: .5, light: P.light, shadow: false, draw: g => g.fillRect(-100, -100, 1300, 2200) });
  S.sheet({ z: -.05, col: P.mid, shadow: 14, draw: g => g.fillRect(-100, 1000, 1300, 1200) }); return S; }; }
