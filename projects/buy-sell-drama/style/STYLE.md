# Project style: Paper-cut Lightbox, vertical, drama edition

Base: the library style "Paper-cut Lightbox" (layered cut paper lit from behind). Everything in its STYLE.md that is about the look is kept: flat-colour sheets in a value ladder (back bright and translucent, front dark), fibre grain, a warm rim on top edges and a dark band on bottom edges, soft cast shadows, light bleeding through paper, emissive windows with bloom, text as cut paper, jointed silhouette figures, slow short camera moves, dissolves / light-off / iris transitions, paper-and-light foley, soft piano / strings / glockenspiel / harp score.

## What this project changes, and why

| Change | Reason |
|---|---|
| 1080×1920 at 30 fps; subtitles inside the social safe zone (centre of the caption block at y≈1370, clear of the bottom 20% and the right 12%) with a faint dark band | the film is for vertical feeds |
| The picture is composited in Canvas 2D (baked paper sheets, per-frame parallax, blurred half-resolution cast shadows, a cheap bloom) instead of the demo's three.js scene with VSM shadows and depth of field | no GPU in the production container: software WebGL measured 2.25 s per frame for a trivial scene (2+ hours per render); this renderer takes ~0.25 s per frame. The sheet geometry (z from −0.14 to 0 m, camera at 0.40 m) and the look are kept |
| Characters are profile paper puppets (identity by outline: hair, glasses cut as holes, clothing) with two-bone IK arms | the film is a drama with six recurring people; no photoreal generator was available |
| Cormorant Garamond (OFL) for all paper type; English only | one language on screen |
| Captions carry a small speaker name above dialogue | the puppets do not lip-sync, so the viewer needs to know who is talking |
| A "lamp as an object" pull-back and a rewind that replays the film's own frames inside the box | the story's pivot: the lamp is the keepsake whose story can be turned back |
| End-card reading speed budget 20 characters/s instead of 15 | to fit the 120 s ceiling (see production_review.md) |

## Ladders

hospital (teal) · flashback (amber/cream) · present (slate blue, warm pendant) · plan and calm outcome (gold) · home (plum, amber windows) · dawn (navy to orange) · end card (navy). One accent: seal red `#b3261e` for the share, the agreement, "Insufficient" and the step seals.
