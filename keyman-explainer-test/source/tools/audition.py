"""Voice audition: render a test passage with several Kokoro voices/blends and score them objectively
(Whisper word accuracy + confidence, median F0, words/min). Writes ../../audio/voice-audition/<name>.wav + audition.json"""
import os, sys, json, re
import numpy as np, soundfile as sf
LIB = "/root/lemo-opuscar"
HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.abspath(os.path.join(HERE, "../../audio/voice-audition")); os.makedirs(OUT, exist_ok=True)
TEXT = ("Your business backs up its files. But what about its most important person? "
        "Keyman insurance can help protect the business financially if an insured key person dies or experiences another covered event.")
CANDS = {
 "zf_xiaoyi": "zf_xiaoyi", "zf_xiaoxiao": "zf_xiaoxiao", "zf_xiaobei": "zf_xiaobei", "zf_xiaoni": "zf_xiaoni",
 "hf_alpha": "hf_alpha", "hf_beta": "hf_beta",
 "xiaoyi70_heart30": "zf_xiaoyi:0.7,af_heart:0.3", "xiaoxiao70_heart30": "zf_xiaoxiao:0.7,af_heart:0.3",
 "xiaoyi50_heart50": "zf_xiaoyi:0.5,af_heart:0.5", "xiaoxiao50_heart50": "zf_xiaoxiao:0.5,af_heart:0.5",
 "alpha70_heart30": "hf_alpha:0.7,af_heart:0.3", "beta70_heart30": "hf_beta:0.7,af_heart:0.3",
 "af_heart_ref": "af_heart",
}
from kokoro_onnx import Kokoro
k = Kokoro(f"{LIB}/core/tts/kokoro-v1.0.onnx", f"{LIB}/core/tts/voices-v1.0.bin")
def style(spec):
    parts = [p.split(":") for p in spec.split(",")]
    if len(parts) == 1 and len(parts[0]) == 1: return parts[0][0]
    w = np.array([float(p[1]) for p in parts]); w /= w.sum()
    return sum(wi * k.get_voice_style(p[0]) for wi, p in zip(w, parts))
def f0_median(x, sr):
    fl, hop = int(.04 * sr), int(.01 * sr); lo, hi = int(sr / 400), int(sr / 70); vals = []
    thr = np.abs(x).max() * .08
    for i in range(0, len(x) - fl - hi, hop):
        fr = x[i:i + fl]
        if np.abs(fr).max() < thr: continue
        fr = fr - fr.mean(); ac = np.correlate(fr, fr, "full")[fl - 1:]
        if ac[0] <= 0: continue
        ac = ac / ac[0]; seg = ac[lo:hi]; j = int(seg.argmax())
        if seg[j] > .6: vals.append(sr / (lo + j))
    return float(np.median(vals)) if vals else 0.0
from faster_whisper import WhisperModel
wm = WhisperModel("base.en", device="cpu", compute_type="int8")
norm = lambda s: re.findall(r"[a-z']+", s.lower())
ref = norm(TEXT); res = {}
for name, spec in CANDS.items():
    au, sr = k.create(TEXT, voice=style(spec), speed=1.0, lang="en-us")
    nz = np.where(np.abs(au) > np.abs(au).max() * .02)[0]; au = au[nz[0]:nz[-1] + int(.05 * sr)]
    sf.write(f"{OUT}/{name}.wav", au, sr)
    segs, _ = wm.transcribe(f"{OUT}/{name}.wav", language="en", word_timestamps=True, beam_size=5)
    words = [w for s in segs for w in s.words]
    hyp = norm(" ".join(w.word for w in words))
    # word-level edit distance
    d = np.zeros((len(ref) + 1, len(hyp) + 1), int); d[:, 0] = range(len(ref) + 1); d[0, :] = range(len(hyp) + 1)
    for i in range(1, len(ref) + 1):
        for j in range(1, len(hyp) + 1):
            d[i, j] = min(d[i-1, j] + 1, d[i, j-1] + 1, d[i-1, j-1] + (ref[i-1] != hyp[j-1]))
    dur = len(au) / sr
    res[name] = dict(spec=spec, dur=round(dur, 2), wpm=round(len(ref) / dur * 60), wer=round(d[-1, -1] / len(ref), 3),
                     conf=round(float(np.mean([w.probability for w in words])), 3), f0=round(f0_median(au, sr)))
    print(f"{name:20s} {res[name]}", flush=True)
json.dump(res, open(f"{OUT}/audition.json", "w"), indent=1)
