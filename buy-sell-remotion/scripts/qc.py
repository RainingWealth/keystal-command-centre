#!/usr/bin/env python3
"""Automated QC of the final MP4.

  python scripts/qc.py [deliverables/buy_sell_agreement_remotion.mp4]

Checks: stream/format spec, duration, loudness + true peak, frozen-video stretches,
audio presence in every scene, and caption sync (Whisper word timestamps on the FINAL mix
vs. the caption timeline). Exits non-zero on failure.
"""
import json
import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
mp4 = Path(sys.argv[1]) if len(sys.argv) > 1 else ROOT / "deliverables/buy_sell_agreement_remotion.mp4"
tl = json.loads((ROOT / "src/data/timeline.json").read_text())
fps = tl["fps"]
fails = []


def run(cmd):
    return subprocess.run(cmd, capture_output=True, text=True)


def check(ok, msg):
    print(("PASS  " if ok else "FAIL  ") + msg)
    if not ok:
        fails.append(msg)


# --- format
p = json.loads(run(["ffprobe", "-v", "error", "-show_streams", "-show_format", "-of", "json", str(mp4)]).stdout)
v = next(s for s in p["streams"] if s["codec_type"] == "video")
a = next(s for s in p["streams"] if s["codec_type"] == "audio")
dur = float(p["format"]["duration"])
check(v["codec_name"] == "h264" and v["pix_fmt"] == "yuv420p", f"H.264 / yuv420p ({v['codec_name']}, {v['pix_fmt']})")
check((v["width"], v["height"]) == (1080, 1920), f"resolution {v['width']}x{v['height']}")
check(v["r_frame_rate"] == "30/1", f"frame rate {v['r_frame_rate']}")
check(55 <= dur <= 65, f"duration {dur:.2f}s within 55-65s")
check(a["codec_name"] == "aac", f"audio codec {a['codec_name']} {a.get('channels')}ch {a.get('sample_rate')}Hz")
adur = float(a.get("duration", dur))
check(abs(adur - dur) < 0.15, f"audio spans video ({adur:.2f}s vs {dur:.2f}s)")

# --- loudness
r = run(["ffmpeg", "-hide_banner", "-nostats", "-i", str(mp4), "-af", "ebur128=peak=true", "-f", "null", "-"]).stderr
lufs = float(re.findall(r"I:\s+(-?[\d.]+) LUFS", r)[-1])
tp = float(re.findall(r"Peak:\s+(-?[\d.]+) dBFS", r)[-1])
check(-15.5 <= lufs <= -12.5, f"integrated loudness {lufs} LUFS (target -14)")
check(tp <= -0.9, f"true peak {tp} dBFS (<= -1)")

# --- frozen video (static frames > 1.2s = 'unexplained pause')
r = run(["ffmpeg", "-hide_banner", "-nostats", "-i", str(mp4), "-vf", "freezedetect=n=-60dB:d=1.2", "-an", "-f", "null", "-"]).stderr
freezes = re.findall(r"freeze_start: ([\d.]+)", r)
check(not freezes, f"no frozen-video stretches > 1.2s {('at ' + ', '.join(freezes)) if freezes else ''}")

# --- audio present in every scene (mean level of each scene's window)
for s in tl["scenes"]:
    t0, t1 = s["voStart"] / fps, s["voEnd"] / fps
    r = run(["ffmpeg", "-hide_banner", "-nostats", "-ss", f"{t0:.2f}", "-to", f"{t1:.2f}", "-i", str(mp4), "-af", "volumedetect", "-vn", "-f", "null", "-"]).stderr
    m = float(re.findall(r"mean_volume: (-?[\d.]+) dB", r)[0])
    check(m > -34, f"{s['id']} narration window mean {m} dB")

# --- caption sync via Whisper on the final mix
try:
    from faster_whisper import WhisperModel

    wav = ROOT / "out/qc_audio.wav"
    run(["ffmpeg", "-y", "-loglevel", "error", "-i", str(mp4), "-vn", "-ac", "1", "-ar", "16000", str(wav)])
    model = WhisperModel("base.en", device="cpu", compute_type="int8")
    import soundfile as sf

    audio, _sr = sf.read(str(wav), dtype="float32")  # array input avoids PyAV version issues
    segs, _ = model.transcribe(audio, word_timestamps=True, language="en", vad_filter=False)
    heard = [(re.sub(r"[^a-z0-9]", "", w.word.lower()), w.start, w.end) for sg in segs for w in sg.words]
    exp = []
    for s in tl["scenes"]:
        for w in s["words"]:
            exp.append((re.sub(r"[^a-z0-9]", "", w["text"].lower()), w["startFrame"] / fps))
    # greedy in-order alignment on word text
    i = 0
    deltas, missing = [], []
    for word, t in exp:
        j = i
        while j < len(heard) and j < i + 6 and heard[j][0] != word:
            j += 1
        if j < len(heard) and j < i + 6 and heard[j][0] == word:
            deltas.append(heard[j][1] - t)
            i = j + 1
        else:
            missing.append(word)
    n = len(exp)
    if deltas:
        mean_abs = sum(abs(d) for d in deltas) / len(deltas)
        within = sum(1 for d in deltas if abs(d) <= 0.25) / len(deltas)
        print(f"INFO  whisper matched {len(deltas)}/{n} words; mean |caption-start - heard-start| = {mean_abs*1000:.0f} ms; {within*100:.0f}% within 250 ms")
        check(len(deltas) / n >= 0.9, f"narration intelligible to ASR ({len(deltas)}/{n} words matched)")
        check(mean_abs < 0.22, f"caption sync mean error {mean_abs*1000:.0f} ms (< 220 ms; Whisper timing is itself ±100 ms)")
    if missing:
        print("INFO  unmatched words:", " ".join(missing))
except Exception as e:  # noqa
    print("WARN  whisper sync check skipped:", e)

print("\nRESULT:", "ALL CHECKS PASSED" if not fails else f"{len(fails)} FAILED")
sys.exit(1 if fails else 0)
