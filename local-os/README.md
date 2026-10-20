# Keystal OS — local workbench

The Python server is a **loopback-only, single-user local app**, not a public backend.

## Run locally

Prerequisites: Python 3, an authenticated Hermes CLI on PATH, and the existing owner's document/Dropbox setup for optional knowledge features.

```sh
python3 local-os/server.py
```

Open http://127.0.0.1:8766/. Captures and conversation state are stored outside this repository under `~/Keystal/outputs/keystal-os/local-state/`. Missing private documents remain unavailable; none are bundled here.

Features: persistent draft captures, pin/archive/restore/search, real Hermes drafting/public-web chat, resumed conversation context, saved-document viewing and a scoped read-only Dropbox check. Captures are not ClickUp tasks. No CRM/calendar/messaging execution is granted.

## Agents & tasks (Phase 1)

Today shows an overview card for Hermes, ChatGPT, Claude, Codex and Gemini; the **Agents & tasks** page tracks work handed to them. It is a **tracking board, not a dispatcher**: creating or assigning a task records who should do it and never contacts, starts or controls an agent. No paid API is called and no agent credentials are stored.

Statuses: queued, running, awaiting review, blocked, failed, paused, completed, stale. Every task keeps an append-only history and output-evidence links. Completion goes through review: move a task to awaiting review, attach evidence (a link or a note), then approve or reject. Rejecting needs a reason and sends the task back to the queue. A task can opt out of review when created.

Every status, note and evidence item is labelled with where it came from:

| Label | Meaning | Who can set it |
| --- | --- | --- |
| OBSERVED | Read directly by this server: the Hermes CLI and chat runs, the Kanban read, the stale sweep | Server only |
| MANUAL | Typed in by you | The browser |
| AGENT-REPORTED | Relayed by you from an agent; not verified | The browser |

The browser can never claim OBSERVED. Only Hermes has observed facts (CLI detected, whether a chat turn is running, the last recorded chat turn). ChatGPT, Claude, Codex and Gemini show **NOT CONNECTED**; their cards show counts from tracked tasks only, and nothing appears as live activity unless a task or event was really recorded. A task reported as running with no update for 24 hours is flagged **stale** by the server (`KEYSTAL_OS_STALE_HOURS`), recorded as an observation of silence, not a claim that the agent stopped.

**Hermes Kanban (read-only).** Refresh runs `hermes kanban list --json` (see the [Hermes Kanban docs](https://hermes-agent.nousresearch.com/docs/user-guide/features/kanban)) and stores a snapshot for display. No other Hermes command is run and nothing is written back. If the CLI is missing or has no Kanban command it reports **NOT CONNECTED**; unreadable output reports **READ FAILED** and imports nothing. Hermes statuses map to ours (`triage`/`todo`/`ready` → queued, `review` → awaiting review, `done` → completed); archived tasks are skipped and unknown statuses are shown as Hermes reported them. Select a non-default board with `KEYSTAL_OS_KANBAN_BOARD`.

**Database.** Schema changes are versioned migrations (`migrations.py`, `PRAGMA user_version`). They only add tables, run in a transaction, copy an existing database aside first (`workbench.backup-v<N>-<time>.sqlite3` next to it, mode 0600), and refuse a database from a newer version. Existing captures, conversations and runs are untouched. Task history and evidence are append-only at the database level.

Environment: `KEYSTAL_OS_DATA`, `KEYSTAL_OS_PORT`, `KEYSTAL_OS_HERMES` (CLI path/name, default `hermes`), `KEYSTAL_OS_KANBAN_BOARD`, `KEYSTAL_OS_STALE_HOURS`.

Host/cookie/Origin/CSRF/CSP controls are local safeguards, not remote identity authentication. **Do not expose this server publicly.** Credentials stay in the existing Hermes installation, not in this repo. Use placeholders rather than private client data.

## Public preview

https://rainingwealth.github.io/keystal-command-centre/preview/

The preview is static and read-only. It contains no live chat, private documents, captures, sessions or credentials. It does not connect to localhost or any agent backend. Viewing it on a phone does not mean the agent is cloud-hosted.

Rebuild the preview after layout changes:

```sh
python3 local-os/build_preview.py
```

## Verification

Self-contained tests for Agents & tasks (no Hermes, no model calls; they use a stub Hermes CLI and synthetic data; the UI tests need Python Playwright and Chromium and skip otherwise):

```sh
python3 -m unittest discover -s local-os/tests
```

The integration suite below also covers the new views and agent-task API.

```sh
python3 local-os/verify.py
```

The integration suite requires Python Playwright/Chromium, a working Hermes CLI and the owner's saved OS documents. It uses isolated temporary app storage and makes real model calls. It is not self-contained CI and may incur model usage. The build passed 45 checks, including two-turn context, restart persistence, input handling and mobile layout. Private test reports and data are not published.

Next deployment gate: separately authorised authenticated hosting, scoped adapters, phone/mobile-data testing with the Mac off, revocation and backup restoration. GitHub Pages cannot execute this Python backend.
