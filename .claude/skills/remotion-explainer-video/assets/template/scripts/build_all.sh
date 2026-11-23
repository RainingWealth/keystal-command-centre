#!/usr/bin/env bash
# Voice -> timeline -> music/SFX -> render -> loudness-normalise -> QC. Re-run after any script/scene change.
# Usage: scripts/build_all.sh [--voice af_heart] [--speed 0.92]   (flags go to generate_voice.py)
set -euo pipefail
cd "$(dirname "$0")/.."
PY="${PY:-.venv/bin/python}"
"$PY" scripts/generate_voice.py "$@"
"$PY" scripts/build_timeline.py
"$PY" scripts/generate_audio_assets.py
npm run render
./scripts/finalize.sh
./scripts/export_voiceover.sh
"$PY" scripts/qc.py
