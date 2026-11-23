#!/usr/bin/env python3
"""Turn voice_timings.json + narration.json into src/data/timeline.json.

The timeline is the single source of truth for scene length, VO position, caption
words and animation cues. Re-voicing the script and re-running this file re-syncs
every animation automatically (scenes read cues via useCue()).
"""
import json
import math
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent


def norm(w):
    return re.sub(r"[^a-z0-9]", "", w.lower())


def main():
    spec = json.loads((ROOT / "script/narration.json").read_text())
    voice = json.loads((ROOT / "script/voice_timings.json").read_text())
    lay = spec["layout"]
    fps = lay["fps"]
    ms2f = lambda ms: ms * fps / 1000.0

    scenes, cursor, captions = [], 0, []
    for sc in spec["scenes"]:
        v = voice["scenes"][sc["id"]]
        lead = lay["leadFrames"].get(sc["id"], lay["leadFrames"]["default"])
        tail = lay["tailFrames"][sc["id"]]
        vo_frames = math.ceil(ms2f(v["durationMs"]))
        dur = lead + vo_frames + tail
        vo_start = cursor + lead

        emph = {norm(e) for e in sc["emphasis"]}
        words = []
        for w in v["words"]:
            words.append(
                {
                    "i": w["i"],
                    "text": w["display"],
                    "startFrame": vo_start + round(ms2f(w["startMs"])),
                    "endFrame": vo_start + round(ms2f(w["endMs"])),
                    "emphasis": norm(w["display"]) in emph,
                }
            )
            captions.append(
                {
                    "text": (" " if captions else "") + w["display"],
                    "startMs": round((vo_start / fps) * 1000 + w["startMs"]),
                    "endMs": round((vo_start / fps) * 1000 + w["endMs"]),
                    "timestampMs": round((vo_start / fps) * 1000 + (w["startMs"] + w["endMs"]) / 2),
                    "confidence": None,
                }
            )

        cues = {}
        for name, ref in sc["cues"].items():
            target, occ = (ref, 0) if isinstance(ref, str) else (ref[0], ref[1])
            hits = [w for w in words if norm(w["text"]) == norm(target)]
            if len(hits) <= occ:
                sys.exit(f"[{sc['id']}] cue {name!r}: word {target!r} #{occ} not found")
            cues[name] = hits[occ]["startFrame"] - cursor  # scene-relative frame

        scenes.append(
            {
                "id": sc["id"],
                "name": sc["name"],
                "label": sc["label"],
                "accent": sc["accent"],
                "start": cursor,
                "duration": dur,
                "voStart": vo_start,
                "voFrames": vo_frames,
                "voFile": f"audio/vo/{sc['id']}.wav",
                "voEnd": vo_start + vo_frames,
                "words": words,
                "cues": cues,
            }
        )
        cursor += dur

    total = cursor
    secs = total / fps
    timeline = {
        "fps": fps,
        "width": 1080,
        "height": 1920,
        "totalFrames": total,
        "scenes": scenes,
        "captions": captions,
    }
    out = ROOT / "src/data/timeline.json"
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(timeline, indent=1))

    print(f"total {total} frames = {secs:.2f}s")
    for s in scenes:
        print(
            f"  {s['id']}  start {s['start']/fps:6.2f}s  dur {s['duration']/fps:5.2f}s  "
            f"vo {s['voStart']/fps:6.2f}-{s['voEnd']/fps:6.2f}s"
        )
    if not (lay["minSeconds"] <= secs <= lay["maxSeconds"]):
        sys.exit(
            f"Duration {secs:.1f}s outside {lay['minSeconds']}-{lay['maxSeconds']}s. "
            "Re-run generate_voice.py with a different --speed (or edit layout.tailFrames)."
        )


if __name__ == "__main__":
    main()
