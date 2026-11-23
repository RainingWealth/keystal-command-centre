# Deployment status (2026-11-23)

**Honest summary:** the engine and workflow are built and tested, and a first live run has produced real prospects in Airtable. The **scheduled automation is not yet operational** because two owner-side credentials are broken. Until they are fixed, runs are performed through the documented offline path.

| Component | Implemented | Tested | Connected | Scheduled | Operational |
|---|---|---|---|---|---|
| Decision engine (identity, verify, dedupe, score, briefs, report) | Yes | 38 fixture tests + live data | n/a | n/a | Yes |
| n8n workflow `GwXjvHz7sV2vsOgL` (24 nodes) | Yes | Pinned run in n8n's real sandbox (5×), 8 simulation tests | **Partly** | Cron `45 9 * * 1-6`, TZ Asia/Singapore, **not published** | **No** |
| Pipeline A: MyCareersFuture API | Yes | Live: 8 queries, 432 recent postings, from n8n host | Yes (no key needed) | with workflow | Yes (manual) |
| Pipelines B/C: Perplexity search + page verification | Yes | Pinned + 8 real pages fetched | **No: Perplexity quota exceeded** | with workflow | **No** |
| LLM briefs (OpenAI `gpt-5-mini`, grounding-checked, template fallback) | Yes | Fixtures, sandbox; credential verified live | Yes | with workflow | Not yet called live in n8n |
| Airtable read/write (Prospects, Raw Signals, Research Runs) | Yes | Writes + read-back via Airtable MCP | **No: n8n Airtable OAuth credential needs reconnect** | with workflow | **No** (offline path works) |
| Error workflow `VtBSlyU87oASSDMs` → n8n data table `second_shift_run_errors` | Yes | Published; not yet triggered by a real failure | Yes | Failure-triggered | Yes |
| Offline runner (same engine) | Yes | Used for the first live run + repeat run | n/a | manual | Yes |

## Blockers (owner action, ~5 minutes)
1. **Reconnect the n8n credential "Airtable Personal Access Token account"** (id `LopM3sV0BR7QrNHP`): n8n → Credentials → open it → *Reconnect* → grant access to base `appJsyvz3FLUU7NlY`. Error today: "needs to be reconnected / refresh token expired or revoked".
2. **Search provider for Pipelines B/C**: top up the Perplexity credits (`pZZbor66p7NfWp3l`, "exceeded your current quota"), **or** add a Tavily key to n8n and swap `Web Search` to an HTTP node (see OPERATIONS.md). Without it the workflow still runs Pipeline A and reports `Partial`.

## Activation checklist (after the blockers)
1. Open the workflow, set `Mark Manual → dryRun = true`, click **Manual Run**. Expect: execution success, `Run Status = Dry run`, a Research Runs row, zero new Prospects.
2. Set `dryRun = false`, run again. Expect Prospects + Raw Signals rows, `verified` equal to created in the Research Runs notes.
3. Run a third time: expect `0` new Prospects for the same sources (duplicates counted instead).
4. **Publish** the workflow. First scheduled run: next Mon–Sat 09:45 SGT.

## First live run (offline path, 2026-11-23)
10 prospects written (9 hiring signals + 1 verified campaign), 11 audit rows, 1 run log; read back and verified; 25 seed rows untouched. A repeat run on the same inputs surfaced 0 of the same businesses. 20 candidates qualified; 10 written, the rest remain queued for the next run.

## Known limitations
- Pipeline C is limited to booking-channel searches and repeat-vacancy merging; review/complaint mining is deliberately not enabled.
- Public contact enrichment (phone/email from the company's own site) is offline-only in v1; in n8n, MCF-sourced prospects carry their website as the contact route.
- Daily cap 20; up to 5 slots are reserved for non-hiring signals that clear the ≥70 bar.
- Airtable and n8n IDs appear in this repo (they are not secrets, but treat the repo as public): no keys, tokens or prospect data are committed.
