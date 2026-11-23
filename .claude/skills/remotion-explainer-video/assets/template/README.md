# Remotion explainer template

Worked example: a 57.9 s buy-sell-agreement explainer (1080x1920, 30 fps). Replace `script/narration.json` and the files in `src/scenes/`, keep everything else.

```bash
.venv/bin/python scripts/generate_voice.py   # Kokoro TTS + word timings
.venv/bin/python scripts/build_timeline.py   # frames, captions, cues -> src/data/timeline.json
.venv/bin/python scripts/generate_audio_assets.py
npm run studio                               # preview
scripts/build_all.sh                         # full pipeline to deliverables/explainer.mp4
```

See the skill's `SKILL.md` and `references/` for the method, design system and QC checklist.
