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

**Hermes Kanban (read-only).** The server runs `hermes kanban [--board B] list --json` (see the [Hermes Kanban docs](https://hermes-agent.nousresearch.com/docs/user-guide/features/kanban)) at startup, every 5 minutes while it runs, and on Refresh. No other Hermes command is run and this app never asks Hermes to change anything. Like any Hermes command, the CLI may create or upgrade Hermes's own database when it runs; this app cannot rule that out. The panel shows the **last attempt**, the **last successful read** (with a STALE flag) and the sanitized error as separate facts. A failed or unsupported read **keeps the last good snapshot** and says so; it never blanks it. Unreadable output fails closed: a non-empty list in which nothing is recognisable is **READ FAILED**, not an empty connected board. Every record is accounted for (`received = shown + duplicates merged + archived skipped + not recognised`), duplicates are merged explicitly (first occurrence wins), and anything over 1000 stored records is announced as truncated. Raw Hermes states are always shown; they map to ours (`triage`/`todo`/`ready` → queued, `review` → awaiting review, `done` → completed) while `scheduled` and unknown states are counted separately, never guessed. A board state is an observed record, **not proof of a live worker**. Pin a board with `KEYSTAL_OS_KANBAN_BOARD`: an invalid name stops the server at startup instead of silently reading another board, and the panel names the board actually read ("not pinned" when it is whichever Hermes has selected).

**Links, projects, sessions.** A task can carry a project, links to a Hermes card (pinned board only) or a ClickUp task (reference only), and opaque session/run identifiers. A link's identity is `provider + instance + board/workspace + external id`, unique across all tasks: for Hermes, the instance label and pinned board recorded with the snapshot the card was read in; for ClickUp, `app.clickup.com` + workspace + task id (the list is context only, because one ClickUp task can sit in several lists). A Hermes card linked to a tracked task is counted once; if the board is not pinned, cards whose id is linked on some board are marked "possibly linked" and not counted, rather than counted twice. See [docs/AUTHORITY.md](docs/AUTHORITY.md) for who owns what.

**Approval gate.** The rule "a review-required task completes only through approval with evidence" is enforced in the database (triggers) as well as the API, and the API rejects fields an endpoint does not own (for example `status` on create), so no write path can bypass it while review is required. Two things are deliberately outside the gate, and both are visible: **(1)** you can switch a task's review requirement off (before it is completed and not mid-review) and then complete it without evidence; the switch is recorded in its history and the task shows NO REVIEW REQUIRED (YOUR CHOICE). **(2)** A task completed before this gate existed (PR #1 allowed switching review on after completion) is kept as recorded, flagged COMPLETED BEFORE THE APPROVAL GATE · NOT APPROVED, still accepts notes, evidence and links, and can be reopened to go through review. `--migrate` and `db_tool.py` report how many there are. Task creation is idempotent with a `request_key`, so a retried or double-submitted create returns the first task. Every task carries a `revision` that every write path bumps (a database trigger), and every task endpoint accepts it: a second browser tab saving over a newer version gets 409 instead of silently winning.

**Database and activation.** Schema changes are versioned additive migrations (`migrations.py`, `PRAGMA user_version`); shipped migrations are frozen by test. Each runs in a transaction, and an existing database is copied aside with SQLite's online backup first (`workbench.backup-v<N>-<time>.sqlite3`, mode 0600). A newer database is refused. A database that already holds tables a migration would create with a **different shape** (another implementation's `agents` table, say) is refused before anything is written: `CREATE TABLE IF NOT EXISTS` is not reconciliation. **An existing database is never migrated implicitly**: the server exits with instructions unless started with `--migrate`. A fresh data directory needs no flag.

```sh
python3 local-os/tools/db_tool.py inspect       --db <path>     # schema + row counts only, read-only
python3 local-os/tools/db_tool.py backup        --db <path>     # online backup, verified
python3 local-os/tools/db_tool.py restore-test  --backup <file> # restore into scratch, dry-run the migration
python3 local-os/tools/db_tool.py migrate-check --db <path>     # migrate a COPY, prove no row is lost
python3 local-os/server.py --migrate                            # explicit activation
```

**Rolling back.** Stop the server, then `python3 local-os/tools/db_tool.py restore --backup <file> --db <path>` (dry run) and again with `--execute`. It verifies the backup first, refuses while anything listens on the server port or holds the database, renames the current file to `workbench.replaced-<time>.sqlite3` (kept, never deleted), and says which code version opens the restored schema: v0 the original app, v2 PR #1 head `e0aea41`, v3 the corrective-pass commits up to `b9bd4c3`, v4 the current code. A database is never opened by code older than its schema, so roll the code back together with the database.

If an interrupted transaction left a hot `-journal` (power loss, a kill), the read-only tools say so and stop; starting the server lets SQLite roll it back, exactly as any normal open does.

If `inspect` reports a conflict, see [docs/RECONCILIATION.md](docs/RECONCILIATION.md). `quarantine` renames another implementation's tables, never deletes them, and refuses when the conflict is your own altered table or when a view holds a table name; foreign keys, views and triggers pointing at a renamed table are rewritten to follow it. Task history, evidence and session records are append-only at the database level.

Other tools: `tools/probe_hermes_kanban.py` (real Hermes read, no titles printed; with a pinned board it also checks the name appears in `hermes kanban boards list`), `tools/preview.py` (isolated loopback preview: synthetic data, synthetic documents and a throwaway HOME except `--hermes real`, which deliberately uses the real HOME and performs a real Dropbox check; prints the URL and commit), `tools/preserve_workspace.sh` (non-destructive snapshot of a dirty workspace), `tools/diagnose_sqlite.py` (which SQLite this Python uses and how it behaves here; synthetic databases only). Release readiness and evidence classes: [docs/RELEASE.md](docs/RELEASE.md).

Environment: `KEYSTAL_OS_DATA`, `KEYSTAL_OS_PORT`, `KEYSTAL_OS_HERMES` (CLI path/name, default `hermes`), `KEYSTAL_OS_KANBAN_BOARD`, `KEYSTAL_OS_HERMES_INSTANCE` (a label you choose for this Hermes installation, stored with each snapshot and link; it is never passed to Hermes, and Hermes boards are not partitioned by it; default `local`), `KEYSTAL_OS_DOCROOT` (saved OS documents folder, default `~/Keystal/outputs/keystal-os`; tests and the preview point it at synthetic documents), `KEYSTAL_OS_KANBAN_REFRESH_SECONDS` (default 300, `0` = startup read only), `KEYSTAL_OS_KANBAN_STALE_SECONDS` (default `max(600, 2×refresh)`), `KEYSTAL_OS_STALE_HOURS` (running task with no update, default 24), `KEYSTAL_OS_PREVIEW_LABEL` (shows a banner; set by the preview tool).

Host/cookie/Origin/CSRF/CSP controls are local safeguards, not remote identity authentication. **Do not expose this server publicly.** Credentials stay in the existing Hermes installation, not in this repo. Use placeholders rather than private client data.

## Public preview

https://rainingwealth.github.io/keystal-command-centre/preview/

The preview is static and read-only. It contains no live chat, private documents, captures, sessions or credentials. It does not connect to localhost or any agent backend. Viewing it on a phone does not mean the agent is cloud-hosted.

Rebuild the preview after layout changes:

```sh
python3 local-os/build_preview.py
```

## Verification

Self-contained tests (no Hermes, no model calls, no files from `~/Keystal`; a stub Hermes CLI, synthetic data and synthetic documents). They cover Agents & tasks, migrations for the original, PR #1 and a foreign schema, `db_tool.py`, the other tools, and regressions of chat (two turns through the bridge with the stub), saved documents and captures:

```sh
python3 -m unittest discover -s local-os/tests
```

The browser tests need Python Playwright and Chromium; without them they are reported as **skipped**, which means no browser coverage, not a pass. Check the skipped count. Current results are in [docs/RELEASE.md](docs/RELEASE.md).

The integration suite below also covers the new views and agent-task API.

```sh
python3 local-os/verify.py
```

The integration suite requires Python Playwright/Chromium, a working Hermes CLI and the owner's saved OS documents. It uses isolated temporary app storage and makes real model calls. It is not self-contained CI and may incur model usage. It now has 67 checks (45 original plus Agents & tasks). The Mac run at b881114 passed 67/67 with real Hermes; the cloud sandbox uses a stub Hermes CLI and synthetic HOME. Private test reports and data are not published.

Next deployment gate: separately authorised authenticated hosting, scoped adapters, phone/mobile-data testing with the Mac off, revocation and backup restoration. GitHub Pages cannot execute this Python backend.
