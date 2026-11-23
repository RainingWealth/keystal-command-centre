/* =====================================================================
 * Second Shift Prospect Engine — pure decision logic (ESM).
 * Runs in Node (tests) and is tree-shaken into n8n Code nodes by
 * scripts/build-workflow.mjs. No network, no secrets, no I/O.
 * ===================================================================== */

const SS = {
  hiringWindowDays: 21,
  expansionWindowDays: 60,
  staleSignalDays: 30,
  maxNewProspects: 20,
  maxRawWrites: 40,
  priorityMin: 85,
  secondaryMin: 70,
  researchMin: 50,
};

const BLOCKED_DOMAINS = [
  'mycareersfuture.gov.sg', 'jobstreet.com', 'jobstreet.com.sg', 'indeed.com', 'sg.indeed.com', 'glassdoor.com',
  'glassdoor.sg', 'linkedin.com', 'facebook.com', 'instagram.com', 'tiktok.com', 'youtube.com', 'x.com',
  'twitter.com', 'expertini.com', 'jobsdb.com', 'foundit.sg', 'carousell.sg', 'carousell.com', 'sgjobs.com',
  'jobscentral.com.sg', 'jooble.org', 'sg.jooble.org', 'talent.com', 'careerjet.com.sg', 'jobsbank.gov.sg',
  'yellowpages.com.sg', 'sgpbusiness.com', 'opencorporates.com', 'yelp.com', 'tripadvisor.com', 'tripadvisor.com.sg',
  'google.com', 'maps.google.com', 'mothership.sg', 'straitstimes.com', 'channelnewsasia.com', 'wikipedia.org',
  'reddit.com', 'quora.com', 'lazada.sg', 'shopee.sg', 'telegram.me', 't.me', 'wa.me', 'whatsapp.com',
  'hardwarezone.com.sg', 'sgcarmart.com', 'tuitionsg.com', 'sgtuition.com', 'eventbrite.com', 'eventbrite.sg',
  'pinterest.com', 'medium.com', 'blogspot.com', 'wordpress.com', 'wixsite.com', 'linktr.ee', 'beacons.ai',
  'jobstore.com', 'ricebowl.com.sg', 'sg.talent.com', 'sg.linkedin.com', 'apply.workable.com', 'workable.com',
  'greenhouse.io', 'lever.co', 'jobscan.co', 'adzuna.sg', 'neuvoo.com.sg', 'trovit.sg', 'sg.trabajo.org',
];

const AGENCY_NAME_RE = /(recruit|staffing|manpower|headhunt|executive search|talent (solutions|acquisition|partners|hub)|human resources?|\bhr (solutions|consult|services|partner)|personnel|resourcing|employment (agency|services)|\bagency\b|job (portal|board)|outsourc|randstad|adecco|kelly services|robert walters|michael page|persolkelly|reeracoen|adia\b|aquarius|hays\b|spring professional|alpha consulting|talentvis|jac recruitment)/i;
const AGENCY_TEXT_RE = /(on behalf of (our|a|an) (client|company)|our client (is|has|requires)|EA licen[cs]e|EA no\.?|licen[cs]e no\.?\s*:?\s*\d{2}[A-Z]\d{4}|EA reg(istration)? ?(no|number)|personnel registration|we are (a|an) (leading )?(recruit|staffing|executive search))/i;
const EXCLUDED_SECTOR_RE = /(insuran|assurance|financial (advis|plann|service)|wealth (manage|plan)|\bbank\b|banking|moneylend|licensed money|securities|fund manage|\bfa firm\b|\bmas[- ]licensed|ministry of|\bgovernment\b|statutory board)/i;
const LARGE_ENTERPRISE_RE = /(multinational|\bmnc\b|fortune 500|publicly[- ]listed|sgx[- ]listed|nasdaq|nyse|global leader|worldwide offices)/i;

const SECTOR_RULES = [
  ['Healthcare', /(clinic|dental|dentist|medical|physio|tcm|chinese medicine|doctor|health ?care|orthodont|optical|optometr|podiatr|chiropract)/i],
  ['Beauty / Wellness', /(aesthetic|\bspa\b|salon|beauty|wellness|massage|facial|hair|nail|lash|slimming|laser)/i],
  ['Pet Services', /(\bpet\b|\bvet\b|veterinar|grooming|dog|\bcat\b)/i],
  ['Education', /(tuition|learning|education|enrich|tutor|school|academy|mandarin|\bmath|science|preschool|kindergarten|childcare|student|curriculum|\bpsle\b|o-level|a-level|\bpmo\b|coding class|music lesson|art class|writing)/i],
  ['Home Services', /(aircon|air-?con|plumb|electrical|renovat|cleaning|repair|servicing|pest|handyman|interior|locksmith|waterproof|moving|movers)/i],
];

const SIGNAL_TYPES = [
  'Hiring enquiry staff', '2027 enrolment campaign', 'Trial booking campaign', 'Promotion deadline',
  'New branch / expansion', 'Booking workflow signal', 'Customer-service bottleneck', 'Other active demand',
];
const SIGNAL_TO_PIPELINE = {
  'Hiring enquiry staff': 'A', '2027 enrolment campaign': 'B', 'Trial booking campaign': 'B', 'Promotion deadline': 'B',
  'New branch / expansion': 'B', 'Booking workflow signal': 'C', 'Customer-service bottleneck': 'C', 'Other active demand': 'B',
};
const SIGNAL_TO_RAWTYPE = {
  'Hiring enquiry staff': 'Hiring', '2027 enrolment campaign': 'Enrolment', 'Trial booking campaign': 'Enrolment',
  'Promotion deadline': 'Promotion', 'New branch / expansion': 'Expansion', 'Booking workflow signal': 'Operational',
  'Customer-service bottleneck': 'Operational', 'Other active demand': 'Unknown',
};

/* ---------- small helpers ---------- */
const MONTHS = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12 };

function pad2(n) { return String(n).padStart(2, '0'); }
function isoOf(y, m, d) {
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return null;
  return `${y}-${pad2(m)}-${pad2(d)}`;
}
function toUTC(iso) { const [y, m, d] = iso.split('-').map(Number); return Date.UTC(y, m - 1, d); }
function daysBetween(fromIso, toIso) { return Math.round((toUTC(toIso) - toUTC(fromIso)) / 86400000); }
function addDays(iso, n) { const t = new Date(toUTC(iso) + n * 86400000); return `${t.getUTCFullYear()}-${pad2(t.getUTCMonth() + 1)}-${pad2(t.getUTCDate())}`; }
function dowOf(iso) { return new Date(toUTC(iso)).getUTCDay(); }
function todaySG(now) {
  const d = now ? new Date(now) : new Date();
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Singapore', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
}
function clip(s, n) { s = String(s == null ? '' : s).replace(/\s+/g, ' ').trim(); return s.length > n ? s.slice(0, n - 1) + '…' : s; }
function hash(s) { let h = 5381; s = String(s); for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0; return h.toString(36); }
function unique(a) { return Array.from(new Set(a.filter(Boolean))); }

