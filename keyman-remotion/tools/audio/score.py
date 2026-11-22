"""Original electronic corporate score, 120 BPM, synthesised with numpy (no samples, no third-party audio).
Reads nothing but the section map below (which mirrors storyboard.md section 6). Writes work/score.wav (48 kHz stereo, float).
Silence #1: everything stops at 17.5 s (the voice finishes 'Cash flow suffers.' alone) until the title lands at 19.0.
Silence #2: drums stop at 37.0 s, only a quiet pad holds until 37.5.
run: $LIB/.venv/bin/python source/score.py"""
import os, sys, numpy as np, soundfile as sf
LIB = os.environ.get("LIB", os.path.expanduser("~/lemo-opuscar")); sys.path.insert(0, f"{LIB}/core/audio")
from sfx import SR, t_, env_exp, bp, lp, hp, noise, norm, add
HERE = os.path.dirname(os.path.abspath(__file__)); OUT = f"{HERE}/work"; os.makedirs(OUT, exist_ok=True)
DUR = 52.5; N = int(DUR * SR); BEAT = .5; S16 = BEAT / 4
rng = np.random.default_rng(120)
mf = lambda n: 440 * 2 ** ((n - 69) / 12)

# ---- voices
def kick(v=1.0):
    d = .4; t = t_(d); f = 46 + 110 * np.exp(-t / .028); ph = 2 * np.pi * np.cumsum(f) / SR
    return norm(np.sin(ph) * np.exp(-t / .13) + hp(noise(d), 2500) * np.exp(-t / .002) * .25) * v
def clap(v=1.0):
    d = .22; t = t_(d); x = np.zeros(len(t))
    for off in (0, .011, .023): x += np.roll(bp(noise(d), 900, 3200) * np.exp(-t / .006), int(off * SR))
    return norm(x + bp(noise(d), 1100, 2600) * np.exp(-t / .07) * .7) * v
def hat(v=1.0, op=False):
    d = .22 if op else .06; return norm(hp(noise(d), 7500) * np.exp(-t_(d) / (.06 if op else .014))) * v
def bass(f, d, v=1.0):
    t = t_(d); e = np.minimum(1, t / .006) * np.exp(-t / (d * .9)) * np.minimum(1, (d - t) / .03)
    x = np.sin(2 * np.pi * f * t) + .45 * np.sin(2 * np.pi * 2 * f * t) + .22 * np.sin(2 * np.pi * 3 * f * t)   # harmonics so it speaks on phone speakers
    return norm(lp(x, 900) * e) * v
def pluck(f, v=1.0, d=.5):
    t = t_(d); idx = 2.2 * np.exp(-t / .07); x = np.sin(2 * np.pi * f * t + idx * np.sin(2 * np.pi * 2 * f * t)) * np.exp(-t / .16)
    return norm(x) * v
def bell(f, v=1.0, d=2.4):
    t = t_(d); idx = 3.0 * np.exp(-t / .5); x = np.sin(2 * np.pi * f * t + idx * np.sin(2 * np.pi * 3.5 * f * t)) * np.exp(-t / .9)
    return norm(x) * v
def pad(freqs, d, v=1.0, att=.45, rel=.7, bright=1800):
    t = t_(d); x = np.zeros(len(t))
    for f in freqs:
        for det in (-.004, 0, .004):
            ff = f * (1 + det); x += sum(np.sin(2 * np.pi * ff * k * t + rng.random() * 6) / k for k in range(1, 9))
    e = np.minimum(1, t / att) * np.minimum(1, np.maximum(0, (d - t)) / rel)
    return norm(lp(x, bright) * e) * v
def drone(f, d, v=1.0):
    t = t_(d); x = np.sin(2 * np.pi * f * t) + .5 * np.sin(2 * np.pi * 1.5 * f * t) * (1 + .3 * np.sin(2 * np.pi * .25 * t)) + .25 * np.sin(2 * np.pi * 2 * f * t)
    return norm(x * np.minimum(1, t / .4) * np.minimum(1, (d - t) / .05)) * v

