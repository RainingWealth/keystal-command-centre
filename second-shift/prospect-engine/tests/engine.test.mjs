import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as E from '../src/engine.js';
const fx = (n) => JSON.parse(readFileSync(new URL('./fixtures/' + n, import.meta.url), 'utf8'));
const TODAY = '2026-11-23';
const mcf = () => fx('mcf.json').results.map((j) => E.normaliseMCF(j, { query: 'receptionist' }));
const search = () => fx('search.json').results.map((r) => E.normaliseSearchResult(r, { pipeline: 'B', provider: 'perplexity', query: 'q' }));
const run = (raw, existing = [], rawKeys = [], opts = {}) => E.processCandidates(raw, existing, rawKeys, { today: TODAY, batch: 'test', ...opts });

test('canonical domain strips www/path and rejects job boards, social, gov', () => {
  assert.equal(E.canonicalDomain('https://www.Stalford.edu.sg/promo?a=1'), 'stalford.edu.sg');
  assert.equal(E.canonicalDomain('https://sg.expertini.com/job/x'), null);
  assert.equal(E.canonicalDomain('https://www.facebook.com/foo'), null);
  assert.equal(E.canonicalDomain('https://www.mom.gov.sg/x'), null);
  assert.equal(E.canonicalDomain('not a url'), null);
});

test('hostOf/normUrl are regex-based: userinfo, port, no scheme, uppercase, tracking params', () => {
  assert.equal(E.hostOf('HTTPS://User:pw@WWW.Example.sg:8443/a/b?x=1#z'), 'example.sg');
  assert.equal(E.hostOf('www.example.com.sg'), 'example.com.sg');
  assert.equal(E.hostOf('example.sg:8080/x'), 'example.sg');
  assert.equal(E.hostOf('not a url'), null);
  assert.equal(E.hostOf('localhost'), null);
  assert.equal(E.normUrl('https://www.Example.sg/Path/?utm_source=a&id=5#frag'), 'example.sg/path?id=5');
  assert.equal(E.normUrl('http://example.sg/path'), E.normUrl('https://www.example.sg/path/'));
});

test('name normalisation: legal suffixes, "the", punctuation', () => {
  assert.equal(E.nameSlug('SUNRISE AESTHETICS PTE. LTD.'), 'sunriseaesthetics');
  assert.ok(E.nameSlugVariants('The Collar Club').includes('collarclub'));
  assert.ok(E.nameSlugVariants('Collar Club Pte Ltd').includes('thecollarclub'));
  assert.equal(E.nameSlug('Nanyang Education (NY Education)'), 'nanyangeducation');
});

test('date parsing: ISO, day-first, month-first, ambiguity and invalid dates', () => {
  assert.deepEqual(E.findDates('Ends 31 Dec 2026', TODAY).map((d) => d.date), ['2026-12-31']);
  assert.deepEqual(E.findDates('Ends Dec 31, 2026', TODAY).map((d) => d.date), ['2026-12-31']);
  assert.deepEqual(E.findDates('valid 05/12/2026', TODAY).map((d) => d.date), ['2026-12-05']); // SG day-first
  assert.deepEqual(E.findDates('on 2026-02-30', TODAY), []);
  assert.deepEqual(E.findDates('on 31 Feb 2026', TODAY), []);
  assert.deepEqual(E.findDates('until 15 Jan', TODAY).map((d) => d.date), ['2027-01-15']); // year inferred forward
});

test('deadline extraction takes the latest framed end date, ignores unframed dates', () => {
  assert.equal(E.extractDeadline('Promo from 1 Nov 2026 to 30 Nov 2026. Posted 5 Nov 2026', TODAY), '2026-11-30');
  assert.equal(E.extractDeadline('Early bird offer valid until 31 Dec 2026', TODAY), '2026-12-31');
  assert.equal(E.extractDeadline('Founded on 12 Mar 2019. Contact us.', TODAY), null);
});

