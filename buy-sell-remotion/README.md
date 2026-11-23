# Buy-Sell Agreement explainer — Remotion project

Vertical 1080×1920 · 30 fps · 57.9 s · React + TypeScript + Remotion 4.0.545. Swiss-style motion graphics, AI narration, word-synced captions, synthesised music + SFX.
Final video: `deliverables/buy_sell_agreement_remotion.mp4` (H.264, AAC, −14 LUFS / −1 dBTP, faststart).

## Preview, edit, render

```bash
cd buy-sell-remotion
npm install
npm run studio        # live preview at http://localhost:3000
npm run render        # -> out/raw.mp4
./scripts/finalize.sh # loudness-normalise -> deliverables/buy_sell_agreement_remotion.mp4
```

Edit **text/CTA/brand**: `src/config.ts` (brand, CTA lines, link/contact line, disclaimer).
Edit **visuals**: `src/scenes/*.tsx`. Every beat is keyed to a narrated word with `useCues()` (e.g. `cue('passed')`), so animation follows the voice automatically.
Edit **colours/type/layout/safe zones**: `src/styles/theme.ts`.

## Change the script or voice

1. Edit `script/narration.json` (`text` = what is spoken, `display` = caption spelling, same word count; `emphasis` = highlighted words; `cues` = animation anchors; `layout` = lead/tail frames).
2. `python scripts/generate_voice.py [--voice af_heart] [--speed 0.92]` — Kokoro TTS → `public/audio/vo/*.wav` + `script/voice_timings.json`.
3. `python scripts/build_timeline.py` — writes `src/data/timeline.json`; fails if duration leaves 55–65 s.
4. `python scripts/generate_audio_assets.py` — music + SFX (harmony follows scene starts).
5. Render + finalize (above). Optional: `./scripts/export_voiceover.sh` (VO-only track), `python scripts/qc.py` (format, loudness, frozen frames, Whisper caption-sync).

Python setup used (CPU only):

```bash
sudo apt-get install -y espeak-ng
python3 -m venv .venv && source .venv/bin/activate
pip install torch --index-url https://download.pytorch.org/whl/cpu
pip install --only-binary=:all: spacy scipy numpy soundfile loguru faster-whisper
pip install --only-binary=:all: --no-deps kokoro==0.7.16 misaki
```

To use another TTS (ElevenLabs, OpenAI, Azure) replace `synth_scene()` in `generate_voice.py`; it only has to return samples + word timings.

`node scripts/stills.mjs <outDir> 100,200,300 [scale]` renders review stills with one bundle.

## Layout

```
script/narration.json            single source of truth for words, cues, pacing
scripts/                         voice, timeline, audio synthesis, grain, finalize, QC, stills
src/data/timeline.json           generated: scene frames, word timings, cues
src/scenes/                      Hook, OwnershipRisk, Agreement, FundingGap, InsuranceSolution, CallToAction
src/components/                  reusable building blocks (below)
public/{audio,fonts,assets}      VO takes, music bed, SFX, Inter (OFL), film grain
deliverables/                    final MP4, VO-only track, cover frame
```

## Licences

Narration: Kokoro-82M (Apache-2.0). Music/SFX: synthesised here, no samples. Fonts: Inter (SIL OFL, notice in `public/fonts/`). Remotion has its own licence — free for individuals and small companies, company licence required beyond that: https://www.remotion.dev/license

## Reuse map for the next videos

| Component | Reuse for |
|---|---|
| `ShareholderDonut` + `Person`/`Family`/`Building` icons | Shareholder Succession, Business Valuation, Keyman (who owns what) |
| `BarGauge` (+ hatched gap) | Estate Liquidity, Keyman cover vs. need, Business Continuity cash runway |
| `FlowPath` + tokens (`Coin`, `ShareToken`) | any money / ownership flow, claim-to-payout stories |
| `NodeCard` + signed `DocIcon` | process explainers (trigger → value → transfer, BCP steps) |
| `Headline` (fitText, masked reveal), `Tag`, `Footnote` | all videos — compliance footnotes are first-class |
| `Captions` (balanced ≤2-line pages, keyword pills) | all videos |
| `BlockWipes`, `Camera`, `Background`, `SceneLabel` | scene system / brand look |
| `AudioLayer`, `Sfx`, narration → timeline → music pipeline | new video = new `narration.json` + new scene files |

## Production review

**Strengths** — every concept reads with sound off (ownership donut → orphaned half → estate → agreement chain → obligation vs cash bar → conditional insurance flow); the ≠ moment is the visual climax; all legal/insurance caveats are on screen as well as spoken; animation is cue-synced to the voice; sound is fully original (no licensing exposure); QC is automated (Whisper caption sync 108 ms mean error on the final mix, −14 LUFS, no frozen frames).

**Limitations** — Kokoro is a good local voice but not an ElevenLabs-grade actor (plain read, no Singapore accent; swap `synth_scene()` for a premium voice if desired). Music is synthesised ambient, not a composed track. First frame is a solid cobalt flash-cut (intentional hook; pick a different cover frame — `deliverables/cover_hook.png` — for feeds). Compositional emphasis is on legibility over illustration richness (icons are geometric). S$ amounts are illustrative; compliance review of final wording by the licensed entity is still required before publishing.
