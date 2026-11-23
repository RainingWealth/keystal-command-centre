# Engine patterns (see keyman-explainer-test/source/film.js)
- **Curves:** `E = cubicBezier(.7,0,.2,1)` and linear only. `snap(t, t1, d)` starts d early and lands on t1; `steps(t,a,b,n)` for "one module at a time".
- **Beats:** 120 BPM → 0.5 s = 12 frames; put every visual onset on a whole frame; snap word hits to the 0.25 s grid (`q4`).
- **`rise(g,s,x,y,o,pin,pout)`:** clip-rect reveal; text enters from below the baseline, leaves upward. Use `o.ct` to shrink the clip top for giant numerals.
- **`knife(...)`:** 2 px line crosses (1/16), element collapses to its midline (3/16). Whole-scene collapse/re-flow: scale Y about the content midline (840), expand next scene from it.
- **`polyPartial`:** linear stroke of a polyline up to fraction p (shield, frame, chart lines).
- **Camera:** translate/scale about a centre, clipped to a window so headline and captions stay in screen space.
- **Collection:** `rise` pushes boxes into `TX` when `texts()` calls `renderFilm`; mark secondary labels `pass:true`.
- **Captions:** wrap by measuring words; throw if >2 lines; each word reveals at its Whisper onset; cue exits upward at t1.
