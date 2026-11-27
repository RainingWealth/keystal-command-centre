"""Numerical consistency + hard-coded-figure audit. Exits non-zero on any failure."""
import json, re, sys, pathlib
from common import *
ok = True
def check(cond, msg):
    global ok
    print(("PASS " if cond else "FAIL ") + msg); ok &= bool(cond)
rev, prof, cash, pay, term = 1_200_000, 180_000, 14_000, 36_000, 90
check(round(prof / rev * 100) == 15, "profit margin 180,000 / 1,200,000 = 15%")
check(pay - cash == 22_000, "payroll shortfall 36,000 - 14,000 = 22,000")
fig = (ROOT / "src/config/figures.ts").read_text()
for name, val in (("revenue", "1_200_000"), ("profit", "180_000"), ("cash", "14_000"), ("payroll", "36_000"), ("termDays", "90")):
    check(re.search(rf"{name}:\s*{val}\b", fig) is not None, f"figures.ts {name} = {val}")
# every S$ amount in the captions must be one of the sanctioned figures
caps = json.loads((DATA / "captions.json").read_text())
allowed = {"S$1.2 million", "S$180,000", "S$14,000", "S$36,000"}
found = set()
for p in caps["pages"]:
    for w in p["words"]:
        m = re.match(r"S\$[\d.,]+( million)?", w["t"])
        if m: found.add(re.sub(r"[.?!,]+$", "", w["t"]))
check(found <= allowed and len(found) == 4, f"caption amounts {sorted(found)}")
# no hard-coded S$ literals in scene/component code (they must come from figures.ts / copy.ts)
bad = []
for f in (ROOT / "src").rglob("*.tsx"):
    for i, line in enumerate(f.read_text().splitlines(), 1):
        if re.search(r"S\$\s?[0-9]", line): bad.append(f"{f.relative_to(ROOT)}:{i}: {line.strip()[:80]}")
check(not bad, "no hard-coded S$ amounts in .tsx" + ("" if not bad else "\n   " + "\n   ".join(bad)))
# narration text carries the same figures in words
text = " ".join(sg["text"] for _, sg in segments()).lower()
for phrase in ("one point two million", "one hundred and eighty thousand", "fourteen thousand dollars", "thirty-six thousand", "ninety days", "one million dollars"):
    check(phrase in text, f"narration contains '{phrase}'")
sys.exit(0 if ok else 1)
