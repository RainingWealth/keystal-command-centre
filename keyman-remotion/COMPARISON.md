# Lemo-Opuscar vs Remotion — Keyman explainer A/B

Both films: 1080x1920, 24 fps, 52.0 s, same script, timings, palette, Archivo type, voice, score, SFX, captions.
Note: the brief's fallbacks (30 fps, "15-minute risk review" CTA) were overridden by the original's real values (24 fps, "DM 'KEYMAN'" CTA).

## Measured evidence
| Item | Opuscar | Remotion |
|---|---|---|
| Output | 1248 frames, 3.22 MB, video 257 kb/s | 1248 frames, 2.80 MB, video 240 kb/s |
| Loudness | -14.0 LUFS, TP -1.5 | -14.0 LUFS, TP -1.4 (two-pass loudnorm added by me; Remotion has no loudness stage) |
| Silence 17.9-19.0 s | yes | yes (silencedetect 17.91-19.00) |
| Pixel parity (SSIM Remotion vs Opuscar, all frames) | - | **0.996 overall**; lowest 0.879 at the 28.4 s and 37.5 s knife/re-flow transitions (sub-frame timing of the midline collapse); 11 spot stills 0.981-0.997 |
| Render time | not measured here (library not installed; original session ran 47.8 min wall for the whole build) | **48 s** picture+audio render, 3 workers, PNG frames (4 vCPU, no GPU) |
| Source | film.js 400 lines (dense canvas code) | 1,218 lines TS/TSX over ~20 files |
| Build cost | $7.37 list, 89 turns, ~48 min (from the session log) incl. voice/TTS, music, tooling install | this port: audio stems by a Sonnet subagent, picture ported directly from film.js; exact token cost not measured. The port was cheap only because the original design, timing and audio already existed |
| Licence | MIT toolkit | Remotion: free for individuals and small companies; larger for-profit teams need a paid company licence (check remotion.pro for current terms) |

Black/freeze detections in the Remotion file (midline transitions, static holds) also occur in the original by design.

## Scores (1-10; the picture is near-identical, so differences are small and mostly about workflow)
| Criteria | Opuscar | Remotion | Evidence |
|---|---|---|---|
| Visual quality | 8 | 8 | SSIM 0.996; same sharpness; Remotion SVG text matches canvas glyphs |
| Animation fluidity | 8 | 8 | both pure functions of time, same easing; only 24 fps in both |
| Storytelling clarity | 8 | 8 | identical script/structure |
| Caption quality | 8 | 8 | same 16 cues, word reveals; Remotion measures wraps with layout-utils |
| Professional appearance | 8 | 8 | identical design |
| Audio sync | 8 | 8 | voice onsets ~30 ms after line start in both (lead is in the TTS files); Remotion places on whole frames |
| Production effort | 7 | 6 | Opuscar gives scaffold, TTS, ASR, SRT, mux in one pipeline; Remotion needs you to supply audio, loudness mastering, SRT |
| Render time | n/m | 9 | 48 s measured |
| Reusability | 6 | 8 | typed components + props; Opuscar scenes live in one imperative film.js |
| Automation potential | 7 | 9 | `renderMedia`/Lambda, zod props, studio; Opuscar is CLI-driven but tied to its library and local models |

## Answers
- **SG SME fit:** identical look; either works. Fine print (26 px) is small in both.
- **TikTok / LinkedIn:** identical 9:16 output; Remotion makes 1:1/16:9 variants cheaper (change composition size + layout tokens).
- **20 topics:** Remotion, if you parameterise (data-driven scenes + props). Opuscar re-authors a film.js each time (its strength is the end-to-end voice/captions pipeline).
- **Automated production:** Remotion for rendering/templating; keep Opuscar's TTS+ASR+SRT tooling as the audio front end.
- **Costs/usage:** see table. Opuscar run: ~48 min / $7.37. Remotion render: 48 s; licence caveat above.

## Recommendation
Use **Remotion as the rendering/template engine** for the 20-topic series, fed by Opuscar's voice/timing/caption pipeline (Kokoro + Whisper + synthesized score) — i.e. combine them. If only one: Remotion. Caveat: this comparison measures a faithful port, so it says little about which engine is faster for *designing* a new film.

## Files
`output/keyman_remotion_comparison.mp4`, `output/keyman_side_by_side.mp4` (2160x2020, 100 px label band, no scaling/cropping; Remotion audio), `output/contact_sheet_top_opuscar_bottom_remotion.png`.
Known limits: I did not listen to the audio; Opuscar render time not measured.
