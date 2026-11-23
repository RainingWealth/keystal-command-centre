import { SEARCH_CONFIG } from '../../src/config.js';
import { todaySG } from '../../src/engine.js';
export function main() {
  const inp = ($input.first() && $input.first().json) || {};
  const now = new Date();
  const today = todaySG(now);
  const hhmm = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Singapore', hour: '2-digit', minute: '2-digit', hour12: false }).format(now).replace(':', '');
  const trigger = inp.trigger || 'manual';
  return [{ json: Object.assign({ runId: `${today}-${trigger}-${hhmm}`, batch: `${today}-auto-${hhmm}`, today, trigger, dryRun: !!inp.dryRun }, SEARCH_CONFIG) }];
}
