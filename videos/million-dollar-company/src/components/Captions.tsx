import React from 'react';
import {AbsoluteFill, useCurrentFrame} from 'remotion';
import caps from '../data/captions.json';
import {C, CAP, FONT} from '../config/theme';
import {clamp01} from '../lib/anim';
import {FPS} from '../lib/timeline';

type Page = {onScreen: boolean; start: number; end: number; text: string; words: Array<{t: string; s: number; e: number; tone: string}>};
const PAGES = (caps as unknown as {pages: Page[]}).pages.filter((p) => p.onScreen);
const TONE: Record<string, string> = {cyan: C.cyan, amber: C.amber, red: C.red, none: C.white, amount: C.white};

export const Captions: React.FC<{hidden?: boolean}> = ({hidden}) => {
  const g = useCurrentFrame();
  const page = PAGES.find((p) => g >= p.start * FPS - 1 && g < p.end * FPS);
  if (!page || hidden) return null;
  const fadeIn = clamp01((g - page.start * FPS) / 5 + 0.2);
  const fadeOut = clamp01((page.end * FPS - g) / 5);
  const op = Math.min(fadeIn, fadeOut);
  return (
    <AbsoluteFill style={{pointerEvents: 'none'}}>
      <div style={{position: 'absolute', left: 0, right: 0, top: CAP.top - 70, height: CAP.bottom - CAP.top + 140, background: 'linear-gradient(180deg, rgba(10,16,28,0) 0%, rgba(10,16,28,0.62) 30%, rgba(10,16,28,0.62) 70%, rgba(10,16,28,0) 100%)', opacity: op}} />
      <div style={{position: 'absolute', left: 70, right: 70, top: CAP.top, height: CAP.bottom - CAP.top, display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: op, transform: `translateY(${(1 - op) * 8}px)`}}>
        <div style={{fontFamily: FONT.display, fontWeight: 800, fontSize: 58, lineHeight: 1.2, textAlign: 'center', color: C.white, textWrap: 'balance' as never, letterSpacing: '-0.012em', textShadow: '0 3px 14px rgba(5,10,20,0.7)'}}>
          {page.words.map((w, i) => {
            const spoken = g >= w.s * FPS - 1;
            const amount = w.tone === 'amount';
            const color = TONE[w.tone] ?? C.white;
            return (
              <span key={i} style={{opacity: spoken ? 1 : 0.4, color, marginRight: '0.26em', display: 'inline-block', padding: amount ? '0 12px' : 0, borderRadius: 14, background: amount ? 'rgba(32,44,58,0.92)' : undefined, boxShadow: amount ? `inset 0 0 0 2px rgba(255,255,255,0.16)` : undefined}}>
                {w.t}
              </span>
            );
          })}
        </div>
      </div>
    </AbsoluteFill>
  );
};
