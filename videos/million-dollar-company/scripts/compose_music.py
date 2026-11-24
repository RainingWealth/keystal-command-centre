"""Original score: composed in code -> MIDI -> FluidSynth (FluidR3_GM) -> loudness-normalised music.wav.
D major (hope) -> B minor (crisis) -> G/D/A lift (action) -> D major resolution. Sections are pinned to timeline.json."""
import json, subprocess, re
import numpy as np
from mido import Message, MidiFile, MidiTrack, MetaMessage
from common import *

TL = json.loads((DATA / "timeline.json").read_text())
SC = {s["id"]: s for s in TL["scenes"]}
SEG = {g["id"]: g for s in TL["scenes"] for g in s["segments"]}
def sec(f): return f / FPS
def word_t(seg, pat, nth=0):
    hits = [w for w in SEG[seg]["words"] if re.search(pat, w["spoken"], re.I)]
    return hits[nth]["start"]
TOTAL = TL["totalSeconds"]
rng = np.random.default_rng(11)
EV = []  # (tick, order, msg)
TPS = 960  # 120 bpm, 480 tpb -> 960 ticks per second
def tk(t): return int(round(max(0, t) * TPS))
NAMES = {"C": 0, "D": 2, "E": 4, "F": 5, "G": 7, "A": 9, "B": 11}
def n(name):
    m = re.match(r"([A-G])([#b]?)(-?\d)", name); v = NAMES[m.group(1)] + (1 if m.group(2) == "#" else -1 if m.group(2) == "b" else 0)
    return 12 * (int(m.group(3)) + 1) + v
def prog(ch, p, vol, pan=64):
    if ch != 9: EV.append((0, 0, Message("program_change", channel=ch, program=p)))
    EV.append((0, 0, Message("control_change", channel=ch, control=7, value=vol)))
    EV.append((0, 0, Message("control_change", channel=ch, control=10, value=pan)))
    EV.append((0, 0, Message("control_change", channel=ch, control=11, value=127)))
def note(ch, t, d, p, v, hum=True):
    if isinstance(p, str): p = n(p)
    j = rng.normal(0, 0.006) if hum else 0
    v = int(np.clip(v + (rng.normal(0, 4) if hum else 0), 1, 127))
    EV.append((tk(t + j), 2, Message("note_on", channel=ch, note=p, velocity=v)))
    EV.append((tk(t + d + j), 1, Message("note_off", channel=ch, note=p, velocity=0)))
def ramp(ch, t0, t1, v0, v1, cc=11, step=0.1):
    for t in np.arange(t0, t1 + 1e-6, step):
        v = int(round(v0 + (v1 - v0) * (t - t0) / max(t1 - t0, 1e-6))); EV.append((tk(t), 0, Message("control_change", channel=ch, control=cc, value=int(np.clip(v, 0, 127)))))

# channels
PIANO, STR, PAD, BASS, PIZZ, TREM, TIMP, VIBE, VLN, DR = 0, 1, 2, 3, 4, 5, 6, 7, 8, 9
prog(PIANO, 0, 92, 58); prog(STR, 48, 86, 64); prog(PAD, 89, 80, 64); prog(BASS, 33, 96, 64); prog(PIZZ, 45, 100, 52)
prog(TREM, 44, 84, 70); prog(TIMP, 47, 100, 64); prog(VIBE, 11, 76, 72); prog(VLN, 40, 80, 60); prog(DR, 0, 70, 64)

