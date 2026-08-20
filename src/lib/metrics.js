/* ─── Reusable metric functions ──────────────────────────────────────────
   Every number the dashboard renders comes from a pure function here:
   (grants, funders) in, plain data out. No React, no globals, no assumption
   about which funders exist. Each is independently testable.
   ──────────────────────────────────────────────────────────────────────── */

/* ── primitives ── */

export const sum = (arr, f = (x) => x) => arr.reduce((s, x) => s + (f(x) || 0), 0);
export const mean = (arr, f = (x) => x) => (arr.length ? sum(arr, f) / arr.length : 0);
export const share = (arr, pred) => (arr.length ? arr.filter(pred).length / arr.length : 0);
export const pct = (fraction, digits = 0) => `${(fraction * 100).toFixed(digits)}%`;

export const fmtUSD = (v) =>
  v >= 1e6 ? `$${(v / 1e6).toFixed(1)}M` : v >= 1e3 ? `$${(v / 1e3).toFixed(0)}K` : `$${Math.round(v || 0)}`;
export const fmtM = (v) => `$${((v || 0) / 1e6).toFixed(2)}M`;

/* "C-Environment" -> "Environment"; leaves plain labels alone. */
export const shortSector = (s) => {
  if (!s) return "Unspecified";
  return s.includes("-") ? s.split("-").slice(1).join("-").trim() || s : s;
};

const labelOf = (v, fallback = "Unspecified") =>
  v === null || v === undefined || v === "" ? fallback : String(v);

/* Counts each funder's grants into a row keyed by funder.key. */
function funderCounts(rows, funders) {
  return Object.fromEntries(funders.map(f => [f.key, 0]));
}

/* ── headline KPIs ── */

export function computeKpis(grants) {
  const totalDisbursed = sum(grants, g => g.amount);
  const withImpact = grants.filter(g => g.impact !== null);
  return {
    count: grants.length,
    totalDisbursed,
    avgGrant: grants.length ? totalDisbursed / grants.length : 0,
    bipocShare: share(grants.filter(g => g.bipocLed !== null), g => g.bipocLed),
    multiYearShare: share(grants.filter(g => g.multiYear !== null), g => g.multiYear),
    collaborativeShare: share(grants.filter(g => g.collaborative !== null), g => g.collaborative),
    outcomeShare: share(grants.filter(g => g.outcomeReported !== null), g => g.outcomeReported),
    genOpShare: share(grants.filter(g => g.grantType !== null), g => isGeneralOperating(g)),
    avgImpact: withImpact.length ? mean(withImpact, g => g.impact) : null,
    avgDuration: mean(grants.filter(g => g.durationYears !== null), g => g.durationYears),
  };
}

export const isGeneralOperating = (g) => /general\s*(operating|support|op)/i.test(g.grantType || "");

/* ── per-funder rollup ── */

export function summarizeFunder(grants, funder) {
  const own = grants.filter(g => g.funder === funder.name);
  const k = computeKpis(own);
  return { ...funder, grants: own, ...k, sectorHHI: herfindahl(own, "sector") };
}

export function summarizeFunders(grants, funders) {
  return funders.map(f => summarizeFunder(grants, f));
}

/* ── concentration ──
   Herfindahl–Hirschman index over any categorical field.
   0 = perfectly diverse, 1 = everything in one category. */
export function herfindahl(grants, key = "sector") {
  const total = grants.length;
  if (!total) return 0;
  const counts = new Map();
  for (const g of grants) {
    const label = labelOf(g[key]);
    counts.set(label, (counts.get(label) || 0) + 1);
  }
  let h = 0;
  for (const c of counts.values()) h += (c / total) ** 2;
  return h;
}

/* ── generic categorical breakdown, split by funder ──
   -> [{ label, full, count, amount, f0: n, f1: n, ... }] */
export function breakdownBy(grants, funders, key, { labelFn = labelOf, sortBy = "count" } = {}) {
  const rows = new Map();

  for (const g of grants) {
    const full = labelOf(g[key]);
    if (!rows.has(full)) {
      rows.set(full, { label: labelFn(full), full, count: 0, amount: 0, ...funderCounts(null, funders) });
    }
    const row = rows.get(full);
    row.count++;
    row.amount += g.amount || 0;
    const f = funders.find(x => x.name === g.funder);
    if (f) row[f.key]++;
  }

  const out = [...rows.values()];
  if (sortBy === "count") out.sort((a, b) => b.count - a.count);
  if (sortBy === "label") out.sort((a, b) => a.full.localeCompare(b.full));
  return out;
}

