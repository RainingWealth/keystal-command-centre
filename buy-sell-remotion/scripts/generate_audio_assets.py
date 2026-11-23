#!/usr/bin/env python3
"""Synthesise the music bed and every sound effect (no samples, no licences).

Usage: python scripts/generate_audio_assets.py

Reads src/data/timeline.json for scene start times so the harmony follows the story:
  S1-S2  Dm / Bb / Gm   (tension)        S3  F / C / Dm   (clarity)
  S4     Dm / Bbm / A   (the gap)        S5-S6  Bb / F / C / F (resolution, warm)
Writes public/audio/music/bed.mp3 (stereo 44.1 kHz) and public/audio/sfx/*.wav (mono).
"""
import json
from pathlib import Path

import numpy as np
import soundfile as sf
from scipy.signal import lfilter

ROOT = Path(__file__).resolve().parent.parent
SR = 44100
BPM = 92
BEAT = 60 / BPM
BAR = 4 * BEAT
rng = np.random.default_rng(11)


# ---------------------------------------------------------------- helpers
def tt(dur):
    return np.arange(int(dur * SR)) / SR


def mtof(m):
    return 440.0 * 2 ** ((m - 69) / 12)


def lp(x, fc):
    a = 1 - np.exp(-2 * np.pi * fc / SR)
    return lfilter([a], [1, -(1 - a)], x)


def hp(x, fc):
    return x - lp(x, fc)


def comb(x, d, g):
    y = x.copy()
    for i in range(d, len(y), d):
        j = min(i + d, len(y))
        y[i:j] += g * y[i - d : j - d]
    return y


def allpass(x, d, g):
    y = -g * x
    y[d:] += x[:-d]
    for i in range(d, len(y), d):
        j = min(i + d, len(y))
        y[i:j] += g * y[i - d : j - d]
    return y


def reverb(x, wet=0.3, seed=0):
    ds = [1557, 1617, 1491, 1422] if seed == 0 else [1601, 1523, 1453, 1381]
    y = sum(comb(x, d, 0.82) for d in ds) / 4
    y = allpass(allpass(y, 225 + seed * 13, 0.5), 556 + seed * 17, 0.5)
    return (1 - wet) * x + wet * lp(y, 5500)


def norm(x, peak):
    return x * (peak / (np.max(np.abs(x)) + 1e-9))


def place(buf, sig, t0, ch=None, gain=1.0):
    i = int(t0 * SR)
    if i >= buf.shape[-1]:
        return
    n = min(len(sig), buf.shape[-1] - i)
    if buf.ndim == 1:
        buf[i : i + n] += sig[:n] * gain
    else:
        for c in ([0, 1] if ch is None else [ch]):
            buf[c, i : i + n] += sig[:n] * gain


def save(path, x, stereo=False):
    path.parent.mkdir(parents=True, exist_ok=True)
    sf.write(path, (x.T if stereo else x).astype(np.float32), SR, subtype="PCM_16")


# ---------------------------------------------------------------- SFX
def whoosh():
    d = 0.75
    t = tt(d)
    n = rng.normal(0, 1, len(t))
    fc = 300 + 5200 * np.sin(np.pi * np.clip(t / d, 0, 1)) ** 1.5
    out = np.zeros_like(n)
    state = 0.0
    for i in range(0, len(n), 64):  # block-wise time-varying lowpass
        a = 1 - np.exp(-2 * np.pi * fc[i] / SR)
        blk = n[i : i + 64]
        y = lfilter([a], [1, -(1 - a)], blk, zi=[state * (1 - a)])[0]
        out[i : i + 64] = y
        state = y[-1]
    env = np.sin(np.pi * np.clip(t / d, 0, 1)) ** 2
    return norm(hp(out, 120) * env, 0.5)


def pop():
    t = tt(0.16)
    f = 340 + 520 * np.exp(-t * 45)
    ph = 2 * np.pi * np.cumsum(f) / SR
    x = np.sin(ph) * np.exp(-t * 32)
    x[:80] += rng.normal(0, 0.25, 80) * np.linspace(1, 0, 80)
    return norm(x, 0.5)


def hit_soft():
    t = tt(0.55)
    x = (np.sin(2 * np.pi * 110 * t) + 0.4 * np.sin(2 * np.pi * 220 * t)) * np.exp(-t * 9)
    n = lp(rng.normal(0, 1, len(t)), 900) * np.exp(-t * 60)
    return norm(x + 0.7 * n, 0.5)


