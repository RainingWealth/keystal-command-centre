# Production notes — keyman-explainer-v1.mp4

**Result:** 1080×1920, 24 fps, H.264 + AAC 48 kHz, 52.0 s, −14.0 LUFS, true peak −1.5 dBTP. Rebuild: `sh source/build.sh` (add `--voice` to regenerate narration).

## Deviations from the brief (and why)
1. **Palette vs Swiss style guide.** The brief's navy/cyan/orange replaces the style's paper/ink/red. Kept: modular grid, one OFL grotesque, flush-left type, the single ease curve plus linear, clip-reveals, knife cuts, ripple by distance, no fades/gradients/bounce. Cyan is the one signal colour; orange is used only in Scene 2 as the risk state.
2. **Scene timing.** Narration measured 38.2 s, so scenes run S1 0–6, S2 6–19, S3 19–28.5, S4 28.5–37.5, S5 37.5–52 (brief: 0–6, 6–16, 16–29, 29–41, 41–50). Each caption must hold ≥ speech + 0.6 s (library rule), which forces the gaps; the CTA holds 4.6 s fully static.
3. **Script edit:** "Projects stall." → "Your projects stall." (the voice mispronounces a bare "stall"). See `script.md`.
4. **Narrator.** Requested "female Asian". Kokoro has no Singapore-English voice. The voice is a 50/50 blend of a Mandarin-female and an American-female Kokoro voice speaking English. Alternatives in `audio/voice-audition/` (`xiaoyi50_heart50`, `alpha70_heart30`). Switching voice: edit `--voice` in `source/build.sh`, run with `--voice`. A true Singapore accent would need a licensed service (not used: cost/licence).
5. **"Keyman"** is given a stressed second syllable via phoneme override (otherwise Whisper hears "Human").
6. Right-rail and bottom 440 px are kept free of essential content; captions end at y≈1380.

## Intentional silences
17.96–19.00 s (voice finishes "Cash flow suffers." alone, then the title lands on the downbeat) and a near-silence at 37.0–37.5 s.

## QA performed on the exported file
- ffprobe: h264, 1080×1920, 24/1, yuv420p, aac stereo 48 kHz, 52.0 s.
- blackdetect: none. Per-frame content scan: no unintended blank frames (sparse only during the 0.1–0.4 s midline re-flows). Static frames only in the final CTA hold.
- ebur128: −14.0 LUFS. Voice 9.7–13.7 dB over music in every line.
- Whisper (base, small, medium) on the final mix: 100 % word match to the script.
- readcheck (1080×1920): all headline and CTA text on screen long enough. Captions: hold rules asserted in `build_timeline.py`; `.srt` matches the burned-in cues.
- Visual review: per-second contact sheets (whole film) and 0.2 s strips of the knife cut, re-flow, ?→✓ bookend and CTA wipe.

## Known limits
- I could not listen to the audio. Voice quality is judged by Whisper intelligibility, pitch and pace, not by ear. Please listen once and swap the voice if the accent doesn't suit.
- Fine print is 26 px (about 9 pt on a phone): legible but small; it is a disclaimer, not a message.
- The S3→S4 midline re-flow has ~0.3 s of near-empty frame by design.
