"""Spell-check on-screen copy, narration and subtitles."""
import json, re, sys
from spellchecker import SpellChecker
from common import *
sp = SpellChecker()
sp.word_frequency.load_words(["sme", "singapore", "singaporean", "payroll", "receivables", "accrual", "invoicing", "runway", "dm", "s", "pm", "am", "inflows", "outflows", "fx", "sgd", "termdays"])
srcs = {}
copy = (ROOT / "src/config/copy.ts").read_text()
srcs["copy.ts"] = " ".join(re.findall(r"'((?:[^'\\]|\\.)*)'|\"((?:[^\"\\]|\\.)*)\"|`([^`]*)`", copy) and [a or b or c for a, b, c in re.findall(r"'((?:[^'\\]|\\.)*)'|\"((?:[^\"\\]|\\.)*)\"|`([^`]*)`", copy)])
srcs["narration"] = " ".join(sg["text"] for _, sg in segments())
srcs["srt"] = re.sub(r"\d+\n[\d:,]+ --> [\d:,]+\n", "", (OUT / "million-dollar-company-cashflow.srt").read_text())
for f in list((ROOT / "src/scenes").glob("*.tsx")) + list((ROOT / "src/components").rglob("*.tsx")):
    t = f.read_text()
    jsx = re.findall(r">([A-Za-z][A-Za-z ,.'\-?!]{3,})<", t)
    lit = [x for x in re.findall(r"'([A-Za-z][A-Za-z ,.'\-?!]{3,})'|\"([A-Za-z][A-Za-z ,.'\-?!]{3,})\"", t) for x in x if x]
    srcs[f.name] = " ".join(jsx + lit)
bad = 0
for name, txt in srcs.items():
    words = [w for w in re.findall(r"[A-Za-z']+", txt) if len(w) > 2]
    miss = sorted({w for w in sp.unknown([w.lower().strip("'") for w in words])})
    print(f"{name:16s} {len(words):4d} words, unknown: {miss}")
    bad += len(miss)
sys.exit(1 if bad else 0)
