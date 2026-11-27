# Gold standard: vertical explainer videos

Ray approved this video ("The Million-Dollar Company That Couldn't Pay Salaries", 2026-11-27) as the gold standard. For any new explainer, start from this folder, not from scratch. Full rationale and vault copy: `11 SOPs/Remotion Cash-Flow Explainer - Gold Standard` in the Rayvern Brain vault. Production detail: `PRODUCTION_NOTES.md`.

## What makes it the bar
1. Story first: the viewer feels the predicament before the lesson.
2. One continuous visual world (parallax, consistent character, SVG charts/props), no slides, no stock, no photorealism.
3. Narration is the master clock: TTS word times -> `timeline.json` -> every cue, caption and sound effect.
4. Figures single-sourced in `src/config/figures.ts` with build-time asserts; no hard-coded amounts in components.
5. Designed sound: original score, synthesised effects, music ducked under voice, mastered to -14 LUFS.
6. Voiced CTA plus end card; never invent contact details.

## Spec
- 1080x1920, 30 fps, 75-90 s, H.264 High yuv420p BT.709, CRF 20 slow, AAC 48 kHz.
- Palette: navy #101827, charcoal #202C3A, cyan #21C6D7 (cash in), amber #FFBE55 (outstanding), red #F06262 (pressure), off-white #F4F6FA. Fonts: Inter Display / Inter.
- Safe zones: critical content y 220-1250, x 60-1020; captions y 1285-1440; nothing critical in the bottom 490 px or right 120 px.
- Voice: Edge TTS `en-SG-WayneNeural`, -3% rate (-7% on amounts), -2 Hz pitch, one synthesis per sentence group so pauses sit on the timeline.

## New video checklist
1. Copy the folder; keep `src/components/`, `src/lib/`, `scripts/`.
2. Rewrite `src/config/production.json`, `copy.ts`, `figures.ts` and the scene files.
3. `npm run assets` (needs network for TTS), check the timeline length, render stills with `--props='{"debug":true,"audio":false}'`, draft with `--scale=0.5`, final render, `python3 scripts/master.py`.
4. QA gate before showing anyone: ffprobe format, decode clean, -14 +/-1 LUFS and true peak <= -1.5 dBFS, `qa_transcribe.py` (word error <= 5%, offset ~0 ms), `check_figures.py`, `spellcheck.py`, scene-change scan, stills reviewed for clipping, search for wording Ray has asked to remove.

## Gotchas
- edge-tts pins its own CA store: point its SSL context at `/root/.ccr/ca-bundle.crt` (never disable TLS). Run `apt-get update` before installing fluidsynth.
- faster-whisper breaks on PyAV with a file path: pass a float32 array; expand numerals and re-join split tokens before scoring; split clips at silent gaps.
- Word-cue regex case-insensitive; keyframes monotonic; headlines must fit the safe zone; leave scene tail for animations after long merged phrases; gate the first render on font load.

## Not yet done (be honest in hand-offs)
Human listen-through of the voice; compliance/MAS review of final wording before publishing; Edge read-aloud is an unofficial route (re-voice via Azure AI Speech for paid distribution); Remotion licence applies to larger for-profit teams.
