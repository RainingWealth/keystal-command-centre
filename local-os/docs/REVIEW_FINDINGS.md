# Open review findings (to fix before activation)

Five reviewers covered security, front end, tools and docs, concurrency, and approval and provenance. Their review ran on commit c7ef6d5. A separate verifier re-ran every finding against the real code: **40 confirmed, 1 refuted**. Some findings were reported more than once; merged, that leaves the 34 distinct defects below, grouped by the files they touch. **None is fixed yet.** Fix each one with a regression test that fails on the current code, and keep the full suite at 0 failed, 0 skipped.

## Decisions already made (implement exactly)

1. **One live server per data folder.**
   - `server.py` takes `fcntl.flock(LOCK_EX | LOCK_NB)` on `<data folder>/keystal-server.lock` (created 0600 if missing). It holds the lock for the whole process lifetime.
   - If the lock is held, exit 2 with "Another Keystal OS server is already using <folder>. Nothing was changed." This happens **before** the database is touched.
   - Startup order: lock, bind the HTTP socket (exit before `init()` if the port is taken), `init()`, start the Kanban thread, `serve_forever()`.
   - `db_tool.py restore --execute` and `quarantine --execute` refuse while that lock is held (try a non-blocking flock; `BlockingIOError` means a live server), in addition to the port check. Read-only commands must not create the lock file.
2. **Session cookie per port:** name it `keystal_local_<PORT>`, both where it is set and where it is read. Update `verify.py`'s cookie check to match.
3. **Database rules go in a new migration v5.** Do not edit v1–v4; add v4's hash to `FROZEN_HASHES` in `tests/test_migrations.py`. v5 must:
   - refuse an UPDATE that completes a task whose `OLD.requires_review = 1`, unless `review_state = 'approved'` with evidence;
   - refuse switching `requires_review` from 1 to 0 when `OLD.status IN ('awaiting_review', 'completed')` or `NEW.status = 'completed'`;
   - refuse moving `review_state` to `'approved'` except from `awaiting_review` with a pending review. Keep `agent_tasks.review_task` working;
   - add BEFORE INSERT triggers so INSERT OR REPLACE / REPLACE cannot rewrite history, evidence or session rows, or move an `external_refs` link. Match on `id` and on each UNIQUE tuple.

   `invariants()` should also flag completed rows that require review but whose review is still `pending`. Pre-gate rows (see `pr_v2_with_pre_gate_row` in the tests) must still migrate and stay flagged. Add v5 to `SCHEMA_CODE` in `db_tool.py`: v4 is "this branch up to c7ef6d5", and v5 is "the current code".
4. **Migrations never move backwards:** `migrate()` re-reads `PRAGMA user_version` inside each `BEGIN IMMEDIATE` and skips versions already applied.
5. **Chat run updates:** `run_hermes` and `fail()` only update a run that is still `running`. A completed run must not keep an error.


## Server, database and API

Files: server.py, agent_tasks.py, migrations.py, verify.py and their tests.

### 1. [major] Two concurrent migrations (server started twice with --migrate) can rewrite user_version from 4 back to 2; the next start refuses the database

`local-os/migrations.py:379` · id `concurrent-migrate-downgrades-user-version`

**What goes wrong.** The owner runs the documented activation `python3 local-os/server.py --migrate` twice at about the same time (two terminals, or a launcher clicked twice). Same port or different ports makes no difference, because init() at server.py:109 migrates before the port is bound at server.py:425. migrate() reads `current` once at line 379, outside any lock. Both processes read 0. Process A then applies v1..v4 and keeps serving. Process B's BEGIN IMMEDIATE at line 384 waits for A and then replays v1 and v2. Those are idempotent (IF NOT EXISTS, INSERT OR IGNORE), and line 388 sets user_version to 1 and then 2. B dies at v3 ('table projects already exists'). The database now has the v4 schema but user_version 2. A keeps running. At the next restart the server refuses with 'has tables that conflict with this version (agent_tasks, ...), probably from another implementation. Nothing was changed.' db_tool inspect says 'altered keystal schema ... needs manual review', and quarantine refuses. No tool or document offers a recovery. The obvious move, restoring the pre-migration backup, loses everything written since.

**How it was confirmed.** I reproduced this two ways. (1) Real servers: f1_double_migrate.py builds a v0 database holding one capture, then starts two `server.py --migrate` together on different ports, 20 times. In 1 of 20 runs the database ended at user_version 2 with the full v4 schema (the revision column is present). In that run the second process died with `sqlite3.OperationalError: table projects already exists` and the first kept running. The next plain start refused with exit 2: 'has tables that conflict with this version (agent_tasks, ..., agent_tasks_project, kanban_snapshot), probably from another implementation.' A `--migrate` start refused the same way. `db_tool inspect` exited 3: 'altered keystal schema ... needs manual review'. The capture row was kept. (2) Deterministic, in process (f1_deterministic.py): migrate() reads `current` once at migrations.py:379, outside any lock, and lines 383-388 then …

**Suggested fix.** Inside each BEGIN IMMEDIATE in migrate(), re-read PRAGMA user_version and skip any version already applied (abort if it is not version-1), so the version can never move backwards. Separately, take a single-instance lock (fcntl.flock on DATA/server.lock, or bind the listening socket) in server.py before init(), so a second server stops before touching the database.

### 2. [major] /api/chat releases BUSY when writing the 202 fails, while the turn thread still holds and later releases it

`local-os/server.py:399` · id `busy-released-twice-on-send-failure`

**What goes wrong.** The browser sends a chat, then goes away (reload, closed tab or client timeout) before the 202 is written. This is most likely while the insert is waiting on a SQLite lock, which can last up to 15 s. The run row is committed and run_hermes is started, but self.send(202) at line 399 raises ConnectionResetError or BrokenPipeError inside the try. The except at 400-402 then calls BUSY.release(), though run_hermes will release it again at line 230. While turn 1 is still running: runtime.busy reads False; the next /api/state sweep (line 126) marks the live run 'interrupted' with 'The local bridge stopped without recording a result ... Nothing was retried' and logs an error event; and a second chat is accepted, so two Hermes turns run at once. When turn 1 ends, its release frees turn 2's lock. Turn 2's own release then raises 'RuntimeError: release unlocked lock', and turn 2 runs unguarded in the meantime. Turn 1 is finally overwritten to 'completed' but keeps the interruption error text.

**How it was confirmed.** Reproduced on a real harness server with f2_busy_double_release.py. A helper connection holds BEGIN IMMEDIATE for 1 s, chat-delay is 6 s, and a raw-socket POST /api/chat is sent and then closed after 0.3 s. I tried both a plain close() (FIN, as a browser reload does) and SO_LINGER 0 (RST); both gave the same result. While turn 1 was still running (chat-done absent): `runtime.busy=False`, Hermes `working_now=False`, run = 'interrupted' / 'The local bridge stopped without recording a result ... Nothing was retried.' A second chat was then accepted with 202, and two `chat --oneshot` calls reached Hermes. After both turns: `[('completed',''), ('completed','The local bridge stopped without recording a result ...')]`, plus the error event 'A Keystal turn ended without a recorded result'. Server stderr showed BrokenPipeError (or ConnectionResetError with RST), `BUSY.release()` and …

**Suggested fix.** Release BUSY in that except only if the thread was never started: set started=True after .start() and check it in the except, or move `return self.send(202, ...)` out of the try. After a successful start, only run_hermes owns the lock.

### 3. [major] A second server.py on the same data folder marks the live server's in-flight turn 'interrupted: Local server restarted' before failing to bind

`local-os/server.py:115` · id `second-server-init-rewrites-live-runs`

**What goes wrong.** The owner starts server.py while it is already running (the usual double start). init() runs before the port is bound (server.py:423-425). At line 115 it executes `UPDATE runs SET status='interrupted', error='Local server restarted; request was not retried automatically.' WHERE status='running'` on the live database. It also starts a Kanban read thread, then dies with 'Address already in use', so the owner believes nothing happened. Meanwhile the live server is still busy with that turn. The chat panel shows 'Local server restarted; request was not retried automatically.' as an error while Send says 'Working…'. The owner may re-send the request in the main Hermes app, duplicating the work. When the turn finishes, run_hermes's UPDATE at line 222 has no `AND status='running'` guard and does not clear `error`. The run becomes 'completed' but keeps the false restart error, which the export then carries. With a second server on another port and the same data folder, which nothing prevents, each server's sweep_orphan_runs marks the other's live turns interrupted and logs an error event.

