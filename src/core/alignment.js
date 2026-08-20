/**
 * Alignment scoring.
 *
 * This is the ONLY place in the engine that produces a score, and it scores a
 * single question: does the money go where the foundation says it goes?
 *
 * That question has a defensible right answer. "Is 64% concentration good?"
 * does not, so concentration lives in metrics.js as a descriptive figure with a
 * peer percentile attached instead.
 *
 * Every score returned here carries its own inputs so the UI can answer
 * "why did I get 78?" without recomputation.
 */

import { gated } from './validation.js';

/**
 * PCS codes are hierarchical and fixed-width by level, so ancestry is a prefix
 * test: a grant coded SB050200 counts toward a stated priority of SB.
 *
 * A foundation whose data is mapped rather than natively PCS-coded can override
 * this with its own ancestry function.
 */
export function descendsFrom(code, ancestor) {
  if (!code || !ancestor) return false;
  const c = String(code).toUpperCase();
  const a = String(ancestor).toUpperCase();
  return c === a || c.startsWith(a);
}

export function matchesAnyPriority(codes, priorities) {
  if (!Array.isArray(codes)) return false;
  return codes.some((code) => priorities.some((p) => descendsFrom(code, p)));
}

/**
 * Coverage: share of classified dollars falling inside the stated priority set.
 *
 * Fractional attribution applies — a grant coded to two subjects, one of which
 * is a priority, contributes half its dollars as aligned.
 */
export function priorityCoverage(grants, field, priorities) {
  let aligned = 0;
  let classified = 0;

  for (const g of grants) {
    const codes = g[field];
    if (!Array.isArray(codes) || codes.length === 0) continue;
    const amount = g.amount ?? 0;
    if (amount <= 0) continue;
    classified += amount;
    const share = amount / codes.length;
    for (const code of codes) {
      if (priorities.some((p) => descendsFrom(code, p))) aligned += share;
    }
  }

  return { aligned, classified, coverage: classified === 0 ? 0 : aligned / classified };
}

/**
 * Total variation distance between the actual and intended dollar split across
 * stated priorities. Bounded [0, 1]; 0 means the portfolio matches the stated
 * weights exactly.
 *
 * Used only when a foundation supplies target weights. Most won't at first, in
 * which case coverage alone is the score.
 */
export function totalVariationDistance(actualShares, targetShares) {
  const keys = new Set([...actualShares.keys(), ...targetShares.keys()]);
  let sum = 0;
  for (const key of keys) {
    sum += Math.abs((actualShares.get(key) ?? 0) - (targetShares.get(key) ?? 0));
  }
  return sum / 2;
}

function normalizeWeights(weights) {
  const total = [...weights.values()].reduce((a, b) => a + b, 0);
  const out = new Map();
  if (total === 0) return out;
  for (const [k, v] of weights) out.set(k, v / total);
  return out;
}

/**
 * Actual dollar split across the stated priority buckets only.
 * Dollars outside the priority set are excluded here; they are already
 * penalized through the coverage term.
 */
export function actualPriorityShares(grants, field, priorities) {
  const buckets = new Map(priorities.map((p) => [p, 0]));
  let insideTotal = 0;

  for (const g of grants) {
    const codes = g[field];
    if (!Array.isArray(codes) || codes.length === 0) continue;
    const amount = g.amount ?? 0;
    if (amount <= 0) continue;
    const share = amount / codes.length;
    for (const code of codes) {
      for (const p of priorities) {
        if (descendsFrom(code, p)) {
          buckets.set(p, buckets.get(p) + share);
          insideTotal += share;
          break;
        }
      }
    }
  }

  const shares = new Map();
  for (const [p, dollars] of buckets) {
    shares.set(p, insideTotal === 0 ? 0 : dollars / insideTotal);
  }
  return shares;
}

/**
 * Alignment score for one dimension (subject, population, or geography).
 *
 * Without target weights:  score = coverage
 * With target weights:     score = coverage x (1 - TVD)
 *
 * The multiplicative form means a foundation cannot earn credit for a perfect
 * internal split of a small slice of its portfolio.
 *
 * @param {object[]} grants
 * @param {string} field - canonical field name, e.g. 'pcs_subject'
 * @param {object} stated - { priorities: string[], weights?: Record<code, number> }
 */
export function alignmentScore(grants, field, stated, options = {}) {
  const priorities = stated?.priorities ?? [];
  if (priorities.length === 0) {
    return {
      value: null,
      suppressed: true,
      reason: `No stated priorities declared for ${field}. Alignment cannot be scored without a stated strategy.`,
    };
  }

  return gated(
    grants,
    [field],
    () => {
      const { aligned, classified, coverage } = priorityCoverage(grants, field, priorities);

      let distance = null;
      let concentrationPenalty = 1;
      if (stated.weights) {
        const targets = normalizeWeights(new Map(Object.entries(stated.weights)));
        const actual = actualPriorityShares(grants, field, priorities);
        distance = totalVariationDistance(actual, targets);
        concentrationPenalty = 1 - distance;
      }

      return {
        score: coverage * concentrationPenalty,
        components: {
          coverage,
          alignedDollars: aligned,
          classifiedDollars: classified,
          totalVariationDistance: distance,
          priorities,
        },
      };
    },
    options,
  );
}

/**
 * Composite alignment across whichever dimensions the foundation declared.
 * Dimensions with no stated strategy are excluded from the denominator rather
 * than scored as zero — silence is not misalignment.
 */
export function compositeAlignment(grants, strategy = {}, options = {}) {
  const dimensions = {
    subject: { field: 'pcs_subject', stated: strategy.subject },
    population: { field: 'pcs_population', stated: strategy.population },
    geography: { field: 'geo_state', stated: strategy.geography },
  };

  const results = {};
  const scored = [];

  for (const [name, { field, stated }] of Object.entries(dimensions)) {
    const result = alignmentScore(grants, field, stated, options);
    results[name] = result;
    if (!result.suppressed && result.value) scored.push(result.value.score);
  }

  return {
    dimensions: results,
    composite: scored.length === 0 ? null : scored.reduce((a, b) => a + b, 0) / scored.length,
    dimensionsScored: scored.length,
  };
}
