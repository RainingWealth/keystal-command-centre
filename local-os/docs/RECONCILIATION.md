# Reconciling two local implementations

**Status: provisional.** This was written from the findings in the Keystal handoff of 20 October 2026. The cloud session that wrote it could not see either Mac workspace, the production database, or the `feature/ai-command-centre-v1` code (it is not on GitHub). Anything below marked *needs the code* has to be confirmed on the Mac before a retire/retain decision is final.

## Recommendation

**Canonical workspace:** `/Users/RayVern/Keystal/keystal-command-centre` (clean on `main`), on the PR #1 branch.
**Canonical implementation:** the PR foundation (`agent_tasks.py`, `migrations.py`).

Reasons that do not depend on seeing the other code: it has the migration framework and conflict detection, a database-level approval gate, 172 automated tests (the alternative has 6, and its direct creation with status `completed` bypasses approval), and its Kanban adapter has been run against the real Hermes CLI (31 records parsed).

## Step 1: preserve the other workspace (read-only on the source)

```sh
local-os/tools/preserve_workspace.sh /Users/RayVern/Keystal/keystal-command-centre-1
```

Writes a new timestamped folder under `~/Keystal/backups/` containing: the git status, staged and unstaged binary patches, a tarball of untracked files, a `git bundle` of all branches, the stash list, a full copy, and SHA-256 sums. It never resets, stashes, checks out or deletes anything in the source, and refuses to overwrite.

**Do not push that work to the public GitHub repository** to share it: `RainingWealth/keystal-command-centre` is public. Share only the specific files under review (for example `task_store.py` and `hermes_kanban.py`), after checking them for private data.

## Step 2: decide what to retire and what to port (needs the code)

| Alternative mechanism | PR foundation equivalent | Expected decision |
| --- | --- | --- |
| `task_store.py` (task store) | `agent_tasks.py` task functions, `agent_tasks`/history/evidence tables | Retire after porting any behaviour the PR lacks, with a test per ported behaviour. *needs the code* |
| `hermes_kanban.py` (adapter) | `agent_tasks.fetch_kanban` / `parse_kanban` | Retire if equivalent; diff the field mapping and status handling. *needs the code* |
| `agents` table (incompatible columns) | `agents` table (`role`, `integration`, ...) | Not migrated automatically. Quarantined, never merged blindly (step 4). |
| Its 6 tests | The 172-test suite | Port any that assert behaviour not already covered. *needs the code* |
| Direct creation as `completed` (review `pending`, no evidence) | Rejected by the API and by the database | This is a defect to retire, not a feature to keep. |

## Step 3: production database, read-only first

Every command below opens the database read-only or works on a copy. None changes it.

```sh
python3 local-os/tools/db_tool.py inspect --db <path>        # schema + row COUNTS only, never content
python3 local-os/tools/db_tool.py backup  --db <path>        # online backup, verified
python3 local-os/tools/db_tool.py restore-test --backup <file> --db <path>   # restores into scratch, dry-runs the migration
python3 local-os/tools/db_tool.py migrate-check --db <path>  # migrates a COPY, proves no row is lost
```

The server will not migrate an existing database on its own. Activation is explicit: `python3 local-os/server.py --migrate` (a backup is taken first). Without the flag it exits with these steps and changes nothing.

## Step 4: if a database was initialised by the other implementation

`inspect` reports `conflicting: tables from another implementation`, and both the server and `migrate-check` refuse before writing anything. To get past it without losing data:

```sh
python3 local-os/tools/db_tool.py quarantine --db <path>             # dry run: shows the plan
python3 local-os/tools/db_tool.py quarantine --db <path> --execute   # backup first, then rename
```

Conflicting tables are **renamed** (`quarantined_<name>_<date>`), never deleted; their index/trigger definitions are saved beside the backup. It refuses if a view or trigger elsewhere depends on them. Importing the other implementation's tasks into this schema is a separate reviewed step *(needs the code)*: nothing here guesses its meaning.

## What was verified without the Mac

The migration, conflict and quarantine paths are tested against a **synthetic stand-in** for the other implementation (an `agents` table with different columns and a `tasks` table), because its real schema was not available. The detection is generic (any pre-existing table that a migration would create with different columns), so it does not depend on that guess, but a run against the real alternative database on the Mac is still required.
