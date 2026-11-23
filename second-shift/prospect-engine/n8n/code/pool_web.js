import { normaliseSearchResult } from '../../src/engine.js';
export function main() {
  const cfg = $('Config').first().json;
  const plans = $('Plan Web').all().map((i) => i.json);
  const res = $('Web Search').all().map((i) => i.json);
  const cands = []; const seenUrl = new Set(); const errs = [];
  let calls = 0, results = 0, blocked = 0;
  const disabled = !!(plans[0] && plans[0].disabled);
  res.forEach((r, i) => {
    const plan = plans[i] || {};
    if (!plan.query) return;
    calls++;
    if (!r || r.error || !Array.isArray(r.results)) { errs.push(String((r && r.error && (r.error.message || r.error)) || 'no results array').slice(0, 140)); return; }
    r.results.forEach((x) => {
      results++;
      const c = normaliseSearchResult(x, { pipeline: plan.pipeline, provider: 'perplexity', query: plan.query });
      if (!c.evidenceUrl || seenUrl.has(c.evidenceUrl)) return;
      seenUrl.add(c.evidenceUrl);
      if (c.blockedHost) { blocked++; return; }
      cands.push(c);
    });
  });
  cands.sort((a, b) => String(b.signalDate || '').localeCompare(String(a.signalDate || '')));
  const keep = cands.slice(0, cfg.quotas.maxFetch);
  const uniq = Array.from(new Set(errs));
  return [{ json: { webCandidates: keep, webStats: { name: 'Perplexity search', calls, results, blockedSkipped: blocked, fetchCapped: cands.length - keep.length, error: disabled ? 'disabled in Config' : (uniq.length ? `${errs.length}/${calls} calls failed: ${uniq.slice(0, 2).join('; ')}` : undefined) } } }];
}
