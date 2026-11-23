// Editable search criteria, quotas and targets. Rebuild after changing (npm run build) or edit the "Config" node in n8n.
// NO secrets belong here: credentials live only in n8n.
export const SEARCH_CONFIG = {
  openaiModel: 'gpt-5-mini',
  baseId: 'appJsyvz3FLUU7NlY',
  tables: { prospects: 'tblXm6RxFaBxBdOJQ', raw: 'tblboeDcAdOUEvIqQ', runs: 'tblH8gnqao9nOsMjL' },
  providers: { mcf: true, perplexity: true },
  quotas: { mcfPageSize: 100, maxSearches: 15, maxFetch: 25, maxNew: 20, hiringWindowDays: 21 },
  // Pipeline A — hiring intelligence (MyCareersFuture public job-search API; no key)
  mcfQueries: ['receptionist', 'customer service', 'appointment coordinator', 'whatsapp', 'trial booking', 'administrative assistant', 'enrolment coordinator', 'front desk executive'],
  // Pipelines B/C — campaign + operational signals (Perplexity search, country=SG, last month)
  webQueries: [
    { pipeline: 'B', q: '2027 enrolment now open tuition enrichment centre Singapore' },
    { pipeline: 'B', q: '2027 early bird registration promotion Singapore learning centre' },
    { pipeline: 'B', q: 'free trial class book now Singapore tuition enrichment' },
    { pipeline: 'B', q: 'Singapore clinic free consultation promotion book appointment' },
    { pipeline: 'B', q: 'Singapore early bird promotion ends December 2026 book appointment' },
    { pipeline: 'B', q: 'new outlet now open Singapore grand opening November 2026' },
    { pipeline: 'B', q: 'new branch opening Singapore salon clinic tuition centre 2026' },
    { pipeline: 'B', q: 'year-end promotion Singapore aircon servicing book appointment' },
    { pipeline: 'C', q: 'book appointment via WhatsApp Singapore service centre' },
    { pipeline: 'C', q: 'Singapore aircon servicing book online WhatsApp enquiry' },
    { pipeline: 'C', q: 'multiple outlets book appointment online Singapore clinic' },
    { pipeline: 'C', q: 'Singapore pet grooming book appointment WhatsApp' },
    { pipeline: 'C', q: 'Singapore home cleaning service booking WhatsApp enquiry' },
  ],
};
