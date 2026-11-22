import os, json, numpy as np, soundfile as sf
H = os.path.dirname(os.path.abspath(__file__)); W = f"{H}/work"; PUB = os.path.abspath(f"{H}/../../public/audio")
TL = json.load(open(f"{W}/timeline.json")); SR = 48000
ref, _ = sf.read(f"{W}/mix_reference.wav"); bed, sr = sf.read(f"{PUB}/bed.wav"); assert sr == SR
N = len(ref); print("bed len %.3f s, ref len %.3f s" % (len(bed) / SR, N / SR), sf.info(f"{PUB}/bed.wav").subtype)
vo = np.zeros((N, 2)); on = []
db = lambda x: 20 * np.log10(np.sqrt(np.mean(x ** 2)) + 1e-12)
for L in TL["lines"]:
    y, s_ = sf.read(f"{PUB}/vo/{L['id']}.wav"); assert s_ == SR and y.shape[1] == 2
    s = int(L["t"] * SR); vo[s:s + len(y)] += y
    idx = np.argmax(np.abs(y).max(1) > 10 ** (-40 / 20)); on.append((L["id"], L["t"], L["t"] + idx / SR))
unl, _ = sf.read(f"{W}/mix_unlimited.wav")
tot = bed + vo
print("bed+vo vs UNLIMITED mix: max abs diff %.2e" % np.abs(tot - unl).max())
d = np.abs(tot - ref)
print("sum check: max abs diff %.2e (unlimited-vs-limited region incl.), median %.2e; diff excluding limiter-engaged samples: %.2e" % (d.max(), np.median(d), d[np.abs(ref) < .94].max()))
for a, b in [(17.96, 19.0), (37.0, 37.5)]:
    seg = tot[int(a * SR):int(b * SR)]; print("rms %.2f-%.2f s: %.1f dBFS" % (a, b, db(seg)))
ok = True
for i, t0, t1 in on:
    dt = (t1 - t0) * 1000; ok &= abs(dt) <= 25; print(f"onset {i}: timeline {t0:.3f}  first>-40dBFS {t1:.3f}  d={dt:+.1f} ms")
print("ONSETS OK" if ok else "ONSETS FAIL")