export const sectorBreakdown = (grants, funders) =>
  breakdownBy(grants, funders, "sector", { labelFn: shortSector });

export const regionBreakdown = (grants, funders) =>
  breakdownBy(grants, funders, "region");

export const localeBreakdown = (grants, funders) =>
  breakdownBy(grants, funders, "locale");

export const grantTypeBreakdown = (grants, funders) =>
  breakdownBy(grants, funders, "grantType");

/* Single-funder pie slices for a categorical field. */
export function sliceBy(grants, key, labelFn = labelOf) {
  const counts = new Map();
  for (const g of grants) {
    const label = labelFn(labelOf(g[key]));
    counts.set(label, (counts.get(label) || 0) + 1);
  }
  return [...counts.entries()].map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);
}

/* ── time series ──
   -> [{ year, f0: count, f0Amt: dollars, ... }] over every year present. */
export function yearTrend(grants, funders) {
  const rows = new Map();
  for (const g of grants) {
    if (g.year === null) continue;
    if (!rows.has(g.year)) {
      const base = { year: g.year };
      funders.forEach(f => { base[f.key] = 0; base[`${f.key}Amt`] = 0; });
      rows.set(g.year, base);
    }
    const row = rows.get(g.year);
    const f = funders.find(x => x.name === g.funder);
    if (f) { row[f.key]++; row[`${f.key}Amt`] += g.amount || 0; }
  }
  return [...rows.values()].sort((a, b) => a.year - b.year);
}

export function yearExtent(grants) {
  const years = grants.map(g => g.year).filter(y => y !== null);
  if (!years.length) return null;
  return { min: Math.min(...years), max: Math.max(...years) };
}

/* ── grant size distribution ── */

export const DEFAULT_SIZE_BUCKETS = [
  { label: "<$50K",     min: 0,       max: 50000 },
  { label: "$50-150K",  min: 50000,   max: 150000 },
  { label: "$150-500K", min: 150000,  max: 500000 },
  { label: "$500K-1M",  min: 500000,  max: 1000000 },
  { label: ">$1M",      min: 1000000, max: Infinity },
];

export function sizeDistribution(grants, funders, buckets = DEFAULT_SIZE_BUCKETS) {
  return buckets.map(b => {
    const row = { label: b.label, count: 0 };
    funders.forEach(f => { row[f.key] = 0; });
    for (const g of grants) {
      const amt = g.amount;
      if (amt === null || amt < b.min || amt >= b.max) continue;
      row.count++;
      const f = funders.find(x => x.name === g.funder);
      if (f) row[f.key]++;
    }
    return row;
  });
}

/* ── impact ── */

export function impactByGrantType(grants) {
  const groups = new Map();
  for (const g of grants) {
    if (g.impact === null) continue;
    const type = labelOf(g.grantType);
    if (!groups.has(type)) groups.set(type, []);
    groups.get(type).push(g.impact);
  }
  return [...groups.entries()]
    .map(([type, vals]) => ({
      type: abbreviateGrantType(type),
      full: type,
      avg: +(vals.reduce((s, v) => s + v, 0) / vals.length).toFixed(2),
      n: vals.length,
    }))
    .sort((a, b) => b.avg - a.avg);
}

/* Keeps long type names from colliding on a chart axis. */
export function abbreviateGrantType(type) {
  return String(type)
    .replace(/general\s*operating/i, "Gen. Ops.")
    .replace(/project[\s-]*specific/i, "Project")
    .replace(/capacity[\s-]*building/i, "Cap. Build.");
}

/* Impact gap between BIPOC-led and other grantees. */
export function equityStats(grants) {
  const rated = grants.filter(g => g.impact !== null && g.bipocLed !== null);
  const bipoc = rated.filter(g => g.bipocLed);
  const other = rated.filter(g => !g.bipocLed);
  const bipocImpact = bipoc.length ? mean(bipoc, g => g.impact) : null;
  const otherImpact = other.length ? mean(other, g => g.impact) : null;
  return {
    outcomeShare: share(grants.filter(g => g.outcomeReported !== null), g => g.outcomeReported),
    bipocImpact,
    otherImpact,
    differential: bipocImpact !== null && otherImpact !== null ? bipocImpact - otherImpact : null,
  };
}

