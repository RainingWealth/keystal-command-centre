"""Single source of truth for timing. Reads lines.json + audio/voice/*.wav, finds word onsets with faster-whisper,
places every VO line on the 120 BPM grid, builds caption chunks, ASSERTS the library's subtitle hold rules, and writes
  source/timeline.json   (page, score and mix all read this)
  source/cues.json       ([{t0,t1,text}] for core/render/srt.py -> subtitles/keyman-explainer.srt)
run: $LIB/.venv/bin/python source/tools/build_timeline.py
"""
import json, os, re, sys
import soundfile as sf
HERE = os.path.dirname(os.path.abspath(__file__)); SRC = os.path.abspath(f"{HERE}/.."); ROOT = os.path.abspath(f"{SRC}/..")
VOICE = f"{ROOT}/audio/voice"
BPM = 120; BEAT = 60 / BPM; DUR = 52.0
# VO line starts (s). Quarter-beat grid; each gap >= speech + 0.6 s so every caption can hold (checked below).
VO = {"l01": 0.50, "l02": 3.25, "l03": 6.25, "l04": 12.25, "l05": 14.50, "l06": 16.50,
      "l07": 19.00, "l08": 28.50, "l09": 37.50, "l10": 41.50, "l11": 44.25}
# caption chunks per line = word-count splits (kept to <= 2 rendered lines at 54 px / 828 px; the page asserts this too)
CHUNKS = {"l03": [5, 6], "l07": [5, 8, 6], "l08": [8, 5, 7]}
SCREEN = {"l11": "Message KEYMAN to explore your options."}   # on-screen spelling (capitals); spoken as the word "Keyman"

lines = json.load(open(f"{SRC}/lines.json", encoding="utf-8")); dur = json.load(open(f"{VOICE}/dur.json"))
norm = lambda s: re.sub(r"[^a-z0-9]", "", s.lower())
from faster_whisper import WhisperModel
wm = WhisperModel("small.en", device="cpu", compute_type="int8")
out = {"bpm": BPM, "dur": DUR, "lines": [], "cues": []}
cues = []
prev_end_need = 0
for L in lines:
    i = L["id"]; t0 = VO[i]; d = dur[i]
    segs, _ = wm.transcribe(f"{VOICE}/{i}.wav", language="en", word_timestamps=True, beam_size=5)
    ws = [(w.word, w.start, w.end) for s in segs for w in s.words]
    script = L["text"].split()
    # align script words to Whisper words: difflib on normalised words (ignores a hallucinated extra word such as a leading "the",
    # tolerates project/projects), unmatched script words are interpolated between their neighbours by character count
    import difflib
    sm = difflib.SequenceMatcher(None, [norm(w) for w in script], [norm(w[0]) for w in ws], autojunk=False)
    res = [None] * len(script)
    for blk in sm.get_matching_blocks():
        for k in range(blk.size): res[blk.a + k] = max(0.0, ws[blk.b + k][1])
    if len(ws) == len(script):          # same count: Whisper mis-heard a suffix (project/projects) -> positional
        res = [max(0.0, w[1]) for w in ws]
    for k in range(len(res)):
        if res[k] is None:
            lo = max((m for m in range(k) if res[m] is not None), default=None); hi = min((m for m in range(k + 1, len(res)) if res[m] is not None), default=None)
            t_lo = res[lo] if lo is not None else 0.0; t_hi = res[hi] if hi is not None else ws[-1][2]
            lo_i = -1 if lo is None else lo; hi_i = len(res) if hi is None else hi
            span = sum(len(script[m]) for m in range(lo_i + 1, hi_i)) or 1; before = sum(len(script[m]) for m in range(lo_i + 1, k))
            res[k] = t_lo + (t_hi - t_lo) * before / span
    res = [round(r, 3) for r in res]
    # whisper can place the first word a hair late; the voice file is trimmed to its first sound, so the line's first word starts at 0
    res[0] = 0.0
    assert all(b >= a for a, b in zip(res, res[1:])), (i, res)
    screen = SCREEN.get(i, L["text"]).split()
    out["lines"].append({"id": i, "t": t0, "dur": d, "text": L["text"], "screen": screen, "wt": [round(t0 + r, 3) for r in res]})
    # caption chunks
    sizes = CHUNKS.get(i, [len(script)]); assert sum(sizes) == len(script), (i, sizes, len(script)); k = 0; chunks = []
    for n in sizes:
        chunks.append((k, k + n)); k += n
    line_end = max(t0 + 1.8, t0 + d + 0.6)          # library rule: hold >= max(1.8, speech + 0.6)
    for ci, (a, b) in enumerate(chunks):
        ts = round(t0 + res[a], 3)
        te = round(t0 + res[chunks[ci + 1][0]], 3) if ci + 1 < len(chunks) else round(line_end, 3)
        if ci + 1 < len(chunks): assert te - ts >= 1.8 - 1e-6, (i, ci, te - ts)     # chunk replaced by its continuation
        cues.append({"t0": ts, "t1": te, "text": " ".join(screen[a:b]), "words": [round(t0 + r, 3) for r in res[a:b]], "id": i})
assert VO["l01"] < 1  # motion already running; first VO word lands on beat 1
# hold-rule check across lines: a cue must end before the next one starts
for a, b in zip(cues, cues[1:]):
    assert a["t1"] <= b["t0"] + 1e-6, ("cue overlap", a, b)
    assert b["t0"] >= a["t0"], "order"
assert cues[-1]["t1"] < DUR - 3.0, ("CTA needs >= 3 s of clean final frame", cues[-1]["t1"])
out["cues"] = cues
json.dump(out, open(f"{SRC}/timeline.json", "w"), indent=1)
json.dump([{"t0": c["t0"], "t1": c["t1"], "text": c["text"]} for c in cues], open(f"{SRC}/cues.json", "w"), indent=1)
print("lines", len(out["lines"]), "cues", len(cues), "last cue ends", cues[-1]["t1"], "DUR", DUR)
for c in cues: print(f'{c["t0"]:7.3f} -> {c["t1"]:7.3f}  ({c["t1"]-c["t0"]:.2f}s)  {c["text"]}')
