import React, {useMemo} from 'react';
import {useCurrentFrame} from 'remotion';
import {ACCENT, C, FONT_TEXT, H, prog, W} from '../styles/theme';
import {timeline, TimelineWord} from '../data/timeline';

type CapWord = TimelineWord & {accent: string};
type Page = {words: CapWord[]; start: number; end: number};

const MAX_CHARS = 32; // 2 lines max at 58px inside 860px
const END_PUNCT = /[.?!]+$|\.{3}$/;

/** Split a sentence into 1–2 line pages with balanced length (never > 2 lines). */
const paginate = (): Page[] => {
  const pages: Page[] = [];
  for (const sc of timeline.scenes) {
    const words: CapWord[] = sc.words.map((w) => ({...w, accent: ACCENT[sc.accent]}));
    // sentences
    const sentences: CapWord[][] = [];
    let cur: CapWord[] = [];
    for (const w of words) {
      cur.push(w);
      if (END_PUNCT.test(w.text)) {
        sentences.push(cur);
        cur = [];
      }
    }
    if (cur.length) sentences.push(cur);

    for (const s of sentences) {
      const L = s.map((w) => w.text).join(' ').length;
      const n = Math.ceil(L / MAX_CHARS);
      const target = L / n;
      let made = 0;
      let page: CapWord[] = [];
      let len = 0;
      for (const w of s) {
        const add = page.length ? len + 1 + w.text.length : w.text.length;
        const lastPage = made >= n - 1;
        const afterComma = /[,:]$/.test(page[page.length - 1]?.text ?? '');
        const shouldBreak =
          page.length > 0 && (add > MAX_CHARS || (!lastPage && add > target + 4) || (!lastPage && afterComma && len >= 14 && add > target - 2));
        if (shouldBreak) {
          pages.push({words: page, start: 0, end: 0});
          made++;
          page = [];
          len = 0;
        }
        page.push(w);
        len = page.length > 1 ? len + 1 + w.text.length : w.text.length;
      }
      if (page.length) pages.push({words: page, start: 0, end: 0});
    }
  }
  pages.forEach((p, i) => {
    const next = pages[i + 1];
    p.start = p.words[0].startFrame - 3;
    const natural = p.words[p.words.length - 1].endFrame + 9;
    p.end = next ? Math.min(natural, next.words[0].startFrame - 3) : natural;
  });
  return pages;
};

export const CAPTION_PAGES = paginate();

export const Captions: React.FC = () => {
  const frame = useCurrentFrame();
  const page = useMemo(() => CAPTION_PAGES.find((p) => frame >= p.start && frame < p.end), [frame]);
  if (!page) return null;

  const appear = prog(frame, page.start, 5);
  const disappear = 1 - prog(frame, page.end - 4, 4);
  const opacity = Math.min(appear, disappear);
  let active = -1;
  page.words.forEach((w, i) => {
    if (frame >= w.startFrame) active = i;
  });

  return (
    <>
      <div
        style={{
          position: 'absolute',
          left: 0,
          top: 1240,
          width: W,
          height: 300,
          background: 'linear-gradient(180deg, rgba(7,18,38,0) 0%, rgba(7,18,38,0.62) 45%, rgba(7,18,38,0) 100%)',
          opacity,
        }}
      />
      <div
        style={{
          position: 'absolute',
          left: (W - 860) / 2,
          width: 860,
          top: 1300,
          height: 170,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          textAlign: 'center',
          opacity,
          transform: `translateY(${(1 - appear) * 18}px)`,
          fontFamily: FONT_TEXT,
          fontWeight: 700,
          fontSize: 58,
          lineHeight: 1.3,
          letterSpacing: '-0.01em',
        }}
      >
        <div>
          {page.words.map((w, i) => {
            const isActive = i === active;
            const spoken = i <= active;
            const emph = w.emphasis;
            const bg = isActive ? (emph ? w.accent : C.cobalt) : 'transparent';
            const color = isActive ? (emph ? C.deep : C.off) : spoken ? (emph ? w.accent : C.off) : 'rgba(244,241,234,0.5)';
            return (
              <span
                key={w.i}
                style={{
                  display: 'inline-block',
                  padding: '0 9px',
                  margin: '2px 0',
                  borderRadius: 14,
                  background: bg,
                  color,
                  textShadow: isActive && emph ? 'none' : '0 2px 14px rgba(7,18,38,0.85)',
                  transform: isActive ? `scale(${1 + 0.05 * prog(frame, w.startFrame, 4)})` : 'scale(1)',
                }}
              >
                {w.text}
              </span>
            );
          })}
        </div>
      </div>
    </>
  );
};
