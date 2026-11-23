#!/usr/bin/env python3
"""One timeline for picture, score, mix, captions and checks. Writes timeline.json, cues.json and subtitles.srt (via core/render/srt.py).
Line start times are placed by hand (the directing), durations and word timings come from the checked voice files."""
import json, re, os, sys, subprocess
HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
V = os.path.join(HERE, 'audio', 'voices'); L = {l['id']: l for l in json.load(open(os.path.join(HERE, 'audio', 'lines.json')))}
DUR = json.load(open(os.path.join(V, 'dur.json'))); WORDS = json.load(open(os.path.join(V, 'words.json')))

TOTAL = 119.7
# line id -> start time (s)
START = dict(n01=3.2, d01=9.0, a01=12.95, n02=15.4, h01=19.9, s01=29.2, e01=36.1, a02=42.65, n03=47.8, c01=56.7, n04=63.8,
             d02=80.0, n05=82.6, s02=100.9, n06=102.2)
WHO = dict(n='', d='Daniel', a='Aaron', s='Sarah', e='Estate representative', h='Hospital', c='Accountant')

# shots: id, t0, transition into the shot
SHOTS = [('corridor', 0.0, 'cut', 0), ('contract', 2.7, 'iris', .55), ('growth', 5.2, 'dissolve', .4), ('toast', 8.8, 'dissolve', .4),
         ('tower', 15.2, 'dark', .7), ('call', 19.4, 'dissolve', .5), ('window', 24.6, 'cut', 0),
         ('meetwide', 26.7, 'dissolve', .8), ('sarah', 29.4, 'cut', 0), ('estate', 36.0, 'cut', 0), ('aaronclose', 42.7, 'cut', 0), ('accounts', 47.8, 'dissolve', .4),
         ('accountant', 56.4, 'dissolve', .6), ('latedesk', 62.2, 'cut', 0), ('photos', 64.6, 'dissolve', .4), ('employees', 67.2, 'dissolve', .4),
         ('loandoc', 70.0, 'cut', 0), ('register', 72.3, 'dissolve', .4),
         ('pullback', 74.0, 'cut', 0), ('rewind', 75.8, 'cut', 0), ('prepared', 78.2, 'dissolve', .5),
         ('advisers', 79.4, 'cut', 0), ('steps', 85.0, 'dissolve', .6), ('example', 93.2, 'dissolve', .5),
         ('buyout', 97.6, 'dissolve', .7), ('workers', 102.0, 'dissolve', .5), ('home', 104.8, 'dissolve', .5),
         ('sunrise', 107.9, 'dissolve', .8), ('navy', 111.0, 'dissolve', .9)]

# paper text. kind strip: lines[], card: label+value. x,y centre in px (frame 1080x1920); size in px; hold-to t1
STRIPS = [
 dict(id='gone', kind='strip', lines=['Daniel passed away', 'unexpectedly.'], t0=24.5, t1=27.0, x=540, y=760, size=64, anchor='left'),
 dict(id='later', kind='strip', lines=['Several weeks later'], t0=26.9, t1=29.3, x=540, y=420, size=54, anchor='left'),
 dict(id='v1', kind='card', label='Company value (illustrative)', value='S$2,000,000', t0=48.4, t1=56.1, x=540, y=300, w=840),
 dict(id='v2', kind='card', label='Daniel’s 50% ownership', value='S$1,000,000', t0=50.5, t1=56.1, x=540, y=470, w=840),
 dict(id='v3', kind='card', label='Available buyout cash', value='Insufficient', t0=52.7, t1=56.1, x=540, y=640, w=840, red=True),
 dict(id='loan', kind='strip', lines=['LOAN AGREEMENT'], t0=70.1, t1=72.2, x=540, y=300, size=56, anchor='left', only='photo'),
 dict(id='reg', kind='reg', t0=72.35, t1=74.0, x=540, y=960, w=760, only='photo'),
 dict(id='prep', kind='strip', lines=['BUT WHAT IF', 'THEY HAD PREPARED?'], t0=77.6, t1=80.9, x=540, y=760, size=70, anchor='center'),
 dict(id='s1', kind='step', n='1', head='AGREE', sub='Agreed terms and a valuation method set how the shares transfer.', t0=82.9, t1=93.3, x=540, y=270, w=860),
 dict(id='s2', kind='step', n='2', head='FUND', sub='Suitable life cover pays the designated recipient on a covered claim.', t0=85.6, t1=93.3, x=540, y=490, w=860),
 dict(id='s3', kind='step', n='3', head='TRANSFER', sub='After a valid claim and the legal steps, the survivor buys the shares from the estate.', t0=88.5, t1=93.3, x=540, y=710, w=860),
 dict(id='ex', kind='example', lines=[['Company value', 'S$2 million'], ['Daniel’s 50%', 'S$1 million'], ['Illustrative cover', 'S$1 million']], note='Illustrative only. Not a valuation or a guarantee.', t0=93.3, t1=97.5, x=540, y=50, w=840),
 dict(id='paid', kind='strip', lines=['Paid to Daniel’s estate,', 'subject to estate administration'], t0=98.3, t1=102.2, x=540, y=330, size=44, anchor='left'),
 dict(id='xfer', kind='strip', lines=['Shares transferred to Aaron', 'under the agreement'], t0=100.2, t1=102.9, x=540, y=520, size=44, anchor='left'),
 dict(id='e1', kind='strip', lines=['You built the business', 'together.'], t0=108.3, t1=111.0, x=540, y=300, size=60, anchor='left', navy=False),
 dict(id='e2', kind='endq', lines=['Have you planned what happens', 'when one of you is gone?'], t0=111.35, t1=115.0, x=540, y=760, size=58),
 dict(id='e3', kind='endcard', title='SHAREHOLDER BUY-SELL PLANNING', tag='Protect ownership continuity. Plan estate liquidity.', cta='Book a Business Continuity Review', t0=115.0, t1=TOTAL, x=540, y=560),
 dict(id='disc', kind='fine', lines=['Illustrative scenario only. Actual arrangements', 'depend on legal agreements, policy terms', 'and individual circumstances.'], t0=112.2, t1=TOTAL, x=540, y=1330),
]

