// Runs the exact bundled Code-node programs (n8n/dist/*.js) against a mock n8n runtime + fixtures.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

execFileSync('node', ['scripts/build-workflow.mjs'], { cwd: new URL('..', import.meta.url).pathname, stdio: 'pipe' });
const dist = (n) => readFileSync(new URL(`../n8n/dist/${n}.js`, import.meta.url), 'utf8');
const fx = (n) => JSON.parse(readFileSync(new URL('./fixtures/' + n, import.meta.url), 'utf8'));

function runChain({ trigger = 'manual', dryRun = false, mcfResponse, webResponse, pageResponse, llmResponse, writeResponse, existing, rawKeys = [] }) {
  const out = {};
  const exec = (name, file, input = [{ json: {} }]) => {
    const $ = (n) => ({ first: () => out[n][0], all: () => out[n] });
    // URL / URLSearchParams are shadowed to undefined: n8n's Code sandbox does not provide them (verified live)
    const fn = new Function('$', '$input', '$execution', 'URL', 'URLSearchParams', dist(file));
    const res = fn($, { first: () => input[0], all: () => input }, { id: 'sim-1' }, undefined, undefined);
    out[name] = res;
    return res;
  };
  exec('Config', 'config', [{ json: { trigger, dryRun } }]);
  out['Read Prospects'] = (existing || fx('existing.json')).map((r) => ({ json: { id: r.id, ...r.fields } }));
  out['Read Raw Keys'] = rawKeys.length ? rawKeys.map((k) => ({ json: { 'Signal Key': k } })) : [{ json: {} }];
  const plan = exec('Plan MCF', 'plan_mcf');
  out['MCF Search'] = plan.map(() => ({ json: mcfResponse }));
  exec('Pool MCF', 'pool_mcf');
  const pw = exec('Plan Web', 'plan_web');
  out['Web Search'] = pw.map(() => ({ json: webResponse }));
  exec('Pool Web', 'pool_web');
  const pf = exec('Plan Fetch', 'plan_fetch');
  out['Fetch Pages'] = pf.length ? pf.map((it) => ({ json: pageResponse(it.json.url) })) : [{ json: {} }];
  const proc = exec('Process', 'process');
  out['LLM Briefs'] = [{ json: llmResponse ? llmResponse(proc[0].json) : { error: { message: 'HTTP 500' } } }];
  const asm = exec('Assemble', 'assemble');
  out['Airtable Write'] = asm.map((it, i) => ({ json: writeResponse ? writeResponse(it.json, i) : { records: it.json.body.records.map((r, k) => ({ id: `rec${it.json.table[0]}${i}${k}`, fields: r.fields })) } }));
  const vp = exec('Verify Plan', 'verify_plan');
  const created = vp[0].json.created;
  out['Read Back'] = [{ json: vp[0].json.mode === 'prospects' ? { records: created.prospectIds.map((id, k) => ({ id, fields: (asm.flatMap((a) => a.json.table === 'Prospects' ? a.json.body.records : []))[k].fields })) } : { id: created.runId, fields: {} } }];
  const fin = exec('Finalise', 'finalise');
  const res = exec('Result', 'result', [{ json: { id: 'recRun' } }]);
  return { out, asm, vp, fin, res };
}
const mcfRes = fx('mcf.json');
const webRes = fx('search.json');
const page = (url) => ({ statusCode: 200, body: `<html><body><h1>${url}</h1>${'Enquiries and registration open. '.repeat(10)} Early bird until 31 Dec 2026. 2027 enrolment. Call +65 6123 4567 ${/\.sg\//.test(url) ? 'hello@' + new URL(url).hostname + '' : ''}</body></html>` });

test('config: SGT date, batch, quotas, trigger flags', () => {
  const { out } = runChain({ trigger: 'manual-dry-run', dryRun: true, mcfResponse: mcfRes, webResponse: webRes, pageResponse: page });
  const c = out.Config[0].json;
  assert.match(c.today, /^\d{4}-\d{2}-\d{2}$/);
  assert.equal(c.dryRun, true);
  assert.equal(c.baseId, 'appJsyvz3FLUU7NlY');
  assert.ok(c.quotas.maxNew <= 20 && c.mcfQueries.length >= 8);
});

