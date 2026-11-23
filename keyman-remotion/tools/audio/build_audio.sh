#!/bin/sh
# Rebuild the audio stems end-to-end (idempotent).
#   npm script:  "audio": "sh tools/audio/build_audio.sh"        (run from keyman-remotion/)
#   env: LIB   = Lemo-Opuscar checkout (default $HOME/lemo-opuscar; needs core/audio/sfx.py)
#        ORIG  = original project folder (default: only used if work/film.mjs, work/timeline.json, work/voice are missing)
# Outputs: public/audio/bed.wav, public/audio/vo/l01..l11.wav, tools/audio/work/mix_reference.wav
set -e
HERE=$(cd "$(dirname "$0")" && pwd); cd "$HERE"
LIB=${LIB:-$HOME/lemo-opuscar}; export LIB
[ -f "$LIB/core/audio/sfx.py" ] || { echo "set LIB to the Lemo-Opuscar library folder"; exit 1; }
mkdir -p work/voice
if [ -n "$ORIG" ]; then
  cp "$ORIG/source/film.js" work/film.mjs; cp "$ORIG/source/timeline.json" work/timeline.json; cp "$ORIG"/audio/voice/l*.wav work/voice/
fi
[ -f work/film.mjs ] && [ -f work/timeline.json ] && [ -f work/voice/l01.wav ] || { echo "work/ inputs missing: set ORIG to the original project folder"; exit 1; }
if [ ! -x .venv/bin/python ]; then python3 -m venv .venv; .venv/bin/pip install -q numpy scipy soundfile; fi
node export_events.mjs
.venv/bin/python score.py
.venv/bin/python stems.py
.venv/bin/python verify_stems.py
