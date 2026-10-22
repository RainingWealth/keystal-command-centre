# Local release readiness

Scope: one trustworthy **local** release. Loopback only, no deployment, no paid APIs, no startup service. Claude Code monitoring and remote hosting are separate, later changes.

## Verdict

**Not ready to activate against production yet.** Your Mac run on 21 October (commit b881114) passed every step it could run. Three tests failed, and the backup and restore test were not run:

| Step on the Mac | Result |
| --- | --- |
| Other workspace preserved | **Done**: `~/Keystal/backups/keystal-command-centre-1-20261021T160155Z`, checksums verified |
| Test suite | 235 run, **3 failed**, 0 skipped |
| Real Hermes read, board `default` | **Passed**: 31 records, none rejected or dropped |
| `db_tool.py inspect` on production | **Passed**: integrity ok, original schema (v0), 4 migrations pending, no conflicts |
| `db_tool.py migrate-check` on production | **Passed**: v0 to v4 on a scratch copy, every row kept, live database unchanged |
| `verify.py` with real Hermes | **Passed**: 67 of 67, including a real chat turn and conversation memory |
| `db_tool.py backup` and `restore-test` on production | **Not run**: no destination folder was given |

**The 3 failures were the test setup, not the code under test.** All three create a "hot journal" (the file a writer leaves when it dies mid-transaction) and check that it is detected. The setup only works if SQLite writes part of the transaction to disk before the writer dies. On your Mac it did not, so the journal it left was not hot. SQLite rightly reported nothing to recover, and the tests failed. The same result reproduces in the sandbox whenever nothing is written to disk. The setup now makes the journal hot on any SQLite build, and it checks that before the test runs. If it ever cannot, the test fails with the SQLite version, the build options and the journal's first bytes, rather than "not detected".

**Not explained yet:** the Mac run also printed `sqlite3.OperationalError: disk I/O error` from a background thread. It does not reproduce in the sandbox with three SQLite versions. `tools/diagnose_sqlite.py` collects what is needed: which SQLite your Python uses, and the exact error code.

Before `python3 local-os/server.py --migrate`:

1. The test suite passes on the Mac at this commit: 0 failed, 0 skipped.
2. `python3 local-os/tools/diagnose_sqlite.py` has run on the Mac and its output has been reviewed.
3. `db_tool.py backup` and `restore-test` pass on the production database, and a copy of that backup is stored off the Mac (an external drive).

## Results recorded for code commit bc41c89 (cloud sandbox, 22 October 2026)

This documentation commit changes no code. Self-contained suite, `python3 -m unittest discover -s local-os/tests`, with Playwright 1.56 and Chromium present, so the browser tests ran (none skipped):

| File | Run | Passed | Failed | Errors | Skipped |
| --- | --- | --- | --- | --- | --- |
| test_agents_api | 53 | 53 | 0 | 0 | 0 |
| test_agents_ui (browser) | 15 | 15 | 0 | 0 | 0 |
| test_agents_ui_truth (browser) | 20 | 20 | 0 | 0 | 0 |
| test_db_tool | 31 | 31 | 0 | 0 | 0 |
| test_existing_features | 4 | 4 | 0 | 0 | 0 |
| test_kanban_truth | 42 | 42 | 0 | 0 | 0 |
| test_links_and_gate | 30 | 30 | 0 | 0 | 0 |
| test_migrations | 43 | 43 | 0 | 0 | 0 |
| test_tools | 6 | 6 | 0 | 0 | 0 |
| **Total** | **244** | **244** | **0** | **0** | **0** |

`verify.py`: 67 of 67 checks passed at bc41c89, against the **stub** Hermes CLI and a synthetic HOME. That is not a real-model result. The real-model result is the Mac run above, on b881114.

### Fixed since the Mac run (c893c49, bc41c89)

The disk I/O investigation reviewed the code paths it touches and found real defects. Each fix has a test that fails on the previous code:

- **Backups could overwrite each other.** Backups, migration backups, pre-quarantine backups and the database `restore` keeps aside were named to the second. A second one in the same second silently replaced the first; in the test, a restore overwrote an earlier kept database. Every such file is now created exclusively, with `-2`, `-3` and so on added if the name is taken.
- **False "NEEDS RECOVERY".** A live connection rolling back its own transaction looks like a crashed writer for a moment. The check now answers yes only if the hot journal is still there after short retries.
- **A busy database crashed `db_tool` with a traceback.** It now prints a JSON report that says the database was locked.
- **Startup crashed with a traceback** when the database could not be opened (another program mid-write, or an unreadable journal). It now stops with a message and changes nothing.
- **The hot-journal check now matches SQLite's exact error code** (SQLITE_READONLY_ROLLBACK) on Python 3.11 and later, instead of the message text. Other read-only errors are no longer mistaken for an interrupted transaction.
- **A database error looked like "server unavailable".** The page now shows "Local server error" with the reason. A manual Kanban refresh that could not be recorded returns an error instead of the previous read as if it were new. A chat turn whose result could not be saved is marked interrupted instead of showing "working" forever.

## Independent review so far

