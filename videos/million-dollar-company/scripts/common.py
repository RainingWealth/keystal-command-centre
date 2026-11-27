import json, os, pathlib
ROOT = pathlib.Path(__file__).resolve().parent.parent
CFG = json.loads((ROOT / "src/config/production.json").read_text())
FPS = CFG["video"]["fps"]
WORK = ROOT / "work"
TTS_DIR = WORK / "tts"
PUB_AUDIO = ROOT / "public/audio"
NARR_DIR = PUB_AUDIO / "narration"
SFX_DIR = PUB_AUDIO / "sfx"
DATA = ROOT / "src/data"
OUT = ROOT / "output"
SR = 48000
for d in (WORK, TTS_DIR, NARR_DIR, SFX_DIR, DATA, OUT):
    d.mkdir(parents=True, exist_ok=True)

def segments():
    for sc in CFG["scenes"]:
        for sg in sc["segments"]:
            yield sc, sg
