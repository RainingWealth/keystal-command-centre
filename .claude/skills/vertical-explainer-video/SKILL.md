---
name: vertical-explainer-video
description: Produce a finished 9:16 (1080x1920) animated explainer/promo MP4 in code with the Lemo-Opuscar library, local Kokoro narration, a synthesised score, burned-in captions and SRT. Use for TikTok/Reels/LinkedIn explainers, lead-gen education videos (e.g. Keyman insurance for Singapore SMEs), or any "make me a video" brief that must end in a rendered, QA'd MP4.
---

# Vertical explainer video (Lemo-Opuscar + Kokoro)

Worked example: `keyman-explainer-test/` (source in `source/film.js`). Success = a QA'd MP4 on disk, not code or stills. Keep it one video; don't build a platform.

## Workflow
1. **Environment.** Need Node ≥20, Python 3.11–3.13, **ffmpeg ≥7** (6.x fails `mux.sh`; install the johnvansickle static build to /usr/local/bin). `claude plugin marketplace add lemomo-ai/lemo-opuscar && claude plugin install lemo-opuscar@lemolab`, then `PLAYWRIGHT_BROWSERS_PATH=$HOME/.cache/lemo-pw sh <skill>/scripts/setup.sh deps voice` (library lands in `~/lemo-opuscar`). Download Archivo (OFL) into `source/fonts/`.
2. **Script → voice first.** Lines of one sentence each in `source/lines.json`. Synthesize with `templates/tools/tts_blend.py` (blend e.g. `zf_xiaoxiao:0.5,af_heart:0.5`, speed 0.82 ≈ 141 wpm). Verify with `core/tts/asr_check.py --lang en` (0 mismatches). Fix mispronounced words with a `phonemes` field (see pitfalls). Spoken text never uses ALL CAPS brand words.
3. **Timeline.** Set VO start times and run `templates/tools/build_timeline.py` → `timeline.json`, `cues.json`, SRT. It asserts caption hold ≥ max(1.8 s, speech+0.6 s), ≤2 caption lines, and a clean final hold. Lock timing from measured speech, not the brief's guesses.
4. **Treatment before demo code.** Write `storyboard.md` (3 structures, shot list, beat sheet at 120 BPM, sound table) *before* opening the style's DEMO.md. Reuse one module grid across scenes. Safe zones for 1080×1920: nothing essential in the bottom ~440 px or right ~72 px; captions flush-left, 54 px, ≤828 px wide.
5. **Build the page.** `render(t)` deterministic, `DUR`, `EV` (sound events from the same constants), `TEXTS` (readcheck), `READY`. Patterns in `reference/film-engine.md`. Prove the look with stills (`still.mjs --size 1080x1920`) and contact sheets before rendering.
6. **Audio.** Original numpy score + procedural foley (`mix.py`), voice ≈10 dB over music, two real silences, trims per section. Mux with `core/render/mux.sh … 24 0` (−14 LUFS).
7. **One command.** `templates/build.sh` (`--voice` regenerates narration). Run it end to end at least once.
8. **QA gate (on the exported file).** ffprobe specs; `ebur128` ≈−14 LUFS, TP < −1; blackdetect **and** a per-frame content scan (dark pages defeat blackdetect); freezedetect; silencedetect (only intended silences); Whisper base/small/medium on the final audio vs script; `readcheck.mjs --size 1080x1920`; per-second contact sheets of the MP4; 0.2 s strips of each key action. Fix and rebuild once, then re-check.
9. **Deliver.** `output/<name>.mp4`, thumbnail (`still.mjs … --q nocap=1`), `.srt`, script, storyboard, production-notes (deviations + limits), CREDITS (Kokoro Apache-2.0, Whisper MIT, font OFL, toolkit MIT), README. Commit, push, draft PR. State plainly that audio was judged by ASR/pitch/pace, not by ear.

Compliance for insurance topics: conditional wording only ("can help", "covered event"), no insurer names/logos/phone numbers, fine print on the end card.
