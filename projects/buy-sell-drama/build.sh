#!/bin/sh
# One-command rebuild: timeline -> picture -> score/foley/mix -> master -> subtitles.
#   LIB=<library folder> sh build.sh              photoreal cut  -> buy_sell_drama_final.mp4
#   LOOK=paper sh build.sh                        paper-cut cut  -> buy_sell_drama_papercut.mp4
#   sh build.sh voices                            also re-synthesise and re-check the voices first
# Requires ffmpeg 7+ on PATH (the library's mux step rejects 6.x), Node 20+, and the library's .venv (setup.sh deps voice music).
# The photoreal cut needs the stills in assets/photo/ (see assets/photo/PROMPTS.md); they are kept in the repository.
set -e
HERE=$(cd "$(dirname "$0")" && pwd)
LIB=${LIB:-/home/user/lemomo-ai/lemo-opuscar}
LOOK=${LOOK:-photo}
export LIB
[ "$LOOK" = photo ] && { OUT=buy_sell_drama_final.mp4; GRAIN=2; } || { OUT=buy_sell_drama_papercut.mp4; GRAIN=1; }
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
node core/render/video.mjs "$HERE" --fps 30 --size 1080x1920 --workers 3 --q "look=$LOOK" --out "$HERE/out/video_$LOOK.mp4"
"$PY" "$HERE/mix.py"
LEMO_COLOR=bt709 sh core/render/mux.sh "$HERE/out/video_$LOOK.mp4" "$HERE/out/mix.wav" "$HERE/$OUT" 30 $GRAIN
