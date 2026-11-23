# Keystal command centre - project memory

## Video production (decided 2026-11-22)
- Two Keyman explainer films exist: Lemo-Opuscar original (PR #4, `keyman-explainer-test/`) and Remotion port (PR #5, `keyman-remotion/`). Near-identical (SSIM 0.996). Full comparison: `keyman-remotion/COMPARISON.md`.
- **Decision: Remotion is the rendering/template engine; keep Opuscar's Kokoro TTS + Whisper timing + SRT + score tooling as the audio front end.** Remotion needs a paid company licence for larger for-profit teams - verify before scaling.
- Real settings of the Keyman film: 1080x1920, 24 fps, 52 s, -14 LUFS, Archivo, CTA "DM 'KEYMAN' to find out more", byline "Rain | SME Risk & Business Advisory".
- Cost reference: Opuscar build 47.8 min / ~214k output tokens / $7.37; Remotion port ~18 min / ~100k output tokens / ~$5 (port of finished design, not like-for-like). Remotion render 48 s.
- Compliance rules for every video: conditional insurance wording, no guarantees, no insurer names, fine-print line on CTA; keyman tax deduction is conditional (IRAS); digital ads under MAS guidelines need approval before publishing.
- Open items: Opuscar render time not measured; audio never listened to by Claude; templates for 20 topics not built.
- Use the `remotion-explainer` skill (`.claude/skills/remotion-explainer/SKILL.md`) for new videos.
