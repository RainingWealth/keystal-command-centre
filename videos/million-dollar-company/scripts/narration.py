"""Generate narration with Edge TTS (en-SG-WayneNeural), trim, clean and level it.
Writes work/tts/<id>.mp3 (raw), public/audio/narration/<id>.wav (48k mono), work/tts/<id>.json (word timings)."""
import asyncio, json, ssl, subprocess, sys, wave
import numpy as np
import edge_tts
import edge_tts.communicate as ec
from common import *

# The agent proxy re-terminates TLS: trust its CA bundle (verification stays ON).
ec._SSL_CTX = ssl.create_default_context(cafile="/root/.ccr/ca-bundle.crt")

TARGET_RMS_DB = -21.0
PRE, POST = 0.05, 0.12   # seconds of room kept around the speech

async def synth(sg):
    voice = CFG["voice"]
    last = None
    for attempt in range(4):
        try:
            c = edge_tts.Communicate(sg["text"], voice["name"], rate=sg.get("rate", voice["rate"]),
                                     pitch=voice["pitch"], boundary="WordBoundary")
            audio, words = bytearray(), []
            async for ch in c.stream():
                if ch["type"] == "audio":
                    audio += ch["data"]
                elif ch["type"] == "WordBoundary":
                    words.append({"text": ch["text"], "start": ch["offset"] / 1e7, "end": (ch["offset"] + ch["duration"]) / 1e7})
            if audio and words:
                return bytes(audio), words
        except Exception as e:  # network hiccup: retry
            last = e
            await asyncio.sleep(1.5 * (attempt + 1))
    raise RuntimeError(f"TTS failed for {sg['id']}: {last}")

def decode(mp3, wav):
    subprocess.run(["ffmpeg", "-y", "-v", "error", "-i", str(mp3), "-ar", str(SR), "-ac", "1", "-c:a", "pcm_s16le", str(wav)], check=True)

def read_wav(p):
    with wave.open(str(p)) as w:
        n = w.getnframes(); x = np.frombuffer(w.readframes(n), dtype="<i2").astype(np.float32) / 32768
    return x

def write_wav(p, x):
    x = np.clip(x, -1, 1)
    with wave.open(str(p), "wb") as w:
        w.setnchannels(1); w.setsampwidth(2); w.setframerate(SR)
        w.writeframes((x * 32767).astype("<i2").tobytes())

def process(sg_id):
    raw = TTS_DIR / f"{sg_id}.raw.wav"
    decode(TTS_DIR / f"{sg_id}.mp3", raw)
    x = read_wav(raw)
    env = np.abs(x)
    idx = np.where(env > 0.012)[0]
    a = max(0, int(idx[0] - PRE * SR)); b = min(len(x), int(idx[-1] + POST * SR))
    x = x[a:b]
    trimmed = TTS_DIR / f"{sg_id}.trim.wav"; write_wav(trimmed, x)
    filt = TTS_DIR / f"{sg_id}.filt.wav"
    subprocess.run(["ffmpeg", "-y", "-v", "error", "-i", str(trimmed), "-af",
                    "highpass=f=70,equalizer=f=3000:t=q:w=1.2:g=1.8,equalizer=f=220:t=q:w=1.0:g=-1.5,"
                    "acompressor=threshold=-24dB:ratio=2.2:attack=8:release=140:makeup=1",
                    "-ar", str(SR), "-c:a", "pcm_s16le", str(filt)], check=True)
    y = read_wav(filt)
    active = y[np.abs(y) > 0.02]
    rms = 20 * np.log10(np.sqrt(np.mean(active ** 2)) + 1e-9)
    y = y * 10 ** ((TARGET_RMS_DB - rms) / 20)
    peak = np.max(np.abs(y))
    if peak > 0.89: y = y * (0.89 / peak)
    out = NARR_DIR / f"{sg_id}.wav"; write_wav(out, y)
    return a / SR, len(y) / SR

async def main():
    only = set(sys.argv[1:])
    for sc, sg in segments():
        if only and sg["id"] not in only: continue
        mp3 = TTS_DIR / f"{sg['id']}.mp3"
        audio, words = await synth(sg)
        mp3.write_bytes(audio)
        trim_start, dur = process(sg["id"])
        for w in words:
            w["start"] = round(max(0.0, w["start"] - trim_start), 3)
            w["end"] = round(max(0.0, w["end"] - trim_start), 3)
        (TTS_DIR / f"{sg['id']}.json").write_text(json.dumps({"id": sg["id"], "text": sg["text"], "duration": round(dur, 3), "words": words}, indent=1))
        print(f"{sg['id']}: {dur:5.2f}s  {len(words)} words  | {sg['text'][:60]}")

asyncio.run(main())
