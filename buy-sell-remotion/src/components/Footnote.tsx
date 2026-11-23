import React from 'react';
import {useCurrentFrame} from 'remotion';
import {C, CONTENT_W, FONT_TEXT, prog, SAFE, ZONE} from '../styles/theme';

export const Footnote: React.FC<{text: string; from: number; exit?: number; top?: number}> = ({text, from, exit, top = ZONE.footnote}) => {
  const frame = useCurrentFrame();
  const p = prog(frame, from, 12) * (exit === undefined ? 1 : 1 - prog(frame, exit, 8));
  return (
    <div
      style={{
        position: 'absolute',
        left: SAFE.left,
        top,
        width: CONTENT_W,
        opacity: p,
        display: 'flex',
        gap: 12,
        alignItems: 'flex-start',
        fontFamily: FONT_TEXT,
        fontWeight: 500,
        fontSize: 25,
        lineHeight: 1.3,
        color: C.slate,
      }}
    >
      <span
        style={{
          flex: '0 0 auto',
          width: 26,
          height: 26,
          marginTop: 2,
          borderRadius: 13,
          border: `2px solid ${C.slate}`,
          textAlign: 'center',
          fontSize: 17,
          lineHeight: '22px',
          fontWeight: 700,
        }}
      >
        i
      </span>
      <span>{text}</span>
    </div>
  );
};
