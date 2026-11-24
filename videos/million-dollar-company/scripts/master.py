"""Two-pass EBU R128 loudness mastering of the Remotion render. Video stream is copied untouched."""
import json, re, subprocess, sys
from common import *
src = WORK / "raw.mp4"
dst = OUT / "million-dollar-company-cashflow.mp4"
I, TP, LRA = -14.0, -1.5, 11.0
p1 = subprocess.run(["ffmpeg", "-hide_banner", "-nostats", "-i", str(src), "-vn", "-af", f"loudnorm=I={I}:TP={TP}:LRA={LRA}:print_format=json", "-f", "null", "-"], capture_output=True, text=True)
m = json.loads(re.search(r"\{[^{}]*\"input_i\"[^{}]*\}", p1.stderr, re.S).group(0))
print("pass1:", {k: m[k] for k in ("input_i", "input_tp", "input_lra", "input_thresh", "target_offset")})
af = (f"loudnorm=I={I}:TP={TP}:LRA={LRA}:measured_I={m['input_i']}:measured_TP={m['input_tp']}:measured_LRA={m['input_lra']}:"
      f"measured_thresh={m['input_thresh']}:offset={m['target_offset']}:linear=true:print_format=summary")
subprocess.run(["ffmpeg", "-y", "-hide_banner", "-v", "error", "-i", str(src), "-map", "0:v:0", "-map", "0:a:0", "-c:v", "copy", "-af", af,
                "-c:a", "aac", "-b:a", "256k", "-ar", "48000", "-ac", "2", "-movflags", "+faststart", str(dst)], check=True)
print("wrote", dst)
