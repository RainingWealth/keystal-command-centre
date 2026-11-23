import { resolveBrief, prospectFields, renderReport, clip } from '../../src/engine.js';
export function main() {
  const cfg = $('Config').first().json;
  const p = $('Process').first().json;
  let llm = null; let llmNote = null;
  if (p.needsLLM) {
    try {
      const r = $('LLM Briefs').first().json;
      if (r && r.error) llmNote = 'LLM call failed: ' + String(r.error.message || r.error).slice(0, 140);
      const txt = r && r.choices && r.choices[0] && r.choices[0].message && r.choices[0].message.content;
      if (txt) llm = JSON.parse(txt).briefs;
      else if (!llmNote) llmNote = 'LLM returned no content';
    } catch (e) { llmNote = 'LLM output unreadable: ' + String(e.message).slice(0, 100); }
  }
  const ctx = { today: cfg.today, batch: cfg.batch };
  const briefs = []; const records = []; let llmUsed = 0, llmRejected = 0;
  p.accepted.forEach((a, i) => {
    const r = resolveBrief(a.c, cfg.today, llm && Array.isArray(llm) ? llm.find((x) => x && x.index === i) : null);
    if (r.source === 'llm') llmUsed++; else if (llm) llmRejected++;
    briefs.push(r.brief);
    records.push({ fields: prospectFields(a.c, a.scored, r.brief, ctx) });
  });
  const notes = [];
  p.providers.forEach((x) => { if (x.error) notes.push(`${x.name}: ${x.error}`); });
  if (llmNote) notes.push(llmNote + ' — deterministic template briefs used.');
  if (llmRejected) notes.push(`${llmRejected} LLM brief(s) failed grounding checks and were replaced by the template.`);
  notes.push('Pipeline C (operational signals) = Perplexity booking-channel searches + repeat-vacancy merge from Pipeline A. Complaint/review mining is not enabled.');
  if (cfg.dryRun) notes.push('DRY RUN: nothing written to Prospects/Raw Signals.');
  const status = cfg.dryRun ? 'Dry run' : (p.providers.some((x) => x.error) ? 'Partial' : 'Success');
  const report = renderReport({ today: cfg.today, batch: cfg.batch, trigger: cfg.trigger, providers: p.providers, metrics: p.metrics, accepted: p.accepted, briefs, followUps: p.followUps, notes, dryRun: cfg.dryRun });
  const url = (t) => `https://api.airtable.com/v0/${cfg.baseId}/${t}`;
  const out = [];
  if (!cfg.dryRun) {
    for (let i = 0; i < records.length; i += 10) out.push({ table: 'Prospects', url: url(cfg.tables.prospects), body: { records: records.slice(i, i + 10), typecast: true }, expect: records.slice(i, i + 10).map((r) => ({ business: r.fields['Business'], key: r.fields['Dedupe Key'] })) });
    const raws = p.rawRows.map((r) => ({ fields: r.fields }));
    for (let i = 0; i < raws.length; i += 10) out.push({ table: 'Raw Signals', url: url(cfg.tables.raw), body: { records: raws.slice(i, i + 10), typecast: true } });
  }
  const sources = p.providers.map((x) => `${x.name}: ${x.calls} calls${x.error ? ' [' + x.error + ']' : ''}`).join(' | ');
  const rr = Object.entries(p.metrics.rejectReasons).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k}=${v}`).join(', ');
  out.push({ table: 'Research Runs', url: url(cfg.tables.runs), body: { typecast: true, records: [{ fields: {
    'Run Name': `Auto — ${cfg.runId}`, 'Run Date': cfg.today, 'Sources Searched': clip(sources, 900),
    'New Prospects': cfg.dryRun ? 0 : records.length, 'Duplicates Skipped': p.metrics.duplicates,
    'Notes': clip(notes.join('\n'), 1800), 'Trigger': cfg.trigger, 'Run Status': status, 'Candidates Found': p.metrics.candidates,
    'Rejected': p.metrics.rejected, 'Rejection Reasons': clip(rr, 900), 'Search Calls': p.providers.reduce((n, x) => n + (x.calls || 0), 0),
    'Errors': clip(notes.filter((n) => /:|failed/.test(n)).join('\n'), 900), 'Daily Report': clip(report, 90000), 'Execution ID': String($execution.id),
  } }] } });
  return out.map((o, i) => ({ json: Object.assign(o, i === out.length - 1 ? { report, status, plannedProspects: records.length, llmUsed, dryRun: cfg.dryRun } : {}) }));
}
