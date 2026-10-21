# Reconciling the two local implementations

**Status: decided for code; one Mac step left.** Compared on 21 October 2026 against the files you supplied from `keystal-command-centre-1` (`task_store.py`, `hermes_kanban.py`). The rest of that workspace (its `server.py`, `app.js` and other changes) has not been seen, so step 1 below still matters before it is retired.

## Decision

**Canonical workspace:** `/Users/RayVern/Keystal/keystal-command-centre` on the PR #1 branch.
**Canonical implementation:** the PR foundation (`agent_tasks.py`, `migrations.py`).
**Retire:** `keystal-command-centre-1` and its `task_store.py` / `hermes_kanban.py`, after step 1.

## What is retained, what is retired, and why

| Alternative mechanism | Decision | Reason (from the code) |
| --- | --- | --- |
| `revision` column checked on every write (409 on mismatch) | **Retained, ported** | The PR protected only status changes with `expected_status`; edits from a second tab silently won. Now migration v4 adds `revision`, a trigger bumps it on every write path (the stale sweep included), and every task endpoint accepts it. The UI sends the revision it rendered. Tested per endpoint and with two browser tabs. |
| "Never import Hermes connection helpers: they may initialize, repair or migrate" | **Retained as a disclosure** | The PR reads through `hermes kanban list --json`, Hermes's own documented command. Like any Hermes command, it may create or upgrade Hermes's own database when it runs. This app never asks Hermes to change a task, but it cannot promise the CLI writes nothing to Hermes's files. Stated in `RELEASE.md` and the README. |
| `task_store.py` task records, `tasks` table | **Retired** | Allows creating a task directly as `completed` with review `pending` and no evidence (`write(..., 'create')` accepts any status). Confirmed by running it. The PR forbids this in the API and in database triggers. |
| Evidence as a JSON list of up to 10 URLs on the task | **Retired** | The PR keeps evidence as append-only rows with label, link, note and provenance. A note-only evidence item is possible, for output that has no URL. |
| `task_history` with a full JSON snapshot per action | **Retired** | The PR's history is per field (from/to, note, provenance, actor), append-only by trigger. Snapshots duplicate state and are not protected from edits. |
| `review` defaulting to `pending` on every task | **Retired** | It records a pending review on tasks that were never submitted. The PR's `review_state` is `none` until a task is awaiting review. |
| `agents(id, name UNIQUE, created)` | **Retired** | The PR's agents table also carries role and integration (observed vs not connected). Both use the same lowercase ids, so nothing maps differently. |
| Own `task_migrations` table, plain `CREATE TABLE` | **Retired** | The PR uses `PRAGMA user_version` with frozen migrations, structural conflict detection, backups and an explicit `--migrate`. The plain `CREATE` (fail loudly, never skip) is already the PR's rule from v3 on. |
| `hermes_kanban.py`: read Hermes's SQLite file directly (`KEYSTAL_HERMES_KANBAN_DB`), read-only, schema-checked | **Retired as the default; kept as a documented fallback idea** | The PR's CLI adapter is the one verified on real Hermes (31 records), uses the documented interface, and handles boards by name. Reading the file couples to an undocumented internal schema; a read-only connection also cannot read a WAL database without its `-shm` file, or recover a hot journal. If the probe shows the CLI misbehaving, the direct read is the fallback to revisit. |
| Its 200-row limit with a notice; "recorded status does not prove a worker is running" | **Already covered** | The PR announces truncation, accounts for every record, and says the same thing about board states. |
| Its 6 tests | **Covered** | Every behaviour they assert (migration atomicity, revision conflict, approval needs evidence, evidence URL rules, read-only board) is covered in this branch's suite, which also covers the gaps above. |

## Data: nothing to import

Keystal's read-only inspection found the production database at `user_version` 0 with only the original capture and chat tables. Neither implementation's task tables were present. So no production task data exists in the other implementation's format, and no importer is needed.

If a copy of the workbench database did receive the other implementation's tables (its `migrate()` writes into the same file), this branch handles it. That path is tested against the real schema, not a stand-in:

1. `db_tool.py inspect` reports `conflicting: tables from another implementation` (its `agents` table).
2. The server and `migrate-check` refuse before writing anything.
3. `db_tool.py quarantine --execute` takes a verified backup and renames only `agents`, to `quarantined_agents_<date>`. Its `tasks.agent_id` foreign key is rewritten to follow it, so its rows never attach to the new agents table. `tasks`, `task_history` and `task_migrations` stay as they are.
4. `migrate-check` then passes, and `--migrate` brings the database to the latest schema with every foreign row preserved.

## Step 1 (on the Mac): preserve the other workspace before retiring it

```sh
local-os/tools/preserve_workspace.sh /Users/RayVern/Keystal/keystal-command-centre-1
```

This writes a new timestamped folder under `~/Keystal/backups/`. It contains the git status, staged and unstaged patches, untracked files, a bundle of every branch, the stash list, a full copy and checksums. It only reads the source. Keep that folder, then stop using the `-1` workspace. **Do not push it to GitHub**: the repository is public.

## Step 2 (on the Mac): production database, read-only first

```sh
DB=~/Keystal/outputs/keystal-os/local-state/workbench.sqlite3
python3 local-os/tools/db_tool.py inspect --db "$DB"
python3 local-os/tools/db_tool.py backup --db "$DB" --out "<a folder on another drive>"
python3 local-os/tools/db_tool.py restore-test --backup <backup file> --db "$DB"
python3 local-os/tools/db_tool.py migrate-check --db "$DB"
```

Every command reads only, or works on a copy. Default backups go next to the database, on the same disk, so keep a second copy elsewhere. Activation is explicit (`python3 local-os/server.py --migrate`) and rollback is `db_tool.py restore` (see the README).
