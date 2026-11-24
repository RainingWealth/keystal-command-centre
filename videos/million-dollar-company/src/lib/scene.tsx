import React, {createContext, useContext} from 'react';
import {AbsoluteFill, Sequence, useCurrentFrame} from 'remotion';
import {SCENE} from './timeline';
import {easeInOut, prog} from './anim';
import {W} from '../config/theme';

type Ctx = {id: string; from: number; start: number; dur: number; pre: number};
const SceneCtx = createContext<Ctx>({id: '', from: 0, start: 0, dur: 0, pre: 0});

/** t = frames since the scene's own start (negative during the pre-roll overlap); g = global frame */
export const useClock = () => {
  const c = useContext(SceneCtx);
  const local = useCurrentFrame();
  const g = c.from + local;
  return {t: g - c.start, g, dur: c.dur, id: c.id, start: c.start};
};
/** convert a global frame to scene-relative frames */
export const useRel = () => {
  const c = useContext(SceneCtx);
  return (global: number) => global - c.start;
};

export type Enter = 'cut' | 'fade' | 'slide';
export type Exit = 'none' | 'slide' | 'fade';

export const SceneWindow: React.FC<{id: string; pre?: number; post?: number; enter?: Enter; exit?: Exit; children: React.ReactNode}> = ({
  id, pre = 0, post = 0, enter = 'cut', exit = 'none', children,
}) => {
  const sc = SCENE[id];
  const from = sc.start - pre;
  return (
    <Sequence from={from} durationInFrames={sc.dur + pre + post} name={id}>
      <SceneCtx.Provider value={{id, from, start: sc.start, dur: sc.dur, pre}}>
        <Wrapper pre={pre} post={post} enter={enter} exit={exit} dur={sc.dur}>
          {children}
        </Wrapper>
      </SceneCtx.Provider>
    </Sequence>
  );
};

const Wrapper: React.FC<{pre: number; post: number; enter: Enter; exit: Exit; dur: number; children: React.ReactNode}> = ({pre, post, enter, exit, dur, children}) => {
  const f = useCurrentFrame(); // local; scene t = f - pre
  const t = f - pre;
  let opacity = 1, tx = 0;
  if (pre > 0 && enter !== 'cut') {
    const p = prog(f, 0, pre, easeInOut);
    if (enter === 'fade') opacity = p;
    if (enter === 'slide') tx = (1 - p) * W;
  }
  if (post > 0 && exit !== 'none') {
    const p = prog(t, dur, post, easeInOut);
    if (exit === 'fade') opacity *= 1 - p;
    if (exit === 'slide') tx = -p * W;
  }
  return <AbsoluteFill style={{opacity, transform: `translateX(${tx}px)`}}>{children}</AbsoluteFill>;
};
