# Test report (2026-11-23)

## Automated (`npm test`): 46 passed, 0 failed
- **Engine, 38 tests** (synthetic fixtures only): URL/domain/name normalisation, date and deadline parsing (day-first, invalid dates, expired vs upcoming, `ends on`), contact extraction, agency/outsourcing/excluded-sector rejection, 21-day window, Singapore check, UEN/domain/slug dedupe incl. legacy keys, in-run merge, templated sibling postings, scoring golden cases, tiering, daily cap with reserved non-hiring slots, no-contact-route rule, grounded-brief validator (fabricated figures, loss claims, URL false positives), report rendering, idempotent repeat run, unverified pages never become Prospects.
- **Workflow simulation, 8 tests**: runs the exact bundled n8n Code-node programs in a mock n8n runtime (with `URL` hidden, as in n8n): full chain, dry run, MCF + Perplexity failures → `Partial`, LLM failure/fabrication, repeat run writes nothing, partial write failure, config.

## In n8n's real runtime
Five pinned-input executions (credentials/HTTP nodes simulated, Code nodes real). **Found and fixed:** n8n's Code sandbox has **no `URL`/`URLSearchParams`**, which silently nulled every domain; the engine is now regex-based and the simulator hides `URL` as a regression guard. Final run (execution 178047): agency and Town Council rejected, hiring + campaign accepted, brand from `og:site_name`, deadline 2026-11-30 parsed.

## Live-source trial
- **MyCareersFuture API** (from the n8n host; blocked from this container): 8 queries, 454 results, 432 posted ≤23 days. Payload provides UEN, `companyUrl`, SSIC code, hide-employer flag: all used.
- **Engine on the live data** (440 candidates): 213 recruitment agencies, 15 templated-sibling postings, 9 excluded sectors, 2 unidentifiable, 3 no relevant signal, 2 duplicates of existing prospects; 20 qualified, 10 written.
- **Real campaign pages** (8 fetched): one verified live (Lil' but Mighty, early-bird extended to 30 Nov 2026; the search summary had claimed it ended 31 Oct, which the page contradicts); 3 undated → research; 2 unreachable.
- **Airtable**: 10 Prospects + 11 Raw Signals + 1 Research Runs created, then read back (35 Prospects total; all 25 seed rows unchanged, status still "Ready for review").
- **Repeat run** on identical inputs against the written data: 12 duplicates matched, 0 re-logged, 0 overlap with written prospects.

## Defects found by live data and fixed (all with regression tests)
URL global missing in n8n; sector inferred from description noise; Town Council and family office passing; sibling shell entities posting identical ads; one stray keyword scoring max urgency; "registration now open" misread as a new branch; brand read from stripped text instead of `og:site_name`; page text ignored by the Singapore check; closed-vs-current offer ambiguity; school-outsourcing vendors ("Name of Authority") passing the agency filter; evidence excerpt starting mid-word; percent-encoded URLs tripping the "no % claims" guard; no-contact-route candidates reaching Prospects.

## Not tested / limitations
- No scheduled production execution yet (credentials, see DEPLOYMENT_STATUS.md). `Read Prospects`/Airtable HTTP nodes and the live OpenAI call inside n8n were exercised only via the credential probe and pinned data.
- Perplexity output shape is taken from the node type definition; first real response may need minor `Pool Web` mapping.
- Source reliability: MCF = official, dated, structured (high); company pages = first-party but undated unless a deadline is stated; search snippets = leads only, never evidence; job-board aggregators = excluded.
- Scores are heuristics, not predictions of purchase; the sales angle is always labelled a hypothesis.
