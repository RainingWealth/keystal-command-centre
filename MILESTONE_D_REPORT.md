# Milestone D report: Claude Code hook monitoring

Branch `claude/pensive-babbage-s85dsa`. Implementation commit: **b799731**.

- Nothing was installed in any Claude settings.
- The production database and the Mac configuration were not touched.
- No tunnel was set up, and PR #1 is not merged.

## Phase 1: Milestone C verified

Commit d330149 has a clean tree matching the remote. Before any change:

- **Full suite:** 305 run, 305 passed, 0 failed, 0 errors, 0 skipped.
- **Milestone C criteria all hold:**
  - bearer-token authentication only, compared in constant time, with the token file 0600;
  - browser cookie and CSRF rejected;
  - Origin and Host checks, and no CORS;
  - JSON only, up to 4 KB, unknown fields and invalid values rejected;
  - server-set `source` and `received_at`, timestamps stored in UTC;
  - 201, 200-duplicate and 409 responses;
  - no task changes, and no token leaks.
- **Open security issues:** none.

## Hook sender: `local-os/hooks/claude_watch_hook.py`

Python standard library only. Claude Code runs it as an **async** command hook, which the installed Claude Code schema (2.1.309) describes as "runs in background without blocking".

**What it does**
- Reads the hook JSON from stdin.
- Keeps only `hook_event_name` (`SessionStart`, `PostToolUse`, `Stop` or `SessionEnd`; anything else is ignored) and `session_id` (it must match the server's session rule).
- Sends:
  - `event_key = cc-<uuid4 hex>`;
  - `agent_id = claude`;
  - `session_ref` = the session id;
  - `event_type`;
  - `occurred_at` = UTC now. Hook payloads carry no timestamp, so the time the hook ran is the event time.
- The server sets `source = hook_reported` and `received_at`.

**What it never sends:** prompts, the last assistant message, transcript paths, `cwd`, tool names, tool inputs or tool results. They are parsed only to find the two fields above and then discarded.

**Token handling**
- The token is read from `<data folder>/watch-token`, where the data folder is `KEYSTAL_OS_DATA` or `~/Keystal/outputs/keystal-os/local-state`, the same as the server.
- It is used only if it is a regular file, not a symlink, owned by the user and unreadable by group and others.
- It is never kept in code or configuration.

**Network**
- A direct `http.client` connection to `127.0.0.1:<KEYSTAL_OS_PORT>` (default 8766), so proxy environment variables never see the token.
- A 1-second timeout on each network step.

**Failure behaviour:** it always exits 0 with no output. A stopped, hung or refusing server, a missing token or bad input never interrupts Claude Code. A failed send is dropped, with no retry file.

**Task safety:** the hook only creates `agent_events` rows. `Stop` and `SessionEnd` change no task, history, approval or session record, and no task is ever created.

## Tests

New file `local-os/tests/test_claude_hook.py` (8 tests), against a synthetic server and database:

- **Storage:** all four hooks stored as `claude` / session / `hook_reported`, with valid unique keys and UTC times.
- **Private content:** the outgoing payload has exactly 5 fields. Private strings (prompt, tool input and output, transcript path, cwd, secret, last message) are absent from the database dump and `/api/export`.
- **Task safety:** tasks, history, evidence, sessions and requests are unchanged after the four events.
- **Ignored input:** other hook types, bad or ID-number session ids, non-object, empty, malformed or non-UTF-8 input are all silent, exit 0 and send nothing.
- **Token cases:** a missing token, wrong token, world-readable token or symlinked token sends nothing, and the hook stays silent.
- **Dead or hung server:** a closed port gives exit 0 in under 3 seconds; a hung server gives exit 0 in under 4 seconds.
- **Proxy variables:** with proxy variables set, the event still goes straight to the loopback server and the proxy sees nothing.
- **Example config:** the four hooks are registered, each async, with no credentials in the command.

Full suite, `python3 -m unittest discover -s local-os/tests` (cloud sandbox, Playwright and Chromium present):

| Run | Passed | Failed | Errors | Skipped |
| --- | --- | --- | --- | --- |
| 313 | 313 | 0 | 0 | 0 |

## Example Claude Code configuration

`local-os/hooks/claude-settings.example.json`:

```json
{
  "hooks": {
    "SessionStart": [{"hooks": [{"type": "command", "command": "python3 \"$HOME/Keystal/keystal-command-centre/local-os/hooks/claude_watch_hook.py\"", "async": true, "timeout": 5}]}],
    "PostToolUse":  [{"matcher": "*", "hooks": [{"type": "command", "command": "python3 \"$HOME/Keystal/keystal-command-centre/local-os/hooks/claude_watch_hook.py\"", "async": true, "timeout": 5}]}],
    "Stop":         [{"hooks": [{"type": "command", "command": "python3 \"$HOME/Keystal/keystal-command-centre/local-os/hooks/claude_watch_hook.py\"", "async": true, "timeout": 5}]}],
    "SessionEnd":   [{"hooks": [{"type": "command", "command": "python3 \"$HOME/Keystal/keystal-command-centre/local-os/hooks/claude_watch_hook.py\"", "async": true, "timeout": 5}]}]
  }
}
```

No token appears in this file. The hook reads it from the data folder at run time.

## Installing and testing on the Mac (only after the production backup and restore verification)

1. **Prerequisites, in this order:**
   - the production backup;
   - `db_tool.py restore-test` passes;
   - a copy of the backup is stored off the Mac;
   - `python3 local-os/server.py --migrate` runs once (v0 → v6, with an automatic backup first).

   Then start the server normally. Its first start creates `watch-token` (0600) in `~/Keystal/outputs/keystal-os/local-state`.
2. **Check the receiver before touching Claude settings**, in Terminal:
   ```sh
   cd ~/Keystal/keystal-command-centre
   echo '{"hook_event_name":"SessionStart","session_id":"manual-check-1"}' | python3 local-os/hooks/claude_watch_hook.py; echo "exit $?"
   sqlite3 ~/Keystal/outputs/keystal-os/local-state/workbench.sqlite3 "SELECT event_type,session_ref,occurred_at,source FROM agent_events ORDER BY id DESC LIMIT 3"
   ```
   Expect `exit 0` and one `SessionStart | manual-check-1 | … | hook_reported` row.
3. **Install for one project first, not globally.** Copy the `hooks` block into `<that project>/.claude/settings.local.json`; that file is not committed. Merge it with any hooks already there; do not replace them.
4. **Use it:** open Claude Code in that project, run one prompt that uses a tool, then exit. Run the query from step 2 again. Expect SessionStart, one or more PostToolUse, Stop and SessionEnd rows for the new session id.
5. **Confirm nothing private was stored:**
   ```sh
   sqlite3 ~/Keystal/outputs/keystal-os/local-state/workbench.sqlite3 ".schema agent_events"
   ```
   There are no columns for prompt or tool data.
6. **Fail-safe check:** stop the Keystal server and use Claude Code again. It should behave normally, with no errors or delay. Those events are simply not recorded.
7. **To uninstall,** remove the `hooks` block. Stored events stay; they are append-only.

## Notes for the next milestone

- **SessionEnd may not fire** if Claude Code crashes or is killed. A `Stop` is the end of a response, not of a task. The session state rule ("active", "idle", "ended", or "unknown" after N minutes without events) belongs to the next milestone.
- **Events are lost while the server is down.** If they matter, add a small local retry file. `event_key` already makes a resend safe.
- **Every tool use fires `PostToolUse`.** That is one local POST per tool call. It is cheap, but busy sessions will create many rows; the dashboard should aggregate them.
- **Still open from before:** the front-end review findings, `RELEASE.md` refresh, and the Mac steps (test suite, `diagnose_sqlite.py`, production backup with its restore test).