test('contact extraction: SG phones, emails, whatsapp links; ignores junk', () => {
  const c = E.extractContacts('Call +65 6123 4567 or 9123-4567. hello@brightpath.com.sg a.png@x.png https://wa.me/6591234567', 'brightpath.com.sg');
  assert.equal(c.phone, '+6561234567');
  assert.equal(c.email, 'hello@brightpath.com.sg');
  assert.equal(c.whatsapp, '+6591234567');
  assert.equal(E.extractContacts('call 1234 5678', 'x.sg').phone, null);
});

test('MCF normalisation: employer, UEN, agency-on-behalf, hiring company substitution', () => {
  const [a, b, , d] = mcf();
  assert.equal(a.business, 'SUNRISE AESTHETICS PTE. LTD.');
  assert.equal(a.uen, '201900001A');
  assert.equal(a.signalDate, '2026-11-19');
  assert.equal(b.postedByAgency, true);
  assert.equal(d.business, 'BAY AESTHETICS PTE. LTD.'); // hiringCompany identified -> employer, not agency
  assert.equal(d.postedByAgency, false);
  assert.equal(a.website, 'https://sunriseaesthetics.sg/');
  assert.equal(a.domain, 'sunriseaesthetics.sg');
  assert.equal(d.domain, 'bayclinic.sg'); // hiring company's own URL, not the agency's
});

test('pipeline A: agency, stale (>21d) and excluded sector are rejected with reasons; good listings accepted', () => {
  const r = run(mcf(), fx('existing.json'));
  assert.equal(r.metrics.rejectReasons.recruitment_agency, 2); // name/EA text + SSIC 78xx industry code
  assert.equal(r.metrics.rejectReasons.employer_hidden, 1);
  assert.equal(r.metrics.rejectReasons.stale_listing_over_window, 1);
  assert.equal(r.metrics.rejectReasons.excluded_sector, 1);
  const names = r.accepted.map((a) => a.c.business);
  assert.ok(names.includes('SUNRISE AESTHETICS PTE. LTD.'));
  assert.ok(names.includes('BAY AESTHETICS PTE. LTD.') === false, 'already existing as Bay Aesthetics Clinic -> duplicate');
});

test('merge: two vacancies from one UEN become one candidate with signalCount 2 and +3 urgency', () => {
  const r = run(mcf());
  const sun = r.accepted.find((a) => a.c.uen === '201900001A');
  assert.equal(sun.c.signalCount, 2);
  assert.equal(sun.c.signals.length, 2);
  assert.equal(sun.scored.parts.urgency, 35); // 35 + 3 capped at 35
  const single = E.scoreCandidate({ ...sun.c, signalCount: 1 }, TODAY);
  assert.equal(single.parts.urgency, 35);
});

test('dedupe vs existing: domain, legacy bare-slug key, name variant, subset name; one record per company', () => {
  const idx = E.buildExistingIndex(fx('existing.json'));
  assert.equal(E.matchExisting(idx, { domain: 'stalford.edu.sg', business: 'x' }).id, 'recD');
  assert.equal(E.matchExisting(idx, { business: 'Dentalis Pte Ltd' }).id, 'recC'); // legacy slug key
  assert.equal(E.matchExisting(idx, { business: 'Collar Club' }).id, 'recB');      // "the" variant
  assert.equal(E.matchExisting(idx, { business: 'BAY AESTHETICS PTE. LTD.' }).id, 'recA'); // subset match
  assert.equal(E.matchExisting(idx, { business: 'NY Education Private Limited', domain: 'nanyangeducation.com' }).id, 'recE');
  assert.equal(E.matchExisting(idx, { business: 'Totally New Business', domain: 'totallynew.sg' }), null);
  // false-positive guard: shared generic word must not match
  assert.equal(E.matchExisting(idx, { business: 'Sunrise Dental Clinic' }), null);
});

