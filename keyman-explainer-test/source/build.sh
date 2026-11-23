#!/bin/sh
# One-command rebuild of output/keyman-explainer-v1.mp4 from the source in this folder.
#   sh source/build.sh            re-time, render picture, score, mix, master
#   sh source/build.sh --voice    also regenerate the narration (Kokoro) first
# Needs the Lemo-Opuscar library (LIB, default ~/lemo-opuscar) with `setup.sh deps voice` done, and ffmpeg 7+.
set -e
HERE=$(cd "$(dirname "$0")" && pwd); ROOT=$(cd "$HERE/.." && pwd)
LIB=${LIB:-$HOME/lemo-opuscar}; export LIB
export PLAYWRIGHT_BROWSERS_PATH=${PLAYWRIGHT_BROWSERS_PATH:-$HOME/.cache/lemo-pw}
PY="$LIB/.venv/bin/python"
[ -f "$LIB/core/render/video.mjs" ] || { echo "set LIB to the Lemo-Opuscar library folder"; exit 1; }
cd "$LIB"
if [ "$1" = "--voice" ]; then
  $PY "$HERE/tools/tts_blend.py" "$HERE/lines.json" "$ROOT/audio/voice" --voice "zf_xiaoxiao:0.5,af_heart:0.5" --speed 0.82
  $PY core/tts/asr_check.py "$HERE/lines.json" "$ROOT/audio/voice" --lang en
fi
$PY "$HERE/tools/build_timeline.py"                                             # word timings, caption chunks, hold-rule asserts
$PY core/render/srt.py "$HERE/cues.json" "$ROOT/subtitles/keyman-explainer.srt"
node core/render/events.mjs "$HERE"                                             # sound events from the same constants as the picture
$PY "$HERE/score.py"                                                            # original score -> out/score.wav
$PY "$HERE/mix.py"                                                              # voice + score + foley -> out/mix.wav
node core/render/video.mjs "$HERE" --size 1080x1920 --fps 24 --workers 3 --out "$HERE/out/video.mp4"
mkdir -p "$ROOT/output"
sh core/render/mux.sh "$HERE/out/video.mp4" "$HERE/out/mix.wav" "$ROOT/output/keyman-explainer-v1.mp4" 24 0
