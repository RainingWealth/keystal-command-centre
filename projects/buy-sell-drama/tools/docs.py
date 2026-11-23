#!/usr/bin/env python3
"""Generates script.md and storyboard.md from timeline.json + audio/lines.json, so the documents always match the film."""
import json, os
HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
TL = json.load(open(os.path.join(HERE, 'timeline.json'))); LN = {l['id']: l for l in json.load(open(os.path.join(HERE, 'audio', 'lines.json')))}
fmt = lambda t: f'{int(t // 60)}:{t % 60:05.2f}'
WHO = dict(n='Narrator', d='Daniel', a='Aaron', s='Sarah', e='Estate representative', h='Hospital (on the phone)', c='Accountant')
VOICE = dict(bm_george='bm_george', bm_lewis='bm_lewis', bm_daniel='bm_daniel', bm_fable='bm_fable', bf_emma='bf_emma', bf_alice='bf_alice', bf_isabella='bf_isabella')
SCENES = [('S1 Two friends, one dream', 0, 15.2), ('S2 The call', 15.2, 26.7), ('S3 The ownership problem', 26.7, 56.4), ('S4 The crisis', 56.4, 74.0), ('S5 Rewind: what if they had prepared?', 74.0, 79.4),
          ('S6 The Buy-Sell solution', 79.4, 97.6), ('S7 The alternate outcome', 97.6, 107.9), ('S8 Final message and call to action', 107.9, TL['dur'])]

# ---------------- script.md
o = ['# Script: THE PARTNER WHO NEVER CAME BACK', '', f'Runtime {TL["dur"]} s, 9:16, English. Times are film time (m:ss). Voices are Kokoro (offline text-to-speech); speaker, then line as spoken. ',
     'Lines marked **(added)** are not in the brief; they were added to meet a requirement of the brief (see production_review.md).', '']
for name, a, b in SCENES:
    o += [f'## {name}  ({fmt(a)} to {fmt(b)})', '', '| Time | Speaker | Line | Voice |', '|---|---|---|---|']
    for lid, info in TL['lines'].items():
        if a <= info['t'] < b:
            add = ' **(added)**' if lid in ('e01', 'd02', 's02') else ''
            o.append(f"| {fmt(info['t'])} | {WHO[lid[0]]} | {LN[lid]['text']}{add} | {LN[lid]['voice']} |")
    strips = [s for s in TL['strips'] if a <= s['t0'] < b]
    if strips:
        o += ['', '**On-screen text (paper):**', '']
        for s in strips:
            txt = ' / '.join(s['lines']) if 'lines' in s and s['kind'] != 'example' else (s['label'] + ': ' + s['value'] if s['kind'] == 'card' else (s['n'] + ' ' + s['head'] + ': ' + s['sub'] if s['kind'] == 'step' else (' · '.join(f"{r[0]} {r[1]}" for r in s['lines']) + '. ' + s['note'] if s['kind'] == 'example' else (s['title'] + ' / ' + s['tag'] + ' / ' + s['cta']))))
            o.append(f"- {fmt(s['t0'])}: {txt}")
    o.append('')
o += ['## Burned-in captions', '', 'Captions follow the spoken lines (digits for numbers, speaker name above dialogue). The same cues are in `subtitles.srt`.', '']
open(os.path.join(HERE, 'script.md'), 'w').write('\n'.join(o) + '\n')

