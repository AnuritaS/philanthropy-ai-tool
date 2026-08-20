/**
 * Adapters: canonical grants -> the shapes the portfolio charts consume.
 *
 * BUILD_SPEC Phase 2 step 2. The charts are worth keeping; V0's data layer is
 * not. Everything here is a regrouping of core records — no measure is invented,
 * and any figure that carries a methodological claim (HHI, flexibility,
 * multi-year, grant size) comes from src/core, dollar-weighted and gated, not
 * from these helpers.
 */

import { labelFor } from '../../taxonomy/index.js';

/** Recharts reads "." in a dataKey as a path separator, so series get a synthetic key. */
export const funderKey = (i) => `f${i}`;

/** Categorical ramp chosen for legibility on the white card, in daylight tokens. */
export const SERIES = [
  '#1D9E75', // teal
  '#185FA5', // blue
  '#EF9F27', // amber
  '#7A4FBF', // violet
  '#C2557A', // rose
  '#3B6D11', // green
  '#5DCAA5', // soft teal
  '#0C447C', // deep blue
];

const UNSPECIFIED = 'Unspecified';

/** First PCS code resolved to a human label; the code itself if unmapped. */
function primaryLabel(facet, codes) {
  if (!Array.isArray(codes) || codes.length === 0) return null;
  return labelFor(facet, codes[0]);
}

/**
 * Flatten a canonical grant into the flat record the charts group over.
 * Fields with no counterpart in the schema (an impact score, urban/rural,
 * BIPOC leadership) are simply absent — the panels that used them in V0 have
 * been replaced rather than fed invented data.
 */
export function toChartRecords(grants) {
  return grants.map((g, i) => ({
    id: g.grant_id ?? i,
    funder: g.funder_name ?? UNSPECIFIED,
    recipient: g.recipient_name ?? UNSPECIFIED,
    year: g.award_date ? g.award_date.getUTCFullYear() : null,
    amount: g.amount ?? 0,
    sector: primaryLabel('subjects', g.pcs_subject),
    population: primaryLabel('populations', g.pcs_population),
    region: g.geo_state,
    locality: g.geo_locality,
    grantType: primaryLabel('support-strategy', g.pcs_support_strategy),
    transaction: primaryLabel('transaction-type', g.pcs_transaction_type),
    durationMonths: g.duration_months,
    multiYear: g.duration_months === null || g.duration_months === undefined ? null : g.duration_months >= 24,
  }));
}

/** Funders discovered from the data, ordered by dollars, with stable colours. */
export function deriveFunders(records) {
  const totals = new Map();
  const firstSeen = new Map();
  records.forEach((r, i) => {
    totals.set(r.funder, (totals.get(r.funder) ?? 0) + r.amount);
    if (!firstSeen.has(r.funder)) firstSeen.set(r.funder, i);
  });
  return [...totals.entries()]
    .sort((a, b) => b[1] - a[1] || firstSeen.get(a[0]) - firstSeen.get(b[0]))
    .map(([name, dollars], i) => ({ key: funderKey(i), name, dollars, color: SERIES[i % SERIES.length] }));
}

const labelOf = (v) => (v === null || v === undefined || v === '' ? UNSPECIFIED : String(v));

/**
 * Group by a categorical field, split by funder.
 * Rows carry both a count and a dollar total; charts plot dollars, because a
 * count treats a $5k grant and a $5M grant as the same event.
 */
export function breakdownBy(records, funders, field, { sortBy = 'amount', limit = null } = {}) {
  const rows = new Map();
  for (const r of records) {
    const label = labelOf(r[field]);
    if (!rows.has(label)) {
      rows.set(label, { label, count: 0, amount: 0, ...Object.fromEntries(funders.map((f) => [f.key, 0])) });
    }
    const row = rows.get(label);
    row.count += 1;
    row.amount += r.amount;
    const f = funders.find((x) => x.name === r.funder);
    if (f) row[f.key] += r.amount;
  }
  const out = [...rows.values()].sort((a, b) => (sortBy === 'count' ? b.count - a.count : b.amount - a.amount));
  return limit ? out.slice(0, limit) : out;
}

/** Pie slices for one categorical field, by dollars. */
export function sliceBy(records, field, limit = 8) {
  const totals = new Map();
  for (const r of records) {
    const label = labelOf(r[field]);
    totals.set(label, (totals.get(label) ?? 0) + r.amount);
  }
  const sorted = [...totals.entries()].map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);
  if (sorted.length <= limit) return sorted;
  const head = sorted.slice(0, limit - 1);
  const tail = sorted.slice(limit - 1).reduce((s, x) => s + x.value, 0);
  return [...head, { name: `Other (${sorted.length - limit + 1})`, value: tail }];
}

/** Disbursement by year, one series per funder. */
export function yearSeries(records, funders) {
  const rows = new Map();
  for (const r of records) {
    if (r.year === null) continue;
    if (!rows.has(r.year)) {
      const base = { year: r.year, total: 0 };
      funders.forEach((f) => { base[f.key] = 0; });
      rows.set(r.year, base);
    }
    const row = rows.get(r.year);
    row.total += r.amount;
    const f = funders.find((x) => x.name === r.funder);
    if (f) row[f.key] += r.amount;
  }
  return [...rows.values()].sort((a, b) => a.year - b.year);
}

export function yearExtent(records) {
  const years = records.map((r) => r.year).filter((y) => y !== null);
  return years.length ? { min: Math.min(...years), max: Math.max(...years) } : null;
}

export const SIZE_BUCKETS = [
  { label: '<$50K', min: 0, max: 50000 },
  { label: '$50–150K', min: 50000, max: 150000 },
  { label: '$150–500K', min: 150000, max: 500000 },
  { label: '$500K–1M', min: 500000, max: 1000000 },
  { label: '>$1M', min: 1000000, max: Infinity },
];

/** Grant-count distribution across size bands, split by funder. */
export function sizeSeries(records, funders, buckets = SIZE_BUCKETS) {
  return buckets.map((b) => {
    const row = { label: b.label, count: 0, amount: 0 };
    funders.forEach((f) => { row[f.key] = 0; });
    for (const r of records) {
      if (r.amount < b.min || r.amount >= b.max) continue;
      row.count += 1;
      row.amount += r.amount;
      const f = funders.find((x) => x.name === r.funder);
      if (f) row[f.key] += 1;
    }
    return row;
  });
}

/* ── formatting ── */

export const fmtUSD = (v) => {
  if (!Number.isFinite(v)) return '—';
  if (v >= 1e9) return `$${(v / 1e9).toFixed(1)}B`;
  if (v >= 1e6) return `$${(v / 1e6).toFixed(1)}M`;
  if (v >= 1e3) return `$${Math.round(v / 1e3)}K`;
  return `$${Math.round(v)}`;
};
export const fmtM = (v) => `$${((v ?? 0) / 1e6).toFixed(2)}M`;
export const pct = (v, digits = 0) => `${((v ?? 0) * 100).toFixed(digits)}%`;
