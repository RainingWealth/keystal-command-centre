export function main() {
  const cfg = $('Config').first().json;
  const planned = $('Assemble').all().map((i) => i.json);
  const resp = $('Airtable Write').all().map((i) => i.json);
  const created = { prospectIds: [], raw: 0, runId: null }; const errs = [];
  planned.forEach((it, i) => {
    const r = resp[i] || {};
    const recs = r.records || (r.body && r.body.records);
    if (r.error || !Array.isArray(recs)) { errs.push(`${it.table} batch ${i + 1}: ${String((r.error && (r.error.message || r.error)) || r.message || 'no records in response').slice(0, 160)}`); return; }
    if (it.table === 'Prospects') recs.forEach((x) => created.prospectIds.push(x.id));
    else if (it.table === 'Raw Signals') created.raw += recs.length;
    else if (it.table === 'Research Runs') created.runId = recs[0] && recs[0].id;
  });
  const ids = created.prospectIds;
  const url = ids.length
    ? `https://api.airtable.com/v0/${cfg.baseId}/${cfg.tables.prospects}?filterByFormula=${encodeURIComponent('OR(' + ids.map((id) => `RECORD_ID()='${id}'`).join(',') + ')')}&fields%5B%5D=Business&fields%5B%5D=Evidence%20URL&fields%5B%5D=Status&fields%5B%5D=Dedupe%20Key&fields%5B%5D=Priority%20%2F100`
    : (created.runId ? `https://api.airtable.com/v0/${cfg.baseId}/${cfg.tables.runs}/${created.runId}` : `https://api.airtable.com/v0/${cfg.baseId}/${cfg.tables.runs}?maxRecords=1`);
  const expectedProspects = planned.filter((x) => x.table === 'Prospects').reduce((n, x) => n + x.expect.length, 0);
  return [{ json: { url, created, errs, expectedProspects, mode: ids.length ? 'prospects' : 'run' } }];
}