# ---------------- storyboard.md
SB = {
 'corridor': ('Wide, tunnel-book corridor; Aaron full figure at left third', 'Slow dolly in (3 cm), flicker on one tube light', 'Aaron outside a hospital room reads his buzzing phone; the screen is the brightest thing in the frame', 'The hook: a person, a glowing phone, a cold corridor. No explanation yet, only dread. 0 to 3 s'),
 'contract': ('Medium two-shot over the desk', 'Gentle push in', 'Young Aaron signs the first contract; Daniel leans in; they shake hands and Daniel claps his shoulder', 'The iris from the phone glow opens on warmth: the contrast is the cut. Flashback ladder (amber)'),
 'growth': ('Wide lateral travel with depth parallax', 'Truck-left past three buildings: shophouse office, warehouse, tower', 'Years pass: two silhouettes at a lamp-lit desk, a forklift at work, a delivery van crossing, a taller building with lit windows', 'Fifteen years in 3.6 s without a single caption; depth as distance'),
 'toast': ('Medium two-shot, loft office against the warehouse floor at dusk', 'Slow push in over 6.4 s', 'Daniel gestures at the floor behind them; they clink paper cups on "from nothing" and again on "bigger"', 'The happy peak of the film, held long enough to be loved before it is taken away'),
 'tower': ('Wide exterior, night; one lit window in a dark tower; a distant block with one lit window', 'Dolly in toward Aaron\'s window', 'Aaron at his desk; the phone rings twice (his window flutters)', 'Two windows, one light: the film\'s native image. The viewer learns who is connected to whom'),
 'call': ('Medium, Aaron seated, city behind', 'Slow push in, slight rise', 'He answers, raises the phone, listens; his shoulders drop; the hand comes down; the head bows', 'No lip-sync: the news is carried by posture. Music cuts on the word "Daniel"'),
 'window': ('Wide exterior again', 'Dolly out', 'The far window goes dark with a click; Aaron\'s stays lit', 'Silence plus one visual fact tells the death without showing anything. The text strip arrives on top'),
 'meetwide': ('Wide, meeting room, three seated', 'Slow dolly in', 'Aaron, the estate representative and Sarah around a table under one pendant lamp', 'Orientation: who is in the room and how far apart they sit'),
 'sarah': ('Over-the-shoulder; Aaron\'s blurred shoulder in the foreground, Sarah lit', 'Slow push in', 'Sarah speaks; her open hand rises on "financial security"', 'The family\'s need, seen from Aaron\'s side. Rack-focus feel from the blurred sheet'),
 'estate': ('Medium three-shot, representative centre with a folder', 'Slow push toward the folder', 'The representative explains the estate process; Sarah and Aaron listen', 'Makes clear that the shares are part of the estate and the transfer follows legal documents'),
 'aaronclose': ('Close profile, Aaron; blurred lamp bokeh behind', 'Push in', 'Hand to chin, then down; he looks at the table', 'The emotional close-up: the owner who wants to buy and cannot'),
 'accounts': ('Top-down on the ledger', 'Slow push', 'A hand follows the figures down the page; paper strips write S$2,000,000, S$1,000,000, "Insufficient"', 'Valuation is not cash: the three numbers arrive one by one. Seal-red only for the problem'),
 'accountant': ('Over-the-shoulder, accountant across the desk', 'Slow push', 'Counts off the options with hand beats: borrow, sell, new investor', 'The options are all bad; the city is cold and far'),
 'latedesk': ('Medium, Aaron alone', 'Dolly out (loneliness)', 'Head in hand under the lamp; a clock on the wall', 'Montage beat 1: the late night'),
 'photos': ('Medium, Sarah at home facing a shelf of lit family photos', 'Push in', 'Her head lowers as she looks at the frames', 'Montage beat 2: what she is protecting. Silhouettes in the frames are family'),
 'employees': ('Medium wide, four employees huddled on the warehouse floor; the loft light on above', 'Slow lateral drift', 'Heads together, watching the loft window where Aaron stands', 'Montage beat 3: the business is people too'),
 'loandoc': ('Top-down on a loan agreement', 'Push in', 'A pen hovers over the signature line and will not land', 'Montage beat 4: the bad option, one signature away'),
 'register': ('Close on the register of members; Aaron\'s head at the bottom', 'Push in', 'DANIEL 50% fades; AARON 50%; an empty line with "?"', 'Montage beat 5: the missing plan, drawn as a blank'),
 'pullback': ('The film pulls out: the box is a lamp on a table in a dark room', 'Pull back (the signature move)', 'The register scene keeps playing inside the wooden box', 'Native move at the emotional peak: the story is an object that can be turned back'),
 'rewind': ('Locked on the lamp', 'Locked; the film inside runs backwards at accelerating speed', 'Calendar leaves flip backwards; tape ghosting; the lamp\'s story rewinds through every earlier shot', 'The rewind, drawn from the film\'s own frames'),
 'prepared': ('Lamp, then push into it', 'Push in until the box fills the frame', 'The lamp is switched on; the same room, earlier, warm, both founders alive', 'Light off to on: hope. Transition into the plan'),
 'advisers': ('Medium wide, meeting room, golden light', 'Slow push', 'Aaron, Daniel and an adviser with a folder; Daniel speaks, gesturing', 'The same room as the loss, but bright, and Daniel is in it'),
 'steps': ('Top-down on the table; three paper tokens', 'Slow push', 'Agreement with a seal, a shield with a tick, a pie with an arrow; each lands on its sentence', 'Agree, fund, transfer: the three steps as objects, not slides'),
 'example': ('Frontal, a paper pie split in two with Daniel and Aaron on each half', 'Gentle push', 'The S$2 million split 50/50; illustrative numbers on a card', 'One simple example; labelled illustrative'),
 'buyout': ('Medium wide, same room, calm', 'Slow push', 'The agreed documents slide to Sarah; she receives them; she says thanks', 'The echo of the problem scene with the problem removed'),
 'workers': ('Medium wide, warehouse in daylight', 'Slow lateral', 'Employees carry boxes; a forklift works', 'The business carries on'),
 'home': ('Wide on a block of flats, one lit window with Sarah and two children', 'Dolly out to reveal the block', 'Sarah hugs a child; the camera draws back to many lit windows', 'The family is fine: one window among many'),
 'sunrise': ('Medium wide, Aaron against the warehouse door and the sun', 'Slow push in', 'He looks out; sunrise grows behind the racks', 'The ending that echoes the opening: a person, a light'),
 'navy': ('Flat navy paper stack with a faint warm glow', 'Almost locked', 'End card: question, title, tagline, call to action, disclosure', 'Consultative close, neutral branding'),
}
o = ['# Storyboard: THE PARTNER WHO NEVER CAME BACK', '', 'Photoreal actors were not possible with this production engine (see production_review.md); the film is a paper-cut lightbox. Each shot below is one built scene; "camera" is the lightbox camera. Timings come from `timeline.json`.', '']
o += ['| # | Time | Shot | Framing | Camera | Action | Why |', '|---|---|---|---|---|---|---|']
for i, s in enumerate(TL['shots'], 1):
    f = SB[s['id']]; tr = s['tr']['type'] + (f" {s['tr']['d']}s" if s['tr']['d'] else '')
    o.append(f"| {i} | {fmt(s['t0'])} to {fmt(s['t1'])} | {s['id']} (in: {tr}) | {f[0]} | {f[1]} | {f[2]} | {f[3]} |")
o += ['', '## Colour and light', '', '- Hospital: cold teal. Flashback: amber and cream. Present: slate blue with one warm lamp. The plan and the calm outcome: gold. Sunrise: dawn orange. End card: navy.',
      '- Back sheets are bright and translucent, front sheets dark; one accent colour (seal red) is used only for the share, the agreement, the "Insufficient" mark and the step seals.', '',
      '## Characters (silhouette identity)', '', '- Aaron: cropped hair, stocky, rolled sleeves. Daniel: side-parted hair, glasses (cut as a hole so light shows through), a little taller. Sarah: shoulder-length hair, skirt. Accountant: bun, glasses, cardigan. Estate representative and adviser: jackets, slicked hair; the adviser wears glasses.', '']
open(os.path.join(HERE, 'storyboard.md'), 'w').write('\n'.join(o) + '\n')
print('docs written')
