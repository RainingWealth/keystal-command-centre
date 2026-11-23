# Operations

## Run it
- **Scheduled:** `Mon-Sat 09:45 SGT` trigger (cron `45 9 * * 1-6`, workflow timezone `Asia/Singapore`). Only active once published.
- **Manual:** open the workflow → *Manual Run*.
- **Dry run (no writes):** set `Mark Manual → dryRun = true`, run. Discovery, scoring and the report run; only a `Dry run` row is logged. Set it back to `false` afterwards.
- **Offline / recovery (n8n or Airtable down):**
  ```sh
  node scripts/enrich-contacts.mjs domains.json contacts.json      # optional public-contact enrichment
  node scripts/offline-run.mjs --existing prospects.json --mcf mcf_raw.json --web web.json \
       --contacts contacts.json --briefs briefs.json --raw-keys keys.json --out ./out [--max-new 20]
  ```
  Output: `out/plan.json` (field-name keyed records to write) and `out/report.md`. File formats are in the script header.

## Change search criteria, quotas, targets
Edit `src/config.js` then `npm run build`, **or** edit the `Config` Code node in n8n. Keys: `mcfQueries`, `webQueries` (pipeline B/C), `quotas` (`maxSearches` 15, `maxFetch` 25, `maxNew` 20, `hiringWindowDays` 21), `providers.{mcf,perplexity}` (set `false` to disable a failing provider), `openaiModel`. Scoring weights and rules live in `src/engine.js` (`scoreCandidate`); thresholds in `SS` (priority ≥85, secondary ≥70, research ≥50). After changing code run `npm test`.

## Deploy a code change to n8n
`npm run build` produces `n8n/dist/<node>.js` (one per Code node). Paste each changed file into the matching node's *Code* field (or use the n8n MCP `update_workflow` / `setNodeParameter /jsCode`). `n8n/second_shift_prospect_engine.json` is the importable export.

## Schedule
Change the cron on the `Mon-Sat 09:45 SGT` node. Because the workflow timezone is `Asia/Singapore`, enter local time.

## Spend control (estimate ≈ US$3-5 / month)
MyCareersFuture API: free. Perplexity: ≤15 searches/day (`maxSearches`). Page fetches: ≤25/day, one request each. OpenAI: **one** `gpt-5-mini` call/day (a 20-token no-op when nothing was accepted). Lower `maxSearches`/`maxFetch` or disable `providers.perplexity` to cut cost to ~zero. `executionTimeout` is 1,500 s.

## Logs and where to look
- Airtable **Research Runs**: one row per run (status, counts, rejection reasons, errors, full Daily Report, n8n execution id).
- Airtable **Raw Signals**: every signal behind a promoted prospect, new signals on existing prospects, and unverified/undated campaigns for human validation. The interface page "Unverified Signal Inbox" shows it.
- n8n **Executions** for the workflow; n8n **Data table** `second_shift_run_errors` (written by the error workflow even if Airtable is down).

## Failure handling
| Symptom | Behaviour | Fix |
|---|---|---|
| Search provider fails / quota | Run completes as `Partial`, error named in Research Runs | Top up / switch provider / `providers.perplexity=false` |
| MyCareersFuture API fails | Retries 3×, then `Partial` | Re-run later |
| OpenAI fails or returns an ungrounded brief | Deterministic template brief used, noted in Notes | none needed |
| Airtable read fails (e.g. credential) | Run **stops before any write** (dedupe is mandatory); logged by the error workflow | Reconnect credential, re-run |
| Airtable write batch fails | Other batches continue; run marked `Partial` with the reason; read-back counts verified vs created | Re-run: duplicates are skipped, so retries are idempotent |

## Data rules
- Existing Prospects rows are **never edited**. New evidence on a known company goes to Raw Signals only. Status, Next Action and Notes belong to you.
- Dedupe order: canonical domain → UEN → normalised/subset name; legacy slug keys (e.g. `dentalis`) still match.
- Rejections include: recruitment agencies (names, EA text, SSIC 78xx, "Name of Authority"/outsourced contracts, hidden employers), listings > 21 days, expired offers (read on the page, not the search snippet), non-Singapore, financial/insurance/government bodies, templated postings from sibling entities.
- A prospect needs a verified source, an identifiable business **and** a public contact route; otherwise it goes to Raw Signals as "research required".

## Compliance
Public business information only; no personal data collection, no scraping behind logins, no automated messages, calls or DMs. A person reviews every prospect and sends manually. Singapore PDPA/DNC: business-to-business outreach to a published business contact is generally outside the DNC Registry for business numbers, but **check the current PDPC guidance and each platform's terms before sending**, honour opt-outs, and keep Second Shift data separate from insurance/financial-advisory data (this base excludes those sectors by rule).

## Add Tavily (or another search provider)
Create a Tavily credential in n8n, replace the `Web Search` node with an HTTP Request to `https://api.tavily.com/search` returning `{results:[{title,url,content,published_date}]}`, and map fields in `Pool Web` (`snippet`←`content`, `date`←`published_date`). No other node changes.