- **Requirements check, two passes.** Every gap that code can close is fixed and tested. What remains needs the Mac (the four steps above) or the other workspace's code.
- **Code review, seven reviewers with one lens each.** Twice cut short by a usage limit. Two reviewers finished: migrations and database, and Kanban truthfulness. They reported 14 findings. Their verifiers did not run, so each finding was reproduced by hand before fixing. All 14 were real, and all are fixed with a test: path characters bypassing the `--migrate` gate, hot-journal and foreign-key crashes, views holding table names, quarantine re-parenting foreign rows, instance relabelling, unreadable timestamps, unrecorded refresh failures, and four wording problems.
- **Mac failure investigation: three investigators, each followed by a verifier.** All three investigators finished. Two verifiers were cut short by usage limits twice.
  - **macOS SQLite builds** (verified): no published macOS SQLite build explains the missing spill. Python.org, Homebrew, uv and conda ship stock SQLite. Apple's current SQLite source is not public. 3.43.2 built with Apple's published options still spills in the sandbox, so the Mac's own `diagnose_sqlite.py` output is needed.
  - **Trying to disprove the test-setup diagnosis:** it holds for every stock SQLite build with normal file locking. That covers 16 builds and option sets from 3.37.2 to 3.54.1, plus PERSIST and TRUNCATE journals and several sync levels. It also found the edge cases fixed below and the limits listed under Known limits.
  - **The disk I/O error:** it does not reproduce in the sandbox. The defects found along the way are fixed (above).
- **Not yet reviewed:** five reviewers did not run (security, front end, tools and docs, concurrency, approval and provenance). This release has not had an independent pass through those lenses.

## Evidence classes

| Evidence | Class |
| --- | --- |
| The 244 tests above | **Simulated integration**: synthetic data, synthetic documents, stub Hermes CLI (`tests/fake_hermes.py`) |
| `verify.py` in the cloud sandbox | **Simulated**: stub Hermes, no real model |
| Real Hermes read, 31 records, board `default` | **Real**, on the Mac at b881114 |
| Production database inspect and migration check | **Real**, on the Mac at b881114: no conflicts, every row kept |
| Production database backup and restore test | **Not done** (step 3) |
| `verify.py` with real Hermes and model | **Real**, on the Mac at b881114: 67 of 67 |
| Test suite on the Mac | b881114: 3 failed (test setup, fixed). This commit: **not run yet** (step 1) |
| Other implementation compared (`task_store.py`, `hermes_kanban.py`) | **Done**: its real schema is in the test suite and the reconciliation path passes on it |
| Other workspace preserved | **Done** on the Mac |
| Physical phone | **Not applicable**: a loopback-only release is not reachable from a phone |

## Commands (on the Mac)

```sh
cd ~/Keystal/keystal-command-centre && git pull
DB=~/Keystal/outputs/keystal-os/local-state/workbench.sqlite3
python3 -m unittest discover -s local-os/tests                          # expect 0 failed, 0 skipped
python3 local-os/tools/diagnose_sqlite.py > ~/Keystal/backups/sqlite-diagnose.json
python3 local-os/tools/db_tool.py backup --db "$DB" --out ~/Keystal/backups/db
python3 local-os/tools/db_tool.py restore-test --backup <the "backup" path printed above> --db "$DB"
# then copy that backup file to an external drive
python3 local-os/tools/db_tool.py restore --backup <backup file> --db "$DB"     # dry run: how you would roll back
python3 local-os/tools/preview.py                                       # isolated preview: prints a 127.0.0.1 URL and the commit
```

The preview URL works only on the computer that runs it. A URL from the cloud sandbox cannot be opened on your Mac, so none is given here.

## Known limits

- **Hermes facts not yet confirmed on real Hermes.** Its JSON field names are undocumented: the parser needs only an id and a title per record, and the probe prints the field names it saw. What `--board <name>` does with a board that does not exist is undocumented, so the board label shows the **configured** name. The probe checks the name appears in `hermes kanban boards list`; the server does not, because that output format is undocumented too. Whether `hermes kanban list` caps its own output is undocumented; a Hermes-side cap would look like a complete read.
- Like any Hermes command, `hermes kanban list` may create or upgrade Hermes's own database when it runs. This app never asks Hermes to change a task.
- Reads are periodic (default every 5 minutes, `KEYSTAL_OS_KANBAN_REFRESH_SECONDS`, `0` = startup only) plus on demand. They prove a read, not worker liveness.
- The instance label (`KEYSTAL_OS_HERMES_INSTANCE`) is a name you choose; it does not select anything in Hermes.
- You can opt a task out of review and complete it without evidence. This is recorded and shown, and deliberately not blocked.
- The loopback cookie bootstrap (visiting `/` grants API access) is a local safeguard, **not** remote-user authentication.
- No ClickUp, Codex or Gemini adapter; ChatGPT, Claude, Codex and Gemini show NOT CONNECTED.
- **Keep the data folder on the Mac's own disk** (APFS), not in Dropbox, iCloud Drive, a network share or a WebDAV mount. On those, SQLite's file locking can be absent or emulated. A crashed write can then go undetected, or recovery can roll back a live writer. `diagnose_sqlite.py` reports the data folder's filesystem.
- **Power loss or a kernel panic:** SQLite's default on macOS does not force the journal to the physical disk before database pages (`PRAGMA fullfsync` is off). A sudden power cut could leave a damaged database that recovery cannot detect. The app has not changed this default. Turning it on would make each save slightly slower; the backups are the safeguard.

## Not part of this release

Claude Code monitoring through lifecycle hooks, and any remote or always-on hosting. Each needs its own change, review and acceptance gate.
