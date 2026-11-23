#!/bin/sh
# usage: qa.sh <video.mp4> [reference.mp4]   - prints frame count, loudness, silences, black/freeze, SSIM vs reference
V="$1"; REF="$2"; [ -f "$V" ] || { echo "usage: qa.sh video.mp4 [reference.mp4]"; exit 1; }
echo "== probe"; ffprobe -v error -count_frames -show_entries stream=codec_name,width,height,r_frame_rate,nb_read_frames,duration,pix_fmt -of compact "$V"
echo "== loudness (target -14 LUFS, TP <= -1.0)"; ffmpeg -hide_banner -i "$V" -af ebur128=peak=true -f null - 2>&1 | grep -E "^\s+(I|Peak):"
echo "== silences"; ffmpeg -hide_banner -i "$V" -af silencedetect=n=-50dB:d=0.5 -f null - 2>&1 | grep -o "silence_[a-z]*: [0-9.]*"
echo "== black / freeze (transitions and the final hold are expected)"; ffmpeg -hide_banner -i "$V" -vf "blackdetect=d=0.1,freezedetect=n=0.001:d=1" -an -f null - 2>&1 | grep -oE "black_start:[0-9.]+ black_end:[0-9.]+|freeze_(start|end): [0-9.]+"
if [ -n "$REF" ]; then echo "== SSIM vs reference (overall; worst frames)"; ffmpeg -hide_banner -i "$REF" -i "$V" -lavfi "[0:v][1:v]ssim=stats_file=/tmp/qa_ssim.log" -f null - 2>&1 | grep -o "All:[0-9.]*"; awk '{split($5,a,":"); print a[2], $1}' /tmp/qa_ssim.log | sort -n | head -5; fi
