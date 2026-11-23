#!/bin/sh
# Render the film, then master loudness to -14 LUFS / -1.5 dBTP (same target as the original), copy video untouched.
#   npm run render      (needs public/audio/*; run `npm run audio` first if missing)
set -e
cd "$(dirname "$0")/.."
mkdir -p out output
START=$(date +%s)
npx remotion render src/index.ts KeymanRemotion out/raw.mp4 --codec=h264 --audio-codec=aac --crf=18 --color-space=bt709 --concurrency=3 --pixel-format=yuv420p
END=$(date +%s); echo "remotion render seconds: $((END-START))" | tee output/render_time.txt
# two-pass loudnorm on the audio only
M=$(ffmpeg -hide_banner -i out/raw.mp4 -vn -af loudnorm=I=-14:TP=-1.5:LRA=11:print_format=json -f null - 2>&1 | sed -n '/^{/,/^}/p')
g() { echo "$M" | grep "\"$1\"" | sed 's/.*: "\(.*\)".*/\1/'; }
ffmpeg -hide_banner -y -i out/raw.mp4 -map 0:v -map 0:a -c:v copy -c:a aac -b:a 192k -ar 48000 \
  -af "loudnorm=I=-14:TP=-1.5:LRA=11:measured_I=$(g input_i):measured_TP=$(g input_tp):measured_LRA=$(g input_lra):measured_thresh=$(g input_thresh):offset=$(g target_offset):linear=true,aresample=48000" \
  -t 52 -movflags +faststart output/keyman_remotion_comparison.mp4
ffprobe -v error -show_entries stream=codec_name,width,height,r_frame_rate,nb_frames,duration,bit_rate -of compact output/keyman_remotion_comparison.mp4
