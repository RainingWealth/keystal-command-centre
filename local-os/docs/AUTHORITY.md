# Task authority boundary

Three systems touch the same work. This app is deliberately **not** a third execution authority.

| System | Owns | This app's relationship |
| --- | --- | --- |
| **ClickUp** | Business commitments: what was promised, to whom, by when, who is accountable | Reference only. A task can carry a ClickUp reference (workspace, list, task id, link). No adapter: nothing is read from or written to ClickUp. |
| **Hermes Kanban** | Internal agent execution: the runnable queue, worker claims, run state | Read-only. The board is read with `hermes kanban list --json` and shown as a copy. Nothing is ever written back, and a board state never overwrites a status recorded here. |
| **Keystal OS (this app)** | Delegation, review and evidence records: who Ray handed work to, what they reported, what evidence exists, and Ray's approval | Aggregates and links. Its tasks are delegation/review records. Assigning a task does not start, message or control any agent. |

## Rules the code enforces

1. **No dispatch.** No endpoint contacts an agent. Every activity-log line for a task action ends with "no agent contacted" (a test checks every one).
2. **No copying status across systems.** A linked Hermes card's state is shown next to the tracked status as `Board record: <raw state>`; when they disagree the app shows *drift* and changes neither.
3. **A board state is a record, not a live worker.** `running` on the board never sets "working now". Only the app's own chat bridge can say Hermes is working.
4. **One external record, one local task.** A link's identity is `provider + instance + board/workspace + external id`, unique in the database. Two boards, instances or workspaces can reuse an id without colliding. For Hermes, the instance and board are the ones recorded with the snapshot the card was read in, never the request's, and never relabelled by a later failed read; the instance is a label you choose (`KEYSTAL_OS_HERMES_INSTANCE`), because Hermes boards are not partitioned by profile. Because it is only a label, changing it does not create a second identity for the same card: a card on the same board linked under another label is not counted again and cannot be linked to a second task. For ClickUp, the identity is `app.clickup.com` + workspace + task id: a ClickUp task can sit in several lists, so the list is stored as context, not identity.
5. **Hermes cards are linkable only on a pinned board.** A card id is only unique within its board, so linking needs `KEYSTAL_OS_KANBAN_BOARD` and a successful read of that board. A task linked to a Hermes card stays with Hermes.
6. **Each Hermes work item is counted once.** A card linked to a tracked task is counted through the task; unlinked cards are added to Hermes, and the Hermes card says how many are in its tiles, done, scheduled or of unknown state. Scheduled (a waiting card with a future or unreadable `scheduled_at`) and unknown board states are never guessed into a status; archived cards are skipped and counted. If the board is not pinned, a card whose id is linked on some board may be that linked work, so it is marked possibly linked and not counted.
7. **Completion is not the agent's call.** A review-required task reaches `completed` only through the owner's approval with at least one evidence item. This is a database rule (triggers), so no write path can bypass it while review is required. The owner can switch review off for a task that is not completed and not mid-review; that choice is recorded and shown on the task. Tasks completed before the gate existed are kept, flagged as not approved, and can be reopened.
8. **Provenance is never upgraded.** `observed` can only be set by this server; the browser can claim `manual` or `agent-reported`.

## Where each fact comes from

| Shown | Source | Provenance |
| --- | --- | --- |
| Hermes CLI present, chat turn running, last chat turn | This server (CLI lookup, chat runs table) | observed |
| Hermes board records, counts, raw states | `hermes kanban list --json`, last successful read | observed (with its age and stale flag) |
| A task's status, notes, evidence, session ids | The owner | manual or agent-reported |
| `stale` on a running task | This server noticing silence | observed (it does not claim the agent stopped) |
| ChatGPT, Claude, Codex, Gemini | Nothing: no adapter | NOT CONNECTED |
