"""Regenerates the scene-timing table for PRODUCTION_NOTES.md from timeline.json (prints markdown)."""
import json
from common import *
TL = json.loads((DATA / "timeline.json").read_text())
NAMES = {"S1": "The success story", "S2": "Profitable on paper", "S3": "Tomorrow's problem", "S4": "The 90-day trap", "S5": "The growth paradox", "S6": "The real problem", "S7": "How to prevent it", "S8": "The final lesson"}
print("| Scene | Start | End | Length | Narration segments (start) |\n|---|---|---|---|---|")
for s in TL["scenes"]:
    segs = ", ".join(f"{g['id']} {g['start'] / FPS:.2f}s" for g in s["segments"])
    print(f"| {s['id']} {NAMES[s['id']]} | {s['start'] / FPS:.2f}s | {s['end'] / FPS:.2f}s | {s['dur'] / FPS:.2f}s | {segs} |")
print(f"\nTotal: {TL['totalFrames']} frames = {TL['totalSeconds']:.2f}s at {FPS} fps")
