"""Mix: score + voice-over + procedural foley -> out/mix.wav (48 kHz stereo float; mux.sh masters it to -14 LUFS)
Foley follows the materials of print: letterpress clack, ruling-pen tss, guillotine snick, felt thump, wooden numeral thunk. Dry, no reverb.
Voice about 10 dB over music, music ducked ~10 dB under the voice. Reads out/score.wav, events.json (from events.mjs), timeline.json, ../audio/voice.
run: $LIB/.venv/bin/python source/mix.py"""
import os, sys, json, numpy as np, soundfile as sf
from scipy.signal import resample_poly
from scipy.ndimage import maximum_filter1d, uniform_filter1d
LIB = os.environ.get("LIB", "/root/lemo-opuscar"); sys.path.insert(0, f"{LIB}/core/audio")
import sfx
from sfx import SR, t_, env_exp, bp, lp, hp, noise, norm, add
HERE = os.path.dirname(os.path.abspath(__file__)); ROOT = os.path.abspath(f"{HERE}/.."); OUT = f"{HERE}/out"
rng = np.random.default_rng(52)
ev = json.load(open(f"{HERE}/events.json")); TL = json.load(open(f"{HERE}/timeline.json"))
N = int((ev["dur"] + .5) * SR)

# ---- foley (all original, synthesised)
def clack(v=1, big=False):
    d = .1 if big else .07; tt = t_(d); p = .92 + rng.random() * .16
    x = hp(noise(d), 2500) * env_exp(d, .0012) * .9 + sum(a * np.sin(2 * np.pi * f * p * tt + rng.random() * 6) * env_exp(d, tau) for f, a, tau in [(3300, .45, .010), (5100, .25, .006), (1250, .35, .016)])
    return norm(x + np.sin(2 * np.pi * 300 * p * tt) * env_exp(d, .015) * .5) * v
def tick(v=1):
    d = .035; tt = t_(d); return norm(np.sin(2 * np.pi * 3600 * tt) * env_exp(d, .005) + hp(noise(d), 5000) * env_exp(d, .001) * .5) * v
def ding(v=1):
    d = 1.1; tt = t_(d); return norm(sum(a * np.sin(2 * np.pi * f * tt) * env_exp(d, tau) for f, a, tau in [(1568, 1, .35), (2349, .45, .22), (3136, .2, .12)])) * v
def snick(v=1):                         # guillotine / utility knife: a quick band-pass sweep ending in a metal snick
    d = .16; n = noise(d); tt = t_(d); out = np.zeros_like(n); hop = 160
    for i in range(0, len(n), hop):
        f = 1800 + 4200 * (i / len(n)) ** 1.4; seg = bp(n[max(0, i - 800):i + hop], f * .8, min(f * 1.25, 20000))[-hop:]; out[i:i + len(seg)] = seg
    out *= np.minimum(1, tt / (d * .8)) ** 1.5
    sn = t_(.06); x = out * .6; x[-len(sn):] += (np.sin(2 * np.pi * 4300 * sn) * env_exp(.06, .01) + hp(noise(.06), 4500) * env_exp(.06, .003)) * .9
    return norm(x) * v
def snap(v=1):
    d = .05; tt = t_(d); return norm(hp(noise(d), 1500) * env_exp(d, .002) + np.sin(2 * np.pi * 1900 * tt) * env_exp(d, .007) * .6 + np.sin(2 * np.pi * 620 * tt) * env_exp(d, .01) * .4) * v
def tss(d=.5, v=1):                     # ruling pen drawing a line: a thin hiss that follows the line
    tt = t_(d); return norm(bp(noise(d), 3500, 9500) * np.minimum(1, tt / .03) * np.minimum(1, (d - tt) / .06)) * v
def thunk(v=1, f=120):
    d = .16; tt = t_(d); return norm(np.sin(2 * np.pi * f * tt * (1 - .2 * tt)) * env_exp(d, .035) + bp(noise(d), 250, 1400) * env_exp(d, .006) * .5) * v
def thump(v=1):
    d = .6; tt = t_(d); return norm(np.sin(2 * np.pi * 56 * tt * (1 - .2 * tt)) * env_exp(d, .11) + lp(noise(d), 220) * env_exp(d, .025) * .35) * v
def whoosh(d=1.0, up=1, v=1):
    n = noise(d); tt = t_(d); out = np.zeros_like(n); hop = 480
    for i in range(0, len(n), hop):
        q = i / len(n); f = 400 + 3200 * (q if up else 1 - q) ** 1.6; seg = bp(n[max(0, i - 2400):i + hop], f * .6, min(f * 1.5, 18000), 2)[-hop:]; out[i:i + len(seg)] = seg
    return norm(out * np.sin(np.pi * np.minimum(1, tt / d)) ** 1.5) * v
