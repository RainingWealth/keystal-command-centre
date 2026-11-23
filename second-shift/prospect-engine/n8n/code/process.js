import { enrichFromPage, processCandidates, followUps, contactRoute, clip } from '../../src/engine.js';
const SYSTEM = [
  'You write short, evidence-grounded B2B sales briefs for Second Shift, a Singapore AI-automation agency.',
  'Use ONLY the supplied evidence. Never invent numbers, savings, revenue, missed leads or customer losses.',
  'Return JSON: {"briefs":[{"index":n,"who":"","whyNow":"","problem":"","solution":"","value":"","hook":"","nextAction":""}]}.',
  'who = likely operational decision-maker role. whyNow starts with "Observed" and cites the dated trigger and source URL from the evidence.',
  'problem MUST start with "Hypothesis (unconfirmed):". solution = one specific workflow Second Shift can demo. value = qualitative only, no figures.',
  'hook = max 80 words, starts "Hi, I\'m Rain from Second Shift.", names the business and the specific observed trigger, ends with one low-pressure question. No urgency tricks.',
  'nextAction names the decision-maker role and the public business channel; a human sends manually.',
].join(' ');
export function main() {
  const cfg = $('Config').first().json;
  const existing = $('Read Prospects').all().map((i) => i.json).filter((j) => j && j.id);
  const rawKeys = $('Read Raw Keys').all().map((i) => i.json && i.json['Signal Key']).filter(Boolean);
  const mcf = $('Pool MCF').first().json;
  const web = $('Pool Web').first().json;
  const pages = $('Fetch Pages').all().map((i) => i.json);
  const webC = web.webCandidates || [];
  let fetchOk = 0, fetchFail = 0;
  const enriched = webC.map((c, i) => {
    const pg = pages[i] || {};
    const status = pg.statusCode !== undefined ? pg.statusCode : (pg.status || 0);
    const body = typeof pg.body === 'string' ? pg.body : (typeof pg.data === 'string' ? pg.data : '');
    const e = enrichFromPage(c, { status, body }, cfg.today);
    if (e.pageFetch === 'ok') fetchOk++; else fetchFail++;
    return e;
  });
  const out = processCandidates((mcf.mcfCandidates || []).concat(enriched), existing, rawKeys, { today: cfg.today, batch: cfg.batch, maxNewProspects: cfg.quotas.maxNew, hiringWindowDays: cfg.quotas.hiringWindowDays });
  const stale = (mcf.mcfStats && mcf.mcfStats.staleSkipped) || 0;
  if (stale) { out.metrics.candidates += stale; out.metrics.rejected += stale; out.metrics.rejectReasons.stale_listing_over_window = (out.metrics.rejectReasons.stale_listing_over_window || 0) + stale; }
  const slim = (c) => Object.assign({}, c, { pageText: clip(c.pageText, 1200), signals: (c.signals || []).slice(0, 6) });
  const accepted = out.accepted.map((a) => ({ c: slim(a.c), scored: a.scored, tier: a.tier }));
  const items = accepted.map((a, i) => ({ index: i, business: a.c.business, sector: a.c.sector, signalType: a.c.signalType, role: a.c.role || null, signalDate: a.c.signalDate || null, deadline: a.c.deadline || null, evidenceUrl: a.c.evidenceUrl, evidence: clip(a.c.evidenceText, 700), publicContactChannel: contactRoute(a.c).channel }));
  const llmRequest = accepted.length
    ? { model: cfg.openaiModel, response_format: { type: 'json_object' }, max_completion_tokens: 9000, reasoning_effort: 'minimal', messages: [{ role: 'system', content: SYSTEM }, { role: 'user', content: JSON.stringify({ prospects: items }) }] }
    : { model: cfg.openaiModel, max_completion_tokens: 20, messages: [{ role: 'user', content: 'Reply with the word ok.' }] };
  const webStats = Object.assign({}, web.webStats, { pagesFetched: fetchOk, pagesFailed: fetchFail });
  return [{ json: { accepted, rawRows: out.rawRows, duplicates: out.duplicates.slice(0, 40), metrics: out.metrics, providers: [mcf.mcfStats, webStats].filter(Boolean), followUps: followUps(existing, cfg.today), llmRequest, needsLLM: accepted.length > 0, existingCount: existing.length } }];
}
