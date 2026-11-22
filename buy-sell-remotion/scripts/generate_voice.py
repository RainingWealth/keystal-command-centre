#!/usr/bin/env python3
"""Generate narration with Kokoro-82M (Apache-2.0) and extract word timings.

Usage:  python scripts/generate_voice.py [--voice af_heart] [--speed 1.0]

Writes:
  public/audio/vo/<scene>.wav     24 kHz mono, leading/trailing silence trimmed
  script/voice_timings.json       per-scene word timings in milliseconds (scene-local)

To use a different TTS provider (ElevenLabs, OpenAI, Azure...) replace `synth_scene`
so it returns (float32 mono samples, 24000, [(word, start_s, end_s), ...]). Everything
downstream (timeline, captions, animation cues) only reads voice_timings.json.
"""
import argparse
import json
import re
from pathlib import Path

import numpy as np
import soundfile as sf

ROOT = Path(__file__).resolve().parent.parent
SR = 24000


def norm(w: str) -> str:
    return re.sub(r"[^a-z0-9]", "", w.lower())


def tokens_to_words(tokens, offset_s):
    """Merge Kokoro sub-tokens (punctuation, contractions, hyphens) into whitespace words."""
    words, cur = [], None
    for t in tokens:
        if cur is None:
            cur = {"text": "", "start": None, "end": None}
        cur["text"] += t.text
        if getattr(t, "start_ts", None) is not None:
            if cur["start"] is None:
                cur["start"] = t.start_ts + offset_s
        if getattr(t, "end_ts", None) is not None:
            cur["end"] = t.end_ts + offset_s
        if t.whitespace:
            words.append(cur)
            cur = None
    if cur is not None and cur["text"]:
        words.append(cur)
    return words


def synth_scene(pipe, text, voice, speed):
    chunks, words, offset = [], [], 0.0
    for res in pipe(text, voice=voice, speed=speed, split_pattern=r"\n+"):
        audio = res.audio.detach().cpu().numpy().astype(np.float32).reshape(-1)
        words += tokens_to_words(res.tokens or [], offset)
        chunks.append(audio)
        offset += len(audio) / SR
    return np.concatenate(chunks), words


def fill_missing(words, total_s):
    """Interpolate any word that lacks a timestamp (punctuation-only tokens, etc.)."""
    for i, w in enumerate(words):
        if w["start"] is None:
            w["start"] = words[i - 1]["end"] if i and words[i - 1]["end"] is not None else 0.0
        if w["end"] is None:
            nxt = next((x["start"] for x in words[i + 1:] if x["start"] is not None), total_s)
            w["end"] = max(w["start"] + 0.05, nxt)
    return words


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--voice")
    ap.add_argument("--speed", type=float)
    args = ap.parse_args()

    spec = json.loads((ROOT / "script/narration.json").read_text())
    voice = args.voice or spec["voice"]
    speed = args.speed or spec["speed"]

    from kokoro import KPipeline

    pipe = KPipeline(lang_code="a")
    out_dir = ROOT / "public/audio/vo"
    out_dir.mkdir(parents=True, exist_ok=True)

    result = {"voice": voice, "speed": speed, "sampleRate": SR, "scenes": {}}
    for sc in spec["scenes"]:
        audio, words = synth_scene(pipe, sc["text"], voice, speed)
        words = fill_missing(words, len(audio) / SR)

        # trim silence: keep 40 ms head and 150 ms tail
        thr = 0.012
        idx = np.where(np.abs(audio) > thr)[0]
        head = max(0, int(idx[0]) - int(0.04 * SR)) if len(idx) else 0
        tail = min(len(audio), int(idx[-1]) + int(0.15 * SR)) if len(idx) else len(audio)
        audio = audio[head:tail]
        shift = head / SR
        for w in words:
            w["start"] = max(0.0, w["start"] - shift)
            w["end"] = max(w["start"] + 0.03, w["end"] - shift)

        # consistent loudness across scenes (-20 dBFS RMS, peak <= 0.92)
        rms = float(np.sqrt(np.mean(audio ** 2))) or 1e-6
        audio = audio * (10 ** (-20 / 20) / rms)
        peak = float(np.max(np.abs(audio)))
        if peak > 0.92:
            audio = audio * (0.92 / peak)

        spoken = sc["text"].split()
        display = sc["display"].split()
        if not (len(words) == len(spoken) == len(display)):
            raise SystemExit(
                f"[{sc['id']}] word-count mismatch: tts={len(words)} spoken={len(spoken)} "
                f"display={len(display)}\n tts words: {[w['text'] for w in words]}"
            )
        for w, s in zip(words, spoken):
            if norm(w["text"]) != norm(s):
                print(f"  note [{sc['id']}] tts token {w['text']!r} vs spoken {s!r}")

        sf.write(out_dir / f"{sc['id']}.wav", audio, SR, subtype="PCM_16")
        result["scenes"][sc["id"]] = {
            "durationMs": round(len(audio) / SR * 1000),
            "words": [
                {
                    "i": i,
                    "spoken": s,
                    "display": d,
                    "startMs": round(w["start"] * 1000),
                    "endMs": round(w["end"] * 1000),
                }
                for i, (w, s, d) in enumerate(zip(words, spoken, display))
            ],
        }
        print(f"{sc['id']}: {len(audio)/SR:5.2f}s  {len(words)} words")

    (ROOT / "script/voice_timings.json").write_text(json.dumps(result, indent=1))
    total = sum(s["durationMs"] for s in result["scenes"].values()) / 1000
    print(f"total narration: {total:.1f}s  (voice={voice}, speed={speed})")


if __name__ == "__main__":
    main()
