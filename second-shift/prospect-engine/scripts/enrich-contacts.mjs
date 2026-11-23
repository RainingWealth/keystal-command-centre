// Optional enrichment: fetch each domain's homepage (+ /contact) once and extract PUBLIC business contact details
// (SG phone, business email, wa.me link) with the engine's extractor. Output: { "<domain>": {phone,email,whatsapp,fetched} }
//   node scripts/enrich-contacts.mjs domains.json contacts.json
// Polite: one request per page, identifying User-Agent, 15s timeout, concurrency 4. No forms are submitted.
import { readFileSync, writeFileSync } from 'node:fs';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import * as E from '../src/engine.js';
const run = promisify(execFile);
const [domFile, outFile] = process.argv.slice(2);
const domains = JSON.parse(readFileSync(domFile, 'utf8'));
const UA = 'SecondShiftProspectBot/1.0 (single public page check for B2B research)';
async function get(url) {
  try {
    const { stdout } = await run('curl', ['-sL', '--max-time', '15', '-A', UA, '-w', '\n__STATUS__%{http_code}', url], { maxBuffer: 8e6 });
    const i = stdout.lastIndexOf('\n__STATUS__');
    return { status: Number(stdout.slice(i + 11)) || 0, body: stdout.slice(0, i) };
  } catch (e) { return { status: 0, body: '' }; }
}
const result = {};
let idx = 0;
async function worker() {
  while (idx < domains.length) {
    const d = domains[idx++];
    let phone = null, email = null, whatsapp = null, fetched = 0;
    for (const p of ['/', '/contact', '/contact-us']) {
      const r = await get(`https://${d}${p}`);
      if (r.status < 200 || r.status >= 300) continue;
      fetched++;
      const text = E.stripHtml(r.body) + ' ' + (r.body.match(/wa\.me\/\+?\d+|api\.whatsapp\.com\/send\?phone=\+?\d+|href=["']tel:[^"']+/gi) || []).join(' ');
      const c = E.extractContacts(text.replace(/tel:/gi, ' '), d);
      phone = phone || c.phone; email = email || c.email; whatsapp = whatsapp || c.whatsapp;
      if (phone && email) break;
    }
    result[d] = { phone, email, whatsapp, fetched };
  }
}
await Promise.all(Array.from({ length: 4 }, worker));
writeFileSync(outFile, JSON.stringify(result, null, 1));
console.log(Object.keys(result).length, 'domains;', Object.values(result).filter((r) => r.phone || r.email || r.whatsapp).length, 'with a public contact');
