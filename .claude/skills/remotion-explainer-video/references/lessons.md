# Lessons and QC checklist

## Defects hit on the first pass, and the fix

| Symptom | Cause | Fix |
|---|---|---|
| "WHOGETS", "THEIR50%?" | negative letter-spacing collapses spaces | `wordSpacing: 0.1em` on HTML text, `wordSpacing="0.14em"` on SVG display text |
| left avatar halo cropped at the frame edge | camera push of 1.12 with an off-centre origin | max scale about 1.08, origin x near 600, no extra x drift; camera on the diagram only |
| headline sizes inconsistent / cropped | sized by eye | `fitText` per line, size = min across lines, width x 0.97 |
| labels sitting on a card border | card too short for title + icons + labels | give the tallest card 230+ px and put labels 30 px above the border |
| faint connector lines visible before their nodes | `FlowPath` track drawn at full length | pass `opacity` = the line's progress |
| captions with one orphan word | greedy line fill | balanced pagination: `n = ceil(chars/32)`, target `chars/n`, break near it, never past 32 |
| `fitText` measured the wrong font | first render before fonts loaded | `FontGate` that waits for `loadFont` promises via `useDelayRender` |
| video 52.6 s (< 55) | Kokoro at 1.0x is fast | speed 0.92 plus longer tails on scenes that end on a headline |
| whisper QC crashed with `metadata_errors` | PyAV 19 vs faster-whisper | pass a numpy array, not a path |
| wipe showed the old scene after the cut | bars staggered but not all covering on the cut frame | enter finishes at `b` for every bar, exits start at `b+1` |
| repo bloat | 10 MB WAV music | encode the bed to MP3 192k |

## Visual QC checklist (do it on frames from the final MP4)

1. Overview sheet every 72 frames: `ffmpeg -i out.mp4 -vf "select='not(mod(n\,72))',scale=270:-1,tile=8x4" sheet.png`.
2. Boundary sheet: frames `b-14, b-4, b+6, b+16` for every cut; no blank frame, no old scene after the bars lift, no flash.
3. Full-size stills of: each headline's final state, the climax frame, the end card.
4. Check every frame for: text touching an edge or border, overlapping labels, anything essential below y 1470 or right of x 970, headline overlapping the diagram, caption overlapping the footnote (footnote ends about 1290), unreadable contrast, missing icons, animation caught half-way on a held beat.
5. Sound with the picture muted: can a viewer follow the story from visuals plus captions alone?
6. Automated: `python scripts/qc.py` must say ALL CHECKS PASSED (format, 55-65 s, -14 LUFS, true peak <= -1, no freeze > 1.2 s, audio in every scene, Whisper sync mean error < 220 ms and at least 90% of words matched).

## Performance

About 1 minute for 1,735 frames at `--concurrency=4` (JPEG frames at quality 95, CRF 17). Stills from one bundle (`stills.mjs`) take 2-3 s each; running `npx remotion still` repeatedly re-bundles every time. Whisper QC about 1 minute on CPU (`base.en`, int8).

## Honest limitations to state when delivering

Kokoro is a clean local read, not an actor and not a Singapore accent (offer a premium TTS swap); the music is ambient synthesis, not a composed track; the first frame is a solid colour flash-cut (pick another cover frame); icons are geometric rather than illustrated; compliance review of final wording is still required.
