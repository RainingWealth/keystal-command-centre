import React, {createContext, useContext} from 'react';
import type {TimelineScene} from '../data/timeline';

const SceneCtx = createContext<TimelineScene | null>(null);

export const SceneProvider: React.FC<{scene: TimelineScene; children: React.ReactNode}> = ({scene, children}) => (
  <SceneCtx.Provider value={scene}>{children}</SceneCtx.Provider>
);

export const useScene = () => {
  const s = useContext(SceneCtx);
  if (!s) throw new Error('useScene must be used inside <SceneProvider>');
  return s;
};

/**
 * Scene-relative frame where a narrated word starts (+ optional offset).
 * Animations keyed to cues re-sync automatically whenever the voice-over changes.
 */
export const useCues = () => {
  const s = useScene();
  return (name: string, offset = 0) => {
    const v = s.cues[name];
    if (v === undefined) throw new Error(`Unknown cue "${name}" in scene ${s.id}`);
    return v + offset;
  };
};