CH = {  # arpeggio tones
    "D": ["D4", "F#4", "A4", "D5"], "A": ["A3", "C#4", "E4", "A4"], "Bm": ["B3", "D4", "F#4", "B4"], "G": ["G3", "B3", "D4", "G4"],
    "Em": ["E4", "G4", "B4", "E5"], "F#": ["F#3", "A#3", "C#4", "F#4"],
}
PADN = {"D": ["D3", "A3", "F#4"], "A": ["A2", "E3", "C#4"], "Bm": ["B2", "F#3", "D4"], "G": ["G2", "D3", "B3"], "Em": ["E3", "B3", "G4"], "F#": ["F#2", "C#3", "A#3"]}
ROOT = {"D": "D2", "A": "A1", "Bm": "B1", "G": "G1", "Em": "E2", "F#": "F#1"}
def chord_at(seq, t, t0, bar): return seq[int((t - t0) // bar) % len(seq)]
PAT = [0, 1, 2, 3, 2, 1, 2, 1]
def arp(ch, t0, t1, seq, bar=2.0, step=0.25, pat=PAT, vel=50, dur=0.4):
    t = t0
    while t < t1 - 1e-6:
        c = chord_at(seq, t, t0, bar); k = int(round((t - t0) / step)) % len(pat)
        note(ch, t, dur, CH[c][pat[k]], vel + (6 if k % 4 == 0 else 0)); t += step
def pads(ch, t0, t1, seq, bar=2.0, vel=36, over=0.25):
    t = t0
    while t < t1 - 1e-6:
        c = chord_at(seq, t, t0, bar); end = min(t + bar + over, t1 + over)
        for p in PADN[c]: note(ch, t, end - t, p, vel)
        t += bar
def bass(t0, t1, seq, bar=2.0, every=1.0, vel=52):
    t = t0
    while t < t1 - 1e-6:
        note(BASS, t, every * 0.9, ROOT[chord_at(seq, t, t0, bar)], vel + (8 if abs(((t - t0) % bar)) < 1e-6 else 0)); t += every
def hats(t0, t1, vel=18, every=0.5):
    t = t0 + every / 2
    while t < t1 - 1e-6: note(DR, t, 0.05, 42, vel); t += every

# ---- timeline anchors ----
S = {k: (sec(v["start"]), sec(v["end"])) for k, v in SC.items()}
tPing = SEG["s3c"]["start"] / FPS - 0.35
GAP = (tPing - 0.12, tPing + 1.05)  # total silence for the phone ping + buzz
tBreath = SEG["s6b"]["start"] / FPS + SEG["s6b"]["durSec"]
tCash = word_t("s8c", r"^cash")
cues7 = [word_t("s7a", p) for p in (r"^forecasting", r"^collecting", r"^negotiating", r"^maintaining")]
tEend = SEG["s8e"]["start"] / FPS + SEG["s8e"]["durSec"]

# S1 optimistic D major
a, b = S["S1"]; seq = ["D", "A", "Bm", "G"]
ramp(PIANO, a, a + 0.6, 0, 127); ramp(STR, a + 0.5, a + 3.5, 0, 127); ramp(BASS, a, a + 1.5, 0, 127)
arp(PIANO, a + 0.1, b, seq, vel=46); pads(STR, a + 0.5, b, seq, vel=34); bass(a + 1.0, b, seq, vel=46); hats(a + 2.0, b)
# S2 on paper: continue, thin to a lone pad for the lights-off
a2, b2 = S["S2"]; tOff = b2 - 0.7
arp(PIANO, a2, tOff, seq, vel=50); pads(STR, a2, b2 + 0.2, seq, vel=34); bass(a2, tOff, seq, vel=48); hats(a2, tOff)
tProfit = word_t("s2b", r"hundred") - 0.05
for i, p in enumerate(["A5", "C#6", "E6"]): note(VIBE, tProfit + i * 0.12, 1.2, p, 52)
ramp(STR, tOff, b2 + 0.1, 127, 20, step=0.05); ramp(PIANO, tOff - 0.05, tOff + 0.4, 127, 0, step=0.05)
# S3 crisis: sparse B minor, ping silence, drone + heartbeat
a3, b3 = S["S3"]; tB = SEG["s3b"]["start"] / FPS
ramp(PAD, a3, a3 + 2.0, 0, 127)
for p in PADN["Bm"]: note(PAD, a3, GAP[0] - a3, p, 30)
for i, t in enumerate(np.arange(a3 + 1.0, GAP[0] - 0.4, 1.6)): note(PIANO, t, 1.4, ["B3", "F#4", "D4", "A3"][i % 4], 36)
ramp(BASS, tB - 0.3, tB + 1.5, 0, 127)
note(BASS, tB - 0.1, GAP[0] - tB + 0.1, "B1", 40); note(STR, tB - 0.1, GAP[0] - tB + 0.1, "F#2", 28)
t1 = GAP[1]
for p, v in (("B1", 52), ("F#2", 40)): note(BASS if p == "B1" else STR, t1, b3 - t1 + 0.3, p, v)
for p in ("B3", "C4", "F#4"): note(TREM, t1, b3 - t1 + 0.3, p, 30)
ramp(TREM, t1, b3, 20, 120, step=0.1); ramp(PAD, t1 - 0.1, t1 + 0.1, 127, 127)
for p in PADN["Bm"]: note(PAD, t1, b3 - t1 + 0.3, p, 26)
t = t1
while t < b3 - 0.4: note(DR, t, 0.2, 41, 52); note(DR, t + 0.28, 0.2, 41, 40); t += 1.0
# S4 90-day trap: ticking pizzicato ostinato
a4, b4 = S["S4"]; seq4 = ["Bm", "G", "Bm", "F#"]
ramp(PIZZ, a4, a4 + 0.3, 0, 127); ramp(STR, a4, a4 + 2.0, 40, 127)
t = a4
while t < b4 - 0.2:
    c = chord_at(seq4, t, a4, 2.0); k = int(round((t - a4) / 0.5)) % 4
    note(PIZZ, t, 0.2, [CH[c][0], CH[c][2]][k % 2], 74 if k == 0 else 54); t += 0.5
pads(STR, a4, b4, seq4, vel=32); bass(a4, b4, seq4, every=1.0, vel=56)
tR = SEG["s4c"]["start"] / FPS
for p in ("B3", "C4", "F#4"): note(TREM, tR - 0.2, b4 - tR + 0.4, p, 30)
ramp(TREM, tR - 0.2, b4, 30, 118)
# S5 growth paradox: rising line over falling bass
a5, b5 = S["S5"]; up = ["B3", "C#4", "D4", "E4", "F#4", "G4", "A4", "B4", "C#5", "D5", "E5", "F#5", "G5", "A5"]
seq5 = ["Em", "Bm", "G", "A"]
for i, t in enumerate(np.arange(a5, b5 - 0.2, 0.5)): note(STR if i % 2 == 0 else VLN, t, 0.7, up[min(i, len(up) - 1)], 40 + 2 * i); 
ramp(STR, a5, b5, 60, 127); ramp(VLN, a5 + 0.5, b5, 40, 120)
for i, (t, p) in enumerate(zip(np.arange(a5, b5 - 0.2, 1.0), ["E2", "D2", "C#2", "B1", "A1", "G1", "F#1"])): note(BASS, t, 0.95, p, 58)
note(PIZZ, a5, 0.2, "B3", 60, True); tt = a5
while tt < b5 - 0.2: note(PIZZ, tt, 0.2, "F#4", 46); tt += 0.5
tt = a5 + 0.5
while tt < b5 - 0.3: note(TIMP, tt, 0.4, "B2", 48 + int(18 * (tt - a5) / (b5 - a5))); tt += 1.0
pads(PAD, a5, b5, seq5, vel=28)
# S6 real problem: peak tension, then a breath at the zoom-out
a6, b6 = S["S6"]; seq6 = ["Bm", "G", "Em", "F#"]
for c_, t in zip(seq6, [a6 + 2.0 * i for i in range(4)]):
    if t >= tBreath: break
    e = min(t + 2.0, tBreath)
    for p in PADN[c_]: note(TREM, t, e - t + 0.1, p, 40)
ramp(TREM, a6, tBreath, 70, 127, step=0.1)
for t in np.arange(a6, tBreath - 0.3, 1.0): note(TIMP, t, 0.5, "B2" if int(t - a6) % 2 == 0 else "F#2", 72 + int(14 * (t - a6) / (tBreath - a6)))
note(VLN, a6, tBreath - a6, "F#5", 38); ramp(VLN, a6, tBreath, 40, 120); bass(a6, tBreath, seq6, every=0.5, vel=50)
note(PIZZ, a6, 0.2, "B3", 40)
pads(PAD, tBreath - 0.1, b6 - 0.0, ["Bm"], bar=4.0, vel=26, over=0.4)
note(BASS, tBreath, b6 - tBreath + 0.2, "B1", 40)
# S7 prevention: lift to G - D - A, controlled
a7, b7 = S["S7"]; marks = [a7] + cues7 + [b7]
seq7 = ["Bm", "G", "D", "A", "D"]
for i, c_ in enumerate(seq7):
    t0, t1_ = marks[i], marks[i + 1]
    if i == 0: t0 = a7
    arp(PIANO, t0, t1_, [c_], bar=100, step=0.25, vel=48 + 2 * i)
    for p in PADN[c_]: note(STR, t0, t1_ - t0 + 0.25, p, 34 + 2 * i)
    for p in PADN[c_]: note(PAD, t0, t1_ - t0 + 0.25, p, 22)
    note(BASS, t0, t1_ - t0, ROOT[c_], 56)
    note(PIZZ, t0, 0.2, CH[c_][1], 60); note(VIBE, t0 + 0.02, 1.2, CH[c_][3].replace("4", "5").replace("3", "5"), 40)
ramp(STR, a7, a7 + 1.5, 60, 127); hats(a7, b7, 20)
# S8 resolution
a8, b8 = S["S8"]; END = b8 + 4.0
ramp(PIANO, a8, a8 + 0.3, 0, 127)
prog_seq = [("D", a8, SEG["s8b"]["start"] / FPS), ("A", SEG["s8b"]["start"] / FPS, SEG["s8c"]["start"] / FPS), ("G", SEG["s8c"]["start"] / FPS, tCash)]
for c_, t0, t1_ in prog_seq:
    arp(PIANO, t0, t1_, [c_], bar=100, step=0.5, pat=[0, 1, 2, 3], vel=40, dur=0.9)
    for p in PADN[c_]: note(STR, t0, t1_ - t0 + 0.3, p, 32)
    note(BASS, t0, t1_ - t0, ROOT[c_], 46)
DFIN = ["D3", "A3", "D4", "F#4", "A4", "E5"]
tD = tCash - 0.05
for p in DFIN: note(STR, tD, END - tD, p, 36)
for p in ("D3", "A3", "F#4"): note(PAD, tD, END - tD, p, 30)
note(BASS, tD, END - tD, "D2", 54); note(TIMP, tD, 2.0, "D2", 60)
for i, t in enumerate(np.arange(tD + 0.1, tEend + 0.6, 1.0)): note(PIANO, t, 1.8, ["D4", "A4", "F#4", "A4"][i % 4] if t < tEend - 1 else "D4", 40)
tF = tEend + 0.5
for p, v in (("D3", 50), ("A3", 46), ("D4", 46), ("F#4", 42), ("A4", 40), ("E5", 34)): note(PIANO, tF, END - tF, p, v)
ramp(STR, tEend, b8 - 0.3, 127, 70, step=0.1); ramp(STR, b8 - 0.3, b8 + 3.0, 70, 0, step=0.1)

# ---- write MIDI ----
mid = MidiFile(ticks_per_beat=480); tr = MidiTrack(); mid.tracks.append(tr)
tr.append(MetaMessage("set_tempo", tempo=500000))
EV.append((tk(END + 2.0), 3, MetaMessage("end_of_track")))
EV.sort(key=lambda e: (e[0], e[1])); last = 0
for t, _, m in EV: m.time = t - last; last = t; tr.append(m)
mid.save(WORK / "score.mid")
print(f"{len([e for e in EV if getattr(e[2], 'type', '') == 'note_on'])} notes, ends {END:.1f}s")

raw = WORK / "music_raw.wav"
sf2 = "/usr/share/sounds/sf2/FluidR3_GM.sf2"
subprocess.run(["fluidsynth", "-ni", "-q", "-g", "0.8", "-r", "48000", "-F", str(raw), sf2, str(WORK / "score.mid")], check=True, stdin=subprocess.DEVNULL)
dur = TOTAL
subprocess.run(["ffmpeg", "-y", "-v", "error", "-i", str(raw), "-t", f"{dur + 0.5:.2f}", "-af",
                f"highpass=f=35,loudnorm=I=-20:TP=-2:LRA=9,afade=t=out:st={dur - 2.8:.2f}:d=3.0", "-ar", "48000", "-ac", "2", "-c:a", "pcm_s16le",
                str(PUB_AUDIO / "music.wav")], check=True)
print("music.wav written; silence window for ping:", [round(x, 2) for x in GAP], "| tCash", round(tCash, 2), "| tBreath", round(tBreath, 2), "| cues7", [round(c, 2) for c in cues7])
