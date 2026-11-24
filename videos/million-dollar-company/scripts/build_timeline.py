"""Measured narration -> scene/segment frames, word cues, caption pages and SRT."""
import json, re
from common import *

def norm(s): return re.sub(r"[^a-z0-9]", "", s.lower())
def clean(s): return re.sub(r"^[^\w$]+|[^\w%]+$", "", s)

def align(seg, tts):
    script = seg["text"].split()
    out, j = [], 0
    for w in tts["words"]:
        d = w["text"]
        for k in range(j, min(j + 4, len(script))):
            if norm(script[k]) == norm(w["text"]):
                d = script[k]; j = k + 1; break
        out.append({"spoken": w["text"], "display": d, "start": w["start"], "end": w["end"]})
    return out

def apply_phrases(words):
    phrases = {tuple(norm(t) for t in k.split()): v for k, v in CFG["displayPhrases"].items()}
    i, res = 0, []
    while i < len(words):
        hit = None
        for key, disp in sorted(phrases.items(), key=lambda kv: -len(kv[0])):
            n = len(key)
            if i + n <= len(words) and tuple(norm(w["spoken"]) for w in words[i:i + n]) == key:
                hit = (n, disp); break
        if hit:
            n, disp = hit
            trail = re.search(r"[^\w%]+$", words[i + n - 1]["display"])
            res.append({"spoken": " ".join(w["spoken"] for w in words[i:i + n]), "display": disp + (trail.group(0) if trail else ""),
                        "start": words[i]["start"], "end": words[i + n - 1]["end"]})
            i += n
        else:
            res.append(words[i]); i += 1
    return res

def tone(display):
    c = clean(display)
    for name, pats in CFG["tones"].items():
        if any(re.search(p, c, re.I) for p in pats): return name
    return "none"

# ---- timeline ----
scenes, t = [], 0.0
for sc in CFG["scenes"]:
    s0 = t; cur = s0 + sc["leadIn"]; segs = []
    for sg in sc["segments"]:
        tts = json.loads((TTS_DIR / f"{sg['id']}.json").read_text())
        sf = round(cur * FPS)
        ws = apply_phrases(align(sg, tts))
        for w in ws:
            w["start"] = round(sf / FPS + w["start"], 3); w["end"] = round(sf / FPS + w["end"], 3)
            w["frame"] = round(w["start"] * FPS); w["tone"] = tone(w["display"])
        segs.append({"id": sg["id"], "text": sg["text"], "start": sf, "dur": round(tts["duration"] * FPS), "durSec": tts["duration"],
                     "caption": sg.get("caption", True), "words": ws})
        cur += tts["duration"] + sg["gapAfter"]
    end = cur + sc["tail"]
    scenes.append({"id": sc["id"], "start": round(s0 * FPS), "end": round(end * FPS), "segments": segs})
    t = end
total = scenes[-1]["end"]
for i, s in enumerate(scenes):
    s["dur"] = s["end"] - s["start"]
    if i + 1 < len(scenes): scenes[i + 1]["start"] = s["end"]; scenes[i + 1]["dur"] = scenes[i + 1]["end"] - s["end"]
(DATA / "timeline.json").write_text(json.dumps({"fps": FPS, "totalFrames": total, "totalSeconds": round(total / FPS, 3), "scenes": scenes}, indent=1))

# ---- caption pages ----
MAXC = 54
def textlen(ws): return len(" ".join(w["display"] for w in ws))
def split_sentences(ws):
    out, cur = [], []
    for w in ws:
        cur.append(w)
        if re.search(r"[.?!]$", w["display"]): out.append(cur); cur = []
    if cur: out.append(cur)
    return out
def split_long(ws):
    if textlen(ws) <= MAXC: return [ws]
    commas = [i for i, w in enumerate(ws[:-1]) if w["display"].endswith(",")]
    if commas:  # group clauses greedily
        clauses, prev = [], 0
        for i in commas: clauses.append(ws[prev:i + 1]); prev = i + 1
        clauses.append(ws[prev:])
        pages, cur = [], []
        for cl in clauses:
            if cur and textlen(cur + cl) > MAXC: pages.append(cur); cur = []
            cur = cur + cl
        if cur: pages.append(cur)
        out = []
        for p in pages: out.extend(split_long(p) if textlen(p) > MAXC else [p])
        return out
    mid = min(range(1, len(ws)), key=lambda i: abs(textlen(ws[:i]) - textlen(ws[i:])))
    return split_long(ws[:mid]) + split_long(ws[mid:])

pages = []
for sc in scenes:
    for sg in sc["segments"]:
        sents = split_sentences(sg["words"]); cur = []
        grouped = []
        for s in sents:
            if cur and textlen(cur + s) <= 40: cur = cur + s
            else:
                if cur: grouped.append(cur)
                cur = s
        if cur: grouped.append(cur)
        for g in grouped:
            for p in split_long(g):
                pages.append({"scene": sc["id"], "seg": sg["id"], "onScreen": sg["caption"], "words": p})
for i, p in enumerate(pages):
    nxt = pages[i + 1]["words"][0]["start"] if i + 1 < len(pages) else 1e9
    p["start"] = round(max(p["words"][0]["start"] - 0.05, pages[i - 1]["end"] if i else 0), 3)
    p["end"] = round(min(p["words"][-1]["end"] + 0.35, nxt - 0.03), 3)
    p["text"] = " ".join(w["display"] for w in p["words"])
    p["words"] = [{"t": w["display"], "s": w["start"], "e": w["end"], "tone": w["tone"]} for w in p["words"]]
(DATA / "captions.json").write_text(json.dumps({"pages": pages}, indent=1))

# ---- SRT ----
def ts(x):
    ms = round(x * 1000); h, ms = divmod(ms, 3600000); m, ms = divmod(ms, 60000); s, ms = divmod(ms, 1000)
    return f"{h:02}:{m:02}:{s:02},{ms:03}"
def wrap(text, n=42):
    if len(text) <= n: return text
    ws = text.split(); best = min(range(1, len(ws)), key=lambda i: abs(len(" ".join(ws[:i])) - len(" ".join(ws[i:]))))
    return " ".join(ws[:best]) + "\n" + " ".join(ws[best:])
srt = []
for i, p in enumerate(pages, 1):
    srt.append(f"{i}\n{ts(p['start'])} --> {ts(p['end'])}\n{wrap(p['text'])}\n")
(OUT / "million-dollar-company-cashflow.srt").write_text("\n".join(srt))

print(f"TOTAL {total} frames = {total / FPS:.2f}s | {len(pages)} caption pages")
for s in scenes:
    print(f"{s['id']}: {s['start'] / FPS:6.2f}-{s['end'] / FPS:6.2f}s ({s['dur'] / FPS:5.2f}s) " + " ".join(f"{g['id']}@{g['start'] / FPS:.2f}" for g in s["segments"]))
for p in pages: print(f"  [{p['start']:6.2f}-{p['end']:6.2f}] {p['text']}   ({'|'.join(w['tone'][0] for w in p['words'])})")