test('existing prospects are never edited: duplicates produce raw signals only, with prospect link', () => {
  const r = run(mcf(), fx('existing.json'));
  assert.ok(r.metrics.duplicates >= 1);
  assert.ok(r.accepted.every((a) => !['recA', 'recB', 'recC', 'recD', 'recE'].includes(a.matchedId)));
  const linked = r.rawRows.filter((x) => x.prospectId === 'recA');
  assert.equal(linked.length, 1);
  assert.equal(linked[0].fields['Review Status'], 'Needs validation');
  assert.equal(linked[0].fields['Matched Prospect'], 'Bay Aesthetics Clinic');
  assert.equal(linked[0].fields['Reject Reason'], 'existing_prospect_new_signal');
});

test('repeated run (idempotency): second run with first run outputs as existing writes 0 new prospects/raw rows', () => {
  const first = run(mcf());
  const existing = first.accepted.map((a, i) => ({ id: 'rec' + i, fields: E.prospectFields(a.c, a.scored, E.templateBrief(a.c, TODAY), { today: TODAY, batch: 'test' }) }));
  const rawKeys = first.rawRows.map((x) => x.fields['Signal Key']);
  const second = run(mcf(), existing, rawKeys);
  assert.equal(second.accepted.length, 0);
  assert.equal(second.rawRows.length, 0);
  assert.equal(second.metrics.duplicates, first.accepted.length);
});

test('pipeline B: campaign page with future deadline scores, expired offer rejected, aggregator/non-SG/unidentified rejected', () => {
  const cands = search().map((c) => E.enrichFromPage(c, { status: 200, body: `<html><body><h1>${c.title}</h1><p>${c.evidenceText}</p><p>${'Contact us for enquiries and registration. '.repeat(8)}${/\.sg\//.test(c.evidenceUrl) ? 'Call +65 6123 4567' : ''}</p></body></html>` }, TODAY));
  const r = run(cands);
  const reasons = r.metrics.rejectReasons;
  assert.ok(reasons.offer_expired >= 1, 'Lotus Spa expired offer');
  assert.ok(reasons.not_singapore >= 1, 'overseas-academy.co.uk');
  const green = r.accepted.find((a) => /greenleaf/i.test(a.c.business));
  assert.ok(green, 'Greenleaf accepted');
  assert.equal(green.c.deadline, '2026-12-31');
  assert.equal(green.c.signalType, '2027 enrolment campaign');
  assert.equal(green.c.evidenceVerified, true);
});

test('unverified page (fetch failed) can never become a Prospect -> goes to raw signals as research-required', () => {
  const cands = search().map((c) => E.enrichFromPage(c, { status: 403, body: '' }, TODAY));
  const r = run(cands);
  assert.equal(r.accepted.length, 0);
  const raw = r.rawRows.filter((x) => x.fields['Reject Reason'] === 'source_page_not_verified');
  assert.ok(raw.length >= 1);
  assert.ok(raw.every((x) => x.fields['Review Status'] === 'Needs validation'));
});

test('scoring golden cases', () => {
  const hire = { signalType: 'Hiring enquiry staff', role: 'Receptionist', evidenceText: 'phone whatsapp appointment', sector: 'Healthcare', website: 'https://a.sg/', phone: '+6561234567', email: 'a@a.sg', signalDate: '2026-11-19', signalCount: 1 };
  const s = E.scoreCandidate(hire, TODAY);
  assert.deepEqual(s.parts, { urgency: 35, fit: 25, commercial: 18, contact: 9, recency: 10 });
  assert.equal(s.total, 97);
  const camp = { signalType: '2027 enrolment campaign', evidenceText: 'enrol now', sector: 'Education', website: 'https://b.sg/', deadline: '2026-12-10', signalCount: 1 };
  const c = E.scoreCandidate(camp, TODAY);
  assert.equal(c.parts.urgency, 32); assert.equal(c.parts.fit, 14); assert.equal(c.parts.recency, 8);
  assert.equal(c.total, 32 + 14 + 18 + 4 + 8);
  const old = E.scoreCandidate({ ...hire, signalDate: '2026-11-01' }, TODAY);
  assert.equal(old.parts.recency, 3);
  const undated = E.scoreCandidate({ signalType: 'Trial booking campaign', evidenceText: 'trial', sector: 'Education', website: 'https://c.sg/', signalCount: 1 }, TODAY);
  assert.equal(undated.parts.urgency, 20); assert.equal(undated.undated, true); assert.equal(undated.parts.recency, 2);
  const big = E.scoreCandidate({ ...hire, evidenceText: 'multinational phone whatsapp appointment' }, TODAY);
  assert.equal(big.parts.commercial, 8);
});

