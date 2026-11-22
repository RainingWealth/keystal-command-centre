import React from 'react';
import {useCurrentFrame} from 'remotion';
import {C, CONTENT_W, EASE_OUT, FONT_TEXT, prog, SAFE, ZONE} from '../styles/theme';

/** Editorial index line: "02 — THE PROBLEM" + hairline that draws in. */
export const SceneLabel: React.FC<{label: string; color: string; index: number; total?: number}> = ({label, color, index, total = 6}) => {
  const frame = useCurrentFrame();
  const p = prog(frame, 2, 14);
  const line = prog(frame, 4, 24, EASE_OUT);
  return (
    <>
      <div
        style={{
          position: 'absolute',
          left: SAFE.left,
          top: ZONE.label,
          width: CONTENT_W,
          display: 'flex',
          alignItems: 'center',
          gap: 16,
          opacity: p,
          transform: `translateX(${(1 - p) * -24}px)`,
          fontFamily: FONT_TEXT,
          fontWeight: 600,
          fontSize: 27,
          letterSpacing: '0.14em',
          color: C.off,
        }}
      >
        <span style={{width: 14, height: 14, background: color, display: 'inline-block'}} />
        <span>{label}</span>
        <span style={{marginLeft: 'auto', color: C.slate}}>
          {String(index).padStart(2, '0')}/{String(total).padStart(2, '0')}
        </span>
      </div>
      <div
        style={{
          position: 'absolute',
          left: SAFE.left,
          top: ZONE.label + 44,
          height: 2,
          width: CONTENT_W * line,
          background: 'rgba(244,241,234,0.22)',
        }}
      />
    </>
  );
};
