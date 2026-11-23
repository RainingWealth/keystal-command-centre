export function main() {
  const f = $('Finalise').first().json;
  return [{ json: Object.assign({}, f.summary, { runLogUpdated: !$input.first().json.error }) }];
}
