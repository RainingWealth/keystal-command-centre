"""Synthesise all sound effects, ambience beds and the film-grain texture in numpy (no third-party samples)."""
import numpy as np, wave
from PIL import Image
from common import *

rng = np.random.default_rng(7)
def t_(d): return np.arange(int(d * SR)) / SR
def env_exp(n, tau, attack=0.002):
    t = np.arange(n) / SR; e = np.exp(-t / tau); a = np.minimum(1, t / max(attack, 1e-4)); return e * a
def sine(f, d, ph=0.0): return np.sin(2 * np.pi * f * t_(d) + ph)
def norm_peak(x, p=0.7): return x * (p / (np.max(np.abs(x)) + 1e-9))
def write(name, x, stereo=False):
    x = np.clip(x, -1, 1)
    ch = 2 if stereo else 1
    if stereo and x.ndim == 1: x = np.stack([x, x], 1)
    with wave.open(str(SFX_DIR / f"{name}.wav"), "wb") as w:
        w.setnchannels(ch); w.setsampwidth(2); w.setframerate(SR); w.writeframes((x * 32767).astype("<i2").tobytes())
    print(f"  {name:14s} {len(x) / SR:5.2f}s")

def sweep_noise(d, f0, f1, width=0.8, seed=0):
    r = np.random.default_rng(seed); n = int(d * SR); x = r.standard_normal(n + 4096)
    N, hop = 2048, 512; win = np.hanning(N); fr = np.fft.rfftfreq(N, 1 / SR); out = np.zeros(n + 4096 + N)
    for i in range(0, n + 2048, hop):
        c = f0 * (f1 / f0) ** min(1, i / n)
        m = np.exp(-0.5 * ((np.log2(fr + 1) - np.log2(c)) / width) ** 2)
        seg = np.fft.irfft(np.fft.rfft(x[i:i + N] * win) * m, N)
        out[i:i + N] += seg * win * 0.5
    return out[2048:2048 + n]

def bandpass(x, lo, hi):
    X = np.fft.rfft(x); f = np.fft.rfftfreq(len(x), 1 / SR)
    m = 1 / (1 + (lo / (f + 1e-9)) ** 4) / (1 + (f / hi) ** 4)
    return np.fft.irfft(X * m, len(x))

def reverb(x, rt60=1.2, wet=0.3, seed=3):
    n = int(rt60 * 1.3 * SR); r = np.random.default_rng(seed)
    ir = r.standard_normal(n) * np.exp(-6.9 * np.arange(n) / SR / rt60); ir[:int(0.012 * SR)] *= 0.2
    ir = bandpass(ir, 200, 6000)
    L = len(x) + n; y = np.fft.irfft(np.fft.rfft(x, L) * np.fft.rfft(ir, L), L); y *= np.max(np.abs(x)) / (np.max(np.abs(y)) + 1e-9)
    out = np.zeros(L); out[:len(x)] += x * (1 - wet); out += y * wet
    return out

def fade(x, a=0.005, b=0.02):
    n = len(x); x = x.copy(); na, nb = int(a * SR), int(b * SR)
    x[:na] *= np.linspace(0, 1, na); x[-nb:] *= np.linspace(1, 0, nb); return x

print("sfx:")
# soft whoosh: swept band noise, bell-shaped envelope
d = 0.9; w = sweep_noise(d, 400, 3500, 0.9, 1); e = np.sin(np.linspace(0, np.pi, len(w))) ** 2
write("whoosh_soft", fade(norm_peak(w * e, 0.5)))
d = 1.7; w = sweep_noise(d, 250, 5000, 1.0, 2); e = np.sin(np.linspace(0, np.pi, len(w))) ** 1.6
write("whoosh_long", fade(norm_peak(w * e, 0.55), 0.01, 0.1))
write("tick", fade(norm_peak(sine(2100, 0.06) * env_exp(int(0.06 * SR), 0.012) + 0.4 * sine(4200, 0.06) * env_exp(int(0.06 * SR), 0.006), 0.5)))
f = 440 * np.exp(np.linspace(0, 0.7, int(0.14 * SR))); ph = 2 * np.pi * np.cumsum(f) / SR
write("pop", fade(norm_peak(np.sin(ph) * env_exp(len(f), 0.04, 0.003), 0.45)))
# counter roll: accelerating then easing ticks
c = np.zeros(int(1.4 * SR)); tt = 0.0; k = 0
while tt < 1.3:
    i = int(tt * SR); tk = sine(1700 + 40 * (k % 5), 0.03) * env_exp(int(0.03 * SR), 0.006); c[i:i + len(tk)] += tk * (0.5 + 0.5 * np.sin(np.pi * tt / 1.3))
    tt += 0.075 - 0.045 * np.sin(np.pi * min(tt, 1.3) / 1.3) ; k += 1
write("counter", fade(norm_peak(c, 0.35)))
# phone chime: generic two-note bell
def bell(f, d, g=1.0):
    x = sum(a * sine(f * m, d) * np.exp(-t_(d) / (tau)) for m, a, tau in [(1, 1, 0.35), (2.01, 0.35, 0.22), (3.97, 0.12, 0.12), (5.4, 0.06, 0.08)])
    return g * x * np.minimum(1, t_(d) / 0.003)
