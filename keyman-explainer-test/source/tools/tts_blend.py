"""Kokoro TTS with optional voice blends.
usage: tts_blend.py lines.json out_dir [--voice "zf_xiaoyi:0.7,af_heart:0.3"] [--speed 1.0]
Per-line "voice"/"speed" fields in lines.json override the CLI values. Writes <id>.wav + dur.json like core/tts/tts.py.
Run with the library venv:  $LIB/.venv/bin/python tts_blend.py ...
"""
import sys, os, json, argparse
import numpy as np, soundfile as sf
LIB = os.environ.get("LIB", "/root/lemo-opuscar")
ap = argparse.ArgumentParser()
ap.add_argument("lines"); ap.add_argument("out")
ap.add_argument("--voice", default="af_heart"); ap.add_argument("--speed", type=float, default=1.0)
a = ap.parse_args()
from kokoro_onnx import Kokoro
k = Kokoro(f"{LIB}/core/tts/kokoro-v1.0.onnx", f"{LIB}/core/tts/voices-v1.0.bin")

def style(spec):
    parts = [p.split(":") for p in spec.split(",")]
    if len(parts) == 1 and len(parts[0]) == 1:
        return parts[0][0]
    w = np.array([float(p[1]) if len(p) > 1 else 1.0 for p in parts]); w = w / w.sum()
    return sum(wi * k.get_voice_style(p[0]) for wi, p in zip(w, parts))

os.makedirs(a.out, exist_ok=True); dur = {}
for L in json.load(open(a.lines, encoding="utf-8")):
    v = style(L.get("voice") or a.voice)
    # optional "phonemes": exact Kokoro phonemes (is_phonemes) when the blend mispronounces a word, e.g. "stall"
    txt, isph = (L["phonemes"], True) if L.get("phonemes") else (L["text"], False)
    au, sr = k.create(txt, voice=v, speed=L.get("speed", a.speed), lang=L.get("lang", "en-us"), is_phonemes=isph)
    nz = np.where(np.abs(au) > np.abs(au).max() * .02)[0]
    au = au[max(0, nz[0] - int(.03 * sr)): nz[-1] + int(.08 * sr)]
    sf.write(os.path.join(a.out, L["id"] + ".wav"), au, sr); dur[L["id"]] = round(len(au) / sr, 3)
    print(L["id"], dur[L["id"]])
json.dump(dur, open(os.path.join(a.out, "dur.json"), "w"), indent=1)