def drop(v=1):
    d = .3; tt = t_(d); return norm(np.sin(2 * np.pi * (330 * np.exp(-tt / .12) + 90) * tt) * env_exp(d, .09)) * v
def hit(f=180, v=1):                    # descending 'consequence' hits in the break
    d = .7; tt = t_(d); return norm(np.sin(2 * np.pi * f * tt * (1 - .1 * tt)) * env_exp(d, .16) + np.sin(2 * np.pi * f * 2.01 * tt) * env_exp(d, .05) * .25 + lp(noise(d), 600) * env_exp(d, .02) * .3) * v
FOLEY = {
 "clack": (lambda e: clack(e.get("v", 1)), .20), "tick": (lambda e: tick(e.get("v", 1)), .11), "ding": (lambda e: ding(e.get("v", 1)), .16),
 "snick": (lambda e: snick(e.get("v", 1)), .24), "snap": (lambda e: snap(e.get("v", 1)), .14), "tss": (lambda e: tss(e.get("d", .5)), .06),
 "thunk": (lambda e: thunk(e.get("v", 1), e.get("f", 120)), .30), "thump": (lambda e: thump(e.get("v", 1)), .50),
 "whoosh": (lambda e: whoosh(e.get("d", 1), e.get("up", 1)), .11), "drop": (lambda e: drop(e.get("v", 1)), .12), "hit": (lambda e: hit(e.get("f", 180)), .30),
}
fol = np.zeros((N, 2))
for e in ev["ev"]:
    if e["type"] not in FOLEY: continue
    fn, g = FOLEY[e["type"]]; x = fn(e).astype(np.float64); at = e["t"]
    if e["type"] in ("snick",): at -= len(x) / SR - .03            # the snick (end of the sound) lands on the event time
    if e["type"] == "whoosh" and e.get("up") == 1: at -= 0          # rises into the event time
    add(fol, x, at, g * 1.4, pan=float(rng.uniform(-.2, .2)))

# ---- voice-over
vo = np.zeros((N, 2)); vad = np.zeros(N)
for L in TL["lines"]:
    y, sr = sf.read(f"{ROOT}/audio/voice/{L['id']}.wav");  y = y.mean(1) if y.ndim > 1 else y
    y = resample_poly(y, SR, sr); y = hp(y, 85); y = sfx.compress(y / (np.abs(y).max() + 1e-9), thr=.3, ratio=3, att=.003, rel=.1); y = norm(y, .9)
    add(vo, y, L["t"], .72); s = int(L["t"] * SR); vad[s:s + len(y)] = 1
vad = uniform_filter1d(maximum_filter1d(vad, size=int(.16 * SR)), size=int(.25 * SR)); duck = 1 - .68 * vad     # ~ -10 dB under the voice

# ---- music
mus, msr = sf.read(f"{OUT}/score.wav"); assert msr == SR
mus = mus[:N] if len(mus) >= N else np.pad(mus, ((0, N - len(mus)), (0, 0)))
mg = np.ones(N)                                                  # section trims so the voice stays >= ~9 dB over the score everywhere
for a, b, g in [(3.0, 11.0, .85), (19.0, 28.4, .68), (44.4, 52.5, .8)]: mg[int(a * SR):int(b * SR)] = g
mg = uniform_filter1d(mg, size=int(.4 * SR))
mus = mus * duck[:, None] * mg[:, None] * 1.05
mix = mus + vo + fol
for c in range(2): mix[:, c] = sfx.limit(mix[:, c], .95)
assert np.isfinite(mix).all()
sf.write(f"{OUT}/mix.wav", mix.astype(np.float32), SR, subtype="FLOAT")
db = lambda x: 20 * np.log10(np.sqrt(np.mean(x ** 2)) + 1e-9)
print("peak %.2f dBFS" % (20 * np.log10(np.abs(mix).max())))
for L in TL["lines"]:
    s = int(L["t"] * SR); e = s + int(L["dur"] * SR); print(f"{L['id']:4s} voice {db(vo[s:e]):6.1f}  music {db(mus[s:e]):6.1f}  foley {db(fol[s:e]):6.1f}  voice-music {db(vo[s:e]) - db(mus[s:e]):5.1f} dB")
s, e = int(17.6 * SR), int(18.95 * SR); print("silence 17.6-18.95 s: music+foley rms %.1f dBFS (voice tail of l06 is until 17.96)" % db((mus + fol)[int(18.0 * SR):e]))
