/**
 * Open Philanthropy Benchmark — core engine entry point.
 *
 * Produces a Portfolio Practice Profile: a set of descriptive measures awaiting
 * peer percentiles, plus an alignment score measured against the foundation's
 * own stated strategy.
 *
 * Deliberately absent: an "impact score". Grant transaction data can show where
 * money went, on what terms, for how long. It cannot show what the money caused.
 * Outcome evidence is a separate ingestion path and a separate score.
 */

import { normalizeDataset } from './schema.js';
import { completenessReport } from './validation.js';
import {
  portfolioTotals,
  concentration,
  flexibilityRate,
  multiYearShare,
  topRecipientShare,
  grantSizeDistribution,
} from './metrics.js';
import { compositeAlignment } from './alignment.js';

export function buildProfile(grants, { strategy = {}, threshold } = {}) {
  const options = threshold === undefined ? {} : { threshold };

  return {
    generatedAt: new Date().toISOString(),
    totals: portfolioTotals(grants),
    dataQuality: completenessReport(grants, options),

    // Descriptive — meaningless without a peer distribution or stated strategy.
    practice: {
      subjectConcentration: concentration(grants, 'pcs_subject'),
      populationConcentration: concentration(grants, 'pcs_population'),
      geographicConcentration: concentration(grants, null, { byKey: (g) => g.geo_state }),
      recipientConcentration: concentration(grants, null, {
        byKey: (g) => g.recipient_id ?? g.recipient_name,
      }),
      topTenRecipientShare: topRecipientShare(grants, 10),
      flexibility: flexibilityRate(grants),
      multiYear: multiYearShare(grants),
      grantSize: grantSizeDistribution(grants),
    },

    // Scored — against the foundation's own declared priorities only.
    alignment: compositeAlignment(grants, strategy, options),
  };
}

export function profileFromRows(rows, mapping, config = {}) {
  const { grants, problems } = normalizeDataset(rows, mapping);
  return { ...buildProfile(grants, config), ingestion: { accepted: grants.length, problems } };
}

export * from './schema.js';
export * from './validation.js';
export * from './metrics.js';
export * from './alignment.js';
