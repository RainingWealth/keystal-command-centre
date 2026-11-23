#!/usr/bin/env python3
"""Seamless 512x512 film-grain tile (public/assets/grain.png). Pure stdlib + numpy."""
import struct
import zlib
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parent.parent
rng = np.random.default_rng(7)
n = rng.normal(128, 38, (512, 512)).clip(0, 255).astype(np.uint8)
raw = b"".join(b"\x00" + n[y].tobytes() for y in range(512))


def chunk(t, d):
    c = struct.pack(">I", len(d)) + t + d
    return c + struct.pack(">I", zlib.crc32(t + d) & 0xFFFFFFFF)


png = b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", struct.pack(">IIBBBBB", 512, 512, 8, 0, 0, 0, 0)) + chunk(b"IDAT", zlib.compress(raw, 9)) + chunk(b"IEND", b"")
out = ROOT / "public/assets/grain.png"
out.parent.mkdir(parents=True, exist_ok=True)
out.write_bytes(png)
print("wrote", out, len(png), "bytes")
