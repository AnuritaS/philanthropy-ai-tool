/**
 * Deterministic finding detection. No AI.
 *
 * Pure functions over a computed profile. Phase 3's narrator may rephrase these
 * headlines, but it may not introduce a number that is not already here — every
 * finding carries a metricRef pointing at the computed value it describes.
 *
 * What this deliberately does NOT do: judge a descriptive measure. "Is an HHI
 * of 0.34 high?" has no answer without a peer distribution, and METHODOLOGY
 * section 2 refuses to encode a contested position as arithmetic. Until a peer
 * corpus exists, concentration and terms measures are reported, not graded —
 * so findings here come from alignment (the one scored dimension), from data
 * completeness, and from peer comparison only when benchmarks are supplied.
 */

const pct = (v, digits = 0) => `${(v * 100).toFixed(digits)}%`;

/** Read a dotted path out of the profile, so a metricRef is verifiable. */
export function readMetric(profile, ref) {
  return ref.split('.').reduce((acc, key) => (acc === null || acc === undefined ? acc : acc[key]), profile);
}

const DIMENSION_LABEL = { subject: 'Subject', population: 'Population', geography: 'Geographic' };

/**
 * @param {object} profile - buildProfile output
 * @param {object|null} benchmarks - peer distributions, or null until a corpus exists
 * @returns {Array<{id,level,metricRef,value,comparison,magnitude,headline,body,icon}>}
 */
export function detectFindings(profile, benchmarks = null) {
  const findings = [];
  const add = (f) => findings.push(f);

  /* ── Alignment: the only scored dimension, so the only one we can judge ── */
  for (const [name, result] of Object.entries(profile.alignment?.dimensions ?? {})) {
    if (result.suppressed || !result.value) continue;
    const score = result.value.score;
    const label = DIMENSION_LABEL[name] ?? name;
    const ref = `alignment.dimensions.${name}.value.score`;

    if (score >= 0.75) {
      add({
        id: `alignment-strong-${name}`,
        level: 'strength',
        icon: 'leaf',
        metricRef: ref,
        value: score,
        comparison: { stated: 1 },
        magnitude: score,
        headline: `${label} funding tracks your stated strategy`,
        body: `${pct(result.value.components.coverage)} of classified dollars fall inside your declared ${name} priorities.`,
      });
    } else if (score < 0.5) {
      add({
        id: `alignment-weak-${name}`,
        level: 'opportunity',
        icon: 'target',
        metricRef: ref,
        value: score,
        comparison: { stated: 1 },
        magnitude: 1 - score,
        headline: `${label} funding diverges from stated priorities`,
        body: `${pct(result.value.components.coverage)} of classified dollars reach your declared priority ${name === 'geography' ? 'geographies' : `${name}s`}.`,
      });
    }
  }

  /* An undeclared dimension is not misalignment, but it is worth surfacing:
     the foundation is choosing not to be measured on it. */
  const undeclared = Object.entries(profile.alignment?.dimensions ?? {})
    .filter(([, r]) => r.suppressed && /stated strategy/.test(r.reason ?? ''))
    .map(([name]) => DIMENSION_LABEL[name] ?? name);
  if (undeclared.length > 0) {
    add({
      id: 'alignment-undeclared',
      level: 'gap',
      icon: 'scale',
      metricRef: 'alignment.dimensionsScored',
      value: profile.alignment?.dimensionsScored ?? 0,
      comparison: {},
      magnitude: undeclared.length * 0.2,
      headline: `${undeclared.join(' and ')} ${undeclared.length === 1 ? 'has' : 'have'} no declared strategy`,
      body: `Alignment is scored only against priorities you state. Undeclared dimensions are excluded from the composite rather than counted as zero.`,
    });
  }

  /* ── Data completeness: factual, not a judgment ── */
  for (const flag of profile.dataQuality?.flags ?? []) {
    if (flag.level !== 'blocking') continue;
    add({
      id: `coverage-${flag.field}`,
      level: 'gap',
      icon: 'wand',
      metricRef: `dataQuality.coverage.${flag.field}.byDollars`,
      value: flag.coverage ?? 0,
      comparison: { threshold: 0.7 },
      magnitude: 1 - (flag.coverage ?? 0),
      headline: `${humanField(flag.field)} is missing on most dollars`,
      body: flag.message,
    });
  }

  const problems = profile.ingestion?.problems ?? [];
  const quarantined = problems.filter((p) => !p.warningOnly);
  if (quarantined.length > 0) {
    add({
      id: 'ingestion-quarantined',
      level: 'gap',
      icon: 'alert-triangle',
      metricRef: 'ingestion.problems',
      value: quarantined.length,
      comparison: {},
      magnitude: 0.4,
      headline: `${quarantined.length} row${quarantined.length === 1 ? '' : 's'} could not be read`,
      body: `Held aside rather than dropped, so nothing silently disappears from the totals.`,
    });
  }

  /* ── Peer-relative findings: only once a corpus exists (Phase 4) ── */
  if (benchmarks) {
    for (const [key, ref] of [
      ['flexibilityRate', 'practice.flexibility'],
      ['multiYearShare', 'practice.multiYear'],
    ]) {
      const metric = readMetric(profile, ref);
      const dist = benchmarks[key];
      if (!metric || metric.suppressed || !dist) continue;
      const percentile = dist.percentileOf?.(metric.value);
      if (percentile === null || percentile === undefined) continue;
      if (percentile >= 75 || percentile <= 25) {
        add({
          id: `peer-${key}`,
          level: percentile >= 75 ? 'strength' : 'opportunity',
          icon: percentile >= 75 ? 'leaf' : 'target',
          metricRef: `${ref}.value`,
          value: metric.value,
          comparison: { peerMedian: dist.p50, percentile },
          magnitude: Math.abs(percentile - 50) / 50,
          headline: `${humanMetric(key)} sits ${percentile >= 75 ? 'above' : 'below'} peers`,
          body: `${pct(metric.value)} against a peer median of ${pct(dist.p50)}.`,
        });
      }
    }
  }

  return findings.sort((a, b) => rank(a.level) - rank(b.level) || b.magnitude - a.magnitude);
}

const rank = (level) => ({ opportunity: 0, strength: 1, gap: 2 })[level] ?? 3;

function humanField(field) {
  return {
    pcs_subject: 'Subject coding',
    pcs_population: 'Population coding',
    pcs_support_strategy: 'Support strategy coding',
    pcs_transaction_type: 'Transaction type coding',
  }[field] ?? field.replace(/_/g, ' ');
}

function humanMetric(key) {
  return { flexibilityRate: 'Flexible funding', multiYearShare: 'Multi-year support' }[key] ?? key;
}

/**
 * Guard for Phase 3: every number in narrated prose must already appear in the
 * finding it describes. Exported now so the narrator has a contract to meet.
 */
export function numbersIn(text) {
  return (String(text).match(/\d+(?:\.\d+)?/g) ?? []).map(Number);
}