def thud_low():
    t = tt(1.0)
    f = 42 + 70 * np.exp(-t * 14)
    ph = 2 * np.pi * np.cumsum(f) / SR
    x = np.tanh(2.2 * np.sin(ph) * np.exp(-t * 3.8))
    n = lp(rng.normal(0, 1, len(t)), 220) * np.exp(-t * 28)
    return norm(x + 0.5 * n, 0.55)


def glitch():
    out = np.zeros(int(0.28 * SR))
    for k, (t0, dur, rate) in enumerate([(0.0, 0.05, 700), (0.07, 0.04, 1400), (0.14, 0.07, 400)]):
        n = int(dur * SR)
        base = rng.normal(0, 1, max(1, n // max(1, SR // rate)) + 1)
        x = np.repeat(base, SR // rate + 1)[:n]
        x = np.sign(x) * (np.abs(x) > 0.4) * np.linspace(1, 0.2, n)
        i = int(t0 * SR)
        out[i : i + n] += x
    return norm(hp(out, 600), 0.4)


def tick():
    t = tt(0.07)
    c = hp(rng.normal(0, 1, len(t)), 3000) * np.exp(-t * 400)
    b = np.sin(2 * np.pi * 1900 * t) * np.exp(-t * 110)
    return norm(c + 0.7 * b, 0.4)


def chime_resolve():
    d = 1.6
    t = tt(d)
    out = np.zeros_like(t)
    for k, (f, t0) in enumerate([(880.0, 0.0), (1318.5, 0.09)]):
        n = len(t) - int(t0 * SR)
        tn = t[:n]
        m = np.sin(2 * np.pi * f * 2.76 * tn) * 1.4 * np.exp(-tn * 9)
        x = np.sin(2 * np.pi * f * tn + m) * np.exp(-tn * 2.6)
        x += 0.25 * np.sin(2 * np.pi * f * 2 * tn) * np.exp(-tn * 4)
        out[int(t0 * SR) :] += x * (1 if k == 0 else 0.8)
    return norm(reverb(out, 0.25), 0.45)


def riser(d=0.87):
    t = tt(d)
    n = rng.normal(0, 1, len(t))
    fc = 250 + 7000 * (t / d) ** 2.2
    out = np.zeros_like(n)
    state = 0.0
    for i in range(0, len(n), 64):
        a = 1 - np.exp(-2 * np.pi * fc[i] / SR)
        y = lfilter([a], [1, -(1 - a)], n[i : i + 64], zi=[state * (1 - a)])[0]
        out[i : i + 64] = y
        state = y[-1]
    tone = np.sin(2 * np.pi * np.cumsum(180 + 900 * (t / d) ** 2) / SR)
    env = (t / d) ** 1.8
    x = (out * 0.9 + tone * 0.35) * env
    x[-60:] *= np.linspace(1, 0, 60)
    return norm(x, 0.45)


# ---------------------------------------------------------------- music
CHORDS = {
    "Dm": (38, [50, 53, 57, 60, 64]),
    "Bb": (34, [46, 50, 53, 57, 60]),
    "Gm": (31, [43, 46, 50, 53, 57]),
    "F": (29, [48, 53, 57, 60, 64]),
    "C": (36, [48, 52, 55, 59, 62]),
    "Am": (33, [45, 48, 52, 55, 59]),
    "Bbm": (34, [46, 49, 53, 56, 60]),
    "A": (33, [45, 52, 57, 61, 64]),
}


def pad_voice(freq, dur, rel=1.6):
    t = tt(dur + rel)
    x = np.zeros_like(t)
    for det in (-0.004, 0.0, 0.0045):
        f = freq * (1 + det)
        x += np.sin(2 * np.pi * f * t) + 0.35 * np.sin(2 * np.pi * 2 * f * t + 0.7) + 0.12 * np.sin(2 * np.pi * 3 * f * t)
    att = np.clip(t / 0.9, 0, 1) ** 1.5
    rel_env = np.clip((dur + rel - t) / rel, 0, 1)
    return x * att * rel_env / 3


def pluck(freq, dur=1.1):
    t = tt(dur)
    x = np.sin(2 * np.pi * freq * t) + 0.45 * np.sin(2 * np.pi * 2 * freq * t) * np.exp(-t * 6) + 0.2 * np.sin(2 * np.pi * 3 * freq * t) * np.exp(-t * 9)
    x *= np.exp(-t * 4.2) * np.clip(t / 0.004, 0, 1)
    return x


def sub(freq, dur):
    t = tt(dur)
    return np.sin(2 * np.pi * freq * t) * np.exp(-t * 2.4) * np.clip(t / 0.02, 0, 1)


def music(total_s, starts):
    N = int(total_s * SR)
    pad = np.zeros((2, N))
    bass = np.zeros(N)
    pl = np.zeros((2, N))
    ticks = np.zeros(N)
    s2, s3, s4, s5, s6 = starts

    def section(t):
        if t < s2:
            return ["Dm"], 0.55
        if t < s3:
            return ["Bb", "Gm"], 0.6
        if t < s4:
            return ["F", "C", "Dm"], 0.7
        if t < s5:
            return ["Dm", "Bbm", "A"], 0.55
        return ["Bb", "F", "C", "F"], 1.0

    bar = 0
    t0 = 0.0
    last_sec = None
    sec_bar = 0
    while t0 < total_s:
        prog, bright = section(t0)
        key = tuple(prog)
        if key != last_sec:
            last_sec, sec_bar = key, 0
        name = prog[sec_bar % len(prog)]
        sec_bar += 1
        root, notes = CHORDS[name]
        dur = BAR
        # a bar that crosses a section change is shortened so harmony lands on the cut
        for cut in (s2, s3, s4, s5, s6):
            if t0 < cut < t0 + dur - 0.3:
                dur = cut - t0
        for k, m in enumerate(notes):
            v = pad_voice(mtof(m), dur)
            place(pad, v, t0, ch=k % 2, gain=0.15 * (0.7 + 0.3 * bright))
            place(pad, v, t0, ch=(k + 1) % 2, gain=0.05)
        place(bass, sub(mtof(root), dur + 0.4), t0, gain=0.5)
        if dur > BAR * 0.7:
            place(bass, sub(mtof(root), 1.2), t0 + 2 * BEAT, gain=0.32)
        # sparse plucks (denser + brighter once resolved)
        density = 0.34 if t0 < s5 else 0.58
        for slot in range(8):
            if slot * BEAT / 2 >= dur - 0.2:
                break
            if rng.random() < density or slot == 0 and t0 >= s5:
                m = notes[rng.integers(1, len(notes))] + (12 if rng.random() < 0.65 else 24)
                p = pluck(mtof(m))
                place(pl, p, t0 + slot * BEAT / 2, ch=slot % 2, gain=0.1 + 0.05 * bright)
        t0 += dur

    # clock-like ticks while there is tension (S1-S4)
    tick_s = tick()
    b = 0.0
    while b < s5 - 0.5:
        place(ticks, tick_s, b, gain=0.06 if b < s4 else 0.09)
        b += BEAT
    # echo on plucks (dotted 8th)
    d = int(BEAT * 0.75 * SR)
    for c in range(2):
        e = np.zeros(N)
        e[d:] += pl[c][:-d] * 0.38
        e[2 * d :] += pl[c][: -2 * d] * 0.2
        pl[c] += lp(e, 3500)
    # swell into S5 and bloom at S5
    sw_t = 1.7
    sw = riser(sw_t)
    place(pad, sw, s5 - sw_t, gain=0.5)
    boom = thud_low()
    place(bass, boom, s5 - 0.02, gain=0.6)
    place(pad, chime_resolve(), s5 + 0.02, gain=0.35)
    # final resolve chime at the CTA
    place(pad, chime_resolve(), s6 + 5.3, gain=0.3)

    wetL = reverb(pad[0], 0.32, 0)
    wetR = reverb(pad[1], 0.32, 1)
    L = wetL + pl[0] + bass * 0.9 + ticks
    R = wetR + pl[1] + bass * 0.9 + ticks
    out = np.stack([L, R])
    out = np.tanh(1.35 * out) / 1.35
    out = norm(out, 0.7)
    return out


def main():
    tl = json.loads((ROOT / "src/data/timeline.json").read_text())
    fps = tl["fps"]
    starts = [s["start"] / fps for s in tl["scenes"][1:]]
    total = tl["totalFrames"] / fps + 0.6

    sfx_dir = ROOT / "public/audio/sfx"
    for name, fn in {
        "whoosh": whoosh,
        "pop": pop,
        "hit_soft": hit_soft,
        "thud_low": thud_low,
        "glitch": glitch,
        "tick": tick,
        "chime_resolve": chime_resolve,
        "riser": riser,
    }.items():
        save(sfx_dir / f"{name}.wav", fn())
        print("sfx", name)

    bed = music(total, starts)
    wav = ROOT / "public/audio/music/bed.wav"
    save(wav, bed, stereo=True)
    import subprocess

    subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", str(wav), "-b:a", "192k", str(wav.with_suffix(".mp3"))], check=True)
    wav.unlink()  # keep the repo small; Remotion plays the mp3
    rms = 20 * np.log10(np.sqrt(np.mean(bed ** 2)))
    print(f"music bed {total:.1f}s  rms {rms:.1f} dBFS")


if __name__ == "__main__":
    main()
