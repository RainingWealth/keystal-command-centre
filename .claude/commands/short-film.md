---
description: Make a short vertical film. Default engine for narrator-led business stories is the gold-standard Remotion explainer.
argument-hint: <story + hook line>
---

# /short-film

Input: $ARGUMENTS

Follow Ray's Short Film Pipeline SOP (vault: `11 SOPs/Short Film Pipeline - SOP`, plan template: `11 SOPs/Short Film - Plan Template`). Be brief; no play-by-play.

## 0. Preflight
State the model you are running. This command is meant for a **Sonnet** session (`/model claude-sonnet-5-5`). If you are on Opus, say so and tell Ray before doing any build work.

## 1. Intake (one message, only for what is missing)
Ask once, together, for anything not already in the input:
- Story or script (verbatim if Ray wrote it). If dialogue: how many speaking characters? Narrator-led is the default and the safest format.
- Length (gold-standard films: 75-90 s) and the **hook line** for the first 2 s.
- **Style.** Default for narrator-led business stories: **Gold-standard explainer (native Remotion)**, i.e. `videos/million-dollar-company/`. Other films: Paper-lantern, Risograph or cel graphic novel (Lemo Opuscar). A new style needs Ray's explicit OK.
- Voice (default Edge `en-SG-WayneNeural`), tone reference, CTA wording (at most 8 s on screen), compliance wording for finance topics, and every figure with its label.
If Ray has already answered, do not ask again.

## 2. Pass 1: plan (exactly one Opus subagent)
Spawn **one** Opus subagent (no further subagents, at most 150K output). It reads `videos/million-dollar-company/GOLD_STANDARD.md`, `videos/million-dollar-company/PRODUCTION_NOTES.md` and the plan template, then writes:
- `<project>/brief/<Name>_PLAN.md`: template sections 0-8, **at most 250 lines**, no rewrite loops. Ray's answers to open questions go in section 1 once.
- `<project>/brief/<Name>_BRIEF.md`: Ray's handoff verbatim.
For the gold-standard engine the plan says: clone `videos/million-dollar-company/` to `videos/<slug>/`; keep `src/components/`, `src/lib/`, `scripts/`; rewrite `src/config/production.json`, `copy.ts`, `figures.ts` and the scenes; reuse the last good film's style, voice and music stack; one lean recon, never read `.env` files or hunt for keys.
The subagent stops after writing the plan and reports the plan path. Then you present it and wait for Ray's go-ahead (or continue if Ray already said to).

## 3. Pass 2: build (Sonnet, at most 500K output)
Preflight first: confirm you are on Sonnet and the plan file exists. If not, stop and tell Ray (`/model claude-sonnet-5-5`, or finish Pass 1). Then:
1. Clone and rename the project; write the script and figures (every amount lives in `figures.ts`, asserted).
2. `npm install` and `npm run assets` (needs network for the voice); check the timeline length.
3. Stills with the safe-zone overlay: `npx remotion still src/index.ts Main out.png --frame=N --props='{"debug":true,"audio":false}'`. Fix clipping.
4. **Checkpoint A:** render a 15 s sound-on test (hook plus payoff) with `npx remotion render ... --frames=a-b`, send it to Ray with SendUserFile, then **stop and wait**.
5. After Ray's OK: full render (CRF 20, x264 slow, BT.709), `python3 scripts/master.py`, then the full QA gate (below). Make a phone copy of at most 30 MB plus the master.

## 4. QA gate (all must pass before showing Ray the finished film)
ffprobe format (H.264 High, yuv420p, 1080x1920, 30 fps, AAC 48 kHz) and a clean decode; -14 +/-1 LUFS and true peak <= -1.5 dBFS; `scripts/qa_transcribe.py` (word error <= 5%, offset ~0 ms); `scripts/check_figures.py`; `scripts/spellcheck.py`; scene-change scan shows only intended cuts; stills reviewed for clipping and caption collisions; search copy, captions and SRT for any wording Ray asked to remove.

## Rules
- Opus plans and stops; Sonnet builds. If a pass heads past its budget, stop and tell Ray.
- Reuse before invent. Gold-standard films keep the approved pacing (hook in 2 s, scenes of about 3-10 s, the approved transitions). The viral cut rate (a cut every 1.5-2.5 s) applies only to the Lemo styles.
- Codex does heavy loops when reachable (record runs in the vault's Codex Usage Log). In cloud sessions it is not reachable: do the work here and end with "via Claude (Codex unreachable)".
- One finished version, no style options. Do not add or remove disclaimers, contact details or claims beyond what Ray asks.
- Say plainly what was and was not checked. The voice has not been heard by a human unless Ray says he has.
- Delivery: the Dropbox connector cannot upload video from cloud sessions, so send the MP4 with SendUserFile and commit it under `videos/<slug>/output/`. Record tokens per pass in the film's `PRODUCTION_NOTES.md`.

## Done checklist
Full-length render, -14 LUFS, captions inside the safe zone, phone copy under 30 MB, Ray has watched it on his phone, files delivered, tokens per pass recorded.
