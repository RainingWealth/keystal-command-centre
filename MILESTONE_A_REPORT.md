# Milestone A report: reliable, tested baseline

Branch `claude/pensive-babbage-s85dsa`. Started from audited commit 5333d94 (plus `RAYVERN_AUDIT.md`, cad85eb). Fix commit: **fd11bb6**. Draft PR #1 is not merged. The production database was not opened, migrated or restored. Every backup and restore ran against temporary synthetic databases.

## Fixes

1. **`tools/db_tool.py` syntax error (line 394).** An `if` sat between `try:` and `finally:` in `cmd_restore`. That stopped every `db_tool` command and kept `test_db_tool` and `test_tools_review` from loading, about 40 tests. Fixed.
2. **Percent-encoded ID numbers.** A new `has_identifier()` in `agent_tasks.py` decodes repeatedly before checking, and refuses anything still encoded after five rounds. It applies to every text field (`field()`) and to evidence and link URLs (`evidence_url()`). The existing test `test_personal_identifiers_in_urls_never_reach_evidence_history_links_or_export` now passes.
3. **Restore into a missing destination.** It used to crash in `os.path.samefile`. Now:
   - the dry run creates nothing;
   - `--execute` creates the folder with permissions 0700 and installs the backup.
4. **Truthful restore failure reports.** If the copy into place fails:
   - the partial copy is removed;
   - the original database and its side files are renamed back;
   - the report says `executed: false` and either "The original database was put back unchanged" or "No database was installed".

   It used to leave a 0-byte database and say "Nothing was changed". A backup SQLite cannot read is now refused with a structured report ("nothing was changed") instead of a generic error.
5. **`preserve_workspace.sh` with a relative backup root.** The root is now resolved to an absolute physical path before the inside-the-source check, without creating anything. A root inside the workspace is refused with exit 2, and nothing is created in the source. Relative roots outside the source work.

Two older tests in `test_db_tool.py` expected a raised exception or a missing report key. They now check the documented contract: a JSON report with exit code 3.

## Test results

`python3 -m unittest discover -s local-os/tests` (cloud sandbox, Python 3.13, SQLite 3.45.1, Playwright 1.56 with Chromium):

| Result | Count |
| --- | --- |
| Run | 284 |
| Passed | 284 |
| Failed | 0 |
| Errors | 0 |
| Skipped | 0 |

Before the fixes, at 5333d94: 237 run, 3 failed, 2 errors, and `test_db_tool` and `test_tools_review` would not load.

The security, approval-gate and migration tests (`test_agents_api`, `test_links_and_gate`, `test_migrations`, `test_server_review`) all pass, including the v5 trigger tests.

New regression tests in `test_tools_review.py`:
- restore into a missing destination (one folder level and two);
- a failed install into a missing destination leaves nothing;
- a failed install over an existing database puts it back and reports so;
- a relative backup root inside the source is refused (three path forms).

## Environment-dependent tests

- **Browser tests (37):** `test_agents_ui` (15), `test_agents_ui_truth` (20) and `test_frontend_review` (2). They need Python Playwright and Chromium, and skip with a stated reason when those are missing. Here they ran.
- **Outside the suite:**
  - `local-os/verify.py` needs a real Hermes CLI and model calls;
  - `tools/probe_hermes_kanban.py` needs a real Hermes;
  - the production backup and restore check needs the Mac.

  None of these can run meaningfully in the cloud sandbox.

## Files changed (fd11bb6)

- `local-os/tools/db_tool.py`
- `local-os/agent_tasks.py`
- `local-os/tools/preserve_workspace.sh`
- `local-os/tests/test_tools_review.py`
- `local-os/tests/test_db_tool.py`

## Outstanding issues

- **Front-end findings still open** (`local-os/docs/REVIEW_FINDINGS.md`):
  - the error toast hidden behind the task dialog;
  - the open task dialog not refreshed by the poll;
  - Hermes preselected as the session agent;
  - focus loss and unnamed dialogs;
  - long IDs overflowing the dialog.
- **`/api/state` now carries the full export on every 4-second poll** (about 44% of the response in a 40-task test). It works, but it is wasteful and grows with history.
- **`preserve_workspace.sh` is cautious with unusual roots:** a root path that goes through a folder that does not exist yet and then `..` back out of it (for example `x/../../out`) is refused even when it ends outside the source.
- **Docs out of date:** `local-os/docs/RELEASE.md` and `REVIEW_FINDINGS.md` still describe an earlier state and need a pass once the remaining findings are closed.
- **Mac steps still pending:**
  - the test suite on the Mac;
  - `tools/diagnose_sqlite.py`;
  - the production backup and its restore test, with a copy kept off the Mac.
