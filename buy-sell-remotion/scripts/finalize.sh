#!/usr/bin/env bash
# Two-pass loudness normalisation (-14 LUFS, -1 dBTP: Reels/TikTok/LinkedIn/YouTube Shorts target),
# video stream copied untouched, AAC 256k, faststart. Usage: scripts/finalize.sh [in.mp4] [out.mp4]
set -euo pipefail
cd "$(dirname "$0")/.."
IN="${1:-out/raw.mp4}"
OUT="${2:-deliverables/buy_sell_agreement_remotion.mp4}"
mkdir -p "$(dirname "$OUT")"
LN="loudnorm=I=-14:TP=-1:LRA=11"
STATS=$(ffmpeg -hide_banner -nostats -i "$IN" -vn -af "$LN:print_format=json" -f null - 2>&1 | sed -n '/^{/,/^}/p')
g() { echo "$STATS" | grep "\"$1\"" | sed -E 's/.*: "([^"]+)".*/\1/'; }
ffmpeg -hide_banner -loglevel error -y -i "$IN" \
  -c:v copy \
  -af "$LN:measured_I=$(g input_i):measured_TP=$(g input_tp):measured_LRA=$(g input_lra):measured_thresh=$(g input_thresh):offset=$(g target_offset):linear=true" \
  -ar 48000 -c:a aac -b:a 256k -movflags +faststart "$OUT"
echo "wrote $OUT"
ffprobe -v error -show_entries format=duration:stream=codec_name,width,height,r_frame_rate,pix_fmt,sample_rate,channels -of default=nw=1 "$OUT"