# ---- arrangement
PROG = [("Am", [57, 60, 64], 45, [69, 72, 76, 81]), ("F", [53, 57, 60], 41, [65, 69, 72, 77]), ("C", [55, 60, 64], 48, [67, 72, 76, 79]), ("G", [55, 59, 62], 43, [67, 71, 74, 79])]
def chord(sec_start, t): return PROG[int((t - sec_start) // (4 * BEAT)) % 4]
buses = {k: np.zeros((N, 2)) for k in ("drums", "bass", "pad", "lead", "fx")}
kicks = []                                   # kick times drive the sidechain pump
def put(bus, x, t, g=1.0, pan=0.0):
    if 0 <= t < DUR: add(buses[bus], x, t, g, pan)
def grid(t0, t1, step): n = 0; t = t0; out = []
def steps(t0, t1, step):
    t = t0
    while t < t1 - 1e-9: yield t; t += step

def groove(t0, t1, kick_pat="1 3", clap_on=True, hats="off8", bass_pat="8th", arp=None, arpv=.5, kv=1.0, section=None):
    s0 = t0 if section is None else section
    for tb in steps(t0, t1, BEAT):                                  # per beat
        k = int(round((tb - s0) / BEAT)) % 4 + 1
        if str(k) in kick_pat.split(): put("drums", kick(.9 * kv), tb, .8); kicks.append(tb)
        if clap_on and k in (2, 4): put("drums", clap(.7), tb, .45, .1)
    for ts in steps(t0, t1, S16):
        n16 = int(round((ts - s0) / S16)) % 16
        if hats == "off8" and n16 % 4 == 2: put("drums", hat(.6), ts, .25, .25)
        if hats == "16" and n16 % 2 == 0: put("drums", hat(.35 if n16 % 4 else .6), ts, .22, -.2 if n16 % 8 else .25)
        if hats == "8" and n16 % 2 == 0 and n16 % 4 != 0: put("drums", hat(.5), ts, .2, .2)
    if bass_pat:
        for ts in steps(t0, t1, S16 * 2 if bass_pat == "8th" else BEAT * 2):
            nm, tones, root, at = chord(s0, ts); put("bass", bass(mf(root), BEAT * .45 if bass_pat == "8th" else BEAT * 1.6, .9), ts, .6)
    if arp:
        for ts in steps(t0, t1, arp):
            nm, tones, root, at = chord(s0, ts); i = int(round((ts - s0) / arp)); note = at[[0, 1, 2, 1, 3, 2, 1, 2][i % 8] % len(at)]
            put("lead", pluck(mf(note), arpv), ts, .35, np.sin(i * .9) * .35)
def pads(t0, t1, v=.5, section=None):
    s0 = t0 if section is None else section; t = t0
    while t < t1 - 1e-9:
        nm, tones, root, at = chord(s0, t); end = min(t1, s0 + (int((t - s0) // (4 * BEAT)) + 1) * 4 * BEAT)
        put("pad", pad([mf(n) for n in tones], end - t + .5, 1.0), t, v); t = end

# A intro 0-6
groove(0, 2.0, kick_pat="", clap_on=False, hats="8", bass_pat=None)
groove(1.0, 2.0, kick_pat="3", clap_on=False, hats=None, bass_pat=None, section=0)
groove(2.0, 6.0, hats="off8", bass_pat="quarter", arp=None, section=2.0); pads(2.0, 6.0, .22, 2.0)
groove(4.0, 6.0, kick_pat="1 3", hats="16", bass_pat="8th", arp=BEAT / 2, arpv=.35, section=2.0)
put("fx", hp(noise(1.0), 2000) * np.linspace(0, 1, SR) ** 2 * .6, 5.0, .25)                 # riser into the push landing
# B network 6-10.5
groove(6.0, 10.5, hats="off8", bass_pat="8th", arp=BEAT / 2, arpv=.5, section=6.0); pads(6.0, 10.5, .35, 6.0)
put("lead", bell(mf(81), .8), 6.0, .3)
# C break 10.5-17.5: no drums, a drone and an unresolved cluster (A + Bb), then everything stops
put("pad", drone(mf(33), 7.0, 1.0), 10.5, .5)
put("pad", pad([mf(45), mf(46), mf(52)], 7.0, 1.0, att=1.2, rel=.05, bright=900), 10.5, .35)
put("drums", kick(1.0), 10.5, .9)                                                              # last hit as the knife lands
# --- silence 17.5-19.0 ---
# D Keyman 19-28: relief. soft kick on the downbeat, bell, then a light pulse
put("lead", bell(mf(84), 1.0), 19.0, .5); put("drums", kick(.8), 19.0, .6); kicks.append(19.0)
pads(19.0, 28.0, .30, 19.0)
groove(21.0, 28.0, kick_pat="1", clap_on=False, hats="off8", bass_pat="quarter", arp=None, section=19.0)
groove(23.0, 28.0, kick_pat="1 3", clap_on=False, hats="off8", bass_pat="8th", arp=BEAT, arpv=.4, section=19.0)
put("lead", bell(mf(88), .6), 26.5, .35)
# E recovery 28.5-37.0: full groove, brighter
groove(28.5, 37.0, kick_pat="1 3", hats="16", bass_pat="8th", arp=S16 * 2, arpv=.55, section=28.5); pads(28.5, 37.0, .4, 28.5)
for tt in (31.5, 33.0, 35.25): put("lead", bell(mf(88), .5), tt, .3)
# --- near silence 37.0-37.5: a quiet pad only ---
put("pad", pad([mf(n) for n in (55, 60, 64)], .9, 1.0, att=.1, rel=.4), 37.0, .15)
# F resolve 37.5-52: thin groove, then the tonic
groove(37.5, 44.5, kick_pat="1", clap_on=False, hats="off8", bass_pat="quarter", arp=BEAT, arpv=.3, section=37.5); pads(37.5, 44.5, .38, 37.5)
put("pad", pad([mf(n) for n in (48, 55, 60, 64, 72)], 7.2, 1.0, att=.25, rel=3.0, bright=2200), 44.5, .5)   # tonic C, long tail
put("bass", bass(mf(36), 1.6, 1.0), 44.5, .6); put("drums", kick(.9), 44.5, .7); kicks.append(44.5)
put("lead", bell(mf(84), 1.0), 44.5, .5); put("lead", bell(mf(79), .7), 45.0, .3)

# ---- sidechain pump from the kicks, hard stops, bus mix
t = np.arange(N) / SR; pump = np.ones(N)
for kt in kicks:
    s = int(kt * SR); e = min(N, s + int(.28 * SR)); pump[s:e] = np.minimum(pump[s:e], 1 - .45 * np.exp(-np.arange(e - s) / SR / .09))
gain = {"drums": .9, "bass": .8, "pad": .85, "lead": .7, "fx": .5}
mix = sum(buses[k] * gain[k] * (pump[:, None] if k in ("pad", "bass", "lead") else 1) for k in buses)
def hard_stop(a, b): mix[int(a * SR):int(b * SR)] = 0
hard_stop(17.5, 19.0)                                                                           # silence #1
ramp = np.minimum(1, np.maximum(0, (DUR - 1.6 - t) / 1.6 + 0)); mix *= np.where(t > DUR - 1.6, np.clip((DUR - t) / 1.6, 0, 1), 1)[:, None]   # tail fades out
for a in (17.5, 28.0):                                                                          # 5 ms fades so a hard stop doesn't click
    s = int(a * SR); mix[s - 240:s] *= np.linspace(1, 0, 240)[:, None]
mix = mix / np.abs(mix).max() * .8
sf.write(f"{OUT}/score.wav", mix.astype(np.float32), SR, subtype="FLOAT")
def db(x): return 20 * np.log10(np.sqrt(np.mean(x ** 2)) + 1e-9)
print("score written; rms dBFS", round(db(mix), 1), " silence 17.5-19 rms", round(db(mix[int(17.6 * SR):int(18.9 * SR)]), 1))