**How it was confirmed.** Reproduced with f4_second_server.py: a live harness server with an 8 s chat turn in flight, then a second server.py with the same environment. Same port: the second process exited 1 with 'OSError: [Errno 98] Address already in use'. On the live server, while the turn was still running: `busy = True | run = interrupted | Local server restarted; request was not retried automatically.` After the turn ended: `run = completed | error = Local server restarted; ...`. hermes.log showed an extra `kanban list` from the process that then failed. On a different port with the same data folder the result was identical, and the second server stays up. The cause is that init() runs the UPDATE at server.py:115 (and line 424 starts the Kanban thread) before the socket is bound at line 425. run_hermes's UPDATE at line 222 neither checks status='running' nor clears `error`. In the UI (app.js:273-278), …

**Suggested fix.** Take a single-instance lock (flock on DATA/server.lock) and bind the HTTP socket BEFORE init() and before starting the Kanban thread; exit before touching the database if either fails. Make run_hermes's and fail()'s UPDATEs conditional on status='running', or clear `error` when completing, so a run never ends as completed-with-an-interruption-message.

### 4. [major] Database completion gate is bypassed by clearing requires_review in the same UPDATE, even mid-review, and nothing records or flags it

`local-os/migrations.py:132` · id `db-gate-requires-review-flip`

**What goes wrong.** A review-required task (requires_review=1) is in awaiting_review with a pending review and no evidence. Any non-API writer (the hook, import or manual SQL that the comment at migrations.py:126-127 says the triggers exist to stop) runs: UPDATE agent_tasks SET status='completed', requires_review=0 WHERE id=?. agent_tasks_completion_gate_update only checks NEW.requires_review=1, so the statement succeeds. The task is now completed with no approval and no evidence. It also ends up in a state the API can never produce (completed with review_state 'pending'), and the switch is not in history. invariants() and db_tool report 0. The dashboard shows the task as COMPLETED · REVIEW PENDING · NO REVIEW REQUIRED (YOUR CHOICE), so the bypass is blamed on the owner's choice. The API refuses both steps (it blocks switching review off mid-review, and it blocks completing). Second shape: a writer can go straight from queued/rejected to completed+approved with status_source 'agent_reported', with no awaiting_review step and no pending review. Any old evidence satisfies the trigger. Neither shape is reachable through the HTTP API. Both contradict the README, which says the rule is enforced by triggers 'so no write path can bypass it while review is required', and the brief, which says the rule must hold on the triggers too.

**How it was confirmed.** Reproduced against HEAD with (sandbox script) I started a real server with the harness, created a codex task (requires_review=1) and moved it to awaiting_review through the API. The API refuses to turn review off mid-review: (400, 'Resolve the pending review before turning review off.'). Through SQL on the same DB, recursive_triggers=0: `UPDATE ... SET status='completed'` is refused, but `UPDATE ... SET status='completed', requires_review=0` is ALLOWED. The row becomes ('completed','pending',0,'agent_reported') with 0 evidence rows. invariants() returns completed_without_approval_and_evidence 0, and so does db_tool, which uses invariants(). History holds only created and queued->awaiting_review: no requires_review switch and no completion. The cause is migrations.py:132, `WHEN NEW.status='completed' AND NEW.requires_review=1 AND ...`, which never reads OLD.requires_review. Nothing at …

**Suggested fix.** Shipped migrations are frozen, so add migration 5 with triggers that (a) refuse an UPDATE that sets NEW.status='completed' when OLD.status!='completed' AND OLD.requires_review=1, unless NEW.review_state='approved' with evidence; (b) refuse requires_review 1->0 when OLD.status IN ('awaiting_review','completed') OR NEW.status='completed'; (c) refuse a transition into review_state 'approved' unless OLD.status='awaiting_review' AND OLD.review_state='pending' AND NEW.status_source='manual'. Include the single-statement flip in test_the_database_itself_refuses_a_bypass, and have invariants() flag completed rows whose review_state is 'pending'.

### 5. [major] INSERT OR REPLACE rewrites 'append-only' history, evidence and sessions in place (including relabelling them observed) and moves an 'immutable' link to another task

`local-os/migrations.py:71` · id `append-only-bypassed-by-replace`

**What goes wrong.** The append-only and immutable rules are BEFORE UPDATE and BEFORE DELETE triggers only. These are at migrations.py:71-74 (history and evidence), :108 (external_refs_immutable) and :122-123 (sessions). With recursive_triggers off (the default, as here), SQLite does not fire delete triggers for REPLACE conflict resolution. So any writer using the common INSERT OR REPLACE / REPLACE INTO idiom with an existing id can replace a history row, an evidence row or a session row wholesale. Examples: change an approval note, swap the evidence an approval was based on for a different URL, or relabel a manual entry as source='observed', actor='Keystal OS' (a forged server observation in the audit trail). REPLACE on the link identity tuple also moves a ClickUp or Hermes link to a different task without unlink/link or any history line. The app itself already uses INSERT OR REPLACE (for meta). The README says these records are 'append-only at the database level', and the schema comment says 'a link cannot be edited; unlink and link again'. Neither holds against this idiom. Not reachable through the HTTP API.

**How it was confirmed.** Reproduced with (sandbox script) against a real server DB, recursive_triggers=0. UPDATE history, DELETE evidence, UPDATE external_refs and an ON CONFLICT DO UPDATE upsert on evidence are all refused by the triggers. Four REPLACE statements are ALLOWED: REPLACE INTO agent_task_history with the id of the approval's review row, INSERT OR REPLACE INTO agent_task_evidence with the approved evidence id, INSERT OR REPLACE INTO agent_task_sessions, and INSERT OR REPLACE INTO external_refs on the (provider,instance,scope,external_id) tuple pointing at task B. Results read back through the API: the review history row is now ('review','REWRITTEN','observed','Keystal OS'); task A's only evidence is ('Swapped evidence','https://evil.example/','observed'); the session is now claude/sess-other/observed; task A has refs [] and task B has cu-1, with no link line in B's history. SQLite fires delete …

**Suggested fix.** In a new migration, add BEFORE INSERT triggers that RAISE(ABORT) when the row already exists: WHEN EXISTS(SELECT 1 FROM agent_task_history WHERE id=NEW.id), and the same for agent_task_evidence and agent_task_sessions (by id and by the UNIQUE tuple). For external_refs, check id and (provider,instance,scope,external_id). Verified in (sandbox script) that such a trigger blocks REPLACE. The trigger raises a constraint error, so link_task and add_session still see sqlite3.IntegrityError. Add REPLACE cases to test_history_and_evidence_are_append_only and test_a_link_cannot_be_edited_only_removed.

### 6. [minor] Preview and real server use the same cookie name on 127.0.0.1, so opening the preview logs the real tab out

`local-os/server.py:264` · id `cookie-shared-across-local-ports`

**What goes wrong.** Browser cookies are not isolated by port. Every server sets `keystal_local=<token>; Path=/` for host 127.0.0.1, including the preview from tools/preview.py (new in this diff and listed among the Mac commands in RELEASE.md). The owner has the real app open at 127.0.0.1:8766 and opens the preview at 127.0.0.1:8767 in the same browser. The preview overwrites the real server's cookie. The real tab's 4-second poll then gets 401: its status line reads 'Local server error — Open Keystal OS on this Mac first.' and Ask Keystal is disabled until the page is reloaded, which in turn breaks the preview tab. Any other loopback service the owner opens in the browser also receives the real token in its Cookie header, which a port-qualified cookie name would make explicit rather than shared.

**How it was confirmed.** I reproduced this with Playwright and Chromium (/opt/pw-browsers) using (sandbox script) two harness servers on different 127.0.0.1 ports, one browser context. Output: 'real tab status before: Local workspace connected', then 'preview tab status: Local workspace connected', then 'real tab status after opening preview: Local server error — Open Keystal OS on this Mac first.' and 'real tab send disabled: True'. The context holds one cookie, [('keystal_local', '127.0.0.1', ...)]. Reloading the real tab fixes it but breaks the preview tab the same way. Cause: server.py:264 sets 'keystal_local={TOKEN}; HttpOnly; SameSite=Strict; Path=/' with no per-port name, browser cookies are not scoped by port, and authorised() at server.py:247-250 reads the same name. No data is lost and the owner recovers by reloading, so minor. The token also goes to every other 127.0.0.1 service, but loopback is …

**Suggested fix.** Name the cookie per port, e.g. f'keystal_local_{PORT}', and read the same name in authorised().

### 7. [minor] The personal-identifier (NRIC) guard skips evidence and ClickUp link URLs, and the value then becomes undeletable

`local-os/agent_tasks.py:133` · id `identifier-guard-bypassed-by-url-fields`

