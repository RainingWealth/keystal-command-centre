# Keystal OS — local workbench

The Python server is a **loopback-only, single-user local app**, not a public backend.

## Run locally

Prerequisites: Python 3, an authenticated Hermes CLI on PATH, and the existing owner's document/Dropbox setup for optional knowledge features.

```sh
python3 local-os/server.py
```

Open http://127.0.0.1:8766/. Captures and conversation state are stored outside this repository under `~/Keystal/outputs/keystal-os/local-state/`. Missing private documents remain unavailable; none are bundled here.

Features: persistent draft captures, pin/archive/restore/search, real Hermes drafting/public-web chat, resumed conversation context, saved-document viewing and a scoped read-only Dropbox check. Captures are not ClickUp tasks. No CRM/calendar/messaging execution is granted.

Host/cookie/Origin/CSRF/CSP controls are local safeguards, not remote identity authentication. **Do not expose this server publicly.** Credentials stay in the existing Hermes installation, not in this repo. Use placeholders rather than private client data.

## Public preview

https://rainingwealth.github.io/keystal-command-centre/preview/

The preview is static and read-only. It contains no live chat, private documents, captures, sessions or credentials. It does not connect to localhost or any agent backend. Viewing it on a phone does not mean the agent is cloud-hosted.

Rebuild the preview after layout changes:

```sh
python3 local-os/build_preview.py
```

## Verification

```sh
python3 local-os/verify.py
```

The integration suite requires Python Playwright/Chromium, a working Hermes CLI and the owner's saved OS documents. It uses isolated temporary app storage and makes real model calls. It is not self-contained CI and may incur model usage. The build passed 45 checks, including two-turn context, restart persistence, input handling and mobile layout. Private test reports and data are not published.

Next deployment gate: separately authorised authenticated hosting, scoped adapters, phone/mobile-data testing with the Mac off, revocation and backup restoration. GitHub Pages cannot execute this Python backend.
