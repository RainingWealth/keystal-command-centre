# Pipeline (commands used for the Keyman film)
Project: `keyman-remotion/` (copy to `<topic>-remotion/`). Original Opuscar source: PR #4 `keyman-explainer-test/source/`.

1. **Script** -> `lines.json` (id, text, optional `phonemes`, `speed`). ~90 words, 130-145 wpm.
2. **Voice** (needs Lemo-Opuscar clone as `LIB`, `setup.sh deps voice`):
   `$LIB/.venv/bin/python tools/tts_blend.py lines.json audio/voice --voice "zf_xiaoxiao:0.5,af_heart:0.5" --speed 0.82`
   then `core/tts/asr_check.py lines.json audio/voice --lang en` (must exit 0).
3. **Timeline**: `build_timeline.py` (Whisper word onsets, caption chunks, hold >= max(1.8 s, speech+0.6 s)) -> `src/data/timeline.json`.
   Start VO lines on 120 BPM quarter-beats (frames = seconds*24).
4. **Audio**: `LIB=<clone> ORIG=<orig project> npm run audio` -> `public/audio/bed.wav` + `public/audio/vo/lXX.wav`.
5. **Scenes**: pure functions of absolute seconds `t` (`src/scenes/*`), constants in `src/data/timing.ts`; helpers in `src/lib/anim.ts`.
6. **Preview**: `npm run studio`; single frame: `npx remotion still src/index.ts KeymanRemotion out/f.png --frame=N`.
7. **Render + master**: `npm run render` (render crf 18 -> two-pass loudnorm I=-14 TP=-1.5 -> `-t <duration>`).
8. **QA**: `sh .claude/skills/remotion-explainer/scripts/qa.sh <video> [reference.mp4]`.
Timing reference: 52 s film rendered in 48 s on 4 vCPU (3 workers).
