# Second Shift — Urgent-Buyer Prospect Engine

Daily discovery of Singapore SMEs with a **dated, evidenced reason** to consider AI automation (hiring for enquiry staff, live enrolment/trial campaigns, new outlets, booking workflows). Results land in the existing Airtable base as a ranked, auditable queue. **Nothing is ever sent to a prospect**; a human reviews and contacts.

- `src/engine.js` — all decision logic (identity, verification, dedupe, 100-point score, grounded briefs, report). Pure, tested.
- `src/config.js` — search queries, quotas, targets. **No secrets.**
- `n8n/code/*.js` + `scripts/build-workflow.mjs` — thin n8n Code-node programs; the builder tree-shakes the engine into each node.
- `n8n/second_shift_prospect_engine.json` — importable workflow (credential *references* only).
- `scripts/offline-run.mjs`, `scripts/enrich-contacts.mjs` — run the same engine on files (recovery path / enrichment).
- `docs/` — `OPERATIONS.md`, `TEST_REPORT.md`, `DEPLOYMENT_STATUS.md` (start with the last one).

```sh
npm install && npm test        # 46 tests: engine fixtures + simulation of the exact n8n Code nodes
npm run build                  # regenerates n8n/dist/*.js and n8n/workflow.sdk.ts (git-ignored)
```