function stripHtml(html) {
  return String(html || '')
    .replace(/<(script|style|noscript|svg)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<br\s*\/?>|<\/(p|div|li|h[1-6]|tr)>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;|&#160;/g, ' ').replace(/&amp;/g, '&').replace(/&quot;|&#34;/g, '"').replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/[ \t\r\f]+/g, ' ').replace(/\n\s*\n+/g, '\n').trim();
}

/* ---------- identity ---------- */
function hostOf(url) {
  // regex-based on purpose: n8n's Code sandbox has no URL / URLSearchParams globals
  if (!url || typeof url !== 'string') return null;
  const m = url.trim().match(/^(?:[a-z][a-z0-9+.-]*:\/\/)?(?:[^\/?#@\s]*@)?([^\/?#:\s]+)(?::\d+)?(?:[\/?#]|$)/i);
  if (!m) return null;
  const host = m[1].toLowerCase().replace(/^www\d?\./, '');
  return /^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(host) ? host : null;
}
function isBlockedDomain(host) {
  if (!host) return true;
  if (/\.gov\.sg$/.test(host) || host === 'gov.sg') return true;
  return BLOCKED_DOMAINS.some((d) => host === d || host.endsWith('.' + d));
}
function canonicalDomain(url) {
  const h = hostOf(url);
  return h && !isBlockedDomain(h) ? h : null;
}
function isHttps(url) { return /^https:\/\/[^\s/]+\.[^\s/]+/i.test(String(url || '')); }

const NAME_STOP = new Set(['pte', 'ltd', 'limited', 'private', 'llp', 'llc', 'inc', 'co', 'company', 'singapore', 'sg', 'the', 'and', 'of', 'centre', 'center', 'services', 'service', 'group', 'holdings', 'enterprise', 'enterprises']);
const NAME_GENERIC = new Set(['clinic', 'dental', 'education', 'learning', 'studio', 'academy', 'school', 'aesthetics', 'wellness', 'care', 'medical', 'tuition', 'enrichment', 'air', 'conditioning', 'aircon', 'electrical', 'engineering']);
function nameTokens(name) {
  return String(name || '').toLowerCase().replace(/\([^)]*\)/g, ' ').replace(/&/g, ' and ')
    .replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter((t) => t && !NAME_STOP.has(t));
}
function nameSlug(name) { return nameTokens(name).join(''); }
function nameSlugVariants(name) {
  const s = nameSlug(name);
  const out = new Set(s ? [s] : []);
  const raw = String(name || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  if (raw) out.add(raw);
  if (s.startsWith('the') && s.length > 6) out.add(s.slice(3));
  else if (s) out.add('the' + s);
  return Array.from(out);
}
function domainLabel(host) { return host ? host.split('.')[0].replace(/[^a-z0-9]/g, '') : ''; }
function domainMatchesName(host, name) {
  const label = domainLabel(host);
  if (!label || label.length < 3) return false;
  const slug = nameSlug(name);
  if (slug && (slug.includes(label) || label.includes(slug))) return true;
  const toks = nameTokens(name).filter((t) => t.length >= 4 && !NAME_GENERIC.has(t));
  return toks.some((t) => label.includes(t));
}
function nameSubsetMatch(a, b) {
  const A = nameTokens(a), B = nameTokens(b);
  if (!A.length || !B.length) return false;
  const [small, big] = A.length <= B.length ? [A, B] : [B, A];
  if (!small.every((t) => big.includes(t))) return false;
  if (small.length >= 2) return true;
  return small[0].length >= 7 && !NAME_GENERIC.has(small[0]);
}

function guessBusinessName(title, host) {
  if (!title) return null;
  const parts = String(title).split(/\s[|\-–—:•·]\s|\s[|]\s|\|/).map((s) => s.trim()).filter(Boolean);
  const label = domainLabel(host);
  for (const p of parts) {
    const slug = nameSlug(p);
    if (!slug || slug.length < 3) continue;
    if (label && label.length >= 3 && (slug.includes(label) || label.includes(slug) || nameTokens(p).some((t) => t.length >= 4 && label.includes(t)))) {
      if (p.length <= 60) return p;
    }
  }
  return null;
}

/* ---------- dates ---------- */
const MONTH_RE = '(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)';
function inferYear(m, d, today) {
  const ty = Number(today.slice(0, 4));
  let iso = isoOf(ty, m, d);
  if (!iso) return null;
  if (daysBetween(iso, today) > 180) iso = isoOf(ty + 1, m, d);
  return iso;
}
/** all dates in text with their index. Day-first (SG convention) for numeric forms. */
function findDates(text, today) {
  const out = [];
  const t = String(text || '');
  let m;
  const iso = /\b(20\d{2})-(\d{2})-(\d{2})\b/g;
  while ((m = iso.exec(t))) { const v = isoOf(+m[1], +m[2], +m[3]); if (v) out.push({ date: v, index: m.index, raw: m[0] }); }
  const dmy = new RegExp('\\b(\\d{1,2})(?:st|nd|rd|th)?\\s*(?:of\\s+)?' + MONTH_RE + '[a-z]*\\.?,?(?:\\s+(20\\d{2}))?', 'gi');
  while ((m = dmy.exec(t))) {
    const mo = MONTHS[m[2].toLowerCase().slice(0, m[2].toLowerCase().startsWith('sept') ? 4 : 3)];
    const v = m[3] ? isoOf(+m[3], mo, +m[1]) : inferYear(mo, +m[1], today);
    if (v) out.push({ date: v, index: m.index, raw: m[0] });
  }
  const mdy = new RegExp('\\b' + MONTH_RE + '[a-z]*\\.?\\s+(\\d{1,2})(?:st|nd|rd|th)?(?:,?\\s+(20\\d{2}))?\\b', 'gi');
  while ((m = mdy.exec(t))) {
    const mo = MONTHS[m[1].toLowerCase().slice(0, m[1].toLowerCase().startsWith('sept') ? 4 : 3)];
    const v = m[3] ? isoOf(+m[3], mo, +m[2]) : inferYear(mo, +m[2], today);
    if (v) out.push({ date: v, index: m.index, raw: m[0] });
  }
  const num = /\b(\d{1,2})[\/.](\d{1,2})[\/.](20\d{2}|\d{2})\b/g;
  while ((m = num.exec(t))) {
    const y = m[3].length === 2 ? 2000 + +m[3] : +m[3];
    const v = isoOf(y, +m[2], +m[1]);
    if (v) out.push({ date: v, index: m.index, raw: m[0] });
  }
  return out;
}
const DEADLINE_KW = /(until|till|til|by|ends?|ending|expires?|expiry|valid(?:\s+(?:until|till|through|to))?|deadline|before|closes?|closing|last day|to|through|–|—|-)\s*[:,]?\s*$/i;
const DEADLINE_CTX = /(promo|offer|early.?bird|enrol|registration|register|trial|discount|deadline|ends|until|till|valid|expires?|closing|last day|special|limited)/i;
/** The latest date that is explicitly framed as an end/deadline. null if none. */
function extractDeadline(text, today) {
  const t = String(text || '');
  const found = findDates(t, today).filter((d) => {
    const before = t.slice(Math.max(0, d.index - 40), d.index);
    if (!DEADLINE_KW.test(before)) return false;
    const around = t.slice(Math.max(0, d.index - 140), d.index + 140);
    return DEADLINE_CTX.test(around);
  });
  if (!found.length) return null;
  found.sort((a, b) => (a.date < b.date ? 1 : -1));
  return found[0].date;
}

/* ---------- contact extraction (public business contact on company's own pages) ---------- */
function extractContacts(text, host) {
  const t = String(text || '');
  const phones = unique((t.match(/(?:\+?65[\s-]?)?\b[689]\d{3}[\s-]?\d{4}\b/g) || []).map((p) => {
    const d = p.replace(/\D/g, '').replace(/^65(?=\d{8}$)/, '');
    return /^[689]\d{7}$/.test(d) ? '+65' + d : null;
  }));
  const emails = unique((t.match(/[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+/g) || [])
    .map((e) => e.toLowerCase().replace(/[.,;]+$/, ''))
    .filter((e) => !/\.(png|jpe?g|gif|svg|webp)$/.test(e) && !/(sentry|wixpress|example\.com|domain\.com|yourname|email@|name@)/.test(e)));
  emails.sort((a, b) => (host && b.endsWith('@' + host) ? 1 : 0) - (host && a.endsWith('@' + host) ? 1 : 0));
  const wa = (t.match(/(?:wa\.me\/|api\.whatsapp\.com\/send\?phone=|whatsapp\.com\/send\?phone=)\+?(\d{8,12})/i) || [])[1];
  return { phone: phones[0] || null, email: emails[0] || null, whatsapp: wa ? '+' + wa : null };
}

/* ---------- classification ---------- */
function classifyText(text, hasDeadline) {
  const t = String(text || '').toLowerCase();
  if (/(new (branch|outlet|centre|center|clinic|studio|location|campus)|grand opening|now open|opening soon|officially open|we(?:'|’)?ve (moved|opened)|newly opened)/.test(t)) return 'New branch / expansion';
  if (/2027/.test(t) && /(enrol|registration|register|admission|intake)/.test(t)) return '2027 enrolment campaign';
  if (/(trial (class|lesson|session)|free trial|book a trial|trial booking)/.test(t)) return 'Trial booking campaign';
  if (/(early.?bird|promo|promotion|% off|discount|free consultation|special offer|limited time)/.test(t)) return hasDeadline ? 'Promotion deadline' : 'Other active demand';
  if (/(whatsapp|book (online|now|an appointment|a slot)|appointment|booking)/.test(t)) return 'Booking workflow signal';
  return null;
}
function classifyHiring(text) {
  const t = String(text || '').toLowerCase();
  const role = /(receptionist|customer (service|support|care)|appointment (coordinator|scheduler)|front.?desk|enrolment (coordinator|executive)|admin(istrative)? (assistant|executive)|client relations|centre (operations|administrator)|booking coordinator)/.test(t);
  const hiring = /(hiring|recruit|vacanc|we are looking for|job opening|apply now|wanted|now hiring|join our team)/.test(t);
  return role && hiring ? 'Hiring enquiry staff' : null;
}
/** Apply an LLM/heuristic-extracted employer name only if it is grounded in the source text. */
function applyIdentity(c, name) {
  if (!name || typeof name !== 'string') return c;
  const toks = nameTokens(name).filter((t) => t.length >= 3);
  if (!toks.length) return c;
  const hay = (c.evidenceText + ' ' + (c.title || '')).toLowerCase().replace(/[^a-z0-9\s]/g, ' ');
  if (!toks.every((t) => hay.includes(t))) return Object.assign({}, c, { identityRejected: name });
  return Object.assign({}, c, { business: name.replace(/\s+/g, ' ').trim(), identitySource: 'extracted' });
}
function inferSector(text) {
  for (const [sector, re] of SECTOR_RULES) if (re.test(text || '')) return sector;
  return 'Other';
}
function isAgency(name, text) {
  return AGENCY_NAME_RE.test(name || '') || AGENCY_TEXT_RE.test(text || '');
}
function isSingapore(c) {
  if (c.source === 'mcf') return true;
  const host = c.domain || hostOf(c.website) || hostOf(c.evidenceUrl) || '';
  if (/\.sg$/.test(host)) return true;
  const t = [c.evidenceText, c.title, c.business, c.phone].join(' ');
  return /(\bsingapore\b|\+65|\(65\)|\b65 ?[689]\d{3} ?\d{4}\b|\bs\(?\d{6}\)?\b)/i.test(t);
}

/* ---------- normalisers (provider payload -> candidate) ---------- */
function normaliseMCF(job, ctx) {
  const m = (job && job.metadata) || {};
  const posted = (job && job.postedCompany) || {};
  const hiring = (job && job.hiringCompany) || null;
  const hiringName = hiring && hiring.name ? hiring.name : null;
  const employer = hiringName ? hiring : posted;
  const onBehalf = !!m.isPostedOnBehalf;
  const description = stripHtml(job && job.description);
  const title = (job && job.title) || '';
  const id = (job && job.uuid) || m.jobPostId || '';
  const ssicCode = String(posted.ssicCode2020 || posted.ssicCode || '');
  const ssicDesc = String(posted.ssicDescription2020 || posted.ssicDescription || '');
  const postedIsAgencyIndustry = /^78/.test(ssicCode) || /(employment agenc|recruit|manpower|placement|staffing|labour supply|human resource)/i.test(ssicDesc);
  const url = employer.companyUrl || (hiringName ? null : posted.companyUrl) || null;
  const dom = canonicalDomain(url);
  const emp = Number(employer.employeeCount || posted.employeeCount);
  return {
    pipeline: 'A', source: 'mcf', signalType: 'Hiring enquiry staff', sourceType: 'Job listing',
    business: employer.name ? String(employer.name).replace(/\s+/g, ' ').trim() : null,
    uen: employer.uen ? String(employer.uen).toUpperCase() : null,
    website: dom ? 'https://' + dom + '/' : null, domain: dom,
    role: title, title, industryHint: ssicDesc || null,
    vacancies: job && job.numberOfVacancies || null,
    largeEnterprise: Number.isFinite(emp) && emp > 250 ? true : undefined,
    evidenceText: clip(`${title}. ${description}`, 1500),
    evidenceUrl: m.jobDetailsUrl || (id ? `https://www.mycareersfuture.gov.sg/job/${id}` : null),
    signalDate: String(m.newPostingDate || m.originalPostingDate || '').slice(0, 10) || null,
    expiryDate: String(m.expiryDate || '').slice(0, 10) || null,
    employerHidden: !!(m.isHideEmployerName || m.isHideHiringEmployerName),
    postedByAgency: !hiringName && ((onBehalf) || postedIsAgencyIndustry || AGENCY_NAME_RE.test(posted.name || '')),
    evidenceVerified: true,
    query: ctx && ctx.query || null,
  };
}
function normaliseSearchResult(r, ctx) {
  const url = r && (r.url || r.link) || null;
  const host = hostOf(url);
  const blocked = isBlockedDomain(host);
  const title = (r && r.title) || '';
  const snippet = (r && (r.snippet || r.content || r.description)) || '';
  const text = `${title}. ${snippet}`;
  const dateStr = String((r && (r.date || r.last_updated || r.published_date)) || '').slice(0, 10);
  const pipeline = (ctx && ctx.pipeline) || 'B';
  return {
    pipeline, source: (ctx && ctx.provider) || 'search', title, evidenceText: clip(text, 1500), evidenceUrl: url,
    domain: blocked ? null : host, website: blocked ? null : (host ? 'https://' + host + '/' : null),
    business: blocked ? null : guessBusinessName(title, host),
    needsIdentity: true, blockedHost: blocked, host,
    signalDate: /^\d{4}-\d{2}-\d{2}$/.test(dateStr) ? dateStr : null,
    sourceType: blocked ? (/(facebook|instagram|tiktok|linkedin)/.test(host || '') ? 'Company social' : 'Other') : 'Company website',
    evidenceVerified: false, query: ctx && ctx.query || null,
  };
}
/** Fold fetched page content into a candidate. `page` = {status, body}. */
function enrichFromPage(c, page, today) {
  const out = Object.assign({}, c);
  const ok = page && page.status >= 200 && page.status < 300 && typeof page.body === 'string';
  if (!ok) { out.pageFetch = 'failed:' + (page && page.status || 'error'); return out; }
  const text = /<\w+[^>]*>/.test(page.body) ? stripHtml(page.body) : page.body;
  out.pageFetch = 'ok';
  out.pageText = clip(text, 6000);
  const host = out.domain || hostOf(out.evidenceUrl);
  const contacts = extractContacts(text, host);
  out.phone = out.phone || contacts.phone; out.email = out.email || contacts.email; out.whatsapp = out.whatsapp || contacts.whatsapp;
  const deadline = extractDeadline(text, today);
  if (deadline) out.deadline = deadline;
  const cls = classifyText(text, !!out.deadline);
  if (cls) { out.pageSignal = cls; }
  if (!out.business) {
    const t = (text.match(/<title>([^<]+)/i) || [])[1] || out.title;
    out.business = guessBusinessName(out.title || t, host);
  }
  out.evidenceVerified = !!cls && text.length > 200;
  return out;
}

/* ---------- verification ---------- */
function verifyCandidate(c, today, opts) {
  const o = Object.assign({}, SS, opts);
  const reasons = [];
  if (!isHttps(c.evidenceUrl)) reasons.push('no_credible_source_url');
  if (c.source !== 'mcf' && c.blockedHost && !c.business) reasons.push('aggregator_or_social_source');
  if (!c.business || nameSlug(c.business).length < 3) reasons.push('business_not_identifiable');
  if (c.employerHidden) reasons.push('employer_hidden');
  if (c.postedByAgency || (c.source === 'mcf' && isAgency(c.business, ''))) reasons.push('recruitment_agency');
  else if (isAgency(c.business, c.evidenceText)) reasons.push('recruitment_agency');
  if (!isSingapore(c)) reasons.push('not_singapore');
  if (EXCLUDED_SECTOR_RE.test([c.business, c.domain, c.title].join(' '))) reasons.push('excluded_sector');
  if (c.signalType === 'Hiring enquiry staff' || c.pipeline === 'A') {
    if (c.signalDate) { if (daysBetween(c.signalDate, today) > o.hiringWindowDays) reasons.push('stale_listing_over_window'); }
    else if (c.source !== 'mcf') reasons.push('hiring_date_unknown');
    if (c.expiryDate && c.expiryDate < today) reasons.push('listing_expired');
  }
  if (c.deadline && c.deadline < today) reasons.push('offer_expired');
  if (c.signalDate && c.signalDate > addDays(today, 1)) reasons.push('invalid_future_date');
  return unique(reasons);
}

/* ---------- scoring ---------- */
const DUTY_CATS = [
  /whatsapp/i, /(enquir|inquir)/i, /(phone|\bcalls?\b|telephone)/i, /(appointment|booking|schedul)/i, /\btrial/i,
  /(registration|enrol)/i, /follow.?up/i, /reminder/i, /\bfaqs?\b/i, /(front.?desk|reception)/i, /customer (service|support|care)/i,
];
const DUTY_URGENT = /(whatsapp|enquir|inquir|phone|\bcalls?\b|appointment|booking|schedul)/i;
function scoreCandidate(c, today) {
  const text = [c.role, c.evidenceText, c.pageText].filter(Boolean).join(' ');
  const parts = {};
  const why = [];
  // urgency /35
  let urgency = 0;
  const dl = c.deadline ? daysBetween(today, c.deadline) : null;
  switch (c.signalType) {
    case 'Hiring enquiry staff':
      urgency = DUTY_URGENT.test(text) ? 35 : 28; why.push(urgency === 35 ? 'hiring role names enquiry/phone/WhatsApp/appointment duties' : 'generic admin/CS hire'); break;
    case 'New branch / expansion': {
      const age = c.signalDate ? daysBetween(c.signalDate, today) : null;
      urgency = age !== null && age <= SS.expansionWindowDays ? 30 : 20; why.push(urgency === 30 ? 'new location within 60 days' : 'expansion, date unconfirmed/older'); break; }
    case 'Customer-service bottleneck': urgency = 22; why.push('customer-service bottleneck evidence'); break;
    case 'Booking workflow signal': urgency = 15; why.push('booking channel only'); break;
    default:
      if (dl !== null && dl >= 0 && dl <= 30) { urgency = 32; why.push(`campaign deadline in ${dl}d`); }
      else { urgency = 26; why.push('active enrolment/trial/promo campaign'); }
  }
  const extra = Math.max(0, (c.signalCount || 1) - 1);
  if (extra) { urgency = Math.min(35, urgency + 3 * extra); why.push(`+${3 * extra} corroborating signals`); }
  const undated = !c.signalDate && !c.deadline && c.signalType !== 'Hiring enquiry staff';
  if (undated) { urgency = Math.min(urgency, 20); why.push('undated campaign: urgency capped at 20'); }
  parts.urgency = urgency;
  // workflow fit /25
  const cats = DUTY_CATS.filter((re) => re.test(text)).length;
  parts.fit = cats === 0 ? 8 : cats === 1 ? 14 : cats === 2 ? 19 : 25;
  why.push(`${cats} automatable-duty keyword groups`);
  // commercial /20
  const base = { Education: 18, Healthcare: 18, 'Beauty / Wellness': 16, 'Home Services': 16, 'Pet Services': 14, Other: 10 }[c.sector || 'Other'];
  let comm = base + (c.multiOutlet ? 2 : 0) - (LARGE_ENTERPRISE_RE.test(text) || c.largeEnterprise ? 10 : 0);
  parts.commercial = Math.max(0, Math.min(20, comm));
  // contactability /10
  parts.contact = (c.website ? 4 : 0) + (c.phone ? 3 : 0) + (c.email ? 2 : 0) + (c.whatsapp ? 1 : 0);
  // recency /10
  let rec;
  if (c.signalDate) { const age = daysBetween(c.signalDate, today); rec = age <= 7 ? 10 : age <= 14 ? 8 : age <= 21 ? 6 : age <= 45 ? 3 : 0; }
  else if (dl !== null && dl >= 0) rec = 8;
  else rec = 2;
  parts.recency = rec;
  const total = parts.urgency + parts.fit + parts.commercial + parts.contact + parts.recency;
  return { parts, total, undated, rationale: `Deterministic: urgency ${parts.urgency}/35 (${why.join('; ')}) + workflow ${parts.fit}/25 + commercial ${parts.commercial}/20 + contact ${parts.contact}/10 + recency ${parts.recency}/10 = ${total}. Evidence is observed; sales angle is a hypothesis.` };
}

/* ---------- identity merge + existing-record matching ---------- */
function keysOf(c) {
  const keys = [];
  if (c.domain) keys.push('d:' + c.domain);
  if (c.uen) keys.push('u:' + c.uen);
  const slug = nameSlug(c.business);
  if (slug) keys.push('n:' + slug);
  return keys;
}
function dedupeKeyFor(c) {
  return c.domain || (c.uen ? 'uen:' + c.uen.toLowerCase() : nameSlug(c.business));
}
function mergeCandidates(list) {
  const parent = list.map((_, i) => i);
  const find = (i) => (parent[i] === i ? i : (parent[i] = find(parent[i])));
  const seen = new Map();
  list.forEach((c, i) => keysOf(c).forEach((k) => {
    if (seen.has(k)) parent[find(i)] = find(seen.get(k)); else seen.set(k, i);
  }));
  const groups = new Map();
  list.forEach((c, i) => { const r = find(i); if (!groups.has(r)) groups.set(r, []); groups.get(r).push(c); });
  return Array.from(groups.values()).map((g) => {
    const rank = (c) => (c.source === 'mcf' ? 2 : 0) + (c.evidenceVerified ? 2 : 0) + (c.signalDate ? 1 : 0) + (c.deadline ? 1 : 0);
    g.sort((a, b) => rank(b) - rank(a));
    const best = Object.assign({}, g[0]);
    best.signals = g.map((x) => ({ signalType: x.signalType, url: x.evidenceUrl, role: x.role || null, date: x.signalDate || null, text: clip(x.evidenceText, 400) }));
    const distinct = unique(g.map((x) => (x.signalType === 'Hiring enquiry staff' ? 'hire:' + (x.role || x.evidenceUrl) : x.signalType + ':' + x.evidenceUrl)));
    best.signalCount = Math.max(1, distinct.length);
    for (const x of g.slice(1)) {
      ['website', 'domain', 'uen', 'phone', 'email', 'whatsapp', 'deadline', 'sector'].forEach((f) => { if (!best[f] && x[f]) best[f] = x[f]; });
      if (x.evidenceVerified && !best.evidenceVerified) best.evidenceVerified = true;
    }
    best.multiOutlet = g.some((x) => /(\d+ (outlets|branches|locations|centres|centers)|multiple (outlets|branches|locations)|our (outlets|branches|locations))/i.test(x.evidenceText || '')) || undefined;
    best.mergedCount = g.length;
    return best;
  });
}
function buildExistingIndex(prospects) {
  const idx = { keys: new Map(), domains: new Map(), names: new Map(), list: [] };
  for (const p of prospects || []) {
    const f = p.fields || p;
    const id = p.id || f.id || null;
    const rec = { id, business: f['Business'] || '', status: f['Status'] || null };
    idx.list.push(rec);
    const dk = String(f['Dedupe Key'] || '').trim().toLowerCase();
    if (dk) { idx.keys.set(dk, rec); if (dk.startsWith('uen:')) idx.keys.set(dk, rec); nameSlugVariants(dk).forEach((v) => idx.names.set(v, rec)); }
    const dom = canonicalDomain(f['Website']) || (dk.includes('.') ? dk : null);
    if (dom) idx.domains.set(dom, rec);
    nameSlugVariants(f['Business']).forEach((v) => idx.names.set(v, rec));
  }
  return idx;
}
function matchExisting(idx, c) {
  if (c.domain && idx.domains.has(c.domain)) return idx.domains.get(c.domain);
  if (c.domain && idx.keys.has(c.domain)) return idx.keys.get(c.domain);
  if (c.uen && idx.keys.has('uen:' + c.uen.toLowerCase())) return idx.keys.get('uen:' + c.uen.toLowerCase());
  for (const v of nameSlugVariants(c.business)) if (idx.names.has(v)) return idx.names.get(v);
  for (const rec of idx.list) if (rec.business && c.business && nameSubsetMatch(rec.business, c.business)) return rec;
  return null;
}

/* ---------- sales brief (deterministic template; LLM may replace, must pass validateBrief) ---------- */
const WHO_BY_SECTOR = {
  Education: 'Centre director / operations manager', Healthcare: 'Clinic manager or practice owner',
  'Beauty / Wellness': 'Owner or outlet/operations manager', 'Home Services': 'Owner or operations / service manager',
  'Pet Services': 'Owner or store manager', Other: 'Owner or operations lead',
};
function contactRoute(c) {
  if (c.email) return { channel: 'Business email', detail: c.email };
  if (c.website) return { channel: 'Website enquiry', detail: c.website };
  if (c.phone) return { channel: 'Business phone', detail: c.phone };
  if (c.whatsapp) return { channel: 'WhatsApp business', detail: c.whatsapp };
  return { channel: null, detail: null };
}
function templateBrief(c, today) {
  const biz = c.business;
  const role = (c.role || '').trim();
  const dl = c.deadline;
  let trigger, solution, solutionShort, process;
  switch (c.signalType) {
    case 'Hiring enquiry staff':
      trigger = `is recruiting for ${role || 'a customer-facing role'}`;
      solution = 'AI WhatsApp assistant that answers routine questions, collects customer requirements and booking preferences, and escalates to staff';
      solutionShort = 'handle routine WhatsApp questions and capture booking requests for your team'; process = 'booking and enquiry'; break;
    case '2027 enrolment campaign':
      trigger = 'is promoting 2027 enrolment';
      solution = 'AI enrolment assistant that answers programme, timing and fee questions, collects the child\'s level and trial preferences, and hands warm enquiries to staff';
      solutionShort = 'answer enrolment questions and capture trial preferences, handing warm enquiries to your team'; process = 'enrolment'; break;
    case 'Trial booking campaign':
      trigger = 'is offering trial classes';
      solution = 'AI trial-booking assistant that qualifies enquiries, proposes available slots and confirms requests for staff';
      solutionShort = 'qualify trial-class enquiries and capture preferred slots'; process = 'trial booking'; break;
    case 'Promotion deadline':
      trigger = dl ? `has a promotion running until ${dl}` : 'has an active promotion';
      solution = 'AI enquiry assistant that answers promotion questions and captures contact and preferred slots while the offer is live';
      solutionShort = 'answer promotion questions and capture bookings while the offer is live'; process = 'promotion enquiry'; break;
    case 'New branch / expansion':
      trigger = 'has opened a new location';
      solution = 'AI front-desk assistant covering enquiries and booking requests for the new location';
      solutionShort = 'cover enquiries and bookings for the new location'; process = 'front-desk'; break;
    default:
      trigger = 'publishes a booking/enquiry channel';
      solution = 'AI booking coordinator that handles routine enquiries and appointment requests';
      solutionShort = 'handle routine enquiries and appointment requests'; process = 'booking';
  }
  const date = c.signalDate ? `listing/page dated ${c.signalDate}` : (dl ? `offer ends ${dl}` : 'date unconfirmed');
  const route = contactRoute(c);
  return {
    who: WHO_BY_SECTOR[c.sector || 'Other'],
    whyNow: `Observed (${date}): ${biz} ${trigger}. Source: ${c.evidenceUrl}`,
    problem: 'Hypothesis (unconfirmed): routine enquiry and booking messages may be handled manually by a small team.',
    solution,
    value: 'Faster first response to routine enquiries and less repetitive messaging for staff. Impact to be measured in a pilot; no savings or revenue claimed.',
    hook: `Hi, I'm Rain from Second Shift. I noticed ${biz} ${trigger}. We build AI assistants that ${solutionShort}. Would a short demo tailored to your current ${process} process be useful?`,
    nextAction: `Review the evidence at ${c.evidenceUrl}; contact the ${WHO_BY_SECTOR[c.sector || 'Other'].toLowerCase()} via ${route.channel ? route.channel.toLowerCase() + ' (' + route.detail + ')' : 'a public business channel (to be located)'}; offer a short tailored demo. Human sends - nothing is automated.`,
    channel: route.channel,
  };
}
const FORBIDDEN_CLAIM_RE = /(\b(missed|missing|losing|lose|lost) (out on )?(leads?|customers?|sales|revenue|enquiries)|sav(e|es|ing|ings) (you )?(\$|s\$|money|time)|increase (your )?(revenue|sales|conversion)|guarantee|roi\b|%|\$\s?\d|s\$\s?\d)/i;
function numbersIn(s) { return (String(s || '').match(/\d[\d,.]*/g) || []).map((n) => n.replace(/[,.]+$/, '')); }
/** LLM brief is accepted only if it adds no unsupported figures/claims. */
function validateBrief(brief, c) {
  const need = ['who', 'whyNow', 'problem', 'solution', 'value', 'hook', 'nextAction'];
  const errs = [];
  if (!brief || typeof brief !== 'object') return { ok: false, errors: ['not_object'] };
  for (const k of need) if (typeof brief[k] !== 'string' || !brief[k].trim()) errs.push('missing_' + k);
  if (errs.length) return { ok: false, errors: errs };
  const evidence = [c.evidenceText, c.pageText, c.business, c.role, c.signalDate, c.deadline, c.evidenceUrl, c.phone, c.email, c.website].join(' ');
  const allowed = new Set(numbersIn(evidence).concat(['2026', '2027']));
  const all = need.map((k) => brief[k]).join(' ');
  for (const n of numbersIn(all)) if (!allowed.has(n)) { errs.push('unsupported_number:' + n); break; }
  if (FORBIDDEN_CLAIM_RE.test(all)) errs.push('forbidden_claim');
  if (!/^hypothesis/i.test(brief.problem.trim()) && !/(evidence|advert|listing|page)/i.test(brief.problem)) errs.push('problem_not_labelled_hypothesis');
  if (!/second shift/i.test(brief.hook)) errs.push('hook_missing_sender');
  if (brief.hook.length > 700) errs.push('hook_too_long');
  return { ok: errs.length === 0, errors: errs };
}
function resolveBrief(c, today, llmBrief) {
  const tpl = templateBrief(c, today);
  if (llmBrief) {
    const v = validateBrief(llmBrief, c);
    if (v.ok) return { brief: Object.assign({}, tpl, llmBrief, { channel: tpl.channel }), source: 'llm', errors: [] };
    return { brief: tpl, source: 'template', errors: v.errors };
  }
  return { brief: tpl, source: 'template', errors: [] };
}
function briefText(b) {
  return `WHO: ${b.who}\nWHY NOW: ${b.whyNow}\nPROBLEM: ${b.problem}\nAI SOLUTION: ${b.solution}\nVALUE: ${b.value}\nHOOK: ${b.hook}\nNEXT ACTION: ${b.nextAction}`;
}

/* ---------- airtable record shapes ---------- */
function nextWorkday(today) { let d = addDays(today, 1); if (dowOf(d) === 0) d = addDays(d, 1); return d; }
function confidenceOf(c) {
  if (!c.evidenceVerified) return 'Low - unconfirmed';
  return c.source === 'mcf' || c.sourceType === 'Job listing' ? 'Medium - third party' : 'High - first party';
}
function prospectFields(c, scored, brief, ctx) {
  const f = {
    'Business': c.business, 'Sector': c.sector || 'Other', 'Website': c.website || undefined,
    'Public Business Phone': c.phone || undefined, 'Public Business Email': c.email || undefined,
    'Signal': c.signalType, 'Signal Evidence': clip(c.evidenceText, 900), 'Evidence URL': c.evidenceUrl,
    'Signal Date': c.signalDate || undefined, 'Signal Deadline': c.deadline || undefined, 'Last Verified': ctx.today,
    'Source Type': c.sourceType || 'Other', 'Confidence': confidenceOf(c),
    'Urgency /35': scored.parts.urgency, 'Workflow Fit /25': scored.parts.fit, 'Commercial Fit /20': scored.parts.commercial,
    'Contactability /10': scored.parts.contact, 'Recency /10': scored.parts.recency, 'Priority /100': scored.total,
    'Score Rationale': scored.rationale, 'Offer Angle': brief.solution, 'Buyer Role': brief.who,
    'Suggested Channel': brief.channel || undefined, 'Outreach Draft': brief.hook, 'AI Brief': briefText(brief),
    'Status': 'Ready for review', 'Next Action': brief.nextAction, 'Next Action Date': nextWorkday(ctx.today),
    'Dedupe Key': dedupeKeyFor(c), 'Research Batch': ctx.batch, 'Entity ID': c.uen || undefined,
    'Discovery Pipeline': c.pipeline, 'Signal Count': c.signalCount || 1,
    'Notes': `Auto-discovered ${ctx.today} (${ctx.batch}). Public B2B research only; no outreach sent. No claim of missed leads, AI budget or buyer intent. Second Shift data only.`,
  };
  Object.keys(f).forEach((k) => f[k] === undefined && delete f[k]);
  return f;
}
function normUrl(u) {
  const str = String(u || '').trim();
  const m = str.match(/^(?:[a-z][a-z0-9+.-]*:\/\/)?(?:[^\/?#@\s]*@)?([^\/?#:\s]+)(?::\d+)?([^?#]*)(\?[^#]*)?/i);
  if (!m) return str;
  const host = m[1].toLowerCase().replace(/^www\./, '');
  const path = (m[2] || '').replace(/\/+$/, '').toLowerCase();
  const q = (m[3] || '').slice(1).split('&').filter((x) => x && !/^(utm_|fbclid|gclid)/i.test(x)).join('&');
  return host + path + (q ? '?' + q : '');
}
function rawSignalKey(c) { return 'sig:' + hash(c.evidenceUrl ? normUrl(c.evidenceUrl) : (c.business + c.evidenceText)); }
function rawFields(c, status, ctx, extra) {
  const f = {
    'Signal Key': rawSignalKey(c), 'Result Title': clip(c.title || c.role || c.business || '', 200), 'Source URL': c.evidenceUrl || undefined,
    'Search Query': c.query || undefined, 'Result Snippet': clip(c.evidenceText, 900), 'Candidate Business': c.business || undefined,
    'Signal Type': SIGNAL_TO_RAWTYPE[c.signalType] || 'Unknown', 'Review Status': status, 'Auto Score': extra && extra.score != null ? extra.score : undefined,
    'First Seen': ctx.today, 'Last Seen': ctx.today, 'Research Batch': ctx.batch, 'Pipeline': c.pipeline,
    'Reject Reason': extra && extra.reason ? extra.reason : undefined, 'Domain': c.domain || undefined, 'Entity ID': c.uen || undefined,
    'Signal Date': c.signalDate || undefined, 'Deadline': c.deadline || undefined,
  };
  Object.keys(f).forEach((k) => f[k] === undefined && delete f[k]);
  return f;
}

/* ---------- the main decision function ---------- */
function processCandidates(raw, existing, existingRawKeys, opts) {
  const o = Object.assign({}, SS, opts);
  const today = o.today;
  const batch = o.batch || `${today}-auto`;
  const metrics = { candidates: raw.length, accepted: 0, secondary: 0, research: 0, rejected: 0, duplicates: 0, rejectReasons: {}, capped: 0 };
  const reject = (c, reasons) => { metrics.rejected++; reasons.forEach((r) => { metrics.rejectReasons[r] = (metrics.rejectReasons[r] || 0) + 1; }); return { c, reasons }; };
  const rejected = [];
  const survivors = [];
  for (const c0 of raw) {
    const c = Object.assign({}, c0);
    if (!c.sector) c.sector = inferSector([c.industryHint, c.business, c.domain, c.title, c.evidenceText].join(' '));
    if (!c.signalType) {
      c.signalType = (c.pipeline === 'A' ? classifyHiring(c.evidenceText) : null) || c.pageSignal || classifyText(c.evidenceText, !!c.deadline) || null;
      if (!c.signalType) { rejected.push(reject(c, ['no_relevant_signal'])); continue; }
      c.pipeline = SIGNAL_TO_PIPELINE[c.signalType] || c.pipeline;
    }
    if (c.signalType === 'Hiring enquiry staff' && c.source !== 'mcf' && !c.evidenceVerified) c.sourceType = 'Job listing';
    if (!c.deadline) { const d = extractDeadline(c.evidenceText, today); if (d) c.deadline = d; }
    const reasons = verifyCandidate(c, today, o);
    if (reasons.length) { rejected.push(reject(c, reasons)); continue; }
    survivors.push(c);
  }
  const merged = mergeCandidates(survivors);
  const idx = buildExistingIndex(existing);
  const rawSeen = new Set(existingRawKeys || []);
  for (const p of existing || []) { const u = (p.fields || p)['Evidence URL']; if (u) rawSeen.add(rawSignalKey({ evidenceUrl: u })); }
  const rawRows = [];
  const promotedRows = [];
  const duplicates = [];
  const scoredList = [];
  for (const c of merged) {
    const hit = matchExisting(idx, c);
    if (hit) {
      metrics.duplicates++;
      duplicates.push({ business: c.business, matchedId: hit.id, matchedBusiness: hit.business });
      // new evidence on an existing prospect is logged as a raw signal; the prospect row is never edited
      for (const s of c.signals || []) {
        const sc = Object.assign({}, c, { evidenceUrl: s.url || c.evidenceUrl, signalType: s.signalType || c.signalType, evidenceText: s.text || c.evidenceText, role: s.role || c.role });
        const key = rawSignalKey(sc);
        if (!rawSeen.has(key) && s.url) { rawSeen.add(key); rawRows.push({ fields: Object.assign(rawFields(sc, 'Needs validation', { today, batch }, { reason: 'existing_prospect_new_signal', score: null }), { 'Matched Prospect': hit.business }), prospectId: hit.id }); }
      }
      continue;
    }
    const scored = scoreCandidate(c, today);
    scoredList.push({ c, scored });
  }
  scoredList.sort((a, b) => b.scored.total - a.scored.total);
  const accepted = [];
  for (const { c, scored } of scoredList) {
    const total = scored.total;
    const unverified = !c.evidenceVerified;
    let outcome;
    if (unverified || scored.undated) outcome = total >= o.researchMin ? 'research' : 'reject';
    else if (total >= o.priorityMin) outcome = 'priority';
    else if (total >= o.secondaryMin) outcome = 'secondary';
    else if (total >= o.researchMin) outcome = 'research';
    else outcome = 'reject';
    const why = unverified ? 'source_page_not_verified' : scored.undated ? 'undated_campaign' : null;
    if ((outcome === 'priority' || outcome === 'secondary') && accepted.length >= o.maxNewProspects) { outcome = 'research'; metrics.capped++; }
    if (outcome === 'priority' || outcome === 'secondary') {
      accepted.push({ c, scored, tier: outcome });
      metrics[outcome === 'priority' ? 'accepted' : 'secondary']++;
      // audit trail: every signal behind a promoted prospect is kept in Raw Signals (never overwritten)
      for (const sg of (c.signals && c.signals.length ? c.signals : [{ url: c.evidenceUrl, signalType: c.signalType, text: c.evidenceText, role: c.role }])) {
        const sc = Object.assign({}, c, { evidenceUrl: sg.url || c.evidenceUrl, signalType: sg.signalType || c.signalType, evidenceText: sg.text || c.evidenceText, role: sg.role || c.role, signalDate: sg.date || c.signalDate });
        const key = rawSignalKey(sc);
        if (rawSeen.has(key)) continue;
        rawSeen.add(key);
        promotedRows.push({ fields: Object.assign(rawFields(sc, 'Promoted', { today, batch }, { score: total, reason: sg.url === c.evidenceUrl ? 'promoted_primary_signal' : 'corroborating_signal' }), { 'Matched Prospect': c.business }), linkKey: dedupeKeyFor(c) });
      }
    } else if (outcome === 'research') {
      metrics.research++;
      const key = rawSignalKey(c);
      if (!rawSeen.has(key)) { rawSeen.add(key); rawRows.push({ fields: rawFields(c, 'Needs validation', { today, batch }, { score: total, reason: why || (metrics.capped && accepted.length >= o.maxNewProspects ? 'daily_cap_reached' : 'score_50_69_research_required') }) }); }
    } else {
      rejected.push(reject(c, ['score_below_50']));
      const key = rawSignalKey(c);
      if (!rawSeen.has(key)) { rawSeen.add(key); rawRows.push({ fields: rawFields(c, 'Rejected', { today, batch }, { score: total, reason: 'score_below_50' }) }); }
    }
  }
  // log identifiable, verified-rejected candidates (not agency/non-SG) for audit, capped
  for (const r of rejected) {
    if (rawRows.length >= o.maxRawWrites) break;
    const c = r.c;
    if (!c.business || !isHttps(c.evidenceUrl)) continue;
    if (r.reasons.some((x) => ['recruitment_agency', 'not_singapore', 'excluded_sector', 'aggregator_or_social_source'].includes(x))) continue;
    const key = rawSignalKey(c);
    if (rawSeen.has(key)) continue;
    rawSeen.add(key);
    rawRows.push({ fields: rawFields(c, 'Rejected', { today, batch }, { reason: r.reasons.join(',') }) });
  }
  return { accepted, rawRows: promotedRows.concat(rawRows).slice(0, o.maxRawWrites + promotedRows.length), rejected, duplicates, metrics, batch };
}

/* ---------- existing-prospect follow-ups + stale detection (read-only) ---------- */
const ACTIVE_STATUSES = ['Approved to contact', 'Contacted', 'Interested', 'Meeting booked', 'Proposal sent'];
function followUps(prospects, today) {
  const due = [], stale = [];
  for (const p of prospects || []) {
    const f = p.fields || p;
    const status = f['Status'];
    const nad = f['Next Action Date'];
    if (nad && nad <= today && ACTIVE_STATUSES.includes(status)) due.push({ business: f['Business'], status, nextActionDate: nad, nextAction: clip(f['Next Action'], 160) });
    if (status === 'Ready for review') {
      const sd = f['Signal Date']; const dl = f['Signal Deadline'];
      if (dl && dl < today) stale.push({ business: f['Business'], reason: `deadline passed ${dl}` });
      else if (sd && daysBetween(sd, today) > SS.staleSignalDays) stale.push({ business: f['Business'], reason: `signal ${daysBetween(sd, today)}d old` });
    }
  }
  return { due, stale };
}

/* ---------- daily report ---------- */
function renderReport(r) {
  const { today, batch, trigger, providers, metrics, accepted, briefs, followUps: fu, notes, dryRun } = r;
  const L = [];
  L.push(`# Second Shift — daily prospecting report ${today}${dryRun ? ' (DRY RUN — nothing written)' : ''}`);
  L.push(`Run: ${batch} · trigger: ${trigger}`);
  L.push('');
  L.push('## Run metrics');
  L.push(`- Sources checked: ${providers.map((p) => `${p.name} (${p.calls} calls${p.error ? ', ERROR: ' + p.error : ''})`).join('; ') || 'none'}`);
  L.push(`- Candidates discovered: ${metrics.candidates}`);
  L.push(`- New prospects written: ${metrics.accepted + metrics.secondary} (priority ${metrics.accepted}, secondary ${metrics.secondary}); research-required: ${metrics.research}`);
  L.push(`- Rejected: ${metrics.rejected}${Object.keys(metrics.rejectReasons).length ? ' — ' + Object.entries(metrics.rejectReasons).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ×${v}`).join(', ') : ''}`);
  L.push(`- Duplicates avoided (already in Prospects): ${metrics.duplicates}`);
  L.push('');
  L.push('## Five best new prospects');
  if (!accepted.length) L.push('_No new prospect met the evidence + score bar today. Nothing was manufactured to hit volume._');
  accepted.slice(0, 5).forEach((a, i) => {
    const c = a.c; const b = briefs[i] || a.brief || {};
    L.push(`### ${i + 1}. ${c.business} — ${a.scored.total}/100 (${a.tier})`);
    L.push(`- Signal: ${c.signalType}${c.signalDate ? ' · dated ' + c.signalDate : ''}${c.deadline ? ' · deadline ' + c.deadline : ''}`);
    L.push(`- Evidence: "${clip(c.evidenceText, 260)}" — ${c.evidenceUrl}`);
    L.push(`- Public contact route: ${(contactRoute(c).channel ? contactRoute(c).channel + ' — ' + contactRoute(c).detail : 'none found yet')}`);
    L.push(`- Offer: ${b.solution || ''}`);
    L.push(`- Message: ${b.hook || ''}`);
    L.push(`- Next action: ${b.nextAction || ''}`);
  });
  L.push('');
  L.push('## Existing prospects needing action');
  L.push(fu.due.length ? fu.due.map((d) => `- ${d.business} [${d.status}] due ${d.nextActionDate}: ${d.nextAction}`).join('\n') : '_None due._');
  if (fu.stale.length) { L.push(''); L.push('## Stale signals still "Ready for review"'); L.push(fu.stale.slice(0, 15).map((s) => `- ${s.business}: ${s.reason}`).join('\n')); }
  L.push('');
  L.push('## Unavailable / unverified');
  L.push((notes && notes.length ? notes : ['None recorded.']).map((n) => `- ${n}`).join('\n'));
  return L.join('\n');
}

export {
  SS,
  SIGNAL_TYPES,
  SIGNAL_TO_PIPELINE,
  SIGNAL_TO_RAWTYPE,
  BLOCKED_DOMAINS,
  pad2,
  isoOf,
  daysBetween,
  addDays,
  dowOf,
  todaySG,
  clip,
  hash,
  stripHtml,
  hostOf,
  isBlockedDomain,
  canonicalDomain,
  isHttps,
  nameTokens,
  nameSlug,
  nameSlugVariants,
  domainMatchesName,
  nameSubsetMatch,
  guessBusinessName,
  findDates,
  extractDeadline,
  extractContacts,
  classifyText,
  classifyHiring,
  applyIdentity,
  inferSector,
  isAgency,
  isSingapore,
  normaliseMCF,
  normaliseSearchResult,
  enrichFromPage,
  verifyCandidate,
  scoreCandidate,
  keysOf,
  dedupeKeyFor,
  mergeCandidates,
  buildExistingIndex,
  matchExisting,
  contactRoute,
  templateBrief,
  validateBrief,
  resolveBrief,
  briefText,
  prospectFields,
  rawFields,
  rawSignalKey,
  normUrl,
  processCandidates,
  followUps,
  renderReport,
  confidenceOf,
  nextWorkday,
};
