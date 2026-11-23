# Keyman Explainer — Production Plan (Lemo-Opuscar, Swiss Motion Graphics)

## Context
First proof-of-concept: one finished 9:16 MP4 (45–55 s) that explains key-person risk and Keyman insurance to Singapore SME owners, built entirely in code with the Lemo-Opuscar library (Swiss Motion Graphics style), with local Kokoro narration, an original synthesized score, SFX, burned-in captions, and a separate `.srt`. Done = a QA'd MP4 on disk, committed and pushed, plus the source needed to rebuild it with one command.

## Environment (inspected)
| Item | Found | Action |
|---|---|---|
| OS | Ubuntu 24.04 x86_64, 4 CPU, 15 GB RAM, no GPU, 60 GB free | fine (2D canvas only) |
| Claude Code | 2.1.330 | run plugin commands |
| Node / npm | 22.23 / 10.9 | ok (needs ≥20) |
| Python | 3.13.18 | ok (kokoro-onnx needs 3.11–3.13) |
| ffmpeg | **6.1.1** | **too old**: library's `mux.sh` rejects 6.x loudnorm. Install static 7.0.2 (johnvansickle.com) to `/usr/local/bin` |
| Chromium | pre-installed `/opt/pw-browsers/chromium_headless_shell-1243` | use via `PLAYWRIGHT_CHROME`; keep setup.sh's browser download out of `/opt` |
| Network | unrestricted | GitHub, npm, PyPI, Hugging Face all reachable |
| Lemo-Opuscar | not installed | install |

