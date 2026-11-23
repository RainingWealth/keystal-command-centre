#!/usr/bin/env bash
# Python env for the voice / music / QC steps: espeak-ng, CPU torch, Kokoro-82M TTS, faster-whisper.
# Idempotent. Usage: scripts/setup_env.sh [venv-dir]   (default ./.venv)
# Why the odd order: plain `pip install kokoro` backtracks to an ancient 0.2.x on Python 3.13 and spaCy
# tries to compile from source, so wheels are forced (--only-binary) and kokoro 0.7.16 is pinned with --no-deps.
set -euo pipefail
VENV="${1:-.venv}"
if ! command -v espeak-ng >/dev/null 2>&1; then
  SUDO=""; [ "$(id -u)" -ne 0 ] && SUDO="sudo"
  $SUDO apt-get update -qq && $SUDO apt-get install -y -qq espeak-ng
fi
[ -d "$VENV" ] || python3 -m venv "$VENV"
PIP="$VENV/bin/pip"
$PIP install -q --upgrade pip
$PIP install -q torch --index-url https://download.pytorch.org/whl/cpu
$PIP install -q --only-binary=:all: spacy scipy numpy soundfile loguru faster-whisper
$PIP install -q --only-binary=:all: kokoro            # pulls misaki + transformers + huggingface-hub (resolves old kokoro)
$PIP install -q --only-binary=:all: --no-deps kokoro==0.7.16
"$VENV/bin/python" -c "import kokoro, soundfile, scipy, faster_whisper; print('python env ok')"