test('tiering: <50 not queued; 50-69 research raw row; cap at maxNewProspects', () => {
  const mk = (i) => ({ pipeline: 'A', source: 'mcf', signalType: 'Hiring enquiry staff', sourceType: 'Job listing', business: 'Alpha Studio ' + 'X'.repeat(i + 1) + ' Pte Ltd', uen: '2020000' + String(i).padStart(2, '0') + 'Z', role: 'Receptionist', evidenceText: 'phone whatsapp enquiries appointment', evidenceUrl: 'https://www.mycareersfuture.gov.sg/job/' + i, signalDate: '2026-11-20', evidenceVerified: true, sector: 'Healthcare' });
  const r = run(Array.from({ length: 30 }, (_, i) => mk(i)), [], [], { maxNewProspects: 20 });
  assert.equal(r.accepted.length, 20);
  assert.equal(r.metrics.capped, 10);
});

test('brief: deterministic template is evidence-grounded; hypothesis labelled; no money/percent claims', () => {
  const c = { business: 'Sunrise Aesthetics', signalType: 'Hiring enquiry staff', role: 'Receptionist', sector: 'Beauty / Wellness', evidenceUrl: 'https://www.mycareersfuture.gov.sg/job/x', signalDate: '2026-11-19', website: 'https://sun.sg/' };
  const b = E.templateBrief(c, TODAY);
  assert.match(b.problem, /^Hypothesis/);
  assert.match(b.hook, /Rain from Second Shift/);
  assert.match(b.hook, /Sunrise Aesthetics/);
  assert.equal(E.validateBrief(b, c).ok, true);
  assert.doesNotMatch(E.briefText(b), /\d+%|\$\d/);
});

test('LLM brief: fabricated figures / loss claims rejected -> template fallback; clean LLM brief accepted', () => {
  const c = { business: 'Sunrise Aesthetics', signalType: 'Hiring enquiry staff', role: 'Receptionist', sector: 'Beauty / Wellness', evidenceText: 'Receptionist for phone enquiries', evidenceUrl: 'https://x.sg/job/1', signalDate: '2026-11-19' };
  const good = { ...E.templateBrief(c, TODAY), hook: "Hi, I'm Rain from Second Shift. I noticed Sunrise Aesthetics is recruiting a Receptionist for phone enquiries. Would a short demo be useful?" };
  assert.equal(E.resolveBrief(c, TODAY, good).source, 'llm');
  const bad1 = { ...good, value: 'You will save $5,000 a month and lose no leads.' };
  const r1 = E.resolveBrief(c, TODAY, bad1);
  assert.equal(r1.source, 'template'); assert.ok(r1.errors.length);
  const bad2 = { ...good, problem: 'You are losing customers because nobody answers the phone.' };
  assert.equal(E.resolveBrief(c, TODAY, bad2).source, 'template');
  const bad3 = { ...good, whyNow: 'Observed: 47 vacancies posted 3 weeks ago.' };
  assert.equal(E.resolveBrief(c, TODAY, bad3).source, 'template');
  assert.equal(E.resolveBrief(c, TODAY, { hook: 'x' }).source, 'template');
  assert.equal(E.resolveBrief(c, TODAY, null).source, 'template');
});

