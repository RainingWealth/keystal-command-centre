# Rayvern OS V2: AI Watcher audit

Audit only; no code was changed. Scope: GitHub branch `claude/pensive-babbage-s85dsa` at 5333d94, inspected in a cloud sandbox. The Mac's local working copy, its production SQLite file and the Codex workspace were not visible; claims about them come from the Mac run reports.

Git: `main` is at 3735b38. PR #1 is an open draft from this branch. The tree is clean. There are no other branches or PRs.

## 1. What works (evidence)

- **Server:** loopback-only single-user Python server with SQLite and 15 API routes (12 in `local-os/server.py`, 9 task routes in `agent_tasks.ROUTES`). Safeguards: session cookie, Origin/CSRF/Host checks, a restrictive Content-Security-Policy.
- **Database:** five versioned migrations, applied only with `--migrate`, backup first. Triggers enforce the approval gate, append-only history/evidence and immutable links.
- **Tracking:** tasks with eight statuses, history, evidence, review, projects, links and session/run IDs. Every update carries its source: `observed`, `manual` or `agent_reported`.
- **Hermes:** chat via `hermes chat`, plus a read-only Kanban read (`hermes kanban list --json`) every 300 s or on demand. A failed read keeps the last good one and marks it stale. On the Mac: 31 records read; the real-Hermes `verify.py` passed 67/67 at b881114.
- **Dashboard:** polls `/api/state` every 4 s; a stalled poll now shows "not updated".

## 2. Incomplete or simulated

- **`tools/db_tool.py` cannot run:** a syntax error at line 394 breaks backup and restore. The suite is red: 3 failed, 2 errored, about 40 tests not loaded.
- **Percent-encoded ID numbers** still pass into evidence and link URLs.
- **Older review findings still open:** five front-end items (in `local-os/docs/REVIEW_FINDINGS.md`) and the restore and `preserve_workspace.sh` bugs.
- **Agent status is typed in by hand:** "agent_reported" means you relayed it. No agent can report directly; every write needs the browser cookie and CSRF token.
- **Only Hermes is observed:** ChatGPT, Claude, Codex and Gemini show NOT CONNECTED.
- **No liveness:** a Kanban card marked "running" is a record, not proof a worker is alive. There are no heartbeats.
- **Claude Code hook monitoring** was deferred and never built.

## 3. Reusable

- **Data and gates:** the SQLite file, the migration framework, the append-only trigger pattern, the source labels and the identifier guard.
- **Session matching:** `agent_task_sessions` (agent, session and run IDs) to match incoming events.
- **Freshness:** the Kanban last-success/stale/keep-last-good pattern, reused for heartbeat staleness.
- **Front end:** the 4-second poll and the agent cards, so no live push is needed.
- **Tests:** the harness and the stand-in Hermes.

## 4. Missing for real-time monitoring

1. A local way for agent tooling to send events without the browser cookie/CSRF: its own token and an allow-list of fields.
2. Storage: one append-only events table in the existing SQLite.
3. A sender. For Claude Code, the official hooks, run asynchronously and never blocking. Metadata only: agent, session, event type, time. No prompts, transcripts, tool arguments or results, or secrets.
4. A state rule: active, idle, ended, or unknown when no event has arrived for N minutes.
   - `Stop` marks the end of a response, not of a task.
   - `SessionEnd` is not guaranteed to fire.
5. Dashboard display: the state labelled "hook-reported" with its age, never as proof of a live worker, linked to the tracked tasks.

## 5. Smallest plan (each change testable alone)

**A. Restore green (prerequisite).**
- Fix the `db_tool` syntax error and the encoded-ID check.
- Fix `restore` into a missing database path, and the misleading report after a failed restore.
- Fix `preserve_workspace.sh` with a relative backup folder.
- Done when the suite shows 0 failed, 0 errors and 0 skipped.

**B. Migration v6: `agent_events` table.** Fields: id, agent, session_ref, run_ref, kind, occurred_at, received_at. Append-only by trigger. Test: migration from v5, append-only rule.

**C. `POST /api/watch/events`.**
- Loopback only, with a token file (`0600`) in the data folder.
- Rejects unknown fields, values over the length limits and ID numbers.
- Source label: `hook_reported`.
- Test: token, Host and allow-list rules, and refusal of anything else.

**D. Claude Code hook script.** Standard-library Python for SessionStart, Stop, SessionEnd and PostToolUse (event name only). Runs asynchronously with a 1-second timeout and gives up silently if the server is down. Test: against the test server, and against a dead port.

**E. Session state.** Computed on the server; the timeout is configurable. Test: fixed timestamps for each state.

**F. Dashboard.** Agent cards and the task dialog show the state, its age and the "hook-reported" label. Test: browser tests for each state, including a stale page.

**G. Kanban cadence (optional).** Allow the Kanban refresh down to 30 s through a setting. Test: existing timing tests.

**Out of scope (by earlier rules):** Codex, Gemini and ChatGPT adapters, autonomous agents, remote hosting.