/* ── OECD DAC framework scores ──
   v1 hard-coded these six numbers per foundation. They are now derived from
   the same portfolio signals the panel claims they synthesize, so the radar
   works for any uploaded dataset. Each dimension maps a blend of portfolio
   shares onto the 1–5 scale; `inputs` is returned for transparency. */
const clamp01 = (x) => Math.min(1, Math.max(0, x));
const to5 = (x) => +(1 + 4 * clamp01(x)).toFixed(2);

export const FRAMEWORK_DIMENSIONS = [
  { dim: "Relevance",      desc: "Alignment with community-defined needs",  inputs: "BIPOC-led share + sector diversity" },
  { dim: "Coherence",      desc: "Fit with broader policy systems",         inputs: "Co-funded share + sector diversity" },
  { dim: "Effectiveness",  desc: "Achievement of stated outcomes",          inputs: "Outcome reporting + mean impact" },
  { dim: "Efficiency",     desc: "Resource optimization ratio",             inputs: "General operating share + co-funded share" },
  { dim: "Impact",         desc: "Long-term systemic change",               inputs: "Mean impact + multi-year share" },
  { dim: "Sustainability", desc: "Endurance beyond grant period",           inputs: "Multi-year share + mean duration" },
];

export function frameworkScores(grants, funders) {
  const perFunder = funders.map(f => {
    const own = grants.filter(g => g.funder === f.name);
    const k = computeKpis(own);
    const diversity = 1 - herfindahl(own, "sector");
    const impact01 = k.avgImpact === null ? 0.5 : (k.avgImpact - 1) / 4;
    const duration01 = clamp01((k.avgDuration || 1) / 4);

    return {
      key: f.key,
      scores: {
        Relevance:      to5(0.5 * k.bipocShare + 0.5 * diversity),
        Coherence:      to5(0.5 * k.collaborativeShare + 0.5 * diversity),
        Effectiveness:  to5(0.5 * k.outcomeShare + 0.5 * impact01),
        Efficiency:     to5(0.6 * k.genOpShare + 0.4 * k.collaborativeShare),
        Impact:         to5(0.6 * impact01 + 0.4 * k.multiYearShare),
        Sustainability: to5(0.5 * k.multiYearShare + 0.5 * duration01),
      },
    };
  });

  return FRAMEWORK_DIMENSIONS.map(d => {
    const row = { dim: d.dim, desc: d.desc, inputs: d.inputs };
    perFunder.forEach(p => { row[p.key] = p.scores[d.dim]; });
    return row;
  });
}

/* ── strategy tab ── */

/* Flat list of per-funder comparison tiles: one row per (metric × funder). */
export function strategyMetrics(grants, funders) {
  const summaries = summarizeFunders(grants, funders);
  const defs = [
    { label: "Avg. Grant",   get: s => (s.count ? fmtUSD(s.avgGrant) : "--") },
    { label: "BIPOC-Led",    get: s => (s.count ? pct(s.bipocShare) : "--") },
    { label: "Multi-Year",   get: s => (s.count ? pct(s.multiYearShare) : "--") },
    { label: "Co-Funded",    get: s => (s.count ? pct(s.collaborativeShare) : "--") },
  ];
  return defs.flatMap(d =>
    summaries.map(s => ({ label: `${d.label} (${s.name})`, val: d.get(s), color: s.color }))
  );
}

/* Best-practice alignment, scored from the data rather than authored by hand.
   Thresholds are the sector benchmarks cited in the evidence column. */