test('prospect/raw field shapes: only existing Airtable fields + new additive ones; Status fixed to Ready for review', () => {
  const run1 = run(mcf());
  const a = run1.accepted[0];
  const f = E.prospectFields(a.c, a.scored, E.templateBrief(a.c, TODAY), { today: TODAY, batch: 'test' });
  assert.equal(f['Status'], 'Ready for review');
  assert.equal(f['Priority /100'], a.scored.total);
  assert.equal(f['Priority /100'], f['Urgency /35'] + f['Workflow Fit /25'] + f['Commercial Fit /20'] + f['Contactability /10'] + f['Recency /10']);
  assert.match(f['Dedupe Key'], /^uen:|\./);
  assert.ok(!Object.values(f).includes(undefined));
  assert.ok(E.isHttps(f['Evidence URL']));
});

test('followUps: due actions on active statuses and stale "Ready for review" signals', () => {
  const { due, stale } = E.followUps(fx('existing.json'), TODAY);
  assert.deepEqual(due.map((d) => d.business), ['Bay Aesthetics Clinic']);
  assert.ok(stale.some((s) => s.business === 'The Collar Club'));
  assert.ok(stale.some((s) => /deadline passed/.test(s.reason)));
});

test('provider failure tolerance: processing with a missing provider (empty search) still works on the other', () => {
  const r = run(mcf().concat([]));
  assert.ok(r.accepted.length >= 1);
  const r2 = run([]);
  assert.equal(r2.accepted.length, 0);
  assert.equal(r2.metrics.candidates, 0);
});

test('report: separates new from existing, lists reasons, evidence URLs, unavailable data, never claims volume', () => {
  const r = run(mcf(), fx('existing.json'));
  const briefs = r.accepted.map((a) => E.templateBrief(a.c, TODAY));
  const txt = E.renderReport({ today: TODAY, batch: 'test', trigger: 'manual', providers: [{ name: 'mcf', calls: 3 }, { name: 'perplexity', calls: 0, error: 'HTTP 429' }], metrics: r.metrics, accepted: r.accepted, briefs, followUps: E.followUps(fx('existing.json'), TODAY), notes: ['Perplexity rate-limited'] });
  assert.match(txt, /Five best new prospects/);
  assert.match(txt, /ERROR: HTTP 429/);
  assert.match(txt, /Existing prospects needing action/);
  assert.match(txt, /recruitment_agency/);
  assert.match(txt, /https:\/\/www\.mycareersfuture\.gov\.sg\/job\//);
  const empty = E.renderReport({ today: TODAY, batch: 'b', trigger: 'schedule', providers: [], metrics: run([]).metrics, accepted: [], briefs: [], followUps: { due: [], stale: [] }, notes: [] });
  assert.match(empty, /Nothing was manufactured/);
});

test('no secrets in source: engine/fixtures contain no key-like strings', () => {
  const src = readFileSync(new URL('../src/engine.js', import.meta.url), 'utf8');
  assert.doesNotMatch(src, /(sk-[A-Za-z0-9]{20,}|pat[A-Za-z0-9]{14}\.[a-f0-9]{30,}|apify_api_|tvly-[A-Za-z0-9]{10,})/);
});

test('Perplexity hiring fallback: job-board result needs a grounded employer name; ungrounded names are refused', () => {
  const r = fx('search.json').results.find((x) => /Pixel Dental/.test(x.title));
  let c = E.normaliseSearchResult(r, { pipeline: 'A', provider: 'perplexity', query: 'q' });
  assert.equal(c.business, null);
  assert.equal(run([c]).metrics.rejectReasons.aggregator_or_social_source, 1);
  const bad = E.applyIdentity(c, 'Totally Other Dental Pte Ltd');
  assert.equal(bad.business, null);
  assert.equal(bad.identityRejected, 'Totally Other Dental Pte Ltd');
  c = E.applyIdentity(c, 'Pixel Dental Pte Ltd');
  assert.equal(c.business, 'Pixel Dental Pte Ltd');
  const out = run([c]);
  assert.equal(out.accepted.length, 0, 'job-board page is unverified -> cannot be a Prospect');
  assert.equal(out.rawRows.filter((x) => x.fields['Reject Reason'] === 'source_page_not_verified').length, 1);
});