test('full chain (live mode, MCF dates shifted to today): writes planned, no secrets, run-log last, read-back verifies', () => {
  const today = new Date().toISOString().slice(0, 10);
  const shifted = JSON.parse(JSON.stringify(mcfRes));
  shifted.results.forEach((j) => { if (j.metadata.newPostingDate !== '2026-10-01') j.metadata.newPostingDate = today; if (j.metadata.expiryDate) j.metadata.expiryDate = '2099-01-01'; });
  const { asm, vp, fin, res, out } = runChain({ mcfResponse: shifted, webResponse: { results: [] }, pageResponse: page });
  const tables = asm.map((a) => a.json.table);
  assert.equal(tables[tables.length - 1], 'Research Runs');
  assert.ok(tables.includes('Prospects'));
  const prospects = asm.filter((a) => a.json.table === 'Prospects').flatMap((a) => a.json.body.records);
  assert.ok(prospects.length >= 1);
  prospects.forEach((p) => { assert.equal(p.fields['Status'], 'Ready for review'); assert.ok(p.fields['Evidence URL'].startsWith('https://')); assert.ok(p.fields['AI Brief'].includes('WHY NOW')); });
  assert.ok(asm.every((a) => a.json.body.records.length <= 10));
  assert.doesNotMatch(JSON.stringify(asm), /(sk-[A-Za-z0-9]{20,}|Bearer )/);
  assert.equal(vp[0].json.errs.length, 0);
  assert.equal(fin[0].json.summary.errors.length, 0);
  assert.equal(fin[0].json.summary.verified, prospects.length);
  assert.equal(fin[0].json.body.fields['Run Status'], 'Success');
  assert.match(res[0].json.report, /Five best new prospects/);
  const runRec = asm[asm.length - 1].json.body.records[0].fields;
  assert.equal(runRec['Execution ID'], 'sim-1');
  assert.equal(runRec['Trigger'], 'manual');
  // existing seed rows are never in any write: no Prospects record for an existing dedupe key
  const keys = prospects.map((p) => p.fields['Dedupe Key']);
  assert.ok(!keys.includes('bayclinic.sg'));
});

test('dry run: only the run-log row is written; status Dry run', () => {
  const { asm, fin } = runChain({ trigger: 'manual-dry-run', dryRun: true, mcfResponse: mcfRes, webResponse: webRes, pageResponse: page });
  assert.deepEqual(asm.map((a) => a.json.table), ['Research Runs']);
  assert.equal(asm[0].json.body.records[0].fields['Run Status'], 'Dry run');
  assert.equal(fin[0].json.body.fields['Run Status'], 'Dry run');
});

test('provider failures: MCF 500s + Perplexity quota error -> run completes as Partial with named errors, no crash', () => {
  const { asm, fin } = runChain({ mcfResponse: { error: { message: 'HTTP 500' } }, webResponse: { error: 'You exceeded your current quota, add credits' }, pageResponse: page });
  const run = asm[asm.length - 1].json.body.records[0].fields;
  assert.equal(run['Run Status'], 'Partial');
  assert.match(run['Errors'], /quota/);
  assert.match(run['Errors'], /HTTP 500/);
  assert.equal(asm.filter((a) => a.json.table === 'Prospects').length, 0);
  assert.equal(fin[0].json.summary.status, 'Partial');
});