export const BEST_PRACTICES = [
  { standard: "General Operating Support",   get: k => k.genOpShare,           target: 0.55, evidence: "CEP, NCRP Power-Building" },
  { standard: "Multi-Year Funding (≥2yr)",   get: k => k.multiYearShare,       target: 0.50, evidence: "MacArthur, Ford Foundation" },
  { standard: "BIPOC-Led Org Prioritization",get: k => k.bipocShare,           target: 0.50, evidence: "Bridgespan, Candid 2023" },
  { standard: "Collaborative Grantmaking",   get: k => k.collaborativeShare,   target: 0.35, evidence: "Pooled funds, PRIs" },
  { standard: "Impact Measurement",          get: k => k.outcomeShare,         target: 0.60, evidence: "OECD DAC, CEP" },
  { standard: "Portfolio Diversification",   get: (k, s) => 1 - s.sectorHHI,   target: 0.75, evidence: "Candid PCS" },
];

/* Ratio of achievement against target, rendered 0–5 stars. */
export function stars(value, target) {
  if (value === null || value === undefined) return { n: 0, label: "n/a" };
  const ratio = target ? value / target : 0;
  const n = Math.max(0, Math.min(5, Math.round(ratio * 4)));
  return { n, label: "★".repeat(n) + "☆".repeat(5 - n) };
}

export function scorecard(grants, funders) {
  const summaries = summarizeFunders(grants, funders);
  return BEST_PRACTICES.map(bp => ({
    standard: bp.standard,
    evidence: bp.evidence,
    target: bp.target,
    cells: summaries.map(s => {
      const value = bp.get(s, s);
      return { key: s.key, name: s.name, color: s.color, value, ...stars(value, bp.target) };
    }),
  }));
}

/* Rule-driven recommendations: each funder is measured against the same
   benchmarks, and only the ones it misses are surfaced. */
export function recommendations(grants, funders) {
  const summaries = summarizeFunders(grants, funders);

  return summaries.map(s => {
    const recs = [];
    const add = (headline, detail) => recs.push({ headline, detail });

    if (s.genOpShare < 0.55)
      add("Increase general operating support", `currently ${pct(s.genOpShare)} of grants, against a ~55% sector benchmark`);
    if (s.multiYearShare < 0.5)
      add("Expand multi-year commitments", `only ${pct(s.multiYearShare)} of grants run 2+ years`);
    if (s.bipocShare < 0.5)
      add("Broaden BIPOC-led funding", `BIPOC-led organizations hold ${pct(s.bipocShare)} of the portfolio`);
    if (s.collaborativeShare < 0.35)
      add("Pursue more co-funded vehicles", `${pct(s.collaborativeShare)} of grants are collaborative`);
    if (s.outcomeShare < 0.6)
      add("Strengthen outcome reporting", `outcomes are reported on ${pct(s.outcomeShare)} of grants`);
    if (s.sectorHHI > 0.25)
      add("Diversify sector allocation", `sector HHI of ${s.sectorHHI.toFixed(3)} indicates concentration`);
    if (s.avgDuration && s.avgDuration < 2)
      add("Lengthen average grant term", `mean duration is ${s.avgDuration.toFixed(1)} years`);

    if (!recs.length)
      add("Portfolio meets every tracked benchmark", "maintain current strategy and monitor for drift");

    return { ...s, recs: recs.slice(0, 4) };
  });
}

/* Data-derived caption for the geography chart — replaces v1's hand-written
   sentence about where two specific foundations concentrate. */
export function geographyNotes(grants, funders) {
  return funders.map(f => {
    const own = grants.filter(g => g.funder === f.name);
    const regions = sliceBy(own, "region");
    const top = regions[0];
    return {
      name: f.name,
      color: f.color,
      text: top && own.length
        ? `concentrates in ${top.name} (${pct(top.value / own.length)} of grants) across ${regions.length} region${regions.length === 1 ? "" : "s"}.`
        : "has no regional data in the current selection.",
    };
  });
}

/* Data-derived caption for the grant-size chart. */
export function sizeNotes(grants, funders, buckets = DEFAULT_SIZE_BUCKETS) {
  const dist = sizeDistribution(grants, funders, buckets);
  return funders.map(f => {
    const total = dist.reduce((s, b) => s + b[f.key], 0);
    const top = dist.reduce((a, b) => (b[f.key] > a[f.key] ? b : a), dist[0]);
    return {
      name: f.name,
      color: f.color,
      text: total
        ? `clusters in the ${top.label} band (${pct(top[f.key] / total)} of its grants).`
        : "has no grants in the current selection.",
    };
  });
}
