export function main() {
  const cfg = $('Config').first().json;
  if (cfg.providers && cfg.providers.mcf === false) return [{ json: { query: '', disabled: true } }];
  return cfg.mcfQueries.map((q) => ({ json: { query: q, limit: cfg.quotas.mcfPageSize } }));
}
