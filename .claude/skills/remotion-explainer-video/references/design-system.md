# Design system (Swiss motion graphics, 1080x1920)

Code: `src/styles/theme.ts` (tokens, zones, easing helpers), `src/components/*`.

## Tokens

navy `#0B1B33` / deep `#071226`, panel `#12284A`, off-white `#F4F1EA`, cobalt `#2A5BFF` (text-safe light `#6C8DFF`), teal `#14B8A6` (protection, solutions, the CTA), orange `#FF6B2C` (risk), red `#E5383B` (the gap), slate `#8A97AD` (secondary text). Type: Inter Display Black for headlines (caps, tracking -0.035em, `wordSpacing` 0.1em), Inter SemiBold/Bold for labels (caps, tracking 0.1-0.16em), Inter Bold 58 px for captions. Minimum text size 24 px; footnotes 25 px.

## Layout zones (y, px)

| Zone | y | Content |
|---|---|---|
| top UI | 0-200 | nothing essential |
| scene label | 214 | `SceneLabel` ("02 — THE PROBLEM", index n/6, drawing hairline at 258) |
| headline | 270-650 | `Headline`, flush-left, up to three lines |
| diagram | 690-1200 | SVG layer inside `Camera` |
| footnote | 1222 (1236 on the end card) | `Footnote` compliance line |
| captions | 1300-1470 | `Captions` |
| platform UI | 1470-1920 and x > 970 | nothing essential |

Content x-range 72-970. Background is a 6-column grid aligned to the margins with slow vertical drift, an accent-tinted corner glow that changes per scene, and film grain.

## Motion language

`EASE_OUT = bezier(0.16,1,0.3,1)` for reveals, `EASE_IN_OUT` for sweeps. `prog(frame, start, dur, easing)` gives clamped 0-1 progress; `sp(frame, fps, start, 'ui'|'pop'|'slam'|'soft')` gives springs. Headlines rise out of a mask line by line (4-7 frame stagger) and exit upward; diagram parts draw with stroke-dash progress, pop with springs, or slide along `FlowPath`s. Impacts: `Camera shakes`, a low `thud_low`, and a brief tint flash. Scene cuts: venetian block wipe (`BlockWipes`) in the next scene's accent colour.

## Components (props that matter)

- `Headline({lines: {t, c?}[][], from, exit?, maxSize, stagger})` size = min `fitText` across lines; swap several per scene with `from`/`exit`.
- `Camera({keys: {f, s, x, y}[], origin, shakes: {at, dur, amp}[]})` wraps the SVG diagram only; keep scale at or below about 1.08 with an origin that keeps left/right elements inside x 72-970.
- `ShareholderDonut({cx, cy, r, thickness, draw, segments: {pct, color, opacity, hollow, dashOffset}[]})` stack two donuts to cross-fade a solid segment into a hollow dashed one.
- `BarGauge({x, y, w, label, value, fill, color, hatchFrom, hatchOpacity, flicker})` value text is a string you count up yourself.
- `FlowPath({pts, draw, flow, token, opacity, dashed, arrow})` with `line()` for straight runs and `bez()`; pass `opacity` equal to the line's own progress or its faint track shows before the nodes exist.
- `NodeCard`, icons (`Person, Family, DocIcon, Building, ShieldIcon, CheckMark, Coin, ShareToken, Gear, Bubble, Cross`), `Footnote`, `SceneLabel`, `Sfx`, `Captions`, `AudioLayer`.
- `useCues()` returns `cue(name, offset?)` (scene-relative frame); `SceneProvider` supplies the scene.

## Scene recipe

```tsx
const cue = useCues();
const cA = cue('agreement'), cB = cue('price');
const a = prog(frame, cA - 6, 14);            // fade/slide in just before the word lands
return (<AbsoluteFill>
  <SceneLabel label="03 — THE AGREEMENT" color={C.cobaltLight} index={3} />
  <Camera keys={[{f:0,s:1},{f:cB,s:1.02}]}><svg width={W} height={H}>{/* diagram */}</svg></Camera>
  <Headline lines={[[{t:'BUY-SELL'}],[{t:'AGREEMENT',c:C.cobaltLight}]]} from={cA-6} exit={cB-4} />
  <Headline lines={[[{t:'PLAN THE TRANSFER'}]]} from={cB} />
  <Footnote text="..." from={cA} />
  <Sfx name="pop" at={cA} />
</AbsoluteFill>);
```

One visual idea per scene; two to three headline states (early keyword, then the on-screen message); always one SFX per diagram beat; leave the lower diagram area free of text that would collide with the footnote.
