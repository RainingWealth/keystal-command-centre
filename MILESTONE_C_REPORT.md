# Milestone C report: secure local event intake

Branch `claude/pensive-babbage-s85dsa`, baseline 65d210f. Feature commit: **bdfe688**.

- No hooks, adapters, front-end changes or deployment.
- The production database was not opened or migrated.
- PR #1 is not merged.

## Endpoint: `POST /api/watch/events`

**Request body:** JSON with exactly these fields; no others are allowed.

| Field | Rule |
| --- | --- |
| `event_key` | required; 16–80 characters from `[A-Za-z0-9_-]` |
| `agent_id` | required; tool name or id |
| `session_ref` | required; 1–128 characters from `[A-Za-z0-9._:-]` |
| `run_ref` | optional; same rule, may be empty |
| `event_type` | required |
| `occurred_at` | required; ISO 8601 with an offset or `Z` |

Agent names map to ids: Claude Code → `claude`, Codex CLI → `codex`, Gemini CLI → `gemini`, Hermes → `hermes`. The ids themselves are also accepted. ChatGPT and unknown agents are refused.

The server sets `received_at` (UTC now) and `source` (`hook_reported`). A client that sends either field gets 400.

**Authentication (this endpoint only)**
- A bearer token: `secrets.token_urlsafe(32)`, created once at server start.
- It is stored at `<data folder>/watch-token`:
  - created exclusively and never through a symlink;
  - permissions 0600, narrowed back if they were widened.
- It is reused across restarts, so configured tooling keeps working, and compared in constant time.
- The browser session cookie and the CSRF token never authenticate here.
- Every other route keeps its cookie, Origin and CSRF checks unchanged.

**Token secrecy**
- The token is never logged, returned, written to the database or exported.
- It lives outside the database, so `db_tool backup` and `/api/export` cannot contain it.
- `watch-token` is in `.gitignore`.

**Network rules**
- The server stays bound to 127.0.0.1.
- Host must be `127.0.0.1:<port>` or `localhost:<port>`.
- Any `Origin` header gives 403, so no browser page can call the endpoint and no CORS headers are ever sent.

**Input limits**
- Only `application/json` is accepted (415 otherwise).
- A valid `Content-Length` of 2 to 4,096 bytes is required (413 otherwise).
- Unknown fields, oversized or malformed values, timestamps without an offset, and personal ID numbers (including percent-encoded ones) give 400.

**Storage**
- Events go into the existing v6 `agent_events` table in one `BEGIN IMMEDIATE` transaction.
- The append-only triggers, constraints and indexes are unchanged.
- `occurred_at` is stored as UTC (`…+00:00`).

**Duplicate handling**

| Case | Response |
| --- | --- |
| New `event_key` | 201 `{"stored": true, "duplicate": false, "event_key", "received_at"}` |
| Same key, same canonical content (`received_at` excluded; other offset spellings and tool names count as the same) | 200 `{"stored": false, "duplicate": true}` |
| Same key, different content | 409; the original is kept |

**Task safety:** receiving an event never creates, changes or completes a task. History, evidence, sessions and approval state are untouched.

## Tests

New file `local-os/tests/test_watch_events.py` (13 tests):

- **Accepted input:**
  - all four event types, with server-set source and receipt time;
  - tool-name mapping;
  - UTC normalisation of three offset forms.
- **Duplicates:** a retry gives 200, and five kinds of conflicting change each give 409 with the original kept.
- **Authentication:** six bad token forms give 401. A browser cookie with CSRF gives 401 without the bearer, and 403 when sent the way a page would.
- **Network:** six Origin and Host attacks give 403, and no CORS is offered.
- **Input limits:** wrong content type, oversized body, bad length, non-object and malformed JSON are all refused.
- **Invalid values:** 29 cases give 400, including client-set `source` and `received_at`.
- **Task safety:** four events leave tasks, history, evidence and sessions unchanged.
- **Token secrecy:**
  - the token appears in no response, `/api/state`, `/api/export`, server log, database dump or backup file;
  - the file is 0600;
  - the same token survives a restart, and widened permissions are narrowed.

Full suite, `python3 -m unittest discover -s local-os/tests` (cloud sandbox, Playwright and Chromium present):

| Run | Passed | Failed | Errors | Skipped |
| --- | --- | --- | --- | --- |
| 305 | 305 | 0 | 0 | 0 |

The existing security, CSRF, approval-gate and migration tests all pass unchanged.

## Files changed (bdfe688)

- `local-os/server.py`: token creation, `watch_event()` handler, routing before cookie auth
- `local-os/agent_events.py`: new; validation, UTC normalisation, storage and duplicate rules
- `local-os/tests/test_watch_events.py`: new
- `.gitignore`: `watch-token`

## Testing with synthetic data

```sh
DATA=$(mktemp -d)/state
KEYSTAL_OS_DATA=$DATA KEYSTAL_OS_PORT=8799 KEYSTAL_OS_HERMES=/nonexistent python3 local-os/server.py &
TOKEN=$(cat $DATA/watch-token)
curl -s -X POST http://127.0.0.1:8799/api/watch/events \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{"event_key":"evt-demo-0000000001","agent_id":"Claude Code","session_ref":"demo-1","event_type":"SessionStart","occurred_at":"2026-10-23T16:00:00+08:00"}'
# 201. Send it again: 200 duplicate. Change event_type and send it again: 409.
sqlite3 $DATA/workbench.sqlite3 'SELECT * FROM agent_events'
kill %1
```

This uses a throwaway data folder, never `~/Keystal`. Do not paste the token anywhere it would be kept, such as chat or tickets.

## Blockers for Milestone D

None technical. Decisions and cautions:

1. **Configuring hooks:** the hook script reads the token from `<data folder>/watch-token`, so it needs the data-folder path (the same `KEYSTAL_OS_DATA`). Do not copy the token into hook settings that are synced or committed.
2. **No receiver:** hooks must fail silently with a short timeout when the server is down, which is common. Events from that time are lost unless the hook keeps a small local retry file. `event_key` already makes a later resend safe.
3. **Event keys:** the sender must generate a unique `event_key` per event (for example a UUID) and reuse it on retry.
4. **Production database:** still at v0. v6 and this endpoint reach it only through the Mac backup, restore test and `--migrate`.
5. **Token exposure through backups:** the token is protected by file permissions only. Any process running as your user can read it, which is acceptable on loopback. A workspace snapshot that copies the data folder would include it, but the default data folder is outside the repository.
6. **Carried over:** the open front-end findings and the out-of-date `RELEASE.md`.
