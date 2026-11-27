# The Million-Dollar Company That Couldn't Pay Salaries

Premium animated business explainer, built natively in Remotion (React + TypeScript). One finished version, 1080 × 1920 (9:16), 30 fps, 88.2 s, H.264 / AAC. The company and its figures are a fictional case study; the video carries no on-screen disclaimer wording, by request.

## Deliverables (`output/`)

| File | What it is |
|---|---|
| `million-dollar-company-cashflow.mp4` | The finished video (H.264 High, yuv420p, BT.709, AAC-LC 48 kHz stereo, −14.0 LUFS, true peak −1.5 dBFS) |
| `million-dollar-company-cashflow.srt` | Subtitles timed from the final voiceover (27 cues, max two lines of ≤42 characters) |
| `narration.wav` / `narration.mp3` | The voiceover alone, placed on the video timeline (sample-aligned with the MP4) |
| `preview.png` | Representative frame: the payroll notification and the founder's reaction |

The Remotion project is this folder (`src/`, `public/`, `scripts/`).

## Voice

- **Provider and voice:** Microsoft Edge neural TTS (via `edge-tts`), voice `en-SG-WayneNeural`: male, Singapore English. It was the only en-SG male voice in the live voice list (the other is `en-SG-LunaNeural`, female).
- **Delivery:** rate −3% overall, −5% on the "tonight, the founder checks the bank account" line, −7% on every line that carries an amount; pitch −2 Hz for a calmer, lower register. Each sentence group is a separate synthesis, so pauses (0.3–1.0 s, longest before the closing lines and around S$14,000) are set on the timeline instead of left to the engine.
- **Processing:** per-segment head/tail trim, 70 Hz high-pass, gentle 3 kHz presence lift, light compression, level-matched to −21 dBFS RMS.
- **Script:** the brief's narration word for word. Three additions: the closing lines "A profitable business can still run out of cash." and "Is your business ready for a ninety-day payment delay?" are voiced as well as shown on screen, and the video now ends with a voiced call to action, "DM me to book a free cash-flow health check." Amounts are spelled out for the voice ("one point two million", "thirty-six thousand").

## Music and sound

- **Music:** original score composed in code (`scripts/compose_music.py`), rendered with FluidSynth and the FluidR3_GM soundfont. D major (hope) in S1–S2, B minor ticking tension in S3–S6, a G–D–A lift in S7 that lands each chord on the matching action, and a D major resolution in S8 that fades with the picture. The music drops out entirely for the phone notification and ducks about 6 dB under the voice.
- **Sound effects:** synthesised in numpy (`scripts/make_sfx.py`): office and night ambience, UI ticks, counter roll, phone chime and vibration, clock tick, paper and coin sounds, heartbeat, soft impacts, lights-off click. No third-party samples.

## Scene timing (from `src/data/timeline.json`)

| Scene | Start | End | Length | Narration segments (start) |
|---|---|---|---|---|
| S1 The success story | 0.00s | 7.03s | 7.03s | s1a 0.60s, s1b 4.27s |
| S2 Profitable on paper | 7.03s | 16.77s | 9.73s | s2a 7.23s, s2b 11.37s |
| S3 Tomorrow's problem | 16.77s | 29.87s | 13.10s | s3a 17.27s, s3b 21.27s, s3c 23.90s |
| S4 The 90-day trap | 29.87s | 39.83s | 9.97s | s4a 30.07s, s4b 31.40s, s4c 34.83s |
| S5 The growth paradox | 39.83s | 46.73s | 6.90s | s5a 40.03s, s5b 42.47s |
| S6 The real problem | 46.73s | 56.47s | 9.73s | s6a 46.93s, s6b 50.17s |
| S7 How to prevent it | 56.47s | 67.27s | 10.80s | s7a 56.77s |
| S8 The final lesson | 67.27s | 88.17s | 20.90s | s8a 67.67s, s8b 70.27s, s8c 72.47s, s8d 75.37s, s8e 79.40s, s8f 83.13s |

Total: 2645 frames = 88.17s at 30 fps

All animation cues (counters, chips, cards, captions, sound effects) read word start times from the measured narration, so changing the script and re-running `npm run assets` re-times everything.

## Call to action

After the closing question the voice says "DM me to book a free cash-flow health check." and an end card shows FREE CASH-FLOW HEALTH CHECK with a DM ME button, held until the fade to black. No phone number, link or handle is shown; the destination is "DM me".

