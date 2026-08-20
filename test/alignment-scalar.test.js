/**
 * Regression tests for scalar-field alignment.
 *
 * Before this fix, compositeAlignment routed geography through 'geo_state' — a
 * string field — while priorityCoverage skipped anything that was not an array.
 * Every geography grant was therefore invisible, and because the coverage gate
 * saw 100% of dollars carrying a state, the engine reported a *confident* score
 * of 0 rather than suppressing. A foundation declaring a California focus was
 * told none of its money went to California.
 *
 * core.test.js is left unmodified, per BUILD_SPEC section 6.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  descendsFrom,
  exactMatch,
  matchesAnyPriority,
  priorityCoverage,
  actualPriorityShares,
  alignmentScore,
} from '../src/core/alignment.js';
import { buildProfile } from '../src/core/index.js';

const grant = (over = {}) => ({
  grant_id: 'g1',
  recipient_name: 'Org A',
  amount: 100000,
  award_date: new Date('2024-01-15'),
  duration_months: 12,
  pcs_subject: ['SB'],
  pcs_population: [],
  pcs_support_strategy: [],
  pcs_transaction_type: ['TT010000'],
  geo_state: 'CA',
  ...over,
});

/* ── the reported bug ── */

test('geography alignment scores the dollars that match a stated state', () => {
  const grants = [
    grant({ grant_id: 'a', amount: 900, geo_state: 'CA' }),
    grant({ grant_id: 'b', amount: 100, geo_state: 'NY' }),
  ];
  const result = alignmentScore(grants, 'geo_state', { priorities: ['CA'] }, { matches: exactMatch });

  assert.equal(result.suppressed, false);
  assert.ok(Math.abs(result.value.score - 0.9) < 1e-9, `expected 0.9, got ${result.value.score}`);
  assert.equal(result.value.components.classifiedDollars, 1000);
  assert.ok(Math.abs(result.value.components.alignedDollars - 900) < 1e-9);
});

test('buildProfile scores a declared geography instead of returning a confident zero', () => {
  const grants = [
    grant({ grant_id: 'a', amount: 900, geo_state: 'CA' }),
    grant({ grant_id: 'b', amount: 100, geo_state: 'NY' }),
  ];
  const profile = buildProfile(grants, { strategy: { geography: { priorities: ['CA'] } } });
  const geo = profile.alignment.dimensions.geography;

  assert.equal(geo.suppressed, false);
  assert.ok(Math.abs(geo.value.score - 0.9) < 1e-9);
  assert.equal(profile.alignment.dimensionsScored, 1);
  assert.ok(Math.abs(profile.alignment.composite - 0.9) < 1e-9);
});

/* ── the comparator that makes it safe ── */

test('geography matches exactly, so CA does not credit CANADA', () => {
  assert.equal(exactMatch('CA', 'CA'), true);
  assert.equal(exactMatch('ca', 'CA'), true);
  assert.equal(exactMatch('CANADA', 'CA'), false);
  assert.equal(exactMatch('NY', 'N'), false);
  // The prefix test that makes this unsafe is still correct for PCS.
  assert.equal(descendsFrom('CANADA', 'CA'), true);
});

test('a CANADA grant earns no credit toward a stated CA priority', () => {
  const grants = [
    grant({ grant_id: 'a', amount: 500, geo_state: 'CA' }),
    grant({ grant_id: 'b', amount: 500, geo_state: 'CANADA' }),
  ];
  const profile = buildProfile(grants, { strategy: { geography: { priorities: ['CA'] } } });
  assert.ok(Math.abs(profile.alignment.dimensions.geography.value.score - 0.5) < 1e-9);
});

/* ── PCS behaviour must be untouched ── */

test('PCS subject alignment still uses prefix ancestry and is unchanged', () => {
  const grants = [
    grant({ grant_id: 'a', amount: 700, pcs_subject: ['SB050200'] }),
    grant({ grant_id: 'b', amount: 300, pcs_subject: ['SC01'] }),
  ];
  assert.ok(Math.abs(priorityCoverage(grants, 'pcs_subject', ['SB']).coverage - 0.7) < 1e-9);

  const profile = buildProfile(grants, { strategy: { subject: { priorities: ['SB'] } } });
  assert.ok(Math.abs(profile.alignment.dimensions.subject.value.score - 0.7) < 1e-9);
});

test('fractional attribution across multi-coded grants is preserved', () => {
  const grants = [grant({ amount: 900, pcs_subject: ['SB', 'SC', 'SD'] })];
  const { coverage } = priorityCoverage(grants, 'pcs_subject', ['SB']);
  assert.ok(Math.abs(coverage - 1 / 3) < 1e-9);
});

/* ── scalar fields work with the rest of the scoring machinery ── */

test('target weights apply to scalar fields as well as PCS arrays', () => {
  const grants = [
    grant({ grant_id: 'a', amount: 500, geo_state: 'CA' }),
    grant({ grant_id: 'b', amount: 500, geo_state: 'NY' }),
  ];
  const matched = alignmentScore(
    grants, 'geo_state',
    { priorities: ['CA', 'NY'], weights: { CA: 50, NY: 50 } },
    { matches: exactMatch },
  );
  const lopsided = alignmentScore(
    grants, 'geo_state',
    { priorities: ['CA', 'NY'], weights: { CA: 100, NY: 0 } },
    { matches: exactMatch },
  );

  assert.ok(Math.abs(matched.value.score - 1) < 1e-9, 'a 50/50 split against 50/50 targets is a perfect match');
  assert.ok(Math.abs(matched.value.components.totalVariationDistance) < 1e-9);
  assert.ok(lopsided.value.score < matched.value.score);
});

test('actualPriorityShares splits scalar dollars across stated buckets', () => {
  const grants = [
    grant({ grant_id: 'a', amount: 750, geo_state: 'CA' }),
    grant({ grant_id: 'b', amount: 250, geo_state: 'NY' }),
  ];
  const shares = actualPriorityShares(grants, 'geo_state', ['CA', 'NY'], { matches: exactMatch });
  assert.ok(Math.abs(shares.get('CA') - 0.75) < 1e-9);
  assert.ok(Math.abs(shares.get('NY') - 0.25) < 1e-9);
});

test('matchesAnyPriority accepts a bare scalar as well as an array', () => {
  assert.equal(matchesAnyPriority('SB050200', ['SB']), true);
  assert.equal(matchesAnyPriority(['SB050200'], ['SB']), true);
  assert.equal(matchesAnyPriority(null, ['SB']), false);
  assert.equal(matchesAnyPriority('CA', ['CA'], { matches: exactMatch }), true);
});

/* ── silence is still not misalignment ── */

test('an undeclared geography is suppressed, not scored zero', () => {
  const profile = buildProfile([grant()], { strategy: { subject: { priorities: ['SB'] } } });
  assert.equal(profile.alignment.dimensions.geography.suppressed, true);
  assert.equal(profile.alignment.dimensions.geography.value, null);
  assert.equal(profile.alignment.dimensionsScored, 1);
});

test('a declared geography with too little state coverage suppresses rather than scoring', () => {
  const grants = [
    grant({ grant_id: 'a', amount: 100, geo_state: 'CA' }),
    grant({ grant_id: 'b', amount: 900, geo_state: null }),
  ];
  const profile = buildProfile(grants, { strategy: { geography: { priorities: ['CA'] } } });
  const geo = profile.alignment.dimensions.geography;
  assert.equal(geo.suppressed, true);
  assert.equal(geo.value, null);
  assert.ok(geo.reason.includes('below'));
});
