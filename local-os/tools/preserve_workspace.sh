#!/usr/bin/env bash
# Non-destructive snapshot of a git workspace INCLUDING uncommitted and untracked work.
# Reads SOURCE, writes only into a NEW timestamped folder. Never resets, stashes, checks out,
# deletes or modifies SOURCE. Refuses to overwrite an existing destination.
#
#   local-os/tools/preserve_workspace.sh /path/to/workspace [backup-root]
#
# Output (mode 0700): status.txt head.txt branch.txt staged.patch unstaged.patch
#                     untracked.tgz repo.bundle stash-list.txt full-copy/ SHA256SUMS
set -euo pipefail
SRC="${1:?usage: preserve_workspace.sh /path/to/workspace [backup-root]}"
ROOT="${2:-$HOME/Keystal/backups}"
[ -d "$SRC" ] || { echo "No such directory: $SRC" >&2; exit 2; }
git -C "$SRC" rev-parse --is-inside-work-tree >/dev/null 2>&1 || { echo "Not a git workspace: $SRC" >&2; exit 2; }
SRC="$(cd "$SRC" && pwd -P)"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
DEST="$ROOT/$(basename "$SRC")-$STAMP"
[ ! -e "$DEST" ] || { echo "Destination exists, refusing: $DEST" >&2; exit 2; }
umask 077
# Read-only on the source: git must not even refresh its index or take optional locks.
export GIT_OPTIONAL_LOCKS=0
mkdir -p "$DEST"
git -C "$SRC" status --porcelain=v1 --branch > "$DEST/status.txt"
git -C "$SRC" rev-parse HEAD > "$DEST/head.txt" 2>/dev/null || echo "(no commits)" > "$DEST/head.txt"
git -C "$SRC" branch --show-current > "$DEST/branch.txt"
git -C "$SRC" diff --cached --binary > "$DEST/staged.patch"
git -C "$SRC" diff --binary > "$DEST/unstaged.patch"
git -C "$SRC" stash list > "$DEST/stash-list.txt"
LIST="$DEST/.untracked-list"
git -C "$SRC" ls-files --others --exclude-standard -z > "$LIST"
if [ -s "$LIST" ]; then (cd "$SRC" && tar -czf "$DEST/untracked.tgz" --null -T "$LIST"); else : > "$DEST/untracked.none"; fi
rm -f "$LIST"
git -C "$SRC" bundle create "$DEST/repo.bundle" --all >/dev/null 2>&1 || echo "no bundle (repository has no commits)" > "$DEST/repo.bundle.none"
cp -Rp "$SRC" "$DEST/full-copy"
if command -v sha256sum >/dev/null 2>&1; then SUM="sha256sum"; else SUM="shasum -a 256"; fi
(cd "$DEST" && find . -type f ! -path './full-copy/*' ! -name SHA256SUMS -print0 | xargs -0 $SUM > SHA256SUMS)
echo "Preserved $SRC"
echo "  -> $DEST"
echo "  branch: $(cat "$DEST/branch.txt")  head: $(cat "$DEST/head.txt")"
echo "  changed/untracked entries: $(grep -vc '^##' "$DEST/status.txt" || true)"
echo "Source was only read. Nothing was reset, stashed, checked out or deleted."
