---
name: remotion-explainer-video
description: Build a finished vertical (9:16) narrated explainer / motion-graphics video with Remotion + React + TypeScript for TikTok, Reels, Shorts or LinkedIn - script to H.264 MP4 with local AI voice-over (Kokoro), word-synced captions, cue-synced SVG animation, synthesised music and sound effects, loudness-normalised audio and automated QC. Use this whenever the user wants an explainer video, social video, animated financial-education clip, Remotion project or "turn this script into a video", or wants to reuse the Buy-Sell Agreement video as a template for Keyman, Shareholder Succession, Business Valuation, Estate Liquidity or Business Continuity topics - even if they never say Remotion.
---

# Remotion explainer video

Turns a script into a publish-ready 1080x1920, 30 fps video with no paid services: Kokoro TTS narration, captions timed to the words, animation keyed to narrated words, original music and SFX, two-pass loudness normalisation, and a QC script. Proven on the 57.9 s Buy-Sell Agreement explainer (see `references/case-study-buy-sell.md`): -14.0 LUFS, -1.0 dBTP, Whisper caption sync 108 ms mean error, no frozen frames, cost $0.

The point of the design: **the narration is the master clock.** Every animation beat is a `cue('word')` that resolves to a frame from the generated voice timings, so changing the script or voice re-syncs the whole video instead of breaking it.

## Defaults (do not ask routine questions; state them and go)

1080x1920, 30 fps (use the fps the brief or a source film specifies; the Keyman film used 24), H.264 yuv420p + AAC, 55-65 s, English, navy/off-white/cobalt with teal = protection/solution and orange/red = risk, Inter type, Kokoro `af_heart` at about 0.92x, -14 LUFS. Ask the user only for things that change the content: the audience, the one-sentence key message, the call to action, and any compliance wording they must keep.

## Workflow

1. **Bootstrap.** `scripts/bootstrap_project.sh <dest>` copies `assets/template/`, installs fonts, npm deps, the Remotion browser, the Python env and the grain texture. The template contains the finished Buy-Sell video as a worked example; replace its content, keep its machinery. First run downloads about 600 MB (torch CPU, Chromium shell, models).
2. **Refine the script** into 5-7 scenes of one idea each (hook, problem, mechanism, gap, solution, CTA). Write for the ear: short sentences, no dashes (they become stray TTS tokens), numbers as words in `text` and digits in `display`. Validate the domain facts and hedge anything legal/financial (`references/compliance.md`). One scene = one narration paragraph = one visual idea; if you cannot say what the viewer sees with sound off, the scene is not done.
3. **Fill `script/narration.json`.** Per scene: `text` (spoken), `display` (caption text, same word count), `emphasis` (keywords that get the accent colour), `cues` (names for words the animation hangs on; use `["word", n]` for the n-th repeat), plus `layout` lead/tail frames. Schema in `references/pipeline.md`.
4. **Voice and timeline.** `python scripts/generate_voice.py` (Kokoro; trims silence, levels each scene, extracts word timings) then `python scripts/build_timeline.py` (frames, captions, cues; fails outside 55-65 s). Fix length with `--speed` (0.92 turned 44 s of narration into a 57.9 s video) or the scene tail frames; tails also give the final headline time to be read, so hold the key scene (the "gap" or the CTA) for 1.5-4 s after the voice ends.
5. **Design inside the layout zones** (`references/design-system.md`): label y 214, headline 270-650, diagram 690-1200, footnote 1222, captions 1300-1470, nothing essential in the bottom 450 px or the right 110 px (platform UI). Keep the camera on the diagram layer only so headlines never crop.
6. **Build the scenes** (`src/scenes/*.tsx`), one file each, using the components (`Headline`, `ShareholderDonut`, `BarGauge`, `FlowPath`, `NodeCard`, icons, `Footnote`, `Camera`, `Sfx`). Pattern per scene: pull cues with `useCues()`, derive progress with `prog()`/`sp()`, swap 2-3 `Headline`s on cues (early keyword, then the on-screen message), add the compliance `Footnote`, place `Sfx` on the same cues. Register the scene ids in `ExplainerVideo.tsx`. Look at a worked scene before writing a new one.
7. **Review stills early and often.** `node scripts/stills.mjs out/st 100,200,300 0.5` renders many frames from one bundle in seconds; build a contact sheet (ffmpeg `hstack`/`tile`) and look at it. Fix layout before touching audio.
8. **Audio assets.** `python scripts/generate_audio_assets.py` synthesises the music bed (harmony follows scene starts: tension, then resolution at the solution) and SFX into `public/audio`. Nothing is sampled, so there is no licensing exposure.
9. **Render and finish.** `npm run render` (about 1 minute for 1,700 frames on 4 cores) then `scripts/finalize.sh` (two-pass loudnorm to -14 LUFS / -1 dBTP, video copied untouched, faststart). `scripts/build_all.sh` runs voice to QC in one go.
10. **QC, then fix, then re-run.** `python scripts/qc.py` checks format, duration, loudness, frozen video, audio in every scene and Whisper caption sync on the final mix. Then inspect frames from the final MP4 itself: a contact sheet every ~72 frames, the frames around every transition, and full-size stills of each headline, the climax and the end card (`references/lessons.md` lists what to look for). Do not deliver until both pass.
11. **Deliver.** Send the MP4 (and the voice-over track and cover frame), commit the project (not `node_modules`, `out/`, `.venv`), push, and give the reader the run/modify/re-render commands plus honest strengths and limitations.

