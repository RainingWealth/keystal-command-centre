# Project notes for Claude Code

## Video production gold standard
Use `/short-film <story + hook line>` (see `.claude/commands/short-film.md`) to start a new video; it defaults to the gold-standard engine for narrator-led business stories.
For any vertical explainer video request, start from `videos/million-dollar-company/` (Ray approved it as the gold standard on 2026-11-27). Read `videos/million-dollar-company/GOLD_STANDARD.md` first, then `PRODUCTION_NOTES.md`. Reuse `src/components/`, `src/lib/` and `scripts/`; rewrite `src/config/production.json`, `copy.ts`, `figures.ts` and the scenes. Keep the narration-as-master-clock pipeline, the safe zones, single-sourced figures and the full QA gate (format, -14 LUFS, Whisper check, figure audit, spellcheck, stills review). Deliver one finished version, say plainly what was and was not checked (the voice has not been heard by a human), and do not add or remove disclaimers, contact details or claims beyond what Ray asked for.
