#!/usr/bin/env bash
# Voice-over only, placed on the video timeline (48 kHz mono WAV) -> deliverables/voiceover_timeline.wav
# Per-scene takes are in public/audio/vo/s1..s6.wav (24 kHz mono).
set -euo pipefail
cd "$(dirname "$0")/.."
python3 - <<'PY' > /tmp/vo_filter.txt
import json
t = json.load(open("src/data/timeline.json"))
ins, parts = [], []
for i, s in enumerate(t["scenes"]):
    ins.append(f"-i public/audio/vo/{s['id']}.wav")
    ms = round(s["voStart"] / t["fps"] * 1000)
    parts.append(f"[{i}:a]adelay={ms}|{ms}[a{i}]")
mix = "".join(f"[a{i}]" for i in range(len(t["scenes"])))
print(" ".join(ins))
print(";".join(parts) + f";{mix}amix=inputs={len(t['scenes'])}:normalize=0,apad=whole_dur={t['totalFrames']/t['fps']}[o]")
PY
INPUTS=$(sed -n 1p /tmp/vo_filter.txt); FILTER=$(sed -n 2p /tmp/vo_filter.txt)
mkdir -p deliverables
# shellcheck disable=SC2086
ffmpeg -hide_banner -loglevel error -y $INPUTS -filter_complex "$FILTER" -map "[o]" -ar 48000 -ac 1 -t "$(python3 -c "import json;t=json.load(open('src/data/timeline.json'));print(t['totalFrames']/t['fps'])")" deliverables/voiceover_timeline.wav
echo "wrote deliverables/voiceover_timeline.wav"
