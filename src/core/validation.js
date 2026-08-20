/**
 * Data quality engine.
 *
 * Runs before any metric is computed. Its job is to make sure a foundation
 * never receives a number that is really a measurement of its own missing data.
 * Every metric downstream is gated on the coverage figures produced here.
 */

import { FIELDS, PCS_FIELDS } from './schema.js';

/** Default minimum share of dollars that must carry a field for a metric to run. */
export const DEFAULT_COVERAGE_THRESHOLD = 0.7;

function isPresent(value) {
  if (value === null || value === undefined) return false;
  if (Array.isArray(value)) return value.length > 0;
  if (value instanceof Date) return true;
  if (typeof value === 'string') return value.trim() !== '';
  return true;
}

/**
 * Coverage for a single field, measured two ways.
 *
 * Dollar coverage is the one that matters for weighting: a portfolio can have
 * 95% of grants coded and still be missing codes on the three grants that carry
 * half the money.
 */
export function fieldCoverage(grants, field) {
  const totalDollars = grants.reduce((sum, g) => sum + (g.amount ?? 0), 0);
  let coveredDollars = 0;
  let coveredCount = 0;

  for (const g of grants) {
    if (isPresent(g[field])) {
      coveredCount += 1;
      coveredDollars += g.amount ?? 0;
    }
  }

  return {
    field,
    byCount: grants.length === 0 ? 0 : coveredCount / grants.length,
    byDollars: totalDollars === 0 ? 0 : coveredDollars / totalDollars,
    coveredCount,
    totalCount: grants.length,
  };
}

/**
 * Full completeness report across every canonical field.
 *
 * @returns {{ grantCount, totalDollars, coverage: Record<string, object>, flags: object[] }}
 */
export function completenessReport(grants, { threshold = DEFAULT_COVERAGE_THRESHOLD } = {}) {
  const coverage = {};
  for (const field of Object.keys(FIELDS)) {
    coverage[field] = fieldCoverage(grants, field);
  }

  const flags = [];
  for (const field of PCS_FIELDS) {
    const c = coverage[field];
    if (c.byDollars < threshold) {
      flags.push({
        level: c.byDollars < threshold / 2 ? 'blocking' : 'warning',
        field,
        message:
          `${((1 - c.byDollars) * 100).toFixed(1)}% of grant dollars lack ${field}. ` +
          `Metrics depending on this field are ${
            c.byDollars < threshold / 2 ? 'suppressed' : 'reported with reduced confidence'
          }.`,
        coverage: c.byDollars,
      });
    }
  }

  const dupes = new Map();
  for (const g of grants) {
    if (!g.grant_id) continue;
    dupes.set(g.grant_id, (dupes.get(g.grant_id) ?? 0) + 1);
  }
  const duplicated = [...dupes.entries()].filter(([, n]) => n > 1);
  if (duplicated.length > 0) {
    flags.push({
      level: 'warning',
      field: 'grant_id',
      message: `${duplicated.length} duplicate grant_id values detected.`,
    });
  }

  return {
    grantCount: grants.length,
    totalDollars: grants.reduce((sum, g) => sum + (g.amount ?? 0), 0),
    coverage,
    flags,
  };
}

/**
 * Wrap a metric so it refuses to report when its inputs are too sparse.
 * Returns the metric value plus the coverage it was computed on, so the UI can
 * always show "78% — based on 84% of portfolio dollars".
 */
export function gated(grants, requiredFields, compute, { threshold = DEFAULT_COVERAGE_THRESHOLD } = {}) {
  const coverages = requiredFields.map((f) => fieldCoverage(grants, f));
  const minCoverage = coverages.length === 0 ? 1 : Math.min(...coverages.map((c) => c.byDollars));

  if (minCoverage < threshold) {
    return {
      value: null,
      suppressed: true,
      coverage: minCoverage,
      reason: `Coverage ${(minCoverage * 100).toFixed(1)}% is below the ${(threshold * 100).toFixed(0)}% threshold.`,
    };
  }

  return { value: compute(), suppressed: false, coverage: minCoverage };
}
