// Run: node integrations/whatsapp-intelligence/test-normalize.js
// Tests use synthetic events only; no WhatsApp or Airtable access.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const source = fs.readFileSync(path.join(__dirname, 'n8n-normalize.js'), 'utf8');
const run = (payloads, allow = false) => {
  const script = allow ? source.replace('new Set([])', "new Set(['rayvern'])") : source;
  return new Function('$input', script)({ all: () => payloads.map(json => ({ json })) }).map(x => x.json);
};
const base = {
  event: 'message.any', session: 'rayvern',
  payload: {
    id: 'false_12345678@c.us_ABC', fromMe: false, from: '12345678@c.us',
    to: '99999999@c.us', timestamp: 1792930000,
    body: 'Email hello@example.com, NRIC S1234567A, call 91234567',
    hasMedia: false
  }
};
assert.deepEqual(run([base]), [], 'No sessions authorised by default');
const rows = run([base], true);
assert.equal(rows.length, 1);
assert.equal(rows[0]['Direction'], 'Incoming');
assert.equal(rows[0]['Conversation Key'], 'rayvern|12345678@c.us');
assert.match(rows[0]['Excerpt (Redacted)'], /\[EMAIL\]/);
assert.match(rows[0]['Excerpt (Redacted)'], /\[SG_ID\]/);
assert.match(rows[0]['Excerpt (Redacted)'], /\[PHONE\]/);
assert.ok(!rows[0]['Excerpt (Redacted)'].includes('91234567'));
assert.equal(rows[0]['Processing Status'], 'Captured');
const outgoing = structuredClone(base);
outgoing.payload.fromMe = true;
outgoing.payload.id = 'true_12345678@c.us_DEF';
outgoing.payload.from = '99999999@c.us';
outgoing.payload.to = '12345678@c.us';
assert.equal(run([outgoing], true)[0]['Direction'], 'Outgoing');
const group = structuredClone(base);
group.payload.from = '12345@g.us';
assert.deepEqual(run([group], true), []);
const unknown = structuredClone(base);
unknown.event = 'message';
assert.deepEqual(run([unknown], true), []);
const status = structuredClone(base);
status.payload.from = 'status@broadcast';
assert.deepEqual(run([status], true), []);
const invalid = structuredClone(base);
delete invalid.payload.fromMe;
assert.deepEqual(run([invalid], true), []);
const wrapped = {body: base};
assert.equal(run([wrapped], true).length, 1);
console.log('WhatsApp intelligence normaliser: all synthetic checks passed');
