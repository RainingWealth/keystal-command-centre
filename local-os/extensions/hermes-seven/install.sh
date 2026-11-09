#!/usr/bin/env bash
# Keystal Hermes upgrade. Run interactively on the owner's Mac, not in GitHub Pages.
set -euo pipefail
if [ "$#" -eq 0 ]; then MODE="--plan"; else MODE="$1"; fi
ARTIFACTS="$HOME/Keystal/outputs/ai-artifacts"
BACKUPS="$HOME/Keystal/outputs/keystal-os/local-state/hermes-upgrade-backups"

help_msg() {
cat <<'HELP'
Usage: bash local-os/extensions/hermes-seven/install.sh [OPTION]
  --plan              Print deployment notes; no changes (default)
  --status            Show Hermes version and current plugins; no changes
  --install-core      Install/enable five plugins in the current Hermes profile
  --install-optional  Download two high-impact plugins, leave them disabled
  --disable           Disable seven plugins (does not revoke OAuth)
Run ONLY on the Mac hosting Keystal. Keep sensitive client history out of audits.
HELP
}
check_hermes() {
  command -v hermes >/dev/null 2>&1 || { echo "Hermes CLI not found. Run this on Keystal's Mac." >&2; exit 2; }
  version_text="$(hermes --version)"
  echo "$version_text"
  version="$(printf '%s\n' "$version_text" | grep -Eo '[0-9]+\.[0-9]+\.[0-9]+' | head -n 1 || true)"
  if [ -z "$version" ]; then
    echo "Cannot verify Hermes version; no changes made." >&2
    exit 3
  fi
  IFS='.' read -r major minor patch <<< "$version"
  if (( major == 0 && (minor < 22 || (minor == 22 && patch < 5)) )); then
    echo "Hermes >=0.22.5 required; check 'hermes update --check' before installing." >&2
    exit 3
  fi
}
backup_config() {
  umask 077
  mkdir -p "$BACKUPS"
  if [ -f "$HOME/.hermes/config.yaml" ]; then
    cp -p "$HOME/.hermes/config.yaml" "$BACKUPS/config-$(date +%Y%m%d-%H%M%S).yaml"
    echo "Local backup of config.yaml stored outside GitHub."
  fi
  # Intentionally never read or copy .env, API keys, cookies, or OAuth tokens.
}
ask() {
  if [ ! -t 0 ]; then echo "Interactive terminal required for capability consent." >&2; exit 4; fi
  printf "%s [y/N] " "$1"
  read -r response
  if [ "$response" != "y" ] && [ "$response" != "Y" ]; then exit 0; fi
}
case "$MODE" in
--plan)
  help_msg
  echo "Core: Olympus (controls off), Understudy (bounded budget), webmint (public sites), iWork Studio (fenced), Hermes GenUI (Desktop)."
  echo "Optional: Super Artifacts publishes to a third party; Kanban Empowered changes card state. Both stay disabled."
  echo "No audit runs, external sign-ins, cron jobs, restarts, deployments, or public ports are created."
  ;;
--status)
  check_hermes
  hermes plugins list
  ;;
--install-core)
  check_hermes
  ask "Install/enable five third-party extensions in this Hermes profile?"
  backup_config
  mkdir -p "$ARTIFACTS"
  # Olympus is read-only until its controls are deliberately re-enabled.
  hermes config set dashboard.olympus.controls false
  hermes plugins install olympus
  hermes plugins enable olympus
  # Understudy only runs if the user later requests an audition.
  hermes plugins install understudy
  hermes plugins enable understudy
  hermes config set plugins.entries.understudy.settings.budget_usd 0.50
  hermes config set plugins.entries.understudy.settings.concurrency 2
  hermes config set plugins.entries.understudy.settings.sample 10
  hermes config set plugins.entries.understudy.settings.days 7
  # Fresh signed-out browser, public websites only; no private URL override.
  hermes plugins install webmint
  hermes plugins enable webmint
  if [ "$(uname -s)" = "Darwin" ]; then
    # All iWork writes are restricted to this dedicated artifact folder.
    hermes config set IWORK_STUDIO_ROOTS "$ARTIFACTS"
    hermes config set IWORK_STUDIO_TOOLSETS "keynote,design"
    hermes plugins install iwork-studio
    hermes plugins enable iwork-studio
    command -v uv >/dev/null 2>&1 || echo "iWork needs uv on PATH before first use."
  else
    echo "Skipped iWork (macOS-only)."
  fi
  hermes plugins install sagarmainkar/hermes-genui
  hermes plugins enable hermes-genui
  echo "Installed and enabled in current profile. Live functionality remains UNVERIFIED."
  echo "When no active Hermes jobs: hermes gateway restart"
  echo "Enable Desktop halves under Capabilities > Plugins."
  echo "Do NOT globally disable Hermes tool search just for GenUI without checking token impact."
  ;;
--install-optional)
  check_hermes
  ask "Download, but leave DISABLED, the publishing and Kanban recovery plugins?"
  backup_config
  hermes plugins install super-artifacts
  hermes plugins disable super-artifacts
  hermes plugins install kanban-empowered
  hermes plugins disable kanban-empowered
  echo "Optional plugins staged DISABLED. No OAuth authorized or task recovery running."
  ;;
--disable)
  check_hermes
  ask "Disable all seven plugin integrations in this profile?"
  for name in olympus understudy webmint iwork-studio hermes-genui super-artifacts kanban-empowered; do
    hermes plugins disable "$name" || true
  done
  echo "Plugins disabled; previously authorized external MCP connections need separate revocation."
  ;;
-h|--help) help_msg ;;
*) help_msg >&2; exit 1 ;;
esac
