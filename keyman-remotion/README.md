# keyman-remotion

Native Remotion (React + SVG) recreation of the Lemo-Opuscar "Keyman insurance" explainer
(original: PR #4, `keyman-explainer-test/`). Same script, timeline, palette, type, audio; different engine.
1080x1920, 24 fps (the original's real fps), 52.0 s = 1248 frames, H.264 + AAC, -14 LUFS.

## Commands
```bash
npm install                 # remotion 4.0.545, react 19
npm run studio              # live preview / scrub
npx remotion still src/index.ts KeymanRemotion out/f.png --frame=528   # any frame
npm run render              # render + loudness master -> output/keyman_remotion_comparison.mp4
npm run audio               # (optional) rebuild public/audio from the original score/foley/voice
                            #   needs LIB=<lemo-opuscar clone> ORIG=<keyman-explainer-test folder>
```
Chrome: uses `/opt/pw-browsers/...` if present (or `BROWSER_EXECUTABLE`), else Remotion downloads its own.

## Layout
`src/data/timing.ts` all timing constants (verbatim from the original film.js) - `src/lib/anim.ts` easing helpers -
`src/components/` SVG primitives, captions - `src/scenes/` S12, S3, S4, S5 - `src/audio/Soundtrack.tsx` bed + 11 VO lines -
`tools/audio/` score/foley/stem build - `output/` finished files and comparison media.
Fonts: Archivo (OFL). Audio: original synthesized score/foley and Kokoro narration, reused unchanged.
