#!/usr/bin/env bash
# Copy Inter / Inter Display (SIL OFL) into <project>/public/fonts. Usage: scripts/setup_fonts.sh <project-dir>
set -euo pipefail
DEST="${1:?project dir}/public/fonts"; mkdir -p "$DEST"
SRC=/usr/share/fonts/opentype/inter
if [ ! -f "$SRC/InterDisplay-Black.otf" ]; then
  SUDO=""; [ "$(id -u)" -ne 0 ] && SUDO="sudo"
  $SUDO apt-get update -qq && $SUDO apt-get install -y -qq fonts-inter
fi
for f in InterDisplay-Black InterDisplay-ExtraBold InterDisplay-Bold Inter-Regular Inter-Medium Inter-SemiBold Inter-Bold; do
  cp "$SRC/$f.otf" "$DEST/"
done
cp /usr/share/doc/fonts-inter*/copyright "$DEST/OFL-NOTICE.txt" 2>/dev/null || echo "Inter is licensed under the SIL Open Font License 1.1 (https://rsms.me/inter/)." > "$DEST/OFL-NOTICE.txt"
echo "fonts ready in $DEST"