ch = np.zeros(int(1.5 * SR)); b1 = bell(1318.5, 1.1); b2 = bell(1760, 1.2); ch[:len(b1)] += b1; ch[int(0.16 * SR):int(0.16 * SR) + len(b2)] += b2 * 0.9
write("chime", fade(norm_peak(reverb(ch, 0.6, 0.15), 0.6), 0.002, 0.15))
# vibration buzz x2
bz = np.zeros(int(0.7 * SR))
for off in (0.0, 0.26):
    d = 0.2; x = (np.sign(np.sin(2 * np.pi * 135 * t_(d))) * 0.5 + sine(270, d) * 0.5) * np.sin(np.linspace(0, np.pi, int(d * SR))) ** 0.5
    i = int(off * SR); bz[i:i + len(x)] += x
write("buzz", fade(norm_peak(bandpass(bz, 90, 900), 0.45)))
# clock tick-tock loop (2s): tick, tock
ck = np.zeros(2 * SR)
for off, f0 in ((0.0, 1500), (1.0, 1100)):
    n = int(0.05 * SR); x = (sine(f0, 0.05) * 0.6 + rng.standard_normal(n) * 0.5) * env_exp(n, 0.007, 0.0005); i = int(off * SR); ck[i:i + n] += bandpass(x, 500, 5000)
write("clock_tick", norm_peak(ck, 0.5))
pp = bandpass(rng.standard_normal(int(0.4 * SR)), 1800, 9000) * (np.sin(np.linspace(0, np.pi, int(0.4 * SR))) ** 2) * (1 + 0.5 * np.sin(np.linspace(0, 40, int(0.4 * SR))))
write("paper", fade(norm_peak(pp, 0.4), 0.01, 0.06))
n = int(0.4 * SR); st = sine(95, 0.4) * env_exp(n, 0.09) + 0.5 * bandpass(rng.standard_normal(n), 150, 2000) * env_exp(n, 0.015)
write("stamp", fade(norm_peak(st, 0.65)))
n = int(0.5 * SR); cn = (sine(2960, 0.5) + 0.7 * sine(4180, 0.5) + 0.5 * sine(5570, 0.5)) * env_exp(n, 0.07, 0.0008)
write("coin", fade(norm_peak(cn, 0.35)))
hb = np.zeros(int(2.0 * SR))
for off in (0.0, 0.28, 1.0, 1.28):
    n = int(0.22 * SR); f = 62 * np.exp(-np.linspace(0, 1, n) * 0.6); x = np.sin(2 * np.pi * np.cumsum(f) / SR) * env_exp(n, 0.07, 0.004) * (1 if off % 1 == 0 else 0.7)
    i = int(off * SR); hb[i:i + n] += x
write("heartbeat", norm_peak(hb, 0.8))
d = 3.2; n = int(d * SR); sw = sweep_noise(d, 300, 6000, 1.2, 5) * (np.linspace(0, 1, n) ** 2.2)
f = 110 * 2 ** (np.linspace(0, 2.2, n)); sw += 0.35 * np.sin(2 * np.pi * np.cumsum(f) / SR) * np.linspace(0, 1, n) ** 2
write("riser", fade(norm_peak(sw, 0.5), 0.01, 0.06))
d = 3.2; n = int(d * SR); im = sine(52, d) * env_exp(n, 0.9, 0.004) + 0.6 * sine(104, d) * env_exp(n, 0.5) + 0.4 * bandpass(rng.standard_normal(n), 80, 1500) * env_exp(n, 0.12, 0.001)
write("impact", fade(norm_peak(reverb(im, 1.8, 0.35), 0.75), 0.002, 0.4))
n = int(0.7 * SR); lo = sine(70, 0.7) * env_exp(n, 0.16) + 0.6 * bandpass(rng.standard_normal(n), 400, 5000) * env_exp(n, 0.01, 0.0005)
lo[int(0.12 * SR):] *= 0.6
write("lights_off", fade(norm_peak(lo, 0.7)))

def loopable(x, xf):
    k = int(xf * SR); y = x[:-k].copy(); y[:k] = y[:k] * np.linspace(0, 1, k) + x[-k:] * np.linspace(1, 0, k); return y
def pink(n, seed):
    r = np.random.default_rng(seed); X = np.fft.rfft(r.standard_normal(n)); f = np.fft.rfftfreq(n, 1 / SR); X /= np.sqrt(np.maximum(f, 20)); return np.fft.irfft(X, n)
print("ambience:")
d = 13.0; n = int(d * SR); off = []
for ch_ in range(2):
    x = bandpass(pink(n, 10 + ch_), 120, 3500) * 0.8
    for _ in range(60):  # faint keyboard / office clicks
        i = rng.integers(0, n - 2000); k = bandpass(rng.standard_normal(600), 1500, 6000) * np.exp(-np.arange(600) / 70) * rng.uniform(0.02, 0.09); x[i:i + 600] += k
    off.append(loopable(x, 1.0))
m = min(len(off[0]), len(off[1])); amb = np.stack([off[0][:m], off[1][:m]], 1); write("amb_office", norm_peak(amb, 0.35), True)
ng = []
for ch_ in range(2):
    x = bandpass(pink(n, 20 + ch_), 40, 1200) * 0.9 + 0.12 * np.sin(2 * np.pi * 60 * t_(d)[:n]) + 0.05 * np.sin(2 * np.pi * 120 * t_(d)[:n])
    ng.append(loopable(x, 1.0))
m = min(len(ng[0]), len(ng[1])); amb = np.stack([ng[0][:m], ng[1][:m]], 1); write("amb_night", norm_peak(amb, 0.35), True)

# film grain texture (tile)
g = rng.normal(128, 38, (512, 512)).clip(0, 255).astype("uint8"); Image.fromarray(g, "L").save(ROOT / "public/textures/grain.png")
print("grain.png written")
