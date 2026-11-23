#!/usr/bin/env bash
# Create a new explainer project from the bundled template and make it ready to run.
# Usage: scripts/bootstrap_project.sh <dest-dir>
set -euo pipefail
HERE="$(cd "$(dirname "$0")/.." && pwd)"
DEST="${1:?destination directory}"
[ -e "$DEST" ] && { echo "$DEST already exists"; exit 1; }
cp -r "$HERE/assets/template" "$DEST"
mkdir -p "$DEST/public/audio/"{vo,music,sfx} "$DEST/public/assets" "$DEST/deliverables"
"$HERE/scripts/setup_fonts.sh" "$DEST"
(cd "$DEST" && npm install --no-audit --no-fund --silent && npx remotion browser ensure >/dev/null)
"$HERE/scripts/setup_env.sh" "$DEST/.venv"
"$DEST/.venv/bin/python" "$DEST/scripts/generate_grain.py"
echo "ready: $DEST  (next: edit script/narration.json, then scripts/build_all.sh)"