**What goes wrong.** Every free-text task field goes through field(), which rejects [STFGM]1234567X identifiers (test_personal_identifiers_rejected_in_every_free_text_field). evidence_url() never applies SENSITIVE. A link such as https://drive.example.com/clients/S1234567D/report, or a ClickUp url with ?client=S1234567D, is accepted. The evidence URL is also copied into the history note (line 354: note=url or note). Both tables are append-only by trigger, so the identifier cannot be removed through the app or plain SQL. It also appears in /api/export.

**How it was confirmed.** I reproduced this with (sandbox script) 'evidence label with NRIC: (400, Remove personal identification numbers...)' compared with 'evidence url with NRIC: (201, ok)' and 'clickup url with NRIC: (201, ok)'. Task detail echoes the evidence URL, and the history note for the evidence row contains it (agent_tasks.py:354, note=url or note). 'NRIC present in export: True'. Plain SQL DELETE on agent_task_evidence and UPDATE on agent_task_history are refused with 'evidence is append-only' and 'history is append-only'. Cause: evidence_url() at local-os/agent_tasks.py:133-142 never applies SENSITIVE (line 31), while field() does at line 102. One correction to the reported scenario: the ClickUp link URL (line 423) can be removed. /api/agent-tasks/unlink deletes the external_refs row, and the link's history entry stores only provider:instance/scope/external_id, never the URL. After unlink the …

**Suggested fix.** In evidence_url(), apply the SENSITIVE check to the URL (including its path and query) and raise the same ApiError. Add URL cases to the identifier test.

### 8. [minor] One /api/state (and /api/export) response mixes database states: tiles and the task list disagree, and Kanban counts disagree with the rows shown

`local-os/server.py:134` · id `state-response-not-a-snapshot`

**What goes wrong.** getstate() makes about 15 separate SELECTs on one connection with no read transaction (autocommit, rollback journal). Any write committed between them shows in some parts of the response and not others: a task create or status change from another tab, the Kanban loop's store, or a link. The agent tiles and totals (overview) then disagree with the task list in the same response. kanban_view reads meta, then external_refs, then the snapshot rows. A link or store landing in between shows 'received X · shown N' beside a different number of rows, and can count a just-linked card twice (as board-only and through its task) for one poll. /api/export (server.py:297-301) builds its file from getstate() and then a second connection, so the exported agent_tasks and agent_task_history can come from different moments.

**How it was confirmed.** Reproduced with f5_state_snapshot.py: one writer thread creates Claude tasks through the API while a reader polls /api/state for 10 s. Result: {'polls': 256, 'responses where tile != list': 187, 'first sample': {'claude tile total': 4, 'claude tasks listed': 5}}. getstate() (server.py:134-156) runs about 15 autocommit SELECTs. Python 3.13's legacy sqlite3 mode issues no BEGIN before a SELECT, and the sweeps write nothing in the common case. So overview(), list_tasks() and kanban_view() each see a different committed state. /api/export (lines 297-301) calls getstate() and then export_rows() on a second connection, which has the same gap. The rate here is inflated by a constant writer. In single-user use it affects the odd poll that overlaps a write, and the next poll corrects it. Minor.

**Suggested fix.** Run the sweeps in their own short committed transaction. Then do all of getstate's reads, and export_rows for /api/export, inside one read transaction on one connection: BEGIN before the first SELECT, COMMIT after the last. Do not start a deferred transaction with a read and then write in it, because SQLite returns SQLITE_BUSY without the busy handler in that case.

### 9. [minor] sweep_orphan_runs logs 'A Keystal turn ended without a recorded result' even when its UPDATE changed nothing

`local-os/server.py:130` · id `orphan-sweep-logs-unconditionally`

**What goes wrong.** A poll's SELECT at line 126 sees the in-flight run as 'running'. Before BUSY.acquire runs, run_hermes commits 'completed' and releases BUSY. The sweep then acquires BUSY, its UPDATE matches 0 rows, and line 130 still inserts the error event 'A Keystal turn ended without a recorded result — no completed result claimed' for a turn that did record its result. While the sweep holds BUSY, a chat POST also gets a spurious 409.

**How it was confirmed.** In server.py:126-130 the error event is inserted whenever BUSY.acquire succeeds after the SELECT saw a running row, without checking the UPDATE's rowcount. f6_orphan_event.py imports the real server module on a real SQLite file. (A) A forced interleaving, where BUSY.acquire first records 'completed' and releases the turn's lock, gave run ('completed', None) plus the event 'A Keystal turn ended without a recorded result — no completed result claimed'. In real use that window is microseconds; the reviewer's 224 live turns did not hit it either. (B) Without forcing: one genuinely orphaned run and two simultaneous getstate() calls (two open tabs) logged the error event twice in 17 of 30 trials. The second sweep acquires BUSY after the first releases it, waits on the first connection's uncommitted UPDATE, matches 0 rows and logs anyway. While it waits it also holds BUSY, so a chat POST in …

**Suggested fix.** Log the event only when the UPDATE's rowcount is greater than 0 (re-check after acquiring BUSY).

### 10. [minor] verify.py's 'No agent activity is invented on a fresh workspace' passes or fails depending on whether the background Kanban read has finished

`local-os/verify.py:96` · id `verify-races-startup-kanban-read`

**What goes wrong.** The check requires every agent's counts to be 0. The Hermes card's counts deliberately include unlinked board cards from the startup read, which kanban_loop performs asynchronously. With a Hermes whose board has an active card, verify fails with a message saying the app invented activity if the read lands within the first second or two. If the read is slower, verify passes 67/67. The 'Real' verify evidence in RELEASE.md (67 of 67 on the Mac, board with 31 records) therefore depends on timing, and a fast Hermes on the same Mac would fail this check.

**How it was confirmed.** f7_verify_timing.py runs verify.py twice against the same stub board (SYNTHETIC_KANBAN, which holds ready, running and blocked cards), with a scratch HOME and TMPDIR. With a fast read: exit 1, passed 25, `AssertionError: No agent activity is invented on a fresh workspace`. With a wrapper that delays only `kanban list` by 3 s and returns the same board: exit 0, passed 67. The check at verify.py:96 requires every agent's counts to sum to 0. overview() (agent_tasks.py:682-683) deliberately adds unlinked board cards to the Hermes tally, and the startup read runs asynchronously in kanban_loop. So the result depends on whether that read finishes before the 25 earlier checks do. It is a false failure, never a false pass. I cannot confirm the reviewer's inference that the recorded Mac 67/67 on b881114 depended on timing: that commit has the same counting and the same check, but whether the 31 …

**Suggested fix.** Assert on tracked-task counts only (state['agent_tasks'] empty and state['agents']['totals'] all zero), or wait for this run's first Kanban read and assert the board-only numbers separately.

## Front end

Files: app.js, index.html, styles.css, tests/test_agents_ui*.py.

### 11. [blocker] A poll that never returns blocks every later poll, and the page keeps saying 'Local workspace connected' with FRESH data

`local-os/app.js:283` · id `hung-poll-says-connected`

**What goes wrong.** The server process is suspended (Ctrl+Z in its terminal, a debugger stop, a hung handler). The kernel still accepts the connection, so the browser's fetch for /api/state never settles, and api() (line 11) has no timeout. pollBusy stays true for good, and each 4 s refresh() returns at line 283 without doing anything. Nothing ever reaches the catch block. The footer keeps 'Local workspace connected', the chat says 'ready to test' with Send enabled, and the Kanban panel keeps 'LAST ATTEMPT just now · CONNECTED · READ-ONLY · LAST SUCCESSFUL READ just now · FRESH' indefinitely. This is stale data presented as live, with no indicator anywhere on the page.

