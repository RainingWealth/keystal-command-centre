"""Audio QA on the delivered MP4: (1) transcription accuracy vs script, (2) word timing vs timeline, (3) cross-correlation offset vs narration.wav."""
import difflib, json, re, subprocess, sys, wave
import numpy as np
from common import *
mp4 = sys.argv[1] if len(sys.argv) > 1 else str(OUT / "million-dollar-company-cashflow.mp4")
wav = WORK / "qa_audio.wav"
subprocess.run(["ffmpeg", "-y", "-v", "error", "-i", mp4, "-vn", "-ac", "1", "-ar", "16000", str(wav)], check=True)

SPOKEN = {"1.2": ["one", "point", "two"], "180,000": ["one", "hundred", "and", "eighty", "thousand"], "14,000": ["fourteen", "thousand"], "36,000": ["thirty", "six", "thousand"],
          "90": ["ninety"], "1": ["one"], "90-day": ["ninety", "day"]}
def expand(word):
    """Whisper writes numerals; expand to the spoken words used in the script."""
    w = word.lower().strip().replace("\u2019", "'")
    core = re.sub(r"^[^a-z0-9]+|[^a-z0-9]+$", "", w)
    if core in SPOKEN: return SPOKEN[core]
    return [t.replace("'", "") for t in re.findall(r"[a-z']+", w.replace("thirty-six", "thirty six"))]
def norm_words(text):
    out = []
    for t in text.split(): out += expand(t)
    return [t for t in out if t != "dollars"]  # whisper prints "$" instead of "dollars"

from faster_whisper import WhisperModel
model = WhisperModel("base.en", device="cpu", compute_type="int8")
with wave.open(str(wav)) as _w: audio = np.frombuffer(_w.readframes(_w.getnframes()), dtype="<i2").astype(np.float32) / 32768
# split at silent gaps between narration segments so each clip is short and unambiguous
_tl = json.loads((DATA / "timeline.json").read_text())
_segs = [g for sc in _tl["scenes"] for g in sc["segments"]]
_cuts, _start = [], 0.0
for a, b in zip(_segs, _segs[1:]):
    gap_lo, gap_hi = (a["start"] + a["dur"]) / FPS, b["start"] / FPS
    mid = (gap_lo + gap_hi) / 2
    if gap_hi - gap_lo >= 0.45 and mid - _start >= 14: _cuts.append(mid); _start = mid
_edges = [0.0] + _cuts + [_tl["totalSeconds"] + 0.5]
CLIPS = [x for i in range(len(_edges) - 1) for x in (_edges[i], _edges[i + 1])]
segs, _ = model.transcribe(audio, language="en", word_timestamps=True, beam_size=5, vad_filter=False, condition_on_previous_text=False, clip_timestamps=CLIPS)
hyp = []
words_all = []
for sg_ in segs:
    for w in sg_.words:  # re-join numerals Whisper splits ("$180" + ",000.", "$1" + ".2", "90" + "-day")
        if words_all and re.match(r"^\s?[.,-]\s?[a-z0-9]", w.word) and re.search(r"[0-9a-z]$", words_all[-1][0]):
            prev = words_all[-1]; words_all[-1] = (prev[0] + w.word.strip(), prev[1], w.end)
        else:
            words_all.append((w.word.strip(), w.start, w.end))
for text, w_start, w_end in words_all:
    if True:
        w = type("W", (), {"word": text, "start": w_start, "end": w_end})
        toks = norm_words(w.word)
        for k, tok in enumerate(toks): hyp.append((tok, w.start + k * (w.end - w.start) / max(1, len(toks))))
TL = json.loads((DATA / "timeline.json").read_text())
ref = []
for sc in TL["scenes"]:
    for sg in sc["segments"]:
        for w in sg["words"]:
            for tok in norm_words(w["spoken"]): ref.append((tok, w["start"]))
hw, rw = [h[0] for h in hyp], [r[0] for r in ref]
sm = difflib.SequenceMatcher(a=rw, b=hw, autojunk=False)
S = D = I = 0; deltas = []
for op, a0, a1, b0, b1 in sm.get_opcodes():
    if op == "equal":
        for k in range(a1 - a0): deltas.append(hyp[b0 + k][1] - ref[a0 + k][1])
    elif op == "replace": S += max(a1 - a0, b1 - b0)
    elif op == "delete": D += a1 - a0
    elif op == "insert": I += b1 - b0
wer = (S + D + I) / len(rw)
print(f"WER {wer * 100:.1f}%  (ref {len(rw)} words; sub/del/ins {S}/{D}/{I})")
for op, a0, a1, b0, b1 in sm.get_opcodes():
    if op != "equal": print("  ", op, "REF:", " ".join(rw[a0:a1]), "| HYP:", " ".join(hw[b0:b1]))
d = np.array(deltas)
p80 = np.percentile(np.abs(d), 80)
print(f"timing vs TTS word boundaries: matched {len(d)} words, median {np.median(d) * 1000:+.0f} ms, p80 |d| {p80 * 1000:.0f} ms, p95 |d| {np.percentile(np.abs(d), 95) * 1000:.0f} ms (Whisper word starts are coarse at clause starts)")

# cross-correlation against the exported narration track
def load(p):
    with wave.open(str(p)) as w: return np.frombuffer(w.readframes(w.getnframes()), dtype="<i2").astype(np.float32), w.getframerate()
a, ra = load(OUT / "narration.wav"); b, rb = load(wav)
a16 = a[: len(a) // 3 * 3].reshape(-1, 3).mean(1)[: len(b)]  # 48k -> 16k
n = 1 << int(np.ceil(np.log2(len(a16) + len(b))))
cc = np.fft.irfft(np.fft.rfft(b, n) * np.conj(np.fft.rfft(a16, n)), n)
lag = int(np.argmax(cc)); lag = lag - n if lag > n // 2 else lag
print(f"cross-correlation offset: {lag / 16:+.1f} ms (video audio vs narration.wav)")
ok = wer <= 0.05 and abs(lag / 16) < 40 and abs(np.median(d)) < 0.15 and p80 < 0.30
print("AUDIO QA:", "PASS" if ok else "CHECK"); sys.exit(0 if ok else 1)
