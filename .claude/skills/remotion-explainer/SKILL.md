---
name: remotion-explainer
description: Build, render and QA a 9:16 financial-education explainer video (Singapore SME audience) with Remotion, starting from the keyman-remotion project. Use when asked to make a new topic video, re-render the Keyman film, or compare video engines.
---

# Remotion explainer workflow

Reference implementation: `keyman-remotion/` (port of the Lemo-Opuscar Keyman film, SSIM 0.996 vs original, render 48 s).
Read `keyman-remotion/COMPARISON.md` and `/CLAUDE.md` first.

## Steps for a new topic
1. **Script** (~90 words, 11-ish lines, 130-145 wpm). Compliance first: conditional wording ("can help", "depending on the policy", "if ... covered event"), no guarantees, no insurer names/logos/phones, fine print on CTA card: "General information only, not financial advice. Benefits depend on policy terms and conditions." Keyman tax: deduction is conditional (IRAS five conditions) - never say "always deductible".
2. **Copy the project** to `<topic>-remotion/`; replace `src/data/timeline.json`, `timing.ts` constants, scene files. Keep `src/lib/anim.ts`, `design/tokens.ts`, `components/primitives.tsx`, `Captions.tsx`, `FontGate.tsx`.
3. **Voice + timing**: Kokoro TTS (blend `zf_xiaoxiao:0.5,af_heart:0.5`, speed 0.82; phoneme override for "Keyman"), faster-whisper word times -> `timeline.json` (`lines[].wt`, `cues[]`). Lemo-Opuscar tools: `tools/tts_blend.py`, `tools/build_timeline.py` in the original (PR #4, `keyman-explainer-test/source`). Start each VO line on a 120 BPM quarter-beat (12 frames/beat at 24 fps); hold each caption >= max(1.8 s, speech+0.6 s).
4. **Audio**: `tools/audio/` rebuilds bed (score+foley, ducked) and per-line VO stems; Remotion `Soundtrack.tsx` places them. Needs `LIB` (lemo-opuscar clone) and `ORIG`.
5. **Scenes**: one pure function of absolute seconds `t` per scene; use `snap/rin/rout/steps/lin` only (ease cubic-bezier(.7,0,.2,1) + linear; no fades/bounce/gradients). Palette: bg #0B1220, panel #17243A, cyan #00D9E8 (single signal), orange #FF9A3C (risk only), Archivo.
6. **Render**: `npm run render` (render -> two-pass loudnorm -14 LUFS/-1.5 TP -> trim `-t 52`).
7. **QA (must pass before claiming done)**: ffprobe frames = fps*duration; ebur128 ~ -14; silencedetect shows intended silences; captions <=2 lines inside x72-900, y<=1380; SSIM vs reference frames; view contact sheet. Say honestly that audio was not listened to.

## Gotchas learned
- Use fps/size of the source film (24 fps), not the brief's fallback.
- Clip with nested `<svg x y width height viewBox>` (no ids); set `strokeMiterlimit=10` to match canvas.
- Gate rendering on font load (`FontGate`) before measuring text.
- Bed audio is longer than video: trim output to duration.
- Chrome: remotion.config.ts uses /opt/pw-browsers headless shell or `BROWSER_EXECUTABLE`; never reinstall.
- Remotion licence: paid for larger for-profit teams; check remotion.pro.
- Generalising the Keyman scenes into data-driven templates is NOT done yet; first new topic should build 3-4 reusable scene types (network, tower+shield, three-row split, CTA card).
