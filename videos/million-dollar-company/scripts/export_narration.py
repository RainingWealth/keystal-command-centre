"""Place every processed narration segment on the video timeline -> output/narration.wav + narration.mp3."""
import json, wave, subprocess
import numpy as np
from common import *
TL = json.loads((DATA / "timeline.json").read_text())
n = int(round(TL["totalFrames"] / FPS * SR)); y = np.zeros(n, dtype=np.float32)
for sc in TL["scenes"]:
    for sg in sc["segments"]:
        with wave.open(str(NARR_DIR / f"{sg['id']}.wav")) as w:
            x = np.frombuffer(w.readframes(w.getnframes()), dtype="<i2").astype(np.float32) / 32768
        i = int(round(sg["start"] / FPS * SR)); y[i:i + len(x)] += x[: max(0, n - i)]
out = OUT / "narration.wav"
with wave.open(str(out), "wb") as w:
    w.setnchannels(1); w.setsampwidth(2); w.setframerate(SR); w.writeframes((np.clip(y, -1, 1) * 32767).astype("<i2").tobytes())
subprocess.run(["ffmpeg", "-y", "-v", "error", "-i", str(out), "-c:a", "libmp3lame", "-b:a", "192k", str(OUT / "narration.mp3")], check=True)
print(f"narration.wav {n / SR:.2f}s, peak {np.max(np.abs(y)):.2f}")