**How it was confirmed.** Reproduced in a real browser. I ran verify-frontend/v1_hung.py with KEYSTAL_OS_KANBAN_STALE_SECONDS=60, opened the Agents page, sent SIGSTOP to the server pid and waited 80 s. The footer still said 'Local workspace connected'. The chat status said 'Local bridge · ready to test' and Send was enabled. The Kanban facts still read 'LAST ATTEMPT just now CONNECTED · READ-ONLY | LAST SUCCESSFUL READ just now · 22 Oct, 07:16 am FRESH', and page.evaluate('pollBusy') returned true. After SIGCONT the stuck fetch finished and the page switched to '1m ago … STALE', which shows the earlier display was frozen. Cause: api() (app.js:11) calls fetch with no AbortSignal or timeout. refresh() sets pollBusy=true (284) and returns early on every later tick (283), so neither the catch block (290) nor finally (294) runs while the request hangs. The trigger is narrow: the process must be suspended (Ctrl+Z in …

**Suggested fix.** Give api() an AbortController timeout (for example 10 s for GET /api/state) so a hung request reaches the catch and clears pollBusy. Record the time of the last successful poll, and once it is older than about two poll intervals, show the page as not updated (see the next finding).

### 12. [major] After a failed poll every view keeps the last state, still labelled FRESH, 'just now' and CONNECTED, and a server restart leaves it like that permanently

`local-os/app.js:290` · id `failed-poll-freezes-views-as-fresh`

**What goes wrong.** Three cases: (a) the server stops, (b) /api/state returns 500 (for example the database is locked by a sync tool), or (c) the server is restarted while the tab stays open. In (c) the new session token makes every poll a 401 until a manual reload. In all three, the catch block only rewrites #server-status (the 8 px footer, below the fold on the Agents page) and #chat-status. Nothing is re-rendered, so relative ages freeze. The Kanban panel keeps 'just now · FRESH · CONNECTED · READ-ONLY', and agent cards keep 'LOCAL CLI DETECTED', 'observed just now' and 'Last recorded update just now', even after the data has passed its stale threshold. After a restart where the server's own Kanban read now FAILS, the open tab still shows CONNECTED/FRESH and never recovers. The page itself is the stale data here. A strict reading of the 'never present stale data as live' rule would make this a blocker; the only on-page disclosure is the small footer text.

**How it was confirmed.** Reproduced two of the three cases. (a) Server stopped (v2_down.py, stale threshold 60 s): 80 s later the footer read 'Local server unavailable — reload after restarting', but the Kanban facts still read 'just now CONNECTED · READ-ONLY … FRESH' and the Hermes card still read '(observed just now)'. On the Agents page at 1440x1000 the statusbar's top is at y=1843, below the fold. (c) Restart (v2_restart.py): the server was restarted with fake Hermes in 'error' mode, and the server's own /api/state reported kanban status 'failed' with an error. 30 s later the open tab showed footer 'Local server error — Open Keystal OS on this Mac first.' and chat 'Server error', yet the panel still read 'CONNECTED · READ-ONLY … FRESH' with no error box. Polls keep failing with the old session until a manual reload, and the footer message ('Open Keystal OS on this Mac first') is misleading to someone who …

**Suggested fix.** In refresh()'s catch, once the last successful poll is older than one interval, mark the whole UI stale: show a prominent banner such as 'Not updated since HH:MM — figures below are from then', and suppress or replace FRESH, CONNECTED and 'just now' badges (for example re-render with a client flag that forces STALE and shows absolute times). On 401, re-bootstrap by fetching '/' and retrying, or tell the user to reload.

### 13. [major] Every error and confirmation from the task dialog is drawn under the modal and removed from the accessibility tree, so refused updates look like nothing happened

`local-os/app.js:7` · id `toast-hidden-behind-modal`

**What goes wrong.** The task dialog and the new-task dialog are opened with showModal(), which puts them in the top layer and makes everything else inert. #toast is a z-index:20 element in the page body, so it renders under the dialog's ::backdrop and under the dialog box. The task dialog is 92vh tall, so the toast is fully covered at 1440x1000 and at 375x740. Example: the user picks Blocked with no note, or the server returns 409 ('This task changed since you opened it'), or the link is refused ('That card is already linked'), or Reject is pressed without a note. The only feedback is a toast nobody can see, and the dialog does not change. The user reasonably concludes the update was recorded. Screen readers get nothing either: the toast's role=status region is inert while the modal is open (no accessibility node with its text).

**How it was confirmed.** Reproduced with v3_toast.py: I opened the task dialog, chose Blocked with no note and pressed Record update. Toast text: 'Say why the task is blocked.' At 1440x1000 the toast rect is y 925-970 and the dialog y 40-960, so 78% of the toast is covered; elementFromPoint at the toast centre returns task-dialog-body. At 375x740 the toast is 100% covered. In both cases the accessibility snapshot has no node with the toast text, and the dialog stays at 'QUEUED Status from MANUAL'. The screenshot (v3_toast_1440.png) shows only a navy sliver under the dialog, with no readable text. The cause is that #toast (app.js:7, index.html:89, z-index:20) sits outside the top layer, while #task-dialog is opened with showModal() and is 92vh tall. Every refusal in the task dialog is therefore invisible: validation errors, the 409 'This task changed since you opened it', 'already linked', and the client-side …

**Suggested fix.** While a modal is open, show messages inside it: either move #toast into the open dialog before showing it, or render a per-dialog status line (role=alert for errors) next to the form that was submitted. Alternatively make the toast a manual popover (popover attribute plus showPopover()) so it joins the top layer above the dialog. Keep form values on error.

### 14. [minor] An open task dialog is never updated by the poll; it shows an outdated status and provenance, and after the resulting 409 it is not reloaded

`local-os/app.js:224` · id `task-dialog-not-refreshed`

**What goes wrong.** The user opens a task that is RUNNING (AGENT-REPORTED) and reads the evidence or types a note. Meanwhile the server's stale sweep flips the task to STALE (OBSERVED), or another tab edits it. The list behind the dialog updates, but the dialog still shows 'RUNNING · Status from AGENT-REPORTED · Last update just now', and its status select still labels Running as '(current)'. Submitting is refused with 409 (whose toast is invisible, see the previous finding). The dialog is not reloaded, so the only way forward is to close it, which discards the typed note, and reopen it.

**How it was confirmed.** Reproduced with v4_dialog.py and KEYSTAL_OS_STALE_HOURS=0.005. I set a task to running/agent_reported, opened its dialog and typed a note. 28 s later the server reported 'stale observed revision 3' and the list card behind the dialog read STALE. The dialog still read 'RUNNING Status from AGENT-REPORTED', with the status select's first option 'Running (current)' and openTaskRevision=2. Submitting returned 'This task changed since you opened it (another tab, or the server). Reload it and try again.' (409), and the dialog stayed unchanged. refresh() (app.js:282-294) never touches #task-dialog-body, and taskAction's catch (235) only toasts. The typed note stays in the textarea while the dialog is open; it is lost only when the user closes and reopens the dialog. The revision check on the server prevents any wrong write, so the impact is an outdated status display in an open dialog plus a …

**Suggested fix.** In refresh(), when #task-dialog is open, compare the matching state.agent_tasks row's revision (list_tasks returns t.*) with openTaskRevision. If it differs, show an in-dialog 'This task changed — status is now X. Reload' notice, or re-render while keeping typed form values. On a 409 in taskAction, refetch the detail and re-render with the user's inputs preserved.

### 15. [minor] Cards linked under another instance label are explained as 'the board is not pinned' even when it is pinned, and are still offered for linking

`local-os/app.js:106` · id `ambiguous-reason-says-unpinned` (also reported as `relabel-ambiguity-says-board-not-pinned`)

**What goes wrong.** KEYSTAL_OS_KANBAN_BOARD=ops with instance label 'laptop'. A Hermes task is linked to card t_004, then the server runs with KEYSTAL_OS_HERMES_INSTANCE=desktop. The server marks t_004 possibly_linked (same board, other label), and the UI explains it with the only reason it knows. The Hermes card says '1 card not counted: the board is not pinned, so it may be already-linked work', and the Today strip says '1 possibly linked (board not pinned, not counted)', while the Kanban panel says 'Board: ops' (pinned). The link dropdown (line 201 filters only on linked_task_id) also offers t_004 to other Hermes tasks, and the server refuses it with 409.

**How it was confirmed.** Reproduced with v5_ambiguous.py. KEYSTAL_OS_KANBAN_BOARD=ops with instance 'laptop'; I linked t_004, then restarted with instance 'desktop'. The server reports board {'name':'ops','pinned':True} and t_004 possibly_linked=True. Today strip: '1 possibly linked (board not pinned, not counted)'. Hermes card: '1 card not counted: the board is not pinned, so it may be already-linked work.' The Kanban panel shows 'Board: ops'. The link dropdown of another Hermes task offers 'Synthetic: waiting on input · blocked' (t_004), and submitting it is refused: 'That card is already linked (under the instance label 'laptop')'. In agent_tasks.py:607-614 the pinned branch sets possibly_linked for other-instance links, but app.js:106 and :125 hard-code the 'not pinned' reason, and app.js:201 filters only on linked_task_id. The wording is wrong and the dropdown offers a dead option. The server's refusal …

**Suggested fix.** Choose the wording from state.kanban.board.pinned: when pinned, say 'linked under another instance label'. Better, have the server return the reason per card. Exclude possibly_linked cards from the 'free' list in renderTaskDialog.

### 16. [minor] Session form preselects Hermes for an unassigned task, so identifiers are attributed to Hermes by default

`local-os/app.js:219` · id `session-agent-defaults-to-hermes`

**What goes wrong.** On an unassigned task, the 'Session and run identifiers' Agent select is built with options(agents, t.agent_id || agents[0][0]), so Hermes is preselected. The user pastes a session id they got from Claude or Codex and clicks 'Add identifier'. It is recorded as a Hermes session. The server deliberately refuses to guess here ('Say which agent this session belongs to, or assign the task first'), but the UI always sends an agent, so that guard never fires from the browser.

**How it was confirmed.** Reproduced with v6_session_cut.py. For an unassigned task, the session form's Agent select preselects 'Hermes' (app.js:219: options(agents, t.agent_id || (agents[0]||[''])[0])). I typed only a session id and submitted. The server recorded [('hermes','sess-synthetic-123','manual')] while task.agent_id stayed None. The same API call without agent_id returns (400, 'Say which agent this session belongs to, or assign the task first.'), so the browser bypasses the server's refusal to guess. The selected agent is visible in the form and in the resulting row, which limits the impact to misattribution when the user does not check.

**Suggested fix.** When t.agent_id is empty, start the select with a blank 'Choose the agent' option and make it required (or omit agent_id so the server's refusal applies).

### 17. [minor] The Hermes link dropdown silently lists only the first 200 unlinked cards

`local-os/app.js:201` · id `link-list-silent-cut-200`

**What goes wrong.** A pinned board has 250 unlinked cards. The 'Link a Hermes Kanban card from the last read of ops' select shows 200 options with no note that 50 are missing, so a card further down cannot be linked and appears not to exist in the read. Elsewhere the app announces truncation explicitly ('Listing 100 of 150', 'TRUNCATED').

**How it was confirmed.** Reproduced with v6_session_cut.py: a pinned board 'ops' with 250 'todo' cards, server counts received 250, stored 250, truncated False. The link form offers 200 options, and t_249 is not offered (count 0). The form text says only 'Link a Hermes Kanban card from the last read of ops', with no count. The API accepts linking t_249 (201), so the cut exists only in the UI: app.js:201 `.slice(0, 200)`. Elsewhere the UI announces truncation ('Listing N of M', TRUNCATED), so this silent cut is inconsistent.

**Suggested fix.** Either drop the slice, or say 'Showing 200 of N unlinked cards' and add a card-id text input (or an input with a datalist) so any stored card can be linked.

### 18. [minor] Keyboard focus is dropped to <body> on poll re-renders and after every save in the task dialog, and the new dialogs have no accessible name

`local-os/app.js:100` · id `focus-lost-and-unnamed-dialogs`

**What goes wrong.** setHTML replaces innerHTML of #agent-overview, #agent-task-list and #kanban-panel whenever the string changes. Relative ages ('Updated just now' to 'Updated 1m ago') change it at least once a minute. A keyboard user focused on a task's 'Open task' button, 'Show all' or 'LINKED · open task' loses focus to <body>, and Enter or Space then does nothing. Inside the task dialog, each successful action re-renders #task-dialog-body (line 206), so focus also falls to <body> with no announcement, since the toast is inert (see above). The new #agent-task-dialog and #task-dialog have no aria-labelledby, so screen readers announce an unnamed dialog.

**How it was confirmed.** Reproduced with v7_focus.py. I focused a task's 'Open task' button and sampled every 5 s. activeElement was BUTTON data-task-open through t+30s, then BODY at t+35s, when the footnote changed from 'Updated just now' to 'Updated 1m ago'. A following Enter did not open the dialog (count 0). setHTML (app.js:100) replaces the innerHTML whenever the string changes, and relative ages change it. In the task dialog, after a successful 'Record update' via keyboard, focus was BODY, because renderTaskDialog replaces #task-dialog-body (line 206). The accessibility snapshot shows both #task-dialog and #agent-task-dialog as {'role':'dialog','name':'','modal':True}, with no accessible name. This affects keyboard and screen-reader users only.

**Suggested fix.** In setHTML, record the focused element's identifying data attribute (data-task-open, data-kanban-toggle, ...), and after replacing the HTML refocus the matching new element. After re-rendering the task dialog, move focus to the form that was submitted (or to a heading with tabindex=-1) and announce the result inside the dialog. Add aria-labelledby to both dialogs (give the h2 an id).

### 19. [minor] Long unbroken identifiers (session or run ids, evidence labels, link history) overflow the task dialog sideways at every width

`local-os/styles.css:10` · id `long-identifiers-overflow-dialog`

**What goes wrong.** A 64-character hex session id (the field allows 128) appears in the session row's <strong>, and the history row repeats it ('Edited session: (empty) → claude:<id>'). Neither .evidence-row strong nor .history-row strong has overflow-wrap; only their <p> children do. The dialog therefore scrolls sideways at 375 px (scrollWidth 479 vs clientWidth 335). With 128-character ids it scrolls at 1440 px too (1972 vs 758). A project name over about 55 characters with no break point also pushes the page to horizontal scroll at 375 px, because the task-card .footnote does not wrap.

**How it was confirmed.** Reproduced with v8_overflow.py. At 375x740 the task dialog's scrollWidth/clientWidth is 335/335 at baseline, 479/335 with a 64-character session_ref ('a3f9'*16) and 966/335 with 128 characters. At 1440 a 64-character id fits (758/758), while 128 characters overflow (973/758). So the 'every width' claim holds only for the maximum-length id. The elements that overflow are the <strong> of the session row ('Claude · a3f9…') and of the history row ('Edited session: (empty) → claude:…'). styles.css:10 puts overflow-wrap only on '.evidence-row p, .history-row p', not on strong. An 80-character project name with no break point takes the 375 px Agents page from 375 to 545 px scrollWidth (horizontal page scroll); without it the page is 375.

**Suggested fix.** Add overflow-wrap:anywhere to .evidence-row strong, .history-row strong, .task-card .footnote and .task-dialog .footnote, and min-width:0 on the flex children that lack it.

### 20. [minor] Pre-gate completed-but-unapproved tasks are invisible on the default dashboard, though startup says they are 'flagged in the dashboard'

`local-os/app.js:155` · id `legacy-unapproved-completions-hidden`

**What goes wrong.** A PR #1 (v2) database holds a task that was completed, then had review switched on. It is migrated with --migrate. server.py:113 prints that such tasks 'are flagged in the dashboard'. But the task list filters out completed tasks by default (app.js:155; #show-completed is unchecked by default). The attention strip (app.js:127-130) has no chip for them and says 'Nothing is waiting on you.' The NOT APPROVED flag appears only after the owner ticks 'show completed'. So the only signal that a task counted as complete never passed review is hidden by default.

**How it was confirmed.** Reproduced in Chromium with (sandbox script) I built a PR #1 v2 DB with tests/test_migrations.pr_v2_with_pre_gate_row (completed, requires_review=1, review_state none). Without --migrate the server exits 2. With --migrate the API row has completed_without_approval 1. On the Agents view with default filters, the task list says 'No tasks match these filters. Clear a filter or include completed tasks.' The attention strip says 'Nothing is waiting on you.' 'NOT APPROVED' appears nowhere in the visible page text. After ticking #show-completed it appears. Causes: app.js:155 hides completed tasks unless #show-completed is checked, and it is unchecked by default (index.html:51). app.js:128 builds chips only for awaiting_review, blocked, failed and stale, with no chip for completed_without_approval. Meanwhile server.py:113-114 and db_tool.py:113 tell the owner these tasks 'are flagged in the …

**Suggested fix.** Always show tasks with completed_without_approval in the default (open) list, or add an attention chip such as 'N completed without approval' that filters to them. Alternatively, change the startup note to say where they can be found.

### 21. [nit] When the stored read time is unreadable, the Hermes card and the Today strip say the records were 'observed never'

`local-os/app.js:106` · id `unreadable-time-says-observed-never`

**What goes wrong.** The server deliberately handles an unparsable last_success_at (time_unreadable: true, age_seconds: null), and the Kanban panel words it correctly. boardNote (line 106) and attentionStrip (line 126) pass age_seconds through ageText, which turns null into 'never'. The result is 'Includes 3 unlinked board records (observed never · STALE)', which wrongly says the displayed records were never observed.

**How it was confirmed.** Reproduced with v9_unreadable.py. I set meta.kanban.last_success_at to 'not-a-time' and restarted with fake Hermes in 'error' mode, so the read is not overwritten. The server reported time_unreadable True, age None, stale True and 4 tasks. The Today strip read 'Hermes board, unlinked records (observed never · STALE · latest read did not succeed)' and the Hermes card 'Includes 4 unlinked board records (observed never · STALE …)'. The Kanban panel correctly said 'Stored read time is unreadable STALE'. ageText(null) returns 'never' (app.js:98) and is used at lines 106 and 126 without checking time_unreadable. The data is still flagged STALE, so nothing is presented as fresh; only the wording is wrong, and the trigger needs a corrupted or hand-edited meta row.

**Suggested fix.** When state.kanban.time_unreadable is true, write 'observed at an unreadable time' instead of calling ageText(null). The task dialog's 'read ${ageText(state.kanban.age_seconds)}' (line 198) needs the same fix.

## Tools and README

Files: tools/*.py and *.sh, README.md, tests/test_db_tool.py, tests/test_tools.py.

### 22. [major] preview.py writes its synthetic seed into whatever server already listens on the chosen port, including the real workbench

`local-os/tools/preview.py:94` · id `preview-seeds-running-server` (also reported as `preview-port-collision-seeds-other-server`, `preview-seeds-live-server`)

**What goes wrong.** The real Keystal server is running on 127.0.0.1:8766 and the owner runs `python3 local-os/tools/preview.py --port 8766`. The same happens if the real server was started with KEYSTAL_OS_PORT=8767 and preview.py runs on its default port. The preview child process needs a few hundred ms before it binds the port. The readiness loop's first urlopen(base) is answered by the REAL server, so the loop breaks. client.bootstrap() and seed(client) then POST four 'Synthetic: ...' tasks into the real database. They include an agent_reported RUNNING task, an agent_reported AWAITING_REVIEW task with evidence, and a project. The child then dies with EADDRINUSE. The script still prints 'Keystal OS isolated preview ... your real database is not opened' and exits 0. The synthetic tasks show up in the real dashboard as live agent-reported work, and the app has no way to remove them: there is no delete route, and history and evidence are append-only by trigger. This breaks the rule that simulated data is never presented as live, and the tool's own guarantee that the real database is never touched.

**How it was confirmed.** I reproduced this at HEAD c7ef6d5 with (sandbox script) A harness Server stands in for the real workbench, and then preview.py runs with --port set to that server's port. Output: 'preview exit 0'. stdout prints the 'Keystal OS isolated preview ... (deleted on exit; your real database is not opened)' banner. stderr ends with 'OSError: [Errno 98] Address already in use'. The real server stays alive with runtime.preview_label still '', and its /api/export now holds ('Synthetic: draft a discovery-call question set','running','agent_reported'), ('Synthetic: refactor intake form validation','awaiting_review','agent_reported'), ('Synthetic: summarise public pricing pages','blocked','manual') and ('Synthetic: unassigned idea','queued','manual'). Cause in local-os/tools/preview.py: lines 92-99 treat any HTTP answer from 127.0.0.1:<port> as the child's readiness. The child is still in …

**Suggested fix.** Before starting the child, refuse if the port is already accepting connections (socket connect_ex). After the readiness probe, confirm the responder is the child: process.poll() is None, and /api/state runtime.preview_label equals the label just set. Abort without seeding otherwise.

### 23. [major] backup leaves a 0-byte file named like a backup when it fails; restore-test and restore then accept that empty file as a verified backup

`local-os/tools/db_tool.py:175` · id `restore-accepts-empty-backup`

**What goes wrong.** cmd_backup claims the destination file (migrations.claim creates it empty, mode 0600) before online_backup opens the source. If the source cannot be read (wrong --db path, or a lock or disk I/O error inside online_backup), the tool stops, but `<stem>.backup-<stamp>.sqlite3` is left at 0 bytes in the backups folder. It is indistinguishable by name from a real backup. A 0-byte file is a valid empty SQLite database, so `restore-test --backup <it>` reports problems [], migration_dry_run ok and exits 0. `restore --backup <it>` verifies it ('backup_verified' integrity ok, rows {}) and with --execute swaps the live database for an empty one. SCHEMA_CODE[0] then tells the user 'this branch opens it only after --migrate'. That is false for an empty file: the server migrates it implicitly and opens an empty app. The real data survives only as workbench.replaced-*.sqlite3. RELEASE.md step 3 relies on 'backup and restore-test pass'.

**How it was confirmed.** Reproduced in (sandbox script)

1. `db_tool.py backup --db workbench.sqlite3 --out bk` (wrong path) printed 'No such database: ...' and exited 1. It left `-rw------- 0 bk/workbench.backup-20261022T071709Z.sqlite3`. cmd_backup line 175 claims the file before online_backup line 176 opens the source.
2. `restore-test --backup <that file> --db live.sqlite3` returned `"problems": []`, `"classification": "empty"` and `"migration_dry_run": {"ok": true}`, exit 0. The only hint was the compared_with_live_database differences (null vs N).
3. `KEYSTAL_OS_PORT=1 restore --backup <it> --db live.sqlite3` (dry run) returned `backup_verified {integrity ok, rows {}, user_version 0}` and `problems []`. which_code_opens_it said 'the original app (main 3735b38) opens it as is; this branch opens it only after --migrate', exit 0. With --execute it returned 'Restored.', exit 0, and live.sqlite3 became a …

**Suggested fix.** In cmd_backup, open and verify the source before claiming the destination, and delete the claimed file (or rename it *.failed) on any exception. In restore and restore-test, treat a backup with no tables, or with no Keystal tables, as a problem (exit 3) unless explicitly overridden. Fix SCHEMA_CODE to say that an empty database is migrated without --migrate.

### 24. [major] restore --execute can move the live database aside, fail, and then report 'Nothing further was done' or 'No such database' without naming where the data went

`local-os/tools/db_tool.py:394` · id `restore-failure-after-rename-misreported`

**What goes wrong.** cmd_restore renames the live file to workbench.replaced-<t>.sqlite3 (lines 393-398) and only then copies the backup into place (line 399). If anything fails after the rename, the JSON never says the live database was moved. (a) If --backup and --db are the same file, the rename removes the backup itself, and open_ro raises SystemExit 'No such database: .../workbench.sqlite3' with exit 1, no JSON and no path to the kept file. (b) An OperationalError during the copy (for example a disk I/O error from an external drive holding the backup, or a full disk) is caught by main(), which prints 'STOPPED: ... Nothing further was done' even though the live file was already renamed and a 0-byte file sits in its place. On the next start the server finds no data, migrates the empty file without --migrate, and shows an empty app. The user's data is only in the replaced-* file, which no message mentions.

**How it was confirmed.** Reproduced three ways at HEAD.

(a) (sandbox script) `KEYSTAL_OS_PORT=1 db_tool.py restore --backup workbench.sqlite3 --db workbench.sqlite3 --execute` printed only 'No such database: .../f3/workbench.sqlite3' with exit 1. The folder then held only `workbench.replaced-20261022T071732Z.sqlite3`.

(b) A real disk-full case, no mocking. I mounted a 200 KB tmpfs holding the 168 KB live database and restored a 217 KB backup into it (f3d). Output: `"result": "STOPPED: SQLite reported \"database or disk is full\". Nothing further was done..."`, exit 3. The folder then held `workbench.replaced-20261022T072037Z.sqlite3` (167936 bytes) and `workbench.sqlite3` (0 bytes).

(c) A mocked 'disk I/O error' (f3b_ioerr.py) gave the same result. Starting the server on the folder (f3c_start.py) then succeeded without --migrate and showed `captures: 0 agent tasks: 0`.

Cause: db_tool.py lines 393-398 rename …

**Suggested fix.** Refuse when the backup resolves to the live database (or to its replaced-* name). Copy the backup to a temporary file in the same folder and verify it first; only then rename the live file aside and rename the temporary file into place. On any failure after the rename, put the original back, or report replaced_file_kept and the exact command to undo.

### 25. [minor] db_tool restore with --backup equal to --db moves the live database away and then fails; the next start silently creates an empty workbench

`local-os/tools/db_tool.py:394` · id `restore-backup-equals-db`

**What goes wrong.** The owner runs `db_tool.py restore --backup "$DB" --db "$DB"` (the same file, or a symlink to it, since both are resolved). The dry run reports success and 'would_rename_current_to ...replaced-...'. With --execute, db.rename(moved) moves the live file away. online_backup(backup, db) then opens the backup path, which no longer exists, raises SystemExit 'No such database', and exits 1, leaving no database at $DB. The next server start sees no file and migrates a fresh empty one without any warning, so the dashboard shows an empty workbench as the current state. The data survives only in workbench.replaced-<time>.sqlite3.

**How it was confirmed.** I reproduced this with (sandbox script), passing --backup as a symlink to the live DB. A harness server first created one task and was stopped. The dry run exits 0, reports backup_verified and would_rename_current_to. With --execute: exit 1, stderr 'No such database: .../state/workbench.sqlite3', and no JSON report. The folder then holds only ['workbench.replaced-20261022T071410Z.sqlite3']. On the next start the server silently creates a fresh workbench.sqlite3, and /api/export shows 'tasks seen by server after restore: []'. Code path in local-os/tools/db_tool.py: line 357 resolves both paths to the same file, and nothing compares them. Line 394 runs db.rename(moved). Line 400 runs online_backup(backup, db), which opens the backup via open_ro, finds it missing (lines 48-50) and raises SystemExit. The data survives in the .replaced file, so this is minor, not data loss.

**Suggested fix.** In cmd_restore, refuse when backup.resolve() == db.resolve() or os.path.samefile(backup, db), already in the dry run. Better still, copy the verified scratch check file into place instead of re-reading the backup path after the rename.

### 26. [minor] restore --execute replaces the database under a running server that uses a non-default KEYSTAL_OS_PORT

`local-os/tools/db_tool.py:349` · id `restore-port-guard-default-only`

**What goes wrong.** The server is started with `KEYSTAL_OS_PORT=8800 python3 local-os/server.py`, a documented variable. The user then runs `db_tool.py restore --backup X --db <live> --execute` from another shell where KEYSTAL_OS_PORT is not set. server_listening() probes only 8766. The BEGIN EXCLUSIVE probe passes because an idle server holds no lock. The live file is renamed and replaced while the server keeps serving it, and tasks written after the backup disappear from the running app. README line 49 says restore 'refuses while anything listens on the server port'.

**How it was confirmed.** Reproduced with (sandbox script) A harness server runs on port 43847. db_tool is run with KEYSTAL_OS_PORT removed from its environment, takes a backup, a task is created through the API, and then restore runs with --execute. Output:

- `restore exit 0 | executed True | refused None | result Restored. Start the code version listed above.`
- `server still running: True | tasks the running server now serves: []`

The task written after the backup is now only in workbench.replaced-*.sqlite3.

Cause: server_listening() (db_tool.py lines 348-352) probes only KEYSTAL_OS_PORT or 8766. The BEGIN EXCLUSIVE probe (lines 384-392) passes because an idle server holds no lock. README line 49 says restore 'refuses while anything listens on the server port'.

Minor: the docs tell the user to stop the server first, so this is a failing safety net rather than the main path, and the replaced file is kept.

**Suggested fix.** Have the server record its PID and port in the data folder (or hold an advisory lock file while it runs), and have restore and quarantine refuse while that record is live, whatever port is in db_tool's environment.

### 27. [minor] Several db_tool error paths print a traceback or a bare message with exit 1, or report success, instead of the documented JSON with exit 3

`local-os/tools/db_tool.py:431` · id `db-tool-error-paths-not-json`

**What goes wrong.** The docstring promises 'All commands print JSON. Exit 0 = fine, 3 = a check failed or action needed, 2 = usage error.' In practice: (1) a missing --db or --backup raises SystemExit('No such database') from open_ro: plain text, exit 1. (2) A file that is not a database raises sqlite3.DatabaseError from needs_recovery, which main() does not catch because it catches only OperationalError: traceback, exit 1. (3) migrate-check on a missing file crashes in sha256() with FileNotFoundError. (4) quarantine on a missing file prints 'Nothing to quarantine: no schema conflict.' with exit 0, so a mistyped path looks like a clean database. A script or user checking for exit 3 or reading JSON misreads these.

**How it was confirmed.** Ran each case in (sandbox script)

- `inspect --db nope.sqlite3`: plain 'No such database: ...', exit 1.
- `inspect --db notdb.txt`, `restore-test --backup notdb.txt` and `backup --db notdb.txt --out bk`: `sqlite3.DatabaseError: file is not a database` traceback, exit 1. It comes from needs_recovery, called at main() line 428; main catches only NeedsRecovery and OperationalError (lines 431-436).
- `migrate-check --db nope.sqlite3`: `FileNotFoundError` traceback from sha256() at line 219, exit 1.
- `quarantine --db nope.sqlite3`: `"result": "Nothing to quarantine: no schema conflict."`, exit 0. migrations.plan returns conflicts [] for a missing file.
- `restore-test --backup nope.sqlite3`: plain text, exit 1.

These contradict the docstring (line 14): 'All commands print JSON. Exit 0 = fine, 3 = ...'. No data is at risk; the quarantine exit 0 on a mistyped path is the most misleading …

**Suggested fix.** In main(), catch sqlite3.DatabaseError (not just OperationalError) and a missing-file condition, and emit a JSON report with exit 3. Make quarantine, migrate-check and restore-test check that the file exists before doing anything.

### 28. [minor] backup --out silently changes an existing user folder's permissions to 0700 (and crashes if the user does not own it)

`local-os/tools/db_tool.py:174` · id `backup-out-chmods-existing-dir` (also reported as `db-tool-out-chmods-existing-folder`)

**What goes wrong.** RECONCILIATION.md step 2 says to pass `--out "<a folder on another drive>"`. If that is an existing folder, such as a drive root /Volumes/X, ~/Desktop or a shared folder, cmd_backup runs os.chmod(out, 0o700) on it. This changes permissions on a folder the tool did not create, which neither the docs nor --help mention. If the user does not own the folder (for example --out /tmp on macOS, which is root-owned /private/tmp), chmod raises PermissionError, which main() does not catch: traceback, exit 1, no backup. The data is not lost, but the action is outside the tool's documented contract.

**How it was confirmed.** Reproduced in (sandbox script) `stat` gave `755 shared drive`. After `db_tool.py backup --db live.sqlite3 --out "shared drive"` (exit 0), it gave `700 shared drive`. Line 174 runs `os.chmod(out, 0o700)` whether or not this run created the folder.

The non-owner crash is certain from the code: PermissionError is not caught by main() (lines 431-436). I simulated it in-process (f9_eperm.py, os.chmod raising EPERM for that folder): `uncaught: PermissionError [Errno 1] Operation not permitted`, and no backup was written. I could not reproduce it as a non-root user, because the scratch ancestors are 0700 root.

No data is lost. The effect is an undocumented permission change on a user folder, or a traceback.

**Suggested fix.** chmod only a folder that this run created (for example, mkdir a dated subfolder inside --out), or leave existing folder modes alone and rely on the 0600 file mode.

### 29. [minor] preserve_workspace.sh writes into the source workspace when the backup root is inside it, and breaks on a relative backup root

`local-os/tools/preserve_workspace.sh:31` · id `preserve-workspace-dest-inside-or-relative` (also reported as `preserve-relative-root-fails`)

**What goes wrong.** (a) The backup root is inside SRC, for example `preserve_workspace.sh ~/ws ~/ws/backups`, or a relative root run from inside the workspace. mkdir creates the backup folder inside the workspace, which git status then lists as untracked. cp -Rp then copies SRC into its own subtree. GNU cp copies part of it and stops with 'cannot copy a directory into itself' (BSD cp on macOS was not tested). This breaks the header's promise to never modify SOURCE. (b) A relative root such as `... /abs/ws backups`: DEST is relative, but tar runs inside `(cd "$SRC" && tar -czf "$DEST/untracked.tgz" ... -T "$LIST")`. Both $DEST and $LIST then resolve against SRC, tar fails, set -e aborts, and only a partial folder is left: no untracked.tgz, repo.bundle or full-copy.

**How it was confirmed.** I reproduced this in (sandbox script) with GNU cp/tar (BSD cp on macOS not tested). (a) `preserve_workspace.sh $PWD/inws $PWD/inws/backups`: cp fails with 'cannot copy a directory ... into itself ... full-copy', exit=1, and `git -C inws status --porcelain` shows '?? backups/'. The source was modified, against header lines 3-4. (b) Run from relrun as `preserve_workspace.sh ../relws backups` with an untracked file: 'tar: backups/relws-.../.untracked-list: Cannot stat', exit=2. The folder holds only status/head/branch/patch/stash files plus a leftover .untracked-list. Line 31 cds into SRC and then uses the relative $DEST and $LIST. (c) A further case the reviewer missed: relative root with no untracked files. It exits 0 and prints 'Preserved', but line 33 runs `git -C "$SRC" bundle create "$DEST/repo.bundle"`, and git resolves the relative path against SRC. The bundle fails and …

**Suggested fix.** Make ROOT absolute (mkdir -p it, then ROOT=$(cd "$ROOT" && pwd -P)) before building DEST. Refuse when DEST is inside SRC (case "$DEST/" in "$SRC"/*).

### 30. [minor] preserve_workspace.sh reports any bundle failure as 'repository has no commits' and still says 'Preserved'

`local-os/tools/preserve_workspace.sh:34` · id `preserve-bundle-failure-mislabelled`

**What goes wrong.** Line 34 (`git bundle create ... --all >/dev/null 2>&1 || echo "no bundle (repository has no commits)" > repo.bundle.none`) throws away git's error. Any failure is labelled as an empty repository and the script exits 0 with 'Preserved ...': a missing or corrupt object, a full disk, or an unreadable ref. The user retires the workspace believing every branch was bundled. The full copy still exists, but the bundle, which the docs present as the portable record of every branch, is silently missing.

**How it was confirmed.** Reproduced in (sandbox script) In a 3-commit repo I deleted the blob of the first commit's file, leaving HEAD and the work tree intact. preserve_workspace.sh printed 'Preserved ... head: 796e319...' with exit 0, and repo.bundle.none read 'no bundle (repository has no commits)'. Running `git bundle create` directly shows the real error: `fatal: unable to read 6267...` and `pack-objects died`.

The code is at line 33 (not 34): `git ... bundle create ... >/dev/null 2>&1 || echo "no bundle (repository has no commits)"`.

A more common trigger I also hit: a relative backup-root with no untracked files. `git -C "$SRC" bundle create "$DEST/repo.bundle"` resolves the relative DEST inside SRC and fails, and the script still exits 0 with 'repository has no commits' for a repo with 1 commit (f11/relout2).

Minor: full-copy/ still contains .git, so the branches are not lost, but the summary is …

**Suggested fix.** Only take the 'no commits' path when `git rev-parse --verify HEAD` fails. Otherwise let the bundle error abort the script, or record git's stderr and print a visible WARNING in the summary.

### 31. [minor] README says quarantine refuses when foreign keys point at a table it would rename; the code rewrites them and proceeds

`local-os/README.md:53` · id `readme-quarantine-fk-refusal-false`

**What goes wrong.** README line 53 says quarantine 'refuses ... when foreign keys elsewhere point at a table it would rename'. cmd_quarantine (db_tool.py 284-285, 320-321) does not refuse: it lists them under references_that_will_follow_the_rename, and ALTER TABLE ... RENAME with legacy_alter_table=OFF rewrites them. test_foreign_keys_elsewhere_follow_the_quarantined_table_and_never_re_parent and the reconciliation test assert exactly that (tasks.agent_id -> agents follows), and RECONCILIATION.md step 3 describes the rewrite. A reader of the README expects a refusal that never comes.

**How it was confirmed.** README.md line 53 says quarantine 'refuses ... when foreign keys elsewhere point at a table it would rename'. The code does not refuse in that case.

- db_tool.py lines 282-285 only collect those references into `references_that_will_follow_the_rename`.
- Lines 311 and 320-321 rename with legacy_alter_table=OFF, so SQLite rewrites the references.
- The report note (lines 291-293) and RECONCILIATION.md line 35 both describe the rewrite.

I ran `python3 -m unittest test_db_tool.ReviewFindings.test_foreign_keys_elsewhere_follow_the_quarantined_table_and_never_re_parent`: OK. That test asserts `(code, executed) == (0, True)` and `references_that_will_follow_the_rename == ['tasks.agent_id -> agents']`.

The other refusal clauses in that README sentence (own altered table, a view holding a table name) are accurate (lines 266-272). This is a documentation mismatch only; the actual behaviour is …

**Suggested fix.** Change README line 53 to say that foreign keys, views and triggers pointing at a renamed table are rewritten to follow it (as RECONCILIATION.md step 3 says), not refused.

### 32. [minor] README says verify.py has never run on the Mac with real Hermes; RELEASE.md says it passed 67/67 there

`local-os/README.md:89` · id `readme-verify-mac-run-contradiction`

**What goes wrong.** README line 89 says the 67 checks 'have passed in the cloud sandbox only against the stub Hermes CLI and a synthetic HOME; a run on the Mac with real Hermes and real model calls has not been done for this branch.' RELEASE.md line 16 ('verify.py with real Hermes | Passed: 67 of 67, including a real chat turn') and line 78 ('Real, on the Mac at b881114: 67 of 67') record that run, and verify.py has not changed since b881114. A reader gets opposite answers about the only real-model evidence.

**How it was confirmed.** README.md line 89 says the 67 checks 'have passed in the cloud sandbox only against the stub Hermes CLI ...; a run on the Mac with real Hermes and real model calls has not been done for this branch.' RELEASE.md says the opposite:

- line 16: '`verify.py` with real Hermes | **Passed**: 67 of 67, including a real chat turn'
- line 46: 'The real-model result is the Mac run above, on b881114'
- line 78: '**Real**, on the Mac at b881114: 67 of 67'

`git diff --stat b881114 HEAD -- local-os/verify.py` is empty. `git show b881114:local-os/README.md` already has the same sentence at line 89. Commit 0ad551b recorded the Mac run in RELEASE.md but left the README as it was. The README understates the evidence; it does not lead to an unsafe action.

**Suggested fix.** Update README line 89 to match RELEASE.md: 67/67 with real Hermes on the Mac at b881114, and the stub in the sandbox.

### 33. [nit] diagnose_sqlite's filesystem report cannot detect the hazard RELEASE.md uses it for (Dropbox or iCloud on macOS) and silently reports a parent folder

`local-os/tools/diagnose_sqlite.py:224` · id `diagnose-filesystem-cannot-see-cloud-sync`

**What goes wrong.** RELEASE.md line 109 warns against keeping the data folder in Dropbox or iCloud Drive and says 'diagnose_sqlite.py reports the data folder's filesystem'. filesystem() only runs `df -P` and `mount`. On current macOS, Dropbox (File Provider, ~/Library/CloudStorage) and iCloud Drive (including synced Desktop and Documents) sit on the local APFS Data volume, so the report shows 'apfs, local' for a synced folder. A user reading that output concludes the folder is safe. In addition, if the data folder does not exist the function walks up to the nearest existing parent (here /root) and reports that parent, without saying the data folder is missing.

**How it was confirmed.** The reviewer's line numbers are wrong: filesystem() is at diagnose_sqlite.py lines 104-112, and its caller is at line 173.

The code uses only `df -P` and `mount`. These report the volume, not whether a folder is synced, so they cannot tell a Dropbox or iCloud folder on the local APFS volume from any other folder. The macOS File Provider behaviour itself was not reproduced; it needs macOS.

The silent walk-up is confirmed. `filesystem('<scratch>/does/not/exist/local-state')` returned `"folder": "<scratch>"` with no indication that the requested path is missing.

This is only a nit:
- RELEASE.md line 109 says only that the tool 'reports the data folder's filesystem', which is literally true. It does not claim to detect sync.
- Keeping the data folder on local disk is a documented known limit.
- On the Mac the default data folder exists (the production database is there), so the walk-up …

**Suggested fix.** Also report the resolved path, and flag it when it is under ~/Library/CloudStorage, ~/Library/Mobile Documents, or a Desktop or Documents folder with iCloud sync. Report 'data folder missing' instead of silently using a parent. Reword RELEASE.md so it does not imply that the df/mount output proves the folder is unsynced.

### 34. [nit] The db_tool docstring and the README preview line make blanket claims that the code does not hold in every mode

`local-os/tools/db_tool.py:2` · id `docs-overstate-readonly-and-preview-home`

**What goes wrong.** The db_tool docstring says 'every command that reads a database opens it read-only' and 'nothing here modifies a database except quarantine --execute'. But restore opens the live database read-write (sqlite3.connect(db, timeout=0) plus BEGIN EXCLUSIVE, line 384) and, with --execute, replaces it. README line 55 says the preview uses 'a throwaway HOME, so the Dropbox check cannot reach your vault' without a qualifier, but `preview.py --hermes real` keeps the real HOME, and its own label says 'REAL Dropbox check' (preview.py lines 76-78).

**How it was confirmed.** db_tool.py lines 2-4 say 'every command that reads a database opens it read-only' and 'nothing here modifies a database except `quarantine --execute`'. But cmd_restore with --execute does three things:

- opens the live database read-write (`sqlite3.connect(db, timeout=0)` plus `BEGIN EXCLUSIVE`, lines 384-387),
- renames it aside (line 394),
- writes the backup into its place (line 399).

The same docstring does describe restore at lines 11-12, so the contradiction is internal and low-impact.

README.md line 55 says the preview uses 'a throwaway HOME, so the Dropbox check cannot reach your vault' with no qualifier. preview.py lines 76-78 keep the real HOME for `--hermes real` and label that mode 'REAL Hermes CLI and REAL Dropbox check'; the throwaway HOME is set only in the else branch (lines 79-82). The preview's own docstring and banner are accurate. Only the README summary …

**Suggested fix.** Add 'restore --execute' to the docstring's exception list. Qualify the README preview line with 'except --hermes real'.

## Refuted

- `approval-reuses-rejected-evidence`: the verifier showed evidence from an earlier review cycle does not wrongly satisfy the approval gate. No change needed.
