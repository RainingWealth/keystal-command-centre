# Pipeline reference

All paths relative to the project root (a copy of `assets/template/`).

## Commands

| Step | Command | Writes |
|---|---|---|
| env (once) | `scripts/setup_env.sh` (skill-level) | `.venv` |
| voice | `.venv/bin/python scripts/generate_voice.py [--voice af_heart] [--speed 0.92]` | `public/audio/vo/<id>.wav`, `script/voice_timings.json` |
| timeline | `.venv/bin/python scripts/build_timeline.py` | `src/data/timeline.json` (exits non-zero outside `minSeconds`-`maxSeconds`) |
| music + SFX | `.venv/bin/python scripts/generate_audio_assets.py` | `public/audio/music/bed.mp3`, `public/audio/sfx/*.wav` |
| grain | `.venv/bin/python scripts/generate_grain.py` | `public/assets/grain.png` |
| preview | `npm run studio` | localhost:3000 |
| stills | `node scripts/stills.mjs <outDir> 100,200,300 [scale]` | `f0100.png` ... (one bundle, fast) |
| render | `npm run render` | `out/raw.mp4` |
| finish | `scripts/finalize.sh [in] [out]` | `deliverables/explainer.mp4` (-14 LUFS, -1 dBTP, faststart) |
| VO track | `scripts/export_voiceover.sh` | `deliverables/voiceover_timeline.wav` |
| QC | `.venv/bin/python scripts/qc.py [mp4]` | console report, exit code |
| everything | `scripts/build_all.sh [voice flags]` | all of the above |

## `script/narration.json`

```jsonc
{
  "title": "...", "voice": "af_heart", "speed": 0.92,
  "layout": {
    "fps": 30,
    "leadFrames": { "s1": 6, "default": 8 },      // silence before the voice in each scene
    "tailFrames": { "s1": 20, "s4": 50, "s6": 120 }, // hold after the voice; the key scene and the end card get the longest
    "minSeconds": 55, "maxSeconds": 65
  },
  "scenes": [{
    "id": "s1", "name": "Hook", "label": "01 — THE QUESTION", "accent": "orange",   // orange | cobalt | teal | red
    "text":    "spoken words, punctuation for pacing",
    "display": "same number of words; spelling used in captions (15-minute vs fifteen-minute)",
    "emphasis": ["words", "that", "get", "the", "accent"],        // matched on lower-cased alphanumerics
    "cues": { "passed": "passed", "notShares": ["shares", 1] }    // name -> word (or [word, zero-based occurrence])
  }]
}
```

Rules: `text` and `display` must split on whitespace into the same number of words; avoid stand-alone dashes; attach ellipses to the word (`away...`); cue words are matched on lower-cased alphanumerics, so `doesn't` is cue `"doesn't"` and `buy-sell` does not match `buy`.

## `src/data/timeline.json` (generated, never hand-edited)

`scenes[]`: `id, name, label, accent, start, duration, voStart, voEnd, voFrames, voFile, words[], cues{}`; `cues` are **scene-relative** frames. `words[]`: `text, startFrame, endFrame` (absolute), `emphasis`. `captions[]` in `@remotion/captions` shape. Scenes are `<Sequence>`s at `start`; voice clips sit at the absolute `voStart`, so transitions never shift narration.

## Timing math (what worked)

- Kokoro `af_heart` speed 1.0 gave 44.0 s of narration for 133 words (about 3 words/s); 0.92 gave 46.4 s. Scene duration = lead + voice + tail. Total 57.8 s for the six scenes with tails 20/20/24/50/60/120 frames.
- Too short: lower `--speed` (0.88 is the floor for a natural read) or lengthen the tails of the scenes whose last headline needs reading time. Too long: raise speed to 1.0, trim words.
- Gaps between scenes are tail + next lead (about 28 frames); the wipe covers about 31 frames around the cut, so keep tails at or above 20.

## Audio mix

VO clips are levelled to -20 dBFS RMS each. Music `bed.mp3` plays at gain 0.15 under narration and 0.34 in gaps (`AudioLayer.musicGain`, a function of the absolute frame), fading in over 24 frames and out over 50. SFX peak at about -6 dBFS and are placed at 0.3-0.85 volume next to the cue they punctuate. `finalize.sh` then normalises the whole mix.

## Voice swap

To use ElevenLabs/OpenAI/Azure TTS, replace `synth_scene()` in `generate_voice.py` so it returns `(float32 samples, 24000, words)` with per-word start/end seconds; the rest of the pipeline only reads `voice_timings.json`.
