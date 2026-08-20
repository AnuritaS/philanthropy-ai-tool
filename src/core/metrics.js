/**
 * Descriptive portfolio metrics.
 *
 * Everything here is DESCRIPTIVE. Nothing in this file produces a score, a
 * grade, or a judgment. Concentration, flexibility and duration are strategy
 * choices, not quality measures: a community foundation is supposed to be
 * geographically concentrated, and a disease-specific funder is supposed to be
 * subject-concentrated. These figures acquire meaning only when placed against
 * a peer distribution (see benchmarking) or a foundation's own stated strategy
 * (see alignment.js).
 */

import { gated } from './validation.js';

/**
 * Fractional dollar attribution across multi-valued PCS fields.
 *
 * A grant coded to three subjects contributes one third of its dollars to each.
 * This keeps shares summing to 1, which is required for HHI to mean anything.
 * The alternative — counting the full amount against every code — inflates
 * totals above 100% and makes concentration incomparable across portfolios.
 */
export function dollarDistribution(grants, field) {
  const dist = new Map();
  let attributed = 0;

  for (const g of grants) {
    const codes = g[field];
    if (!Array.isArray(codes) || codes.length === 0) continue;
    const amount = g.amount ?? 0;
    if (amount <= 0) continue;
    const share = amount / codes.length;
    for (const code of codes) {
      dist.set(code, (dist.get(code) ?? 0) + share);
    }
    attributed += amount;
  }

  const shares = new Map();
  for (const [code, dollars] of dist) {
    shares.set(code, attributed === 0 ? 0 : dollars / attributed);
  }

  return { dollars: dist, shares, attributed };
}

/** Dollar distribution across a single-valued field (recipient, state, country). */
export function dollarDistributionByKey(grants, keyFn) {
  const dist = new Map();
  let attributed = 0;

  for (const g of grants) {
    const key = keyFn(g);
    if (key === null || key === undefined || key === '') continue;
    const amount = g.amount ?? 0;
    if (amount <= 0) continue;
    dist.set(key, (dist.get(key) ?? 0) + amount);
    attributed += amount;
  }

  const shares = new Map();
  for (const [key, dollars] of dist) {
    shares.set(key, attributed === 0 ? 0 : dollars / attributed);
  }

  return { dollars: dist, shares, attributed };
}

/** Herfindahl-Hirschman Index: sum of squared shares. Range (0, 1]. */
export function hhi(shares) {
  let total = 0;
  for (const share of shares) total += share * share;
  return total;
}

/**
 * HHI normalized for the number of categories present.
 *
 * Raw HHI is bounded below by 1/N, so a portfolio spread perfectly evenly
 * across 4 categories scores 0.25 while one spread evenly across 40 scores
 * 0.025 — even though both are maximally diversified given their opportunity
 * set. Normalizing to (HHI - 1/N) / (1 - 1/N) puts both at 0.
 *
 * Report both: raw HHI is comparable to published philanthropy research,
 * normalized HHI is the fairer within-portfolio measure.
 */
export function normalizedHHI(shares) {
  const values = [...shares];
  const n = values.length;
  if (n <= 1) return n === 1 ? 1 : 0;
  const raw = hhi(values);
  return (raw - 1 / n) / (1 - 1 / n);
}

/** Inverse Simpson index: the "effective number" of categories funded. */
export function effectiveCategories(shares) {
  const raw = hhi(shares);
  return raw === 0 ? 0 : 1 / raw;
}

export function concentration(grants, field, { byKey = null } = {}) {
  const dist = byKey ? dollarDistributionByKey(grants, byKey) : dollarDistribution(grants, field);
  const shares = [...dist.shares.values()];
  return {
    hhi: hhi(shares),
    normalizedHHI: normalizedHHI(shares),
    effectiveCategories: effectiveCategories(shares),
    categoryCount: shares.length,
    attributedDollars: dist.attributed,
    shares: dist.shares,
  };
}

/** Share of dollars going to the top N recipients. */
export function topRecipientShare(grants, n = 10) {
  const dist = dollarDistributionByKey(grants, (g) => g.recipient_id ?? g.recipient_name);
  const sorted = [...dist.shares.values()].sort((a, b) => b - a);
  return sorted.slice(0, n).reduce((sum, s) => sum + s, 0);
}

/**
 * Share of dollars provided as general operating support.
 *
 * Codes are configurable because a foundation's transaction-type vocabulary may
 * be mapped rather than native PCS.
 */
export function flexibilityRate(grants, { generalOperatingCodes = ['GENERAL SUPPORT', 'TT010000'] } = {}) {
  const wanted = new Set(generalOperatingCodes.map((c) => c.toUpperCase()));
  return gated(grants, ['pcs_transaction_type'], () => {
    let flexible = 0;
    let total = 0;
    for (const g of grants) {
      const codes = g.pcs_transaction_type;
      if (!Array.isArray(codes) || codes.length === 0) continue;
      const amount = g.amount ?? 0;
      total += amount;
      if (codes.some((c) => wanted.has(c))) flexible += amount;
    }
    return total === 0 ? 0 : flexible / total;
  });
}

/** Share of dollars committed for 24 months or longer. */
export function multiYearShare(grants, { minMonths = 24 } = {}) {
  return gated(grants, ['duration_months'], () => {
    let multi = 0;
    let total = 0;
    for (const g of grants) {
      if (g.duration_months === null || g.duration_months === undefined) continue;
      const amount = g.amount ?? 0;
      total += amount;
      if (g.duration_months >= minMonths) multi += amount;
    }
    return total === 0 ? 0 : multi / total;
  });
}

function quantile(sorted, q) {
  if (sorted.length === 0) return null;
  const pos = (sorted.length - 1) * q;
  const lower = Math.floor(pos);
  const upper = Math.ceil(pos);
  if (lower === upper) return sorted[lower];
  return sorted[lower] + (sorted[upper] - sorted[lower]) * (pos - lower);
}

/**
 * Grant size distribution. Median and IQR rather than mean, because grant
 * portfolios are heavily right-skewed and the mean is usually one large grant.
 */
export function grantSizeDistribution(grants) {
  const amounts = grants.map((g) => g.amount).filter((a) => typeof a === 'number' && a > 0).sort((a, b) => a - b);
  return {
    n: amounts.length,
    min: amounts[0] ?? null,
    p25: quantile(amounts, 0.25),
    median: quantile(amounts, 0.5),
    p75: quantile(amounts, 0.75),
    max: amounts[amounts.length - 1] ?? null,
    mean: amounts.length === 0 ? null : amounts.reduce((a, b) => a + b, 0) / amounts.length,
  };
}

/** Headline portfolio totals. */
export function portfolioTotals(grants) {
  const recipients = new Set();
  let dollars = 0;
  let earliest = null;
  let latest = null;

  for (const g of grants) {
    dollars += g.amount ?? 0;
    const r = g.recipient_id ?? g.recipient_name;
    if (r) recipients.add(r);
    if (g.award_date) {
      if (!earliest || g.award_date < earliest) earliest = g.award_date;
      if (!latest || g.award_date > latest) latest = g.award_date;
    }
  }

  return {
    grantCount: grants.length,
    totalDollars: dollars,
    recipientCount: recipients.size,
    firstAward: earliest,
    lastAward: latest,
  };
}
