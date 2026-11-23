#!/usr/bin/env python3
"""Score, foley, voice and mix for 'The Partner Who Never Came Back'. Everything reads timeline.json, so sound lands on the same numbers as the picture.
Writes out/mix.wav (stereo, 48 kHz) plus stems (voice / music / sfx) for revisions."""
import os, sys, json
import numpy as np, soundfile as sf
from scipy.signal import resample_poly, sosfilt, butter
HERE = os.path.dirname(os.path.abspath(__file__)); LIB = os.environ.get('LIB', '/home/user/lemomo-ai/lemo-opuscar'); sys.path.insert(0, LIB)
from core.audio import sampler as S
from core.audio.sfx import SR, add, limit, compress, bp, lp, hp, noise, brown, env_exp, t_, norm, click, clack, ding, thump
TL = json.load(open(os.path.join(HERE, 'timeline.json'))); TOTAL = TL['dur']; H = TL['hit']; N = int((TOTAL + .8) * SR)
rng = np.random.default_rng(2026); S.seed(7)
I = lambda t: int(round(t * SR))
db = lambda x: 10 ** (x / 20)

# ------------------------------------------------------------------ voice
PAN = dict(n=0, a=-.12, d=.12, s=.1, e=-.06, h=0, c=.08)
voice = np.zeros((N, 2), np.float32)
for lid, info in TL['lines'].items():
    x, sr = sf.read(os.path.join(HERE, 'audio', 'voices', lid + '.wav'), dtype='float32'); x = x if x.ndim == 1 else x.mean(1)
    x = resample_poly(x, SR // sr, 1).astype(np.float32); x = hp(x, 70)
    if lid[0] == 'h':                                   # the hospital voice is on a phone: narrow band, a little grit
        x = bp(x, 320, 3300, 3); x = np.tanh(x * 2.2) / np.tanh(2.2); x = x + bp(rng.standard_normal(len(x)).astype(np.float32), 800, 3500) * .004
    x = compress(x, thr=.16, ratio=4.0)
    act = np.abs(x) > .02 * np.abs(x).max(); rms = np.sqrt(np.mean(x[act] ** 2)); x = x * (db(-19 if lid[0] != 'h' else -23) / rms)
    add(voice, x.astype(np.float32), info['t'], 1.0, PAN.get(lid[0], 0))
for c in range(2): voice[:, c] = limit(voice[:, c], .55)
speech = np.abs(voice).max(1)
from scipy.ndimage import uniform_filter1d, maximum_filter1d
env = np.clip(uniform_filter1d(maximum_filter1d(speech, size=int(.05 * SR)), size=int(.25 * SR)) * 6, 0, 1)
env = uniform_filter1d(env, size=int(.4 * SR))

# ------------------------------------------------------------------ music
ev = []
def P(t, p, d, v=.5, pan=0.0, inst='piano', g=1.0, **k): ev.append(dict(t=float(t), inst=inst, pitch=p, dur=float(d), vel=float(v), pan=float(pan), gain=float(g), **k))
def hum(t): return rng.normal(0, .004)                           # (kept for symmetry; humanising is per-note below)
def hz(t): return t + rng.normal(0, .012)                        # a human 12 ms of looseness
CH = dict(D=['D4', 'F#4', 'A4', 'D5', 'F#5'], A=['A3', 'E4', 'A4', 'C#5', 'E5'], Bm=['B3', 'F#4', 'B4', 'D5', 'F#5'], G=['G3', 'D4', 'G4', 'B4', 'D5'],
          Em=['E4', 'G4', 'B4', 'E5', 'G5'], Fs=['F#3', 'C#4', 'F#4', 'A#4', 'C#5'])
ROOT = dict(D='D2', A='A1', Bm='B1', G='G1', Em='E2', Fs='F#1'); MID = dict(D='D3', A='A2', Bm='B2', G='G2', Em='E3', Fs='F#2')
def arp(t0, ch, beat, pat, v, inst='piano', pan=0.0):                 # eighth-note arpeggio, `pat` indexes the chord tones
    for i, k in enumerate(pat): P(hz(t0 + i * beat / 2), CH[ch][k], beat * 1.6, v * (1.12 if i % 4 == 0 else 1) * (.9 + .1 * rng.random()), pan, inst)

# S1: hopeful, 84 bpm, D major  (piano enters 0.2 s before the flashback: J-cut)
b1 = 60 / 84; bar1 = 4 * b1; t = 2.5
for k, ch in enumerate(['D', 'A', 'Bm', 'G', 'D']):
    tb = t + k * bar1; P(tb, ROOT[ch], bar1 * .95, .42, -.1); P(tb + .02, MID[ch], bar1 * .9, .32, .1); arp(tb, ch, b1, [0, 2, 3, 2, 4, 3, 2, 1], .30, pan=.05)
MEL = [(0, 'F#5', 1.5), (1.5, 'A5', .5), (2, 'B5', 2)], [(0, 'C#6', 1.5), (1.5, 'B5', .5), (2, 'A5', 2)], [(0, 'D6', 1.5), (1.5, 'C#6', .5), (2, 'B5', 2)], [(0, 'B5', 1), (1, 'A5', 1), (2, 'G5', 2)], [(0, 'A5', 2), (2, 'F#5', 2)]
for k in range(1, 5):
    for (bt, pn, dd) in MEL[k]: tt = t + k * bar1 + bt * b1; P(hz(tt), pn, dd * b1 * .95, .5, .1, 'piano'); P(hz(tt) + .01, pn, dd * b1, .26, .2, 'glockenspiel')
for k, ch in enumerate(['D', 'A', 'Bm', 'G']):
    tb = 8.8 + k * bar1
    if tb < 15.2:
        for n_, pn in enumerate(CH[ch][:3]): P(tb, pn, bar1 * 1.05, .26, (-.2, 0, .2)[n_], 'violins', attack=.35)
        P(tb, MID[ch], bar1 * 1.05, .26, 0, 'cellos', attack=.4)
P(H['cupclink'], 'A6', 1.5, .45, .2, 'glockenspiel'); P(14.4, 'D6', 2.0, .45, .2, 'glockenspiel')
# S2: the call: the music thins to two held notes and goes uneasy
P(15.3, 'D3', 8.3, .30, -.1, 'cellos', attack=.8); P(15.3, 'A3', 8.3, .24, .1, 'cellos', attack=.8); P(15.6, 'D4', 3, .30, 0); P(18.4, 'A3', 3.5, .28, 0)
P(18.2, 'B2', 5.4, .26, 0, 'cellos', attack=1.0); P(18.2, 'F#3', 5.4, .20, .1, 'cellos', attack=1.0)
for tt, pn, v in [(20.6, 'F#5', .16), (22.0, 'D6', .2), (23.0, 'B5', .24)]: P(tt, pn, 1.6, v, .15, 'violins_trem', attack=.5)
# the cut: everything below is killed at silence0, so notes started here are dressing only; the first sound back is one low piano note
# S3: restrained piano, 56 bpm, B minor
P(H['piano_low'], 'B2', 6.0, .33, -.05); P(H['piano_low'] + .01, 'B1', 6.0, .30, -.05)
b3 = 60 / 56; bar3 = 4 * b3; t = 29.9
for k, ch in enumerate(['Bm', 'G', 'D', 'A', 'Bm', 'G', 'D']):
    tb = t + k * bar3
    if tb > 56.0: break
    P(tb, ROOT[ch], bar3 * .95, .34, -.1); P(hz(tb + 2.5 * b3), CH[ch][1], b3 * 3, .22, .1); P(hz(tb + 3.5 * b3), CH[ch][3 if k % 2 else 2], b3 * 3, .2, .15)
for tt, ch in [(36.1, 'Bm'), (42.7, 'G')]: P(tt, MID['Bm' if ch == 'Bm' else 'G'], 8, .18, 0, 'cellos', attack=2.0)
P(36.1, 'F#3', 14, .16, .1, 'cellos', attack=2.5); P(47.8, 'B2', 9, .22, 0, 'cellos', attack=1.5); P(47.8, 'D4', 9, .14, .1, 'violas', attack=1.5)
# S4: the crisis: cello/bass pulse, rising, 72 bpm
b4 = 60 / 72
for k in range(int((74.0 - 56.4) / b4)):
    tt = 56.6 + k * b4; r = (tt - 56.4) / 17.6; pn = 'B2' if k % 4 != 3 else 'F#3'
    P(tt, pn, b4 * .55, .24 + .38 * r, -.1, 'cellos_spic'); 
    if k % 2 == 0: P(tt, 'B1', b4 * 1.8, .22 + .3 * r, 0, 'contrabass')
for tt, pn in [(63.8, 'B5'), (66.8, 'D6'), (69.8, 'F6'), (72.2, 'B5')]: P(tt, pn, 3.2, .22 + .25 * (tt - 63) / 10, .2, 'violins_trem', attack=.9)
for k, tt in enumerate(np.arange(64.3, 73.5, b4 * 2)): P(tt, 'B1', 1.2, .25 + .03 * k, 0, 'timpani')
# S6/S7: the plan, then the calm: 76 bpm, D major
b6 = 60 / 76; bar6 = 4 * b6; t6 = 79.2
PROG = ['D', 'A', 'Bm', 'G', 'D', 'A', 'G', 'A']
for k, ch in enumerate(PROG):
    tb = t6 + k * bar6; ramp = min(1, k / 4)
    P(tb, ROOT[ch], bar6 * .95, .40, -.1); P(tb + .02, MID[ch], bar6 * .9, .30, .1)
    arp(tb, ch, b6, [0, 2, 3, 2, 4, 3, 2, 1] if k < 6 else [0, 3, 2, 3, 0, 3, 2, 3], .26 + .1 * ramp, pan=.05)
    if k >= 1: arp(tb + b6 / 4, ch, b6, [1, 3, 4, 3, 2, 4, 3, 2], .20, 'harp', pan=-.15)
    if k >= 2:
        for n_, pn in enumerate(CH[ch][:3]): P(tb, pn, bar6 * 1.03, .22 + .1 * ramp, (-.25, 0, .25)[n_], 'violins', attack=.4)
        P(tb, MID[ch], bar6 * 1.03, .24 + .08 * ramp, 0, 'cellos', attack=.4)
    if k >= 4: P(tb, CH[ch][1], bar6 * 1.03, .2, -.1, 'violas', attack=.4)
for i, tt in enumerate([H['step'][0], H['step'][1], H['step'][2]]): P(tt, ['A5', 'C#6', 'D6'][i], 1.8, .5, .2, 'glockenspiel')
for k in range(2, 7):
    tb = t6 + k * bar6
    for (bt, pn, dd) in MEL[(k - 1) % 4]: P(hz(tb + bt * b6), pn, dd * b6 * .95, .42 + .06 * min(1, (k - 2) / 3), .1, 'violins' if k in (4, 5, 6) else 'piano', attack=.12 if k in (4, 5, 6) else 0)
P(103.6, 'D3', 6.0, .3, 0, 'horn', attack=.6)
# the resolution lands just after the last word of the narration
tr = 107.35
for n_, pn in enumerate(['D3', 'A3', 'D4', 'F#4', 'A4']): P(tr, pn, 7.0, .34, (-.3, -.1, 0, .1, .3)[n_], 'violins' if n_ > 2 else 'violas', attack=.5)
P(tr, 'D2', 8, .36, 0, 'cellos', attack=.5); P(tr, 'D3', 8, .3, 0, 'horn', attack=.7); P(tr, 'D2', 8, .4, 0, 'piano'); P(tr + .01, 'A3', 8, .35, .1, 'piano'); P(tr + .02, 'F#4', 8, .3, -.1, 'piano')
for i, pn in enumerate(['D4', 'F#4', 'A4', 'D5', 'F#5', 'A5', 'D6']): P(tr - .6 + i * .09, pn, 3, .30, -.3 + .1 * i, 'harp')
# S8: sunrise and card: the opening theme once more, slow, over a held chord
for (bt, pn, dd) in MEL[0] + [(4, 'C#6', 1.5), (5.5, 'B5', .5), (6, 'A5', 3)]: tt = 108.6 + bt * 60 / 70; P(hz(tt), pn, dd * 60 / 70 * .95, .46, .1, 'piano'); P(tt + .01, pn, dd * 60 / 70, .24, .2, 'glockenspiel')
P(112.0, 'D3', 8, .22, 0, 'cellos', attack=1.0); P(112.0, 'A4', 8, .18, .15, 'violins', attack=1.0); P(115.0, 'D4', 4.5, .34, 0); P(115.02, 'A4', 4.5, .3, .1); P(115.04, 'F#5', 4.5, .26, -.1)
print('rendering score:', len(ev), 'notes'); sys.stdout.flush()
music = S.render(ev, dur=N / SR, master=False).astype(np.float32)
if len(music) < N: music = np.pad(music, ((0, N - len(music)), (0, 0)))
music = S.room(music[:N], size=.5, mix=.22)[:N].astype(np.float32)
gm = np.ones(N, np.float32)                                           # the hard cut at silence0 and the second silence at the freeze (picture holds, music stops)
def cut(a, b, fade=.03):
    gm[I(a):I(b)] = 0; n = I(fade); gm[I(a) - n:I(a)] = np.minimum(gm[I(a) - n:I(a)], np.linspace(1, 0, n))
cut(H['silence0'], H['silence1'] - .02, .02); cut(H['freeze'] + .05, 79.15, .08)
gm[I(118.0):I(TOTAL)] *= np.linspace(1, 0, I(TOTAL) - I(118.0)); gm[I(TOTAL):] = 0
music *= gm[:, None]
sw = [dict(t=0.0, inst='violins', pitch=p_, dur=2.8, vel=.55, pan=pn, gain=1.0, attack=.25) for p_, pn in (('D4', -.3), ('A4', 0), ('F#5', .3), ('D5', .1))] + [dict(t=0.0, inst='cellos', pitch='D3', dur=2.8, vel=.55, pan=0, gain=1.0, attack=.25), dict(t=0.0, inst='horn', pitch='A2', dur=2.8, vel=.4, pan=0, gain=1.0, attack=.3)]
sw += [dict(t=.12 * i, inst='harp', pitch=p_, dur=2.0, vel=.5, pan=-.2 + .08 * i, gain=1.0) for i, p_ in enumerate(['D4', 'A4', 'D5', 'F#5', 'A5'])]
swb = S.room(S.render(sw, dur=4.6, master=False).astype(np.float32), size=.7, mix=.35).astype(np.float32)[::-1].copy()
swb = swb[len(swb) - I(2.75):]; swb *= np.minimum(1, np.arange(len(swb)) / (.2 * SR))[:, None] * np.minimum(1, (len(swb) - np.arange(len(swb))) / (.05 * SR))[:, None]
a0 = I(H['rewind0'] + .02); music[a0:a0 + len(swb)] += swb[:max(0, N - a0)] * .5

# ------------------------------------------------------------------ foley and beds
sfx = np.zeros((N, 2), np.float32)
def bed(a, b, x, g, fi=.6, fo=.6, pan=0.0):
    n = I(b - a); y = x[:n].copy() if len(x) >= n else np.pad(x, (0, n - len(x))); y *= np.minimum(1, np.minimum(np.arange(n) / (fi * SR), (n - np.arange(n)) / (fo * SR))); add(sfx, y, a, g, pan)
tone = lambda d, f0, f1, g=1.0: norm(lp(brown(d), f1) * .8 + hp(lp(noise(d), f1 * 2), f0) * .05) * g
def buzz(v=1.0):
    d = .55; tt = t_(d); on = (np.sin(2 * np.pi * 7 * tt) > -.1).astype(float); return norm(np.sign(np.sin(2 * np.pi * 168 * tt)) * lp(on, 60) * env_exp(d, .5) + bp(noise(d), 800, 2500) * .08 * on) * v
def ring(v=1.0):
    d = .9; tt = t_(d); g = (np.sin(2 * np.pi * 20 * tt) > 0).astype(float); g = lp(g, 120) * np.minimum(1, (d - tt) / .05) ; return norm((np.sin(2 * np.pi * 440 * tt) + np.sin(2 * np.pi * 480 * tt)) * g * env_exp(d, 1.2)) * v
def paper(d=.4, v=1.0): tt = t_(d); e = (np.abs(np.sin(2 * np.pi * 9 * tt + rng.random() * 6)) ** 2) * np.minimum(1, tt / .03) * np.minimum(1, (d - tt) / .1); return norm(bp(noise(d), 1800, 7000, 2) * e) * v
def pen(d=.5, v=1.0): tt = t_(d); e = (.6 + .4 * np.sin(2 * np.pi * 14 * tt)) * np.minimum(1, tt / .02) * np.minimum(1, (d - tt) / .08); return norm(hp(noise(d), 3200) * e) * v
def beep(f=1000, d=.14, v=1.0): tt = t_(d); return np.sin(2 * np.pi * f * tt) * np.minimum(1, np.minimum(tt / .005, (d - tt) / .01)) * v
def tapestop(d=.75, v=1.0): tt = t_(d); f = 520 * np.exp(-tt * 4.8) + 30; ph = 2 * np.pi * np.cumsum(f) / SR; return norm((np.sin(ph) + .4 * np.sin(2 * ph)) * env_exp(d, .4) + bp(noise(d), 200, 1800) * .12 * env_exp(d, .3)) * v
def whir(d, v=1.0): tt = t_(d); f = 220 + 2400 * (tt / d) ** 1.6; ph = 2 * np.pi * np.cumsum(f * (1 + .02 * np.sin(2 * np.pi * 31 * tt))) / SR; return norm(np.sin(ph) * .5 + bp(noise(d), 600, 4000) * .5 * (.5 + .5 * np.sin(2 * np.pi * 45 * tt))) * v * np.minimum(1, tt / .3)
def shimmer(d=1.6, v=1.0, f0=880): tt = t_(d); y = sum(np.sin(2 * np.pi * f0 * m * tt + rng.random() * 6) * (1 / m) for m in (1, 1.5, 2, 3, 4)) * (tt / d) ** .6 * env_exp(d, .5) ; return norm(y + hp(noise(d), 5000) * .1 * env_exp(d, .5)) * v
def bird(v=1.0): d = .22; tt = t_(d); f = 3200 + 1800 * np.sin(np.pi * tt / d) ** 2; return np.sin(2 * np.pi * np.cumsum(f) / SR) * np.sin(np.pi * tt / d) ** 1.5 * v
def thud(v=1.0): return thump(v, 90)
# beds
bed(0, 2.9, tone(3, 40, 260), .07, .3, .6)                                              # hospital HVAC
add(sfx, tapestop(.2) * 0, 0)                                                           # placeholder (kept for symmetry)
for tt in H['buzz']: add(sfx, buzz(.9), tt, .32, -.1)
add(sfx, shimmer(1.4, .8, 660), 1.7, .22)                                              # the phone's light opens the flashback
bed(2.7, 8.8, tone(7, 80, 900), .035, .6, .6)                                           # shophouse street
add(sfx, pen(.7, .9), H['pen'] - .3, .22); add(sfx, clack(1.2, .9), H['shake'], .25); add(sfx, clack(.9, .7), H['shake'] + .12, .15)
bed(5.0, 8.9, tone(4, 50, 500), .05, .4, .5)                                           # engine / street
for tt in np.arange(6.4, 7.3, .5): add(sfx, beep(1000, .14, .5), tt, .07, .2)           # forklift beeps
for tt in (5.2, 8.8): add(sfx, paper(.35, .8), tt - .2, .06)
bed(8.8, 15.4, tone(7, 60, 700), .04, .5, .5)                                          # warehouse floor, distant
add(sfx, ding(1.0) * .9, H['cupclink'], .17, .1); add(sfx, ding(1.0) * .9, 14.4, .17, .1)
bed(15.2, 24.0, tone(9, 40, 420), .06, .8, .08)                                         # night city / office hum
for tt in H['ring']: add(sfx, ring(.9), tt, .16, .1)
add(sfx, click(.8) * .8, H['answer'], .22)
bed(24.0, 26.9, tone(3, 30, 180), .018, .15, .6)                                       # room tone: the only sound in the silence
add(sfx, click(.5) * .7, H['farwin_off'], .22, .2)
bed(26.7, 56.6, tone(30, 40, 300), .05, 1.0, 1.0)                                       # aircon, quiet
for tt in H['paper']: add(sfx, paper(.5, .9), tt, .1)
bed(56.4, 74.2, tone(18, 40, 260), .05, .6, .15)
for tt in np.arange(62.2, 74.0, 1.0): add(sfx, click(.55) * .5, tt, .08, .3)              # clock tick under the late-night shots
add(sfx, paper(.5, .9), 70.0, .12); add(sfx, thud(.6), 70.8, .1); add(sfx, thud(.55), 71.5, .09); add(sfx, pen(.6, .8), 71.7, .12)
add(sfx, tapestop(.75, .9), H['freeze'] + .05, .3)
bed(H['freeze'] + .1, 75.8, tone(2, 30, 200), .03, .2, .2)                              # the lamp's hum in the near-silence
add(sfx, whir(2.4, .9), H['rewind0'], .14)
for k, tt in enumerate(np.cumsum(np.linspace(.2, .06, 14)) + 75.9): add(sfx, paper(.12, .8), tt, .09)   # calendar leaves, faster and faster
add(sfx, click(.6) * .9, H['lampon'], .3); add(sfx, shimmer(1.8, .9, 523), H['lampon'], .24)
bed(79.4, 97.6, tone(18, 40, 520), .035, .6, .5)                                        # warm room
for tt in H['step']: add(sfx, paper(.45, .9), tt, .13); add(sfx, thud(.5), tt + .35, .07)
add(sfx, paper(.5, .9), H['docslide'][0], .14); add(sfx, pen(.9, .9), H['signature'][0], .14); add(sfx, thud(.4), 101.2, .06)
bed(102.0, 104.9, tone(3, 50, 600), .05, .3, .3); add(sfx, beep(1000, .14, .5), 103.0, .06, .3); add(sfx, beep(1000, .14, .5), 103.6, .06, .3); add(sfx, thud(.7), 103.2, .1)
bed(104.8, 108.0, tone(3, 30, 400), .045, .4, .4)                                       # evening, a block of flats
bed(107.9, 119.7, tone(12, 40, 600), .04, 1.0, 1.0)
for tt in (108.1, 108.9, 109.6, 110.3): add(sfx, bird(.5), tt, .04, rng.uniform(-.4, .4)); add(sfx, bird(.4), tt + .12, .03, rng.uniform(-.4, .4))
for tt in H['card']: add(sfx, shimmer(1.6, .8, 698), tt, .13)
for c in range(2): sfx[:, c] = sfx[:, c] * np.where(np.arange(N) < I(TOTAL), 1, 0)

# ------------------------------------------------------------------ balance: voice ~ 10 dB over music, music ducks 6 dB under speech
duck_m = 1 - env * (1 - db(-6.5)); duck_s = 1 - env * (1 - db(-3.0))
lift = np.where(np.arange(N) > I(107.3), db(3.5), 1.0).astype(np.float32); music_b = music * duck_m[:, None] * lift[:, None] * db(-.5); sfx_b = sfx * duck_s[:, None] * db(1.5)
mix = voice + music_b + sfx_b
for c in range(2): mix[:, c] = limit(mix[:, c], .8)
mix = mix[:I(TOTAL + .3)]
os.makedirs(os.path.join(HERE, 'out'), exist_ok=True)
sf.write(os.path.join(HERE, 'out', 'mix.wav'), mix, SR, subtype='PCM_24')
for nm, st in (('voice', voice), ('music', music_b), ('sfx', sfx_b)): sf.write(os.path.join(HERE, 'out', f'stem_{nm}.wav'), st[:I(TOTAL + .3)], SR, subtype='PCM_24')
print('mix written', mix.shape, 'peak', float(np.abs(mix).max()))
used = sorted({e['inst'] for e in ev}); open(os.path.join(HERE, 'out', 'music_instruments.txt'), 'w').write('\n'.join(used)); print('instruments:', used)
