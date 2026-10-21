# Local release readiness

Scope: one trustworthy **local** release. Loopback only, no deployment, no paid APIs, no startup service. Claude Code monitoring and remote hosting are separate, later changes.

## Verdict

**Not ready to activate against production yet.** The code is ready for you to verify on the Mac, and five of seven independent review lenses have not run yet. Activation stays blocked until the four Mac steps below are done and reviewed:

1. `tools/probe_hermes_kanban.py` passes against your real Hermes **on this commit** (the 31-record run was on the earlier adapter).
2. `db_tool.py backup`, `restore-test` and `migrate-check` pass on the **production** database, with a second backup copy off the Mac's disk.
3. `local-os/verify.py` passes on the Mac with real Hermes and real model calls.
4. The other workspace is preserved (`tools/preserve_workspace.sh`). Its two files have been compared and the decision is recorded in `docs/RECONCILIATION.md`.

Only then: `python3 local-os/server.py --migrate`.

## Results recorded for code commit 2f2298a (cloud sandbox, 21 October 2026)

This documentation commit changes no code. Self-contained suite, `python3 -m unittest discover -s local-os/tests`, with Playwright 1.56 and Chromium present, so the browser tests ran (none skipped):

| File | Run | Passed | Failed | Errors | Skipped |
| --- | --- | --- | --- | --- | --- |
| test_agents_api | 50 | 50 | 0 | 0 | 0 |
| test_agents_ui (browser) | 15 | 15 | 0 | 0 | 0 |
| test_agents_ui_truth (browser) | 19 | 19 | 0 | 0 | 0 |
| test_db_tool | 28 | 28 | 0 | 0 | 0 |
| test_existing_features | 4 | 4 | 0 | 0 | 0 |
| test_kanban_truth | 42 | 42 | 0 | 0 | 0 |
| test_links_and_gate | 30 | 30 | 0 | 0 | 0 |
| test_migrations | 41 | 41 | 0 | 0 | 0 |
| test_tools | 6 | 6 | 0 | 0 | 0 |
| **Total** | **235** | **235** | **0** | **0** | **0** |

`verify.py`: 67 of 67 checks passed, against the **stub** Hermes CLI and a synthetic HOME. That is not a real-model result.

## Independent review so far

- **Requirements check, two passes.** Every gap that code can close is fixed and tested. What remains needs the Mac (the four steps above) or the other workspace's code.
- **Code review, seven reviewers with one lens each.** Twice cut short by a usage limit. Two reviewers finished: migrations and database, and Kanban truthfulness. They reported 14 findings. Their verifiers did not run, so each finding was reproduced by hand before fixing. All 14 were real, and all are fixed with a test: path characters bypassing the `--migrate` gate, hot-journal and foreign-key crashes, views holding table names, quarantine re-parenting foreign rows, instance relabelling, unreadable timestamps, unrecorded refresh failures, and four wording problems.
- **Not yet reviewed:** five reviewers did not run (security, front end, tools and docs, concurrency, approval and provenance). This release has not had an independent pass through those lenses.

## Evidence classes

| Evidence | Class |
| --- | --- |
| The 198 tests above | **Simulated integration**: synthetic data, synthetic documents, stub Hermes CLI (`tests/fake_hermes.py`) |
| `verify.py` in the cloud sandbox | **Simulated**: stub Hermes, no real model |
| Real Hermes read, 31 records | **Real**, reported by Keystal on the Mac, against the **earlier** PR #1 adapter |
| Real Hermes read on this commit | **Not done** (step 1) |
| Production database backup, restore test, migration check | **Not done** (step 2) |
| `verify.py` on the Mac with real Hermes and model | **Not done** (step 3) |
| Other implementation compared (`task_store.py`, `hermes_kanban.py`) | **Done**: its real schema is in the test suite and the reconciliation path passes on it |
| Other workspace preserved | **Not done** (step 4) |
| Physical phone | **Not applicable**: a loopback-only release is not reachable from a phone |

## Commands (on the Mac)

```sh
git fetch origin && git switch claude/pensive-babbage-s85dsa
python3 -m unittest discover -s local-os/tests           # check the skipped count is 0
python3 local-os/tools/probe_hermes_kanban.py --board <your board>
python3 local-os/tools/db_tool.py inspect --db <production db>
python3 local-os/tools/db_tool.py backup  --db <production db> --out <a folder on another drive>
python3 local-os/tools/db_tool.py restore-test --backup <backup file> --db <production db>
python3 local-os/tools/db_tool.py migrate-check --db <production db>
python3 local-os/tools/db_tool.py restore --backup <backup file> --db <production db>   # dry run: how you would roll back
python3 local-os/tools/preview.py                        # isolated preview: prints a 127.0.0.1 URL and the commit
python3 local-os/verify.py                               # real Hermes and model calls; may incur usage
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

## Not part of this release

Claude Code monitoring through lifecycle hooks, and any remote or always-on hosting. Each needs its own change, review and acceptance gate.