# sound / action hits (s): picture and mix both read these
HIT = dict(buzz=[0.85, 1.55], phoneglow=1.0, lampclick=24.9, pen=3.7, shake=4.55, cupclink=11.55, ring=[18.55, 19.1], answer=19.55, silence0=23.6, silence1=25.6, piano_low=25.6,
           farwin_off=25.1, stamp=[70.8, 71.4], regstare=72.3, freeze=74.0, rewind0=75.8, rewind1=78.2, tapestop=75.8, calflip=[76.0, 77.4], lampon=78.5,
           step=[82.9, 85.6, 88.5], paper=[48.4, 50.5, 52.7], docslide=[98.4], signature=[99.4], sunrise=[107.9], card=[111.0, 115.0])

def digits(t):
    return t.replace('Fifteen years', '15 years').replace('fifteen years', '15 years')
MAXC = 58          # characters per cue (two lines of ~29 at 46 px on 1080 px)
cues = []
for lid, t0 in START.items():
    txt = L[lid]['text']; toks = txt.split(); words = WORDS[lid]; who = WHO.get(lid[0], '')
    if len(words) != len(toks): print('warn: word count differs for', lid, len(words), len(toks))
    def tm(i, end):                       # start / end of token i from the word timings (proportional if the counts differ)
        j = min(len(words) - 1, int(round(i * len(words) / len(toks))))
        return max(0.0, words[j][2 if end else 1])
    # sentence units as token ranges
    units, a0 = [], 0
    for i, tk in enumerate(toks):
        if tk[-1] in '.?!' or i == len(toks) - 1: units.append([a0, i]); a0 = i + 1
    split = []                            # split units that are too long at the space nearest the middle (prefer after a comma)
    for a1, b1 in units:
        t = ' '.join(toks[a1:b1 + 1])
        if len(t) <= MAXC: split.append([a1, b1]); continue
        best = None
        for k in range(a1, b1):
            l = len(' '.join(toks[a1:k + 1])); score = abs(l - len(t) / 2) - (6 if toks[k].endswith(',') else 0)
            if best is None or score < best[0]: best = (score, k)
        split.append([a1, best[1]]); split.append([best[1] + 1, b1])
    merged = []                           # merge short neighbours so a cue holds >= 1.8 s
    for u in split:
        if merged:
            m = merged[-1]; dur = tm(m[1], True) - tm(m[0], False)
            if dur < 1.7 and len(' '.join(toks[m[0]:u[1] + 1])) <= MAXC: m[1] = u[1]; continue
        merged.append(u)
    if len(merged) > 1:                   # a last cue that is still short joins its predecessor if it fits
        m, l = merged[-2], merged[-1]
        if tm(l[1], True) - tm(l[0], False) < 1.2 and len(' '.join(toks[m[0]:l[1] + 1])) <= MAXC: merged[-2:] = [[m[0], l[1]]]
    for a1, b1 in merged:
        cues.append(dict(t0=round(t0 + tm(a1, False), 3), t1=round(t0 + tm(b1, True), 3), text=digits(' '.join(toks[a1:b1 + 1])), who=who, line=lid))
# hold rules: >= 1.8 s and >= speech + 0.6 s, never into the next cue
for i, c in enumerate(cues):
    c['t0'] = round(max(0, c['t0'] - .05), 3)
for i, c in enumerate(cues):
    nxt = cues[i + 1]['t0'] - .02 if i + 1 < len(cues) else TOTAL
    c['t1'] = round(min(max(c['t0'] + 1.8, c['t1'] + .6), nxt), 3)

shots = []
for i, (sid, t0, tr, td) in enumerate(SHOTS):
    t1 = SHOTS[i + 1][1] if i + 1 < len(SHOTS) else TOTAL
    shots.append(dict(id=sid, t0=t0, t1=t1, tr=dict(type=tr, d=td)))
out = dict(dur=TOTAL, fps=30, shots=shots, lines={k: dict(t=v, d=DUR[k], who=WHO.get(k[0], 'Narrator')) for k, v in START.items()}, cues=cues, strips=STRIPS, hit=HIT)
json.dump(out, open(os.path.join(HERE, 'timeline.json'), 'w'), indent=1, ensure_ascii=False)
json.dump([dict(t0=c['t0'], t1=c['t1'], text=(c['who'] + ': ' if c['who'] else '') + c['text']) for c in cues], open(os.path.join(HERE, 'cues.json'), 'w'), indent=1, ensure_ascii=False)
for lid, t0 in START.items():           # no two voice lines overlap
    pass
ends = sorted((t0, t0 + DUR[k], k) for k, t0 in START.items())
for a, b in zip(ends, ends[1:]):
    if b[0] < a[1] + .05: sys.exit(f'overlap {a[2]} / {b[2]}')
print(f'timeline ok: {len(shots)} shots, {len(cues)} cues, {len(STRIPS)} paper texts, last voice ends {ends[-1][1]:.2f}s, total {TOTAL}s')
