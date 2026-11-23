---
name: remotion-explainer
description: Build, render and QA a 9:16 financial-education explainer video (Singapore SME audience) with Remotion, starting from the keyman-remotion project. Use when asked to make a new topic video, re-render the Keyman film, or compare video engines.
---

# Remotion explainer workflow
Reference implementation: `keyman-remotion/` (SSIM 0.996 vs the Lemo-Opuscar original, render 48 s). Read `keyman-remotion/COMPARISON.md` and `/CLAUDE.md` first. Decision: Remotion renders; Opuscar's Kokoro TTS + Whisper timing + score tooling feed it.

1. Script (~90 words) under `references/compliance.md` rules.
2. Copy `keyman-remotion/` to `<topic>-remotion/`; keep `src/lib`, `src/design`, `src/components`, `FontGate`, `Captions`; replace `timeline.json`, `timing.ts`, scenes.
3. Voice, timing, audio, render, QA: exact commands in `references/pipeline.md`.
4. QA gate before claiming done: `scripts/qa.sh <video> [reference]` - frames = fps x duration, ~-14 LUFS, intended silences only, captions <= 2 lines inside x72-900 / y<=1380, view a contact sheet. State honestly that audio was not listened to.

## Gotchas
- Use the source film's fps/size (24 fps), not a brief's fallback; real CTA text beats the brief's.
- Clip with nested `<svg x y width height viewBox>` (no ids); `strokeMiterlimit=10` to match canvas.
- Gate rendering on font load before measuring text; bed audio is longer than the video, so trim with `-t`.
- Chrome: `remotion.config.ts` uses the pre-installed headless shell or `BROWSER_EXECUTABLE`; never reinstall.
- Remotion needs a paid company licence for larger for-profit teams - check remotion.pro.

## Next step for the 20-topic series (not built yet)
Build 4 reusable data-driven scene types from the Keyman scenes: network grid, tower + shield, three-row split, CTA card; then one `topic.json` per video (script, timeline, scene props).
