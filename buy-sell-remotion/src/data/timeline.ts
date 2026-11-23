import raw from './timeline.json';
import type {AccentName} from '../styles/theme';

export type TimelineWord = {i: number; text: string; startFrame: number; endFrame: number; emphasis: boolean};
export type TimelineScene = {
  id: string;
  name: string;
  label: string;
  accent: AccentName;
  start: number;
  duration: number;
  voStart: number;
  voFrames: number;
  voEnd: number;
  voFile: string;
  words: TimelineWord[];
  cues: Record<string, number>; // scene-relative frame where the cued word starts
};
export type Timeline = {fps: number; width: number; height: number; totalFrames: number; scenes: TimelineScene[]};

export const timeline = raw as unknown as Timeline;
export const sceneById = (id: string) => timeline.scenes.find((s) => s.id === id)!;