test('LLM failure -> deterministic template briefs, noted; valid LLM brief accepted; fabricated brief replaced', () => {
  const today = new Date().toISOString().slice(0, 10);
  const shifted = JSON.parse(JSON.stringify(mcfRes));
  shifted.results.forEach((j) => { if (j.metadata.newPostingDate !== '2026-10-01') j.metadata.newPostingDate = today; if (j.metadata.expiryDate) j.metadata.expiryDate = '2099-01-01'; });
  const base = { mcfResponse: shifted, webResponse: { results: [] }, pageResponse: page };
  const a = runChain(base);
  assert.match(a.asm[a.asm.length - 1].json.body.records[0].fields['Notes'], /LLM call failed/);
  const bad = runChain({ ...base, llmResponse: (proc) => ({ choices: [{ message: { content: JSON.stringify({ briefs: proc.accepted.map((x, i) => ({ index: i, who: 'x', whyNow: 'Observed: 99 vacancies', problem: 'You are losing customers', solution: 's', value: 'Save $5000', hook: 'Hi', nextAction: 'n' })) }) } }] }) });
  const prospects = bad.asm.filter((x) => x.json.table === 'Prospects').flatMap((x) => x.json.body.records);
  prospects.forEach((p) => { assert.match(p.fields['Outreach Draft'], /Rain from Second Shift/); assert.doesNotMatch(p.fields['AI Brief'], /losing customers|\$5000/); });
  assert.match(bad.asm[bad.asm.length - 1].json.body.records[0].fields['Notes'], /failed grounding checks/);
});

test('idempotent re-run: feeding run 1 output back as existing rows + raw keys writes zero new prospects/raw rows', () => {
  const today = new Date().toISOString().slice(0, 10);
  const shifted = JSON.parse(JSON.stringify(mcfRes));
  shifted.results.forEach((j) => { if (j.metadata.newPostingDate !== '2026-10-01') j.metadata.newPostingDate = today; if (j.metadata.expiryDate) j.metadata.expiryDate = '2099-01-01'; });
  const base = { mcfResponse: shifted, webResponse: { results: [] }, pageResponse: page };
  const r1 = runChain(base);
  const created = r1.asm.filter((x) => x.json.table === 'Prospects').flatMap((x) => x.json.body.records);
  const raws = r1.asm.filter((x) => x.json.table === 'Raw Signals').flatMap((x) => x.json.body.records);
  const existing = fx('existing.json').concat(created.map((c, i) => ({ id: 'recNew' + i, fields: c.fields })));
  const r2 = runChain({ ...base, existing, rawKeys: raws.map((r) => r.fields['Signal Key']) });
  assert.equal(r2.asm.filter((x) => x.json.table === 'Prospects').length, 0);
  assert.equal(r2.asm.filter((x) => x.json.table === 'Raw Signals').length, 0);
});

test('write failure for one batch is reported (Partial), not swallowed', () => {
  const today = new Date().toISOString().slice(0, 10);
  const shifted = JSON.parse(JSON.stringify(mcfRes));
  shifted.results.forEach((j) => { if (j.metadata.newPostingDate !== '2026-10-01') j.metadata.newPostingDate = today; if (j.metadata.expiryDate) j.metadata.expiryDate = '2099-01-01'; });
  const r = runChain({ mcfResponse: shifted, webResponse: { results: [] }, pageResponse: page, writeResponse: (it, i) => it.table === 'Prospects' ? { error: { message: 'The credential needs to be reconnected' } } : { records: it.body.records.map((x, k) => ({ id: 'rec' + i + k, fields: x.fields })) } });
  assert.equal(r.fin[0].json.summary.status, 'Partial');
  assert.match(r.fin[0].json.body.fields['Notes'], /reconnected/);
});

test('sandbox regression: with URL undefined (as in n8n), MCF websites/domains and web hosts still resolve', () => {
  const today = new Date().toISOString().slice(0, 10);
  const shifted = JSON.parse(JSON.stringify(mcfRes));
  shifted.results.forEach((j) => { if (j.metadata.newPostingDate !== '2026-10-01') j.metadata.newPostingDate = today; if (j.metadata.expiryDate) j.metadata.expiryDate = '2099-01-01'; });
  const r = runChain({ mcfResponse: shifted, webResponse: webRes, pageResponse: page });
  const cands = r.out['Pool MCF'][0].json.mcfCandidates;
  assert.ok(cands.some((c) => c.domain === 'sunriseaesthetics.sg' && c.website === 'https://sunriseaesthetics.sg/'));
  const web = r.out['Pool Web'][0].json.webCandidates;
  assert.ok(web.length >= 3, 'first-party web hosts must not all be treated as blocked');
  assert.ok(web.some((c) => c.domain === 'greenleaf-learning.sg'));
  assert.ok(r.out['Pool Web'][0].json.webStats.blockedSkipped >= 1);
});