## Figures (single source: `src/config/figures.ts`)

| Item | Amount |
|---|---|
| Annual revenue | S$1,200,000 |
| Reported profit | S$180,000 |
| Profit margin | 15% (derived, asserted at build time) |
| Current cash | S$14,000 |
| Payroll due tomorrow | S$36,000 |
| Payroll shortfall | S$22,000 (derived, asserted at build time) |
| Customer payment term | 90 days |

The video carries no "hypothetical" or "illustrative" wording (removed by request). Revenue and profit never appear as bank cash: bank cash appears only on the phone, labelled "Available cash". S2 notes that profit is booked when invoiced (accrual) and S6 repeats it. S7 closes with "Helps narrow the gap. No guarantee for every business."

## Quality checks run on the final MP4

| Check | Result |
|---|---|
| Format | 1080×1920, 30 fps, H.264 High yuv420p BT.709; AAC-LC 48 kHz stereo; 88.20 s; decodes with no errors |
| Loudness | −14.0 LUFS integrated, LRA 3.1 LU, true peak −1.5 dBFS (two-pass `loudnorm`) |
| Voiceover audible and accurate | Whisper (`base.en`) transcript of the delivered MP4 vs script: 2.6% word error (4 of 152 words; recogniser misreads of "reported", "suppliers want" and "unpaid"); the CTA line is transcribed correctly |
| Audio/video sync | Cross-correlation of the MP4's audio against `narration.wav`: 0.0 ms offset. TTS word timings sit within about 50 ms of audio onsets and offsets (worst trailing end 0.19 s) |
| Figures | `scripts/check_figures.py`: 15 checks pass (margin 15%, shortfall S$22,000, caption amounts, no hard-coded amounts in components, narration wording) |
| Spelling | `scripts/spellcheck.py`: no unknown words in on-screen copy, narration or subtitles |
| Layout | Safe-zone overlay (`debug` prop) reviewed on stills from every scene; captions sit in y 1285–1440, critical content in y 220–1250 |
| Hard cuts | Scene-change detection finds one event above threshold: the intended payroll-notification flash at 23.6 s |

## Re-render

Requirements: Node 22, Python 3.13 (`pip install edge-tts mido pyspellchecker faster-whisper`), ffmpeg, FluidSynth + `fluid-soundfont-gm`, a Chromium headless shell (path set in `remotion.config.ts`; Remotion downloads its own if absent).

```bash
npm install
npm run assets                      # TTS, timeline, SFX, music, narration export (needs network for TTS)
npm run studio                      # preview and edit
npx remotion render src/index.ts Main work/raw.mp4 --crf=20 --x264-preset=slow --color-space=bt709 --audio-bitrate=320k
python3 scripts/master.py           # loudness master -> output/million-dollar-company-cashflow.mp4
python3 scripts/qa_transcribe.py    # audio QA on the delivered file
```

`npx remotion still src/index.ts Main out.png --frame=1200 --props='{"debug":true,"audio":false}'` draws the safe-zone overlay.

## Limitations and licences

- **Voice authenticity was checked by speech recognition and timing only; nobody has listened to the accent and pacing.** The en-SG-WayneNeural voice is a neural voice and will not match a human Singaporean voice actor. Please listen once before publishing; if the accent or pace is off, change `voice` in `src/config/production.json` and re-run `npm run assets`.
- **Edge read-aloud is an unofficial route to the Azure neural voice.** For paid or large-scale distribution, re-voice through Azure AI Speech (same voice name, with an Azure key) or a human recording. The script and timing plan carry over.
- The music is a soundfont-rendered score, not a live recording. It is original, but the instruments are General MIDI quality.
- Illustrations are stylised vector characters. The skyline is a generic Singapore-style silhouette (a Marina Bay Sands-like deck on three towers), not a trace of any real building.
- The bottom third of the frame is deliberately calm so platform buttons and captions do not collide with the story.
- **Licences:** Inter fonts are SIL OFL 1.1. FluidR3_GM is MIT-licensed (Frank Wen). Remotion's licence lets individuals, for-profit organisations with up to 3 employees and non-profits use it free of charge (commercial use included); larger for-profit companies need a Remotion Company License (see `node_modules/remotion/LICENSE.md`).
- Figures are fictional and the video is general information, not financial advice.
