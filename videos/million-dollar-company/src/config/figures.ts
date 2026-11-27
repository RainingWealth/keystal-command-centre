// Single source of truth for every financial figure used in the video.
export const FIG = {
  revenue: 1_200_000,
  profit: 180_000,
  cash: 14_000,
  payroll: 36_000,
  termDays: 90,
} as const;

export const DERIVED = {
  marginPct: (FIG.profit / FIG.revenue) * 100,
  shortfall: FIG.payroll - FIG.cash,
} as const;

// Integrity checks: the build fails loudly if the numbers ever drift apart.
if (Math.round(DERIVED.marginPct) !== 15) throw new Error(`Profit margin must be 15%, got ${DERIVED.marginPct}`);
if (DERIVED.shortfall !== 22_000) throw new Error(`Payroll shortfall must be 22,000, got ${DERIVED.shortfall}`);
if (FIG.termDays !== 90) throw new Error('Customer payment term must be 90 days');

export const sgd = (n: number) => `S$${Math.round(n).toLocaleString('en-US')}`;
export const sgdShort = (n: number) => (n >= 1_000_000 ? `S$${(n / 1_000_000).toFixed(1)}M` : `S$${Math.round(n / 1000)}K`);
export const MARGIN = Math.round(DERIVED.marginPct);
export const SHORTFALL = DERIVED.shortfall;
