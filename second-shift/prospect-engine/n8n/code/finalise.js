export function main() {
  const v = $('Verify Plan').first().json;
  const last = $('Assemble').all().map((i) => i.json).slice(-1)[0] || {};
  const rb = $('Read Back').first().json || {};
  const recs = rb.records || (rb.body && rb.body.records) || [];
  let verified = 0; const problems = [];
  if (v.mode === 'prospects') {
    recs.forEach((r) => { const f = r.fields || {}; if (f['Business'] && /^https:\/\//.test(f['Evidence URL'] || '') && f['Status'] && f['Dedupe Key']) verified++; else problems.push(r.id); });
    if (recs.length !== v.expectedProspects) problems.push(`read-back returned ${recs.length} of ${v.expectedProspects}`);
  } else if (rb.error) problems.push('read-back failed: ' + String(rb.error.message || rb.error).slice(0, 100));
  const errs = v.errs.concat(problems.map((p) => 'verify: ' + p));
  const status = last.dryRun ? 'Dry run' : (errs.length ? 'Partial' : last.status);
  const note = `Write result: ${v.created.prospectIds.length} prospects created, ${verified} verified by read-back; ${v.created.raw} raw signals created.${errs.length ? ' ISSUES: ' + errs.join(' | ') : ''}`;
  return [{ json: { url: v.created.runId ? `https://api.airtable.com/v0/appJsyvz3FLUU7NlY/tblH8gnqao9nOsMjL/${v.created.runId}` : null, body: { typecast: true, fields: { 'Run Status': status, 'Notes': note.slice(0, 1800) } }, summary: { status, prospectsCreated: v.created.prospectIds.length, verified, rawCreated: v.created.raw, errors: errs, report: last.report } } }];
}
