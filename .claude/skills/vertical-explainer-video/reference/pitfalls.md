# Pitfalls hit and fixes
- **ffmpeg 6.1 (Ubuntu 24.04):** `mux.sh` rejects it. Install static ffmpeg 7.
- **Browser path:** `setup.sh deps` downloads Chromium; export `PLAYWRIGHT_BROWSERS_PATH=$HOME/.cache/lemo-pw` for every render command (build.sh does).
- **Kokoro blend mispronounces:** bare "stall" → "stole"; "Keyman" (schwa) → "Keeman"/"Human". Fix with `phonemes` in lines.json: get `k.tokenizer.phonemize(text,'en-us')`, edit (`stˈɔːl`→`stˈɔl`, `kˈiːmən`→`kˈiːmˌæn`), generate with `is_phonemes=True`. Two-word fragments are unreliable for ASR: test in context, or add a word ("Your projects stall.").
- **Whisper word timing:** small.en may add a leading "The" or hear "project" for "projects". `build_timeline.py` aligns with difflib, positional when counts match, interpolates misses; force first word to 0.
- **Hold rule:** consecutive lines need ≥0.6 s gap after speech; plan VO starts on the 0.25 s grid, then check asserts.
- **blackdetect** won't flag empty frames on a navy page; scan content % per frame instead.
- **Music level:** first mix was 15–20 dB under voice; add per-section trims (`mg` in mix.py) to keep ≈10 dB.
- **asr_check under `set -e`:** a mismatch aborts build.sh (intended).
- **Do not ship the library or frames:** `.gitignore` source/out, stills, events.json.
