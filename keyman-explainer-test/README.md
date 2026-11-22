# keyman-explainer-test

45–55 s vertical explainer: "What Happens When Your Most Important Employee Disappears?" (Keyman insurance, Singapore SMEs).
Built with Lemo-Opuscar (Swiss Motion Graphics), local Kokoro narration, synthesised score.

- `output/keyman-explainer-v1.mp4` — the film; `output/thumbnail.png`
- `subtitles/keyman-explainer.srt` — captions (also burned in)
- `script.md`, `storyboard.md`, `production-plan.md`, `production-notes.md`, `CREDITS.md`
- `audio/voice/` narration lines; `audio/voice-audition/` alternative voices
- `source/` — `film.js` (all scenes), `timeline.json`, `score.py`, `mix.py`, `tools/`, `build.sh`

Rebuild (needs the Lemo-Opuscar library at `~/lemo-opuscar` with `setup.sh deps voice`, ffmpeg ≥ 7): `sh source/build.sh`