## Decisions (defaults locked)
- **Narrator: female Asian voice (user choice).** Kokoro is the only commercially clean local option (Apache-2.0). Audition its Mandarin-female voices (`zf_xiaoyi`, `zf_xiaoxiao`, `zf_xiaobei`, `zf_xiaoni`) and Hindi-female (`hf_alpha`, `hf_beta`) speaking English, plus 70/30 blends with `af_heart` for English prosody (kokoro-onnx accepts a blended style vector). Pick the best one that passes Whisper word-for-word on the full script at 130–145 wpm. Keep 3 finalist clips in `audio/voice-audition/` so the voice can be swapped with a one-line change. (A true Singapore accent would need Azure Speech `en-SG-LunaNeural` with the user's own key. Optional later, not default.)
- **Palette vs Swiss STYLE.md:** the brief's palette wins. Page `#0B1220`, panels `#17243A`, ink `#FFFFFF`, grid lines = white at 6–10%. **Cyan `#00D9E8` = the single signal colour** (key person, protection, CTA). **Orange `#FF9A3C` appears only in Scene 2** as the risk state, never alongside cyan in the same element. Everything else in STYLE.md stays: grid, one OFL grotesque (**Archivo**, self-hosted), flush-left, `cubic-bezier(.7,0,.2,1)` snaps on beats, clip-reveal entrances, knife-cut deletions, no fades/gradients/bounce, grain 0. Log the deviation in `production-notes.md`.
- **Vertical grid 1080×1920:** 6 columns, 72 px side margins, 24 px gutters, 24 px baseline. **Safe zone** for anything that must be read: x 72–900 (right rail kept clear for TikTok/Reels buttons), y 220–1480 (top status bar and bottom caption/UI band kept clear). Subtitle band reserved at y ≈ 1250–1450.
- **Music:** original 120 BPM electronic score synthesized in numpy (drum-machine kit, sub-bass with 2nd/3rd harmonics, FM pluck arpeggio, FM bell on reveals). 1 beat = 0.5 s = 12 frames, so every snap lands on a whole frame. No sample libraries, so the score carries no third-party licence.
- **Compliance:** covered events stay conditional in VO and picture. The payout only moves after a "COVERED EVENT" condition ticks. End card gets fine print: "General information only, not financial advice. Benefits depend on policy terms and conditions." No insurer names, logos, or phone numbers.
- **Location and persistence:** project at `/home/user/keystal-command-centre/keyman-explainer-test/` (container is ephemeral). Commit source and deliverables (not frames, caches, or the library) to `claude/sharp-newton-3wb3d7`, push, then open a draft PR. Also send the MP4 and thumbnail to the user.

## Stage B — execution steps

### 1. Install
```bash
claude plugin marketplace add lemomo-ai/lemo-opuscar
claude plugin install lemo-opuscar@lemolab
```
- ffmpeg 7: download `ffmpeg-release-amd64-static.tar.xz` into the scratchpad, then copy `ffmpeg` and `ffprobe` to `/usr/local/bin`. Verify `ffmpeg -version` reports 7.x.
- Library: `sh <plugin>/skills/lemo-opuscar/scripts/setup.sh`, which clones `~/lemo-opuscar` and prints `LIB=`. Fallback if the plugin CLI fails: run the same `setup.sh` fetched from GitHub.
- Dependencies: `PLAYWRIGHT_CHROME=<pre-installed headless_shell> PLAYWRIGHT_BROWSERS_PATH=$HOME/.cache/lemo-pw sh setup.sh deps voice`. This installs core (npm, .venv) and voice (kokoro-onnx, faster-whisper, Kokoro model). The music tier is not needed.
- Fonts: Archivo (OFL) from `github.com/google/fonts/tree/main/ofl/archivo` into `keyman-explainer-test/source/fonts/`.
- Read the installed `SKILL.md`. No restart is needed: the skill's `setup.sh` is called by path. Write `production-plan.md` (this plan) first as the handoff file.

### 2. Treatment, then demo techniques
- Write `script.md` (final VO with timing notes) and `storyboard.md`. `storyboard.md` serves as the library's TREATMENT: 3 candidate structures, the choice, logline, benchmark, shot list, beat sheet, cue map, sound table, and subtitle design.
- Only after that, run `setup.sh demo swiss-motion`. Read `DEMO.md`, `ease.js`, `film.js`, `main.js`, `tools/words.py`, and `tools/subs.py`, and copy the technique code (MIT) into `source/`, replacing `../..` with `$LIB`/absolute URLs. Do not reuse its story, shots, or timeline.

### 3. Voice first (locks timing)
- `source/lines.json`: one entry per sentence (11 lines, 89 words). Spoken text uses "Keyman", never all-caps.
- Run the voice audition, then `tts.py` (or `source/tts_blend.py` for a blend) to write `audio/voice/*.wav` and `dur.json`. Then `asr_check.py --lang en`, which must exit 0 and writes `words.json`. Tune speed so speech totals about 39–42 s.
- `source/timeline.json`: sections snapped to 2 s bars, each VO line starting on a beat. It is the single source for picture, score, SFX, and subtitles. Target length is about 50–52 s, including a CTA hold of at least 4 s.

### 4. Scenes (target times; final times come from the voice)
| # | Time | Picture (Swiss technique) | On-screen text | Sound cue |
|---|---|---|---|---|
| 1 Hook | 0–6 | Motion from frame 0: file tiles snap onto the grid with "BACKUP COMPLETE ✓" counters. **Re-flow** (nearest first) into an org chart with a cyan human pictogram in the centre. A giant "?" (extreme scale contrast) wipes in behind it, then a **push into the module** lands on the downbeat | YOUR BIGGEST BUSINESS RISK? (word clip-reveal) | clack per snap, notification ding on ✓, whoosh on push |
| 2 Problem | 6–16 | **Pull out** to a network of 6 department modules linked to the key person, with pulses travelling the lines. The caption cycles FOUNDER / LEAD OPERATOR / TOP SALESPERSON. Half-bar near-silence, then a **knife cut** deletes the person. **Ripple by distance**: links snap, modules turn orange, PROJECTS bar freezes, CLIENTS meter drops, CASH FLOW line dives | ONE PERSON. / MULTIPLE BUSINESS RISKS. | drums drop (silence 1), guillotine snick, low drone |
| 3 Keyman | 16–29 | Near-silent bar, then the title on the downbeat. A stacked-block "business finances" structure; a cyan shield frame is **drawn linearly** around it; a policy icon snaps in on the grid. Condition row "INSURED KEY PERSON · DEATH OR OTHER COVERED EVENT*" ticks only on that VO phrase, then the cyan **payout block travels linearly (the exception)** into the structure | KEYMAN INSURANCE / FINANCIAL PROTECTION FOR THE BUSINESS | silence 2, numeral thunk, ruling-pen "tss", J-cut pad |
| 4 Recovery | 29–41 | Knife cut splits the payout into 3 and the frame **splits into 3 equal cells** (stacked rows, giant 01/02/03). Staggered on narration: A new person fills the empty org slot; B expense bars filled from below in cyan; C runway playhead runs linearly across months | DEPENDING ON THE POLICY (grey lead-in) / RECRUITMENT / OPERATING EXPENSES / RECOVERY TIME | block snaps on beats, light groove |
| 5 CTA | 41–51 | **Pull out to the whole network, stable**: all white with cyan links. The hook's "?" is knife-cut and replaced by a ✓ (bookend). A wipe leads to the closing composition, held at least 4 s | PROTECT YOUR BUSINESS CONTINUITY / DM 'KEYMAN' TO FIND OUT MORE (navy on cyan block) / Rain \| SME Risk & Business Advisory / fine print | resolve to tonic, felt thump on the final downbeat |

Build as one page: `source/index.html` with canvas 2D modules (`grid.js`, `scenes/s1..s5.js`, `subs.js`). `render(t)` is deterministic and uses a single 2D camera matrix. It exposes `DUR`, `READY`, `EV` (SFX and cue events), and `TEXTS` (for readcheck). Prove the look first: render 3 style frames of Scene 1 with `still.mjs --size 1080x1920` before building the rest.

### 5. Audio and subtitles
- `source/score.py` (numpy synth from `timeline.json`) and `source/mix.py`. Mix uses `core/audio/sfx.py` for SFX at `events.json` times. Voice is compressed, then set about 10 dB over the music, with the music ducked about 10 dB under the voice. Writes `out/mix.wav`.
- Subtitles are part of the layout: flush-left at column 1 inside the reserved band, max 2 lines, Archivo SemiBold about 58 px, words clip-revealed on Whisper timestamps. Each cue holds at least max(1.8 s, speech + 0.6 s), asserted in code. `cues.json` drives both the burned-in captions and `core/render/srt.py`, which writes `subtitles/keyman-explainer.srt`.

### 6. Render
`source/build.sh` (with `LIB=` at the top) runs `events.mjs`, then `video.mjs --size 1080x1920 --fps 24 --workers 3`, then `mix.py`, then `mux.sh … 24 0` (grain 0, −14 LUFS, H.264 and AAC), writing `output/keyman-explainer-v1.mp4`. `output/thumbnail.png` comes from the CTA or hook frame.

## Verification (on the exported file, then one fix round and a rerender)
- `ffprobe`: h264, 1080×1920, 24 fps, AAC, duration 45–55 s.
- `ffmpeg -af ebur128` reads about −14 LUFS; `blackdetect` and `freezedetect` find no blank or stuck frames.
- Whisper on the final mix matches the script; `asr_check.py` exits 0.
- `readcheck.mjs --size 1080x1920` exits 0 (fine print marked `pass`); `.srt` intervals satisfy the hold rule and match the burned-in cues.
- Contact sheets every 1 s, two passes, via `still.mjs --range` and `sheet.py`, plus 0.2 s strips of the knife cut, the payout drop, and the 3-way split. Check clipping, overlap, safe-zone breaches, and text legibility at phone size.
- Content check: conditional wording, no guarantees, correct CTA and branding. `grep -rniE "lemo ?lab"` on the project finds nothing outside CREDITS.
- Compare against the Swiss demo (at least 4 of 6 differ: structure, opening, signature shot, camera path, score shape, ending) and its poster.

## Deliverables (`keyman-explainer-test/`)
```
output/keyman-explainer-v1.mp4, output/thumbnail.png
subtitles/keyman-explainer.srt
audio/voice/*.wav, audio/voice-audition/*.wav   (mix.wav regenerated by build.sh)
source/ (index.html, scenes, fonts, lines.json, timeline.json, cues.json, score.py, mix.py, build.sh)
script.md, storyboard.md, production-plan.md, production-notes.md, CREDITS.md, README.md, .gitignore (out/, stills/, caches)
```
CREDITS.md lists Kokoro (Apache-2.0) with the chosen voice, faster-whisper (MIT), Archivo (OFL), Lemo-Opuscar toolkit code (MIT; films made with it need no credit), and an original synthesized score and SFX.

Finally: commit, push to `claude/sharp-newton-3wb3d7`, open a draft PR, and send the MP4 and thumbnail to the user.
