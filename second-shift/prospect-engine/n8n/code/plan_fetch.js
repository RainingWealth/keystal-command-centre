export function main() {
  const w = $('Pool Web').first().json.webCandidates || [];
  return w.map((c) => ({ json: { url: c.evidenceUrl } }));
}
