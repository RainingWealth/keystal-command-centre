import { normaliseMCF, daysBetween } from '../../src/engine.js';
export function main() {
  const cfg = $('Config').first().json;
  const plans = $('Plan MCF').all().map((i) => i.json);
  const res = $('MCF Search').all().map((i) => i.json);
  const cands = []; const seen = new Set(); const errs = [];
  let calls = 0, stale = 0, total = 0;
  const disabled = !!(plans[0] && plans[0].disabled);
  res.forEach((r, i) => {
    const plan = plans[i] || {};
    if (!plan.query) return;
    calls++;
    const body = r && r.body && Array.isArray(r.body.results) ? r.body : r;
    if (!r || r.error || !body || !Array.isArray(body.results)) { errs.push(String((r && r.error && (r.error.message || r.error)) || (r && r.message) || 'no results array').slice(0, 120)); return; }
    body.results.forEach((job) => {
      total++;
      const id = job.uuid || (job.metadata && job.metadata.jobPostId);
      if (!id || seen.has(id)) return;
      seen.add(id);
      const c = normaliseMCF(job, { query: plan.query });
      if ((c.signalDate && daysBetween(c.signalDate, cfg.today) > cfg.quotas.hiringWindowDays) || (c.expiryDate && c.expiryDate < cfg.today)) { stale++; return; }
      cands.push(c);
    });
  });
  const uniq = Array.from(new Set(errs));
  return [{ json: { mcfCandidates: cands, mcfStats: { name: 'MyCareersFuture API', calls, jobsSeen: seen.size, staleSkipped: stale, error: disabled ? 'disabled in Config' : (uniq.length ? `${errs.length}/${calls} calls failed: ${uniq.slice(0, 2).join('; ')}` : undefined) } } }];
}
