# Production manifest: THE PARTNER WHO NEVER CAME BACK

Everything here was actually run in this repository's cloud session. Paths are relative to `projects/buy-sell-drama/`.

## 1. Engine and tools

| Role | Tool | Version / source | Notes |
|---|---|---|---|
| Production engine | Lemo-Opuscar library | github.com/lemomo-ai/lemo-opuscar, commit `8ca0dd8` (2026-11-23), cloned to `/home/user/lemomo-ai/lemo-opuscar` | Not preinstalled in the container; installed from its public repository. Used for: page contract, frame capture (`core/render/video.mjs`, `still.mjs`), TTS (`core/tts/tts.py`), speech check (`asr_check.py`), sampler and sfx helpers, `srt.py`, `mux.sh`, `readcheck.mjs`, `sheet.py` |
| Style | "Paper-cut Lightbox" | library `styles/paper-lantern/STYLE.md` | Chosen by the client. Adapted to 9:16 (see `style/STYLE.md`) |
| Picture renderer | Canvas 2D in headless Chromium (Playwright) | this project, `src/` | **Substitution:** the library demo uses three.js + WebGL. The container has no GPU; measured 2.25 s/frame in software WebGL for a trivial scene (≈2.2 h per render before any real content). The Canvas 2D renderer takes ≈0.25 s/frame: the full film renders in ≈6 min |
| Voice | Kokoro-82M via kokoro-onnx (offline), Apache-2.0 | library `core/tts/tts.py` | British voices only (see §4). No other TTS used |
| Speech check | faster-whisper, model `base.en` | library `core/tts/asr_check.py` | All 15 lines pass; two name overrides (§4) |
| Score | Sampled instruments, library `core/audio/sampler.py` | Salamander Grand Piano (CC BY 3.0); VSCO 2 CE and VCSL (CC0) | Score is original, written in `mix.py` |
| Foley | Procedural synthesis in `mix.py` using library `core/audio/sfx.py` | n/a | Phone vibration, ring, paper, pen, tape stop, rewind whir, shimmer, beds, birds |
| Master | `core/render/mux.sh` | ffmpeg `N-129241-g05c674c913-20261123` (BtbN static master build; the container's apt ffmpeg 6.1 is too old for the library) | Two-pass loudnorm to −14 LUFS, true peak ≤ −1 dBTP, light film grain (1), H.264 High, AAC |
| Fonts | Cormorant Garamond (OFL) | `fonts/` | Self-hosted |
| Runtime | Node v22.23.5, Python 3.13 | container | |

Not used: any image or video generation service, stock footage, photographs, real people's voices.

## 2. Settings

- Picture: 1080×1920, 30 fps, 3 591 frames (119.7 s), `video.mjs --workers 3`, JPEG capture, then `mux.sh` re-encode.
- Audio: 48 kHz stereo; voice compressed and set to −19 dBFS RMS per line (hospital line −23, phone-band filtered); music bus ducked 6.5 dB under speech; −14 LUFS integrated after `mux.sh`.
- Captions: burned in (Cormorant Garamond 700, 54 px) at y≈1372, inside the social safe zone, with speaker name for dialogue; `subtitles.srt` carries the same 33 cues.
- Scripts: `build.sh` rebuilds the whole film (`LIB=<library folder> sh build.sh`; `sh build.sh voices` also re-synthesises and re-checks the voices).

## 3. Assets and source files (kept for revisions)

| Path | What |
|---|---|
| `index.html`, `src/*.js` | Page, engine (`engine.js`, `paper.js`), figures (`figures.js`), motifs (`sets.js`), shots (`shots_a/b/c.js`), on-screen text and captions (`overlay.js`) |
| `tools/timeline.py` → `timeline.json`, `cues.json` | The single timeline: shots, transitions, line starts, caption cues (aligned to the Whisper word timings), paper-text timings, sound hits |
| `tools/docs.py` → `script.md`, `storyboard.md` | Documents generated from the timeline |
| `audio/lines.json`, `audio/voices/*.wav`, `dur.json`, `words.json` | The synthesised lines, durations and word timings |
| `mix.py` → `out/mix.wav`, `out/stem_voice.wav`, `stem_music.wav`, `stem_sfx.wav` | Score, foley, voice processing and mix, with stems |
| `out/music_instruments.txt`, `CREDITS` | Instruments used and licences |
| `tools/review.sh` | Contact-sheet helper used for visual review |
| `TREATMENT.md` | The treatment written before drawing (Lemo workflow) |

## 4. Voices

| Character | Voice | Note |
|---|---|---|
| Narrator | `bm_george` | Mature, calm British male. Closest available to a neutral Singapore-English register; Kokoro has **no Singaporean accent** |
| Daniel | `bm_lewis` | |
| Aaron | `bm_daniel` | |
| Sarah | `bf_emma` | The name "Aaron" comes out British (Erin-like) and Whisper transcribes it that way; the check expects it (`asr` field) |
| Hospital | `bf_alice` | Band-limited to 320 Hz to 3.3 kHz with light distortion so it sounds like a phone |
| Accountant | `bf_isabella` | |
| Estate representative | `bm_fable` | Line added to meet the brief (§5) |

I could not listen to the audio in this environment. Voice quality, acting and accent were checked only by speech-to-text (every line transcribes back), by level measurements and by the final-mix transcript. A human listening pass is required before release.

## 5. Funding structure used in the drama (internally consistent, simplified)

**Structure shown: a cross-purchase buy-sell agreement.** Each founder owns, pays for and is the designated recipient of a policy on the other founder's life. On a valid claim after Daniel's death, Aaron receives the proceeds, pays the agreed price for Daniel's 50% to Daniel's estate, and the shares are transferred to him under the agreement, subject to the estate process. Sarah is treated as the person acting for the estate ("Sarah receives the agreed purchase consideration on behalf of the estate, subject to the relevant estate administration", per the brief).

| Item | Treatment in the film |
|---|---|
| Valuation | Company S$2,000,000 and Daniel's 50% = S$1,000,000 are hypothetical and labelled "illustrative" (cards, example card) |
| Insurance amount | S$1,000,000 "illustrative cover" matched to the illustrative buyout; the film does not claim any business can obtain it, or that cover will match a future valuation |
| Who is paid | Step 2: "Suitable life cover pays the designated recipient on a covered claim." The film never says insurance transfers shares or pays the family directly |
| Estate | Spoken by the estate representative and captioned: shares are part of Daniel's estate; any transfer follows the legal documents and the estate process. S7 card: "Paid to Daniel's estate, subject to estate administration" |
| Not shown | Underwriting, exclusions, premiums, tax, any insurer or product, the company-owned (entity) route and its Companies Act limits on buying back shares. The end card says: "Illustrative scenario only. Actual arrangements depend on legal agreements, policy terms and individual circumstances." |

**What was verified (web research, 2026-11-23) and what was not**

- Buy-sell agreement as a contract setting how remaining owners buy an outgoing owner's shares on a trigger event; entity vs cross-purchase types; life insurance as the usual funding; cross-purchase = each owner owns insurance on the others; valuation, trigger events, right of first refusal as core terms: SingaporeLegalAdvice.com, "Buy-Sell Agreements: How to Write & Fund Them in Singapore" (updated 3 Mar 2024): https://singaporelegaladvice.com/law-articles/buy-sell-agreements-write-fund-singapore/
- A shareholder's death passes title by transmission to the personal representative (executor under a will, administrator without one); a Grant of Probate or Letters of Administration is needed before the representative can receive the shares; transmission is subject to the company's constitution (e.g. directors' power to decline registration): SingaporeLegalAdvice.com, "Share Transmission: What Happens If a Shareholder Dies in Singapore?" (updated 10 Dec 2024): https://singaporelegaladvice.com/law-articles/share-transmission-shareholder-dies-singapore/
- Insurable interest between business partners (Insurance Act s 57: a life policy is void without insurable interest; business partners need a proven financial interest) and company buyback limits (Companies Act): **found only in secondary sources; the primary statute site (sso.agc.gov.sg) returned HTTP 403 to automated access and could not be read.** Treat both as unverified against the statutes.
- No insurer products, tax benefits or statutory requirements are asserted in the film.

**Required before publishing:** review by a licensed Singapore financial adviser / compliance team and a lawyer (nomination and ownership of the policies, entity vs cross-purchase, the company's constitution and pre-emption rights, MAS-regulated advertising rules and disclaimers).
