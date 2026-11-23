#!/bin/sh
# usage: tools/review.sh <name> <t> [<t>...]   -> review/<name>.jpg contact sheet of those frames (captions off)
HERE=$(cd "$(dirname "$0")/.." && pwd); LIB=${LIB:-/home/user/lemomo-ai/lemo-opuscar}; N=$1; shift
export PATH=$HOME/bin:$PATH; mkdir -p "$HERE/review/$N"; rm -f "$HERE/review/$N"/*.jpg
cd "$LIB" && node core/render/still.mjs "$HERE" "$@" --size 1080x1920 --q "${Q:-nosub=1}" --out "$HERE/review/$N" --prefix f_ 2>&1 | grep -E "Error|error|missing" | head
"$LIB/.venv/bin/python" core/render/sheet.py "$HERE/review/$N.jpg" $(ls "$HERE/review/$N"/f_*.jpg | sort -t_ -k2 -n) --cols ${COLS:-6} --w ${CW:-300}
echo "$HERE/review/$N.jpg"
