export function main() {
  const cfg = $('Config').first().json;
  if (cfg.providers && cfg.providers.perplexity === false) return [{ json: { query: '', disabled: true } }];
  return cfg.webQueries.slice(0, cfg.quotas.maxSearches).map((x) => ({ json: { query: x.q, pipeline: x.pipeline } }));
}
