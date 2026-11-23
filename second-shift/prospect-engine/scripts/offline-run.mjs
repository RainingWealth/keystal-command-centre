// Offline / recovery runner: runs the SAME engine as the n8n workflow on files and writes a plan of Airtable writes.
// Use when n8n or its Airtable credential is down, or to re-process a captured run.
//
//   node scripts/offline-run.mjs --existing prospects.json [--raw-keys keys.json] [--mcf mcf_raw.json] [--web web.json]
//        [--briefs briefs.json] [--today 2026-11-23] [--batch NAME] [--max-new 20] --out ./out
//
// existing.json : [{ id, Business, Website, "Dedupe Key", Status, "Evidence URL", "Signal Date", ... }]  (flat Airtable rows)
// mcf_raw.json  : { jobs: [ ...MyCareersFuture v2 job objects... ] }
// web.json      : [ { title, url, snippet, date, query, pipeline, status, body } ]   (body = fetched page HTML/text, optional)
// contacts.json : { "<domain>": { phone, email, whatsapp } }   (optional; from scripts/enrich-contacts.mjs)
// briefs.json   : { "<dedupe key>": { who, whyNow, problem, solution, value, hook, nextAction } }  (optional hand/LLM briefs; must pass grounding checks)
// Writes <out>/plan.json (field-name keyed records) and <out>/report.md. Nothing is sent to any network.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import * as E from '../src/engine.js';

const args = Object.fromEntries(process.argv.slice(2).reduce((a, v, i, arr) => (v.startsWith('--') ? a.concat([[v.slice(2), arr[i + 1] && !arr[i + 1].startsWith('--') ? arr[i + 1] : true]]) : a), []));
const read = (f, d) => (f ? JSON.parse(readFileSync(f, 'utf8')) : d);
const today = args.today || E.todaySG();
const batch = args.batch || `${today}-offline`;
const existing = read(args.existing, []);
const rawKeys = read(args['raw-keys'], []);
const briefsIn = read(args.briefs, {});
const contacts = read(args.contacts, {});
const maxNew = Number(args['max-new'] || E.SS.maxNewProspects);
const out = args.out || './out';

const cands = [];
let staleSkipped = 0;
if (args.mcf) {
  const seen = new Set();
  for (const job of read(args.mcf, { jobs: [] }).jobs) {
    if (!job.uuid || seen.has(job.uuid)) continue;
    seen.add(job.uuid);
    const c = E.normaliseMCF(job, { query: job.query });
    if ((c.signalDate && E.daysBetween(c.signalDate, today) > E.SS.hiringWindowDays) || (c.expiryDate && c.expiryDate < today)) { staleSkipped++; continue; }
    cands.push(c);
  }
}
let fetched = 0, fetchFailed = 0;
if (args.web) {
  const seen = new Set();
  for (const r of read(args.web, [])) {
    const c = E.normaliseSearchResult(r, { pipeline: r.pipeline || 'B', provider: r.provider || 'web-search', query: r.query });
    if (!c.evidenceUrl || seen.has(c.evidenceUrl) || c.blockedHost) continue;
    seen.add(c.evidenceUrl);
    const e = E.enrichFromPage(c, { status: r.status || 0, body: r.body || '' }, today);
    e.pageFetch === 'ok' ? fetched++ : fetchFailed++;
    cands.push(e);
  }
}

for (const c of cands) { const k = c.domain && contacts[c.domain]; if (k) { c.phone = c.phone || k.phone || undefined; c.email = c.email || k.email || undefined; c.whatsapp = c.whatsapp || k.whatsapp || undefined; } }
const res = E.processCandidates(cands, existing, rawKeys, { today, batch, maxNewProspects: maxNew });
if (staleSkipped) { res.metrics.candidates += staleSkipped; res.metrics.rejected += staleSkipped; res.metrics.rejectReasons.stale_listing_over_window = (res.metrics.rejectReasons.stale_listing_over_window || 0) + staleSkipped; }

const briefs = res.accepted.map((a) => {
  const k = E.dedupeKeyFor(a.c);
  const r = E.resolveBrief(a.c, today, briefsIn[k] || null);
  return { ...r, key: k };
});
const records = res.accepted.map((a, i) => ({ fields: E.prospectFields(a.c, a.scored, briefs[i].brief, { today, batch }), briefSource: briefs[i].source, briefErrors: briefs[i].errors }));
const providers = [];
if (args.mcf) providers.push({ name: 'MyCareersFuture API (via n8n host)', calls: 8, jobsSeen: cands.filter((c) => c.source === 'mcf').length + staleSkipped });
if (args.web) providers.push({ name: 'Web search + page fetch', calls: cands.filter((c) => c.source !== 'mcf').length, pagesFetched: fetched, pagesFailed: fetchFailed });
const followUps = E.followUps(existing, today);
const notes = ['Offline runner used (n8n Airtable credential / search provider unavailable); same engine as the n8n workflow.'];
const report = E.renderReport({ today, batch, trigger: 'offline-run', providers, metrics: res.metrics, accepted: res.accepted, briefs: briefs.map((b) => b.brief), followUps, notes, dryRun: false });

mkdirSync(out, { recursive: true });
writeFileSync(path.join(out, 'plan.json'), JSON.stringify({ today, batch, metrics: res.metrics, prospects: records, rawRows: res.rawRows.map((r) => r.fields), duplicates: res.duplicates, followUps }, null, 1));
writeFileSync(path.join(out, 'report.md'), report);
console.log(JSON.stringify({ metrics: res.metrics, prospects: records.length, rawRows: res.rawRows.length, duplicates: res.duplicates.length, out }, null, 1));
