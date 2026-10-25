// n8n Code node (Run Once for All Items) for WAHA message.any.
// Emits only redacted, direct-chat metadata. No sending, AI calls or external requests.
// SAFETY: Populate explicit allowlist after verifying WAHA sessions.
const ALLOWED_SESSIONS = new Set([]); // e.g. ['rayvern']; empty = fail closed
const MAX_EXCERPT = 240;
const results = [];

function redact(text) {
  return String(text)
    .replace(/\b[STFGM]\d{7}[A-Z]\b/gi, '[SG_ID]')
    .replace(/[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}/g, '[EMAIL]')
    .replace(/(?:\+?65[\s-]?)?[689]\d{3}[\s-]?\d{4}\b/g, '[PHONE]')
    .replace(/\b\d{9,19}\b/g, '[NUMBER]');
}
function asString(value) {
  return typeof value === 'string' ? value.trim() : '';
}
function toTimestamp(value) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) return null;
  const millis = value > 1e12 ? value : value * 1000;
  const d = new Date(millis);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}
for (const input of $input.all()) {
  const outer = input.json && typeof input.json === 'object' ? input.json : {};
  const event = outer.body && typeof outer.body === 'object' && outer.body.event
    ? outer.body : outer;
  if (event.event !== 'message.any') continue;
  const session = asString(event.session);
  if (!session || !ALLOWED_SESSIONS.has(session)) continue;
  const p = event.payload;
  if (!p || typeof p !== 'object' || typeof p.fromMe !== 'boolean') continue;
  const messageId = asString(p.id);
  const chatId = asString(p.fromMe ? p.to : p.from);
  if (!messageId || !chatId) continue;
  // Exclude broadcast, stories, groups, channels and participant events.
  if (!chatId.endsWith('@c.us')) continue;
  const messageTime = toTimestamp(p.timestamp);
  if (!messageTime) continue;
  const body = asString(p.body) || asString(p.text?.body);
  const excerpt = body ? redact(body).slice(0, MAX_EXCERPT) : '[non-text message]';
  const eventKey = session + '|' + messageId;
  const conversationKey = session + '|' + chatId;
  results.push({
    json: {
      'Event Key': eventKey,
      'Conversation Key': conversationKey,
      'Message ID': messageId,
      'Session': session,
      'Chat ID': chatId,
      'Direction': p.fromMe ? 'Outgoing' : 'Incoming',
      'Message Time': messageTime,
      'Message Type': p.hasMedia ? 'media' : (body ? 'text' : 'unknown'),
      'Excerpt (Redacted)': excerpt,
      'Processing Status': 'Captured',
      'Capture Reason': 'WAHA message.any (direct chat)'
    }
  });
}
return results;
