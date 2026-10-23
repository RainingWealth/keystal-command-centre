# Milestone B report: append-only agent event storage

Branch `claude/pensive-babbage-s85dsa`, baseline fd11bb6. Feature commit: **65d210f**.

Storage only: no API endpoint, hooks or front-end changes. The production database was not opened or migrated, and PR #1 is not merged.

## Migration v6: `agent_events`

| Column | Rule |
| --- | --- |
| `id` | INTEGER PRIMARY KEY AUTOINCREMENT |
| `event_key` | the sender's unique event id; UNIQUE; 16–80 characters from `[A-Za-z0-9_-]` |
| `agent_id` | NOT NULL, foreign key to `agents(id)` (`claude`, `codex`, `gemini`, `hermes`, `chatgpt`) |
| `session_ref` | 1–128 characters from `[A-Za-z0-9._:-]` |
| `run_ref` | optional (`''`), at most 128 characters, same character set |
| `event_type` | one of `SessionStart`, `PostToolUse`, `Stop`, `SessionEnd` (exact case) |
| `occurred_at`, `received_at` | 19–35 characters; must start `YYYY-MM-DDTHH:MM:SS` and be parseable by SQLite |
| `source` | `hook_reported` (an agent's own tooling) or `observed` (this server, e.g. Hermes) |

Metadata only. There are no columns for prompts, transcripts, tool arguments or results.

- **Append-only:**
  - `BEFORE UPDATE` and `BEFORE DELETE` triggers raise "agent events are append-only".
  - `REPLACE` cannot overwrite a stored row: reusing a row `id` is refused, and reusing an `event_key` is ignored.
- **Duplicate handling, with no queue:**
  - A re-delivered `event_key` is silently ignored by a `BEFORE INSERT` trigger. The first delivery wins.
  - The insert's row count is 0, which tells a future endpoint it was a duplicate.
- **Indexes:**
  - `agent_events_agent_recent(agent_id, occurred_at)`;
  - `agent_events_session(agent_id, session_ref, occurred_at)`;
  - the UNIQUE index on `event_key`.

  The tests confirm recent-activity queries use these indexes with no sort step.
- **Compatibility:**
  - There is no foreign key to tasks and no trigger on task tables. An event never completes or changes a task: `Stop` means a response ended, not the task.
  - Events join `agent_task_sessions` on `(agent_id, session_ref)`.
- **Migration path:** additive only. It runs through the existing framework: online backup first, one transaction, `--migrate` required for an existing database.
- **Frozen migrations:** v5 is now frozen in `FROZEN_HASHES` (`29e9db76…`).
- **Schema map:** `db_tool.py SCHEMA_CODE` gains v6, and v5 now names Milestone A.

## Tests

New file `local-os/tests/test_agent_events.py` (8 tests):

- **v5 → v6 with real data:** every existing row is unchanged, a backup is taken, integrity is ok, only the expected objects are added, and the pre-gate task stays flagged.
- **Fresh database:** reaches v6 with no events invented.
- **Storage:** all four event types, plus Hermes `observed` events, are inserted and read back by agent and session.
- **Indexes:** the query plans use both indexes.
- **Append-only:** UPDATE, DELETE and both REPLACE forms are rejected, and the stored row is unchanged.
- **Duplicates:** a duplicate `event_key` is ignored with row count 0, and the first delivery is kept.
- **Invalid input:** 19 invalid or oversized values and 7 missing required fields are refused.
- **No task changes:** `Stop` and `SessionEnd` change no task, task session or history row.

Full suite, `python3 -m unittest discover -s local-os/tests` (cloud sandbox, Playwright and Chromium present):

| Run | Passed | Failed | Errors | Skipped |
| --- | --- | --- | --- | --- |
| 292 | 292 | 0 | 0 | 0 |

The existing migration, frozen-hash, approval-gate and security tests all pass at v6.

## Files changed (65d210f)

- `local-os/migrations.py`: migration v6
- `local-os/tests/test_agent_events.py`: new
- `local-os/tests/test_migrations.py`: v5 added to `FROZEN_HASHES`
- `local-os/tools/db_tool.py`: `SCHEMA_CODE` entry for v6

## Blocking or deciding Milestone C

Nothing blocks it technically. Decide these before building the endpoint:

1. **Agent ids:** the table accepts `agents.id` values (`claude`, `codex`, `gemini`, `hermes`). The endpoint must map Claude Code to `claude`, Codex CLI to `codex` and Gemini CLI to `gemini`.
2. **Duplicate check:** a duplicate is detected by row count 0. Duplicates with different content are dropped silently. Decide whether the endpoint should return 200 "duplicate" or 409 for those.
3. **Timestamps:** the database accepts any timezone offset. The endpoint should store UTC (`+00:00`), as the rest of the app does, so time ordering is exact.
4. **Event authentication:** the token, the field allow-list and the identifier check are the endpoint's job. The database only enforces shape.
5. **Migration on the Mac:** the production database is still at v0. v6 arrives through the same `--migrate` step, still gated on the Mac backup and restore test from earlier milestones.
6. **Carried over from Milestone A:** the open front-end findings and the out-of-date `RELEASE.md`.