## Rules that earn their keep

- **Cue everything to words, never to absolute frames**, except for pure decoration. Absolute frames silently drift when the voice changes.
- **Hedge by construction.** Put the caveat in the narration *and* as an on-screen footnote, and design the visual so it cannot be read as a guarantee (e.g. insurance proceeds only flow after visible conditions tick).
- **The climax needs its own beat:** a hold after the key line plus a camera shake and a low hit. Everything else supports it.
- **Size text with `fitText`**, never by eye, and add `wordSpacing` to negatively tracked display type or the spaces collapse ("WHOGETS").
- **Captions:** at most two lines, balanced pages (about 32 characters), the active word in a pill, emphasis words in the scene accent, centred in the 1300-1470 band.
- **Transitions cover the cut.** Venetian wipe bars fully cover the frame on the boundary frame and lift after it; whoosh 15 frames before the boundary.
- **Fonts:** load via `@remotion/fonts` and block the first render with a `FontGate`, otherwise `fitText` measures a fallback font.
- Generated media (VO, music, SFX) can be committed; compress the music bed to MP3 to keep the repo small.

## Environment gotchas (already handled by the scripts, know them when something breaks)

- `pip install kokoro` on Python 3.13 backtracks to 0.2.x and tries to compile spaCy; `setup_env.sh` forces wheels and pins `kokoro==0.7.16 --no-deps`. `KPipeline(lang_code="a")` takes no `repo_id` in 0.7.16.
- faster-whisper 1.2.1 breaks on PyAV 19 when given a file path; pass a float32 numpy array (done in `qc.py`). The first model download can fail once; retry.
- Remotion downloads its own headless shell on first use (`npx remotion browser ensure`); network must be allowed.
- Word counts of `text` and `display` must match exactly or `generate_voice.py` stops with the TTS tokens printed.
- Remotion is free for individuals and companies of up to three people; larger companies need a licence (https://www.remotion.dev/license). Mention it when delivering.

## Related skills (other sessions, other branches)

`vertical-explainer-video` (Lemo-Opuscar engine, branch `claude/sharp-newton-3wb3d7`) and `remotion-explainer` (Keyman film ported to Remotion with Opuscar's audio front end, branch `claude/pensive-turing-mhc480`, reference project `keyman-remotion/`). This skill is the self-contained, all-Remotion path: the narration timeline drives everything and nothing outside npm and pip is needed. Start from `keyman-remotion/` instead when the new video should look like the Keyman film (network grid, tower + shield, three-row split scenes). Both sibling approaches share the compliance rules and the QC-on-the-final-file habit.

## Reuse map (what to take for the next topic)

| Need | Component | Seen in |
|---|---|---|
| who owns what, a share leaves | `ShareholderDonut`, `Person`, `Family`, hollow dashed segment | Hook, OwnershipRisk |
| money vs need, a shortfall | `BarGauge` with hatched gap, counters, flicker | FundingGap, InsuranceSolution |
| money or ownership moving | `FlowPath` + `Coin` / `ShareToken` | OwnershipRisk, InsuranceSolution |
| a process of linked steps | `NodeCard` chain + signed `DocIcon` | Agreement |
| conditional outcome | checklist gate before flow | InsuranceSolution |
| CTA end card | teal block with light sweep, fade-out | CallToAction |

For Keyman, Succession, Valuation, Estate Liquidity and Continuity videos: new `narration.json`, new scene files, same everything else.

## Files

- `assets/template/`: complete working project (scripts, components, theme, six example scenes, example timeline).
- `scripts/`: `bootstrap_project.sh`, `setup_env.sh`, `setup_fonts.sh` (skill-level helpers).
- `references/pipeline.md`: commands, `narration.json` and `timeline.json` schemas, timing math.
- `references/design-system.md`: tokens, layout zones, motion language, component API, scene recipe.
- `references/compliance.md`: wording rules for financial, insurance and legal explainers.
- `references/lessons.md`: defects found and fixes, plus the visual QC checklist.
- `references/case-study-buy-sell.md`: the six-scene storyboard and final numbers.
