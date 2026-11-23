#!/bin/sh
# One-command rebuild: voices (optional) -> timeline -> picture -> score/foley/mix -> master -> subtitles.
#   LIB=<library folder> sh build.sh            full film
#   sh build.sh voices                          also re-synthesise and re-check the voices first
# Requires ffmpeg 7+ on PATH (the library's mux step rejects 6.x), Node 20+, and the library's .venv (setup.sh deps voice music).
set -e
HERE=$(cd "$(dirname "$0")" && pwd)
LIB=${LIB:-/home/user/lemomo-ai/lemo-opuscar}
export LIB
[ -f "$LIB/core/render/video.mjs" ] || { echo "set LIB to the library folder"; exit 1; }
PY="$LIB/.venv/bin/python"
cd "$LIB"
if [ "$1" = voices ]; then
  "$PY" core/tts/tts.py "$HERE/audio/lines.json" "$HERE/audio/voices"
  "$PY" core/tts/asr_check.py "$HERE/audio/lines.json" "$HERE/audio/voices" --lang en
fi
python3 "$HERE/tools/timeline.py"
python3 "$HERE/tools/docs.py"
"$PY" core/render/srt.py "$HERE/cues.json" "$HERE/subtitles.srt"
mkdir -p "$HERE/out"
node core/render/video.mjs "$HERE" --fps 30 --size 1080x1920 --workers 3 --out "$HERE/out/video.mp4"
"$PY" "$HERE/mix.py"
sh core/render/mux.sh "$HERE/out/video.mp4" "$HERE/out/mix.wav" "$HERE/buy_sell_drama_final.mp4" 30 1
