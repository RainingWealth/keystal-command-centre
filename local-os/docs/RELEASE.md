# Local release readiness

Scope: one trustworthy **local** release. Loopback only, no deployment, no paid APIs, no startup service. Monitoring and remote hosting are separate, later changes.

## Run it yourself (on the Mac)

```sh
git fetch origin && git switch claude/pensive-babbage-s85dsa
python3 -m unittest discover -s local-os/tests          # synthetic data, stub Hermes, no model calls
python3 local-os/tools/probe_hermes_kanban.py           # REAL Hermes read; prints counts and field names, no titles
python3 local-os/tools/preview.py                       # isolated loopback preview with synthetic data (prints URL + commit)
python3 local-os/verify.py                              # full integration suite: real Hermes, real model calls (may incur usage)
```

Then, for the production database, follow `RECONCILIATION.md` steps 3 and 4 and only then start with `--migrate`.

## Evidence classes

| Evidence | Class |
| --- | --- |
| Unit, API, migration, db_tool, UI tests | **Simulated integration**: synthetic data and a stub Hermes CLI (`tests/fake_hermes.py`) |
| `verify.py` run in the cloud sandbox | **Simulated**: stub Hermes, no real model |
| Real Hermes read adapter, 31 records | **Real**, reported by Keystal from the Mac against the earlier adapter. Re-run the probe on this commit |
| `verify.py` on the Mac with real Hermes and model | **Not yet run** |
| Physical phone | **Not applicable** to a loopback-only release; not run |

## Known limits

- Reads of the Hermes board are periodic (default every 5 minutes while the server runs; `KEYSTAL_OS_KANBAN_REFRESH_SECONDS`, `0` disables) plus on demand. They prove a read, not worker liveness.
- The Hermes JSON field names are undocumented. The parser needs only an id and a title per record; `probe_hermes_kanban.py` prints the field names it saw so the mapping can be checked without exposing board content.
- The loopback cookie bootstrap (visiting `/` grants API access) is a local safeguard, **not** remote-user authentication.
- No ClickUp, Codex or Gemini adapter; ChatGPT, Claude, Codex and Gemini show NOT CONNECTED.
- Reconciliation with the other local implementation is not complete: see `RECONCILIATION.md`.

## Not part of this release

Claude Code monitoring through lifecycle hooks, and any remote or always-on hosting. Each needs its own review and acceptance gate.
