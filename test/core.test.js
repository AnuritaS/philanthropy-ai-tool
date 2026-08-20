import test from 'node:test';
import assert from 'node:assert/strict';

import { normalizeGrant, normalizeDataset } from '../src/core/schema.js';
import { completenessReport, fieldCoverage } from '../src/core/validation.js';
import {
  hhi,
  normalizedHHI,
  effectiveCategories,
  dollarDistribution,
  flexibilityRate,
  multiYearShare,
  topRecipientShare,
  grantSizeDistribution,
} from '../src/core/metrics.js';
import {
  descendsFrom,
  priorityCoverage,
  totalVariationDistance,
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

test('normalizeGrant coerces messy money and dates', () => {
  const { record, issues } = normalizeGrant({
    grant_id: '1',
    recipient_name: 'Org',
    amount: '$1,250,000',
    award_date: '2023-06-01',
    pcs_subject: 'SB; SC02',
  });
  assert.equal(record.amount, 1250000);
  assert.equal(record.award_date.getUTCFullYear(), 2023);
  assert.deepEqual(record.pcs_subject, ['SB', 'SC02']);
  assert.deepEqual(issues, []);
});

test('normalizeGrant reads parenthesized negatives and flags them', () => {
  const { record, issues } = normalizeGrant({
    grant_id: '1',
    recipient_name: 'Org',
    amount: '(5,000)',
    award_date: '2023-06-01',
  });
  assert.equal(record.amount, -5000);
  assert.ok(issues.some((i) => i.includes('non-positive')));
});

test('duration is derived from start and end dates', () => {
  const { record } = normalizeGrant({
    grant_id: '1',
    recipient_name: 'Org',
    amount: 100,
    award_date: '2023-01-01',
    start_date: '2023-01-01',
    end_date: '2026-01-01',
  });
  assert.equal(record.duration_months, 36);
});

test('rows missing required fields are quarantined, not dropped', () => {
  const { grants, problems } = normalizeDataset([
    { grant_id: '1', recipient_name: 'A', amount: 10, award_date: '2024-01-01' },
    { grant_id: '2', amount: 20, award_date: '2024-01-01' },
  ]);
  assert.equal(grants.length, 1);
  assert.equal(problems.length, 1);
  assert.ok(problems[0].issues[0].includes('recipient_name'));
});

test('coverage is measured by dollars, not just row count', () => {
  const grants = [
    grant({ grant_id: 'a', amount: 10, pcs_population: ['PA'] }),
    grant({ grant_id: 'b', amount: 10, pcs_population: ['PA'] }),
    grant({ grant_id: 'c', amount: 980, pcs_population: [] }),
  ];
  const c = fieldCoverage(grants, 'pcs_population');
  assert.ok(Math.abs(c.byCount - 2 / 3) < 1e-9);
  assert.ok(c.byDollars < 0.03, 'dollar coverage should expose the uncoded large grant');
});

test('HHI, normalized HHI and effective categories behave at the extremes', () => {
  assert.equal(hhi([1]), 1);
  assert.ok(Math.abs(hhi([0.25, 0.25, 0.25, 0.25]) - 0.25) < 1e-9);
  // Perfectly even split scores 0 regardless of how many categories exist.
  assert.ok(Math.abs(normalizedHHI([0.25, 0.25, 0.25, 0.25])) < 1e-9);
  assert.ok(Math.abs(normalizedHHI([0.1, 0.1, 0.1, 0.1, 0.1, 0.1, 0.1, 0.1, 0.1, 0.1])) < 1e-9);
  assert.ok(Math.abs(effectiveCategories([0.5, 0.5]) - 2) < 1e-9);
});

test('multi-coded grants split dollars fractionally so shares sum to one', () => {
  const grants = [grant({ amount: 300, pcs_subject: ['SB', 'SC', 'SD'] })];
  const dist = dollarDistribution(grants, 'pcs_subject');
  assert.equal(dist.dollars.get('SB'), 100);
  const total = [...dist.shares.values()].reduce((a, b) => a + b, 0);
  assert.ok(Math.abs(total - 1) < 1e-9);
});

test('metrics are suppressed when coverage falls below threshold', () => {
  const grants = [
    grant({ grant_id: 'a', amount: 100, pcs_transaction_type: ['TT010000'] }),
    grant({ grant_id: 'b', amount: 900, pcs_transaction_type: [] }),
  ];
  const flex = flexibilityRate(grants);
  assert.equal(flex.suppressed, true);
  assert.equal(flex.value, null);
  assert.ok(flex.reason.includes('below'));
});

test('flexibility and multi-year read dollars, not grant counts', () => {
  const grants = [
    grant({ grant_id: 'a', amount: 900, pcs_transaction_type: ['TT010000'], duration_months: 36 }),
    grant({ grant_id: 'b', amount: 100, pcs_transaction_type: ['TT020000'], duration_months: 12 }),
  ];
  assert.ok(Math.abs(flexibilityRate(grants).value - 0.9) < 1e-9);
  assert.ok(Math.abs(multiYearShare(grants).value - 0.9) < 1e-9);
});

test('top recipient share aggregates across a recipient multiple grants', () => {
  const grants = [
    grant({ grant_id: 'a', recipient_name: 'Big', amount: 400 }),
    grant({ grant_id: 'b', recipient_name: 'Big', amount: 400 }),
    grant({ grant_id: 'c', recipient_name: 'Small', amount: 200 }),
  ];
  assert.ok(Math.abs(topRecipientShare(grants, 1) - 0.8) < 1e-9);
});

test('grant size uses median, not the mean that one huge grant would dominate', () => {
  const grants = [10, 20, 30, 40, 10000].map((a, i) => grant({ grant_id: `g${i}`, amount: a }));
  const size = grantSizeDistribution(grants);
  assert.equal(size.median, 30);
  assert.ok(size.mean > 2000);
});

test('PCS ancestry is a prefix test', () => {
  assert.equal(descendsFrom('SB050200', 'SB'), true);
  assert.equal(descendsFrom('SB', 'SB'), true);
  assert.equal(descendsFrom('SC050200', 'SB'), false);
});

test('priority coverage credits descendants of a stated parent code', () => {
  const grants = [
    grant({ grant_id: 'a', amount: 700, pcs_subject: ['SB050200'] }),
    grant({ grant_id: 'b', amount: 300, pcs_subject: ['SC01'] }),
  ];
  const { coverage } = priorityCoverage(grants, 'pcs_subject', ['SB']);
  assert.ok(Math.abs(coverage - 0.7) < 1e-9);
});

test('total variation distance is zero for identical distributions', () => {
  const a = new Map([['SB', 0.6], ['SC', 0.4]]);
  const b = new Map([['SB', 0.6], ['SC', 0.4]]);
  assert.ok(Math.abs(totalVariationDistance(a, b)) < 1e-9);
  const c = new Map([['SB', 1.0], ['SC', 0]]);
  assert.ok(Math.abs(totalVariationDistance(a, c) - 0.4) < 1e-9);
});

test('alignment is unscored when no strategy is declared', () => {
  const result = alignmentScore([grant()], 'pcs_subject', undefined);
  assert.equal(result.suppressed, true);
  assert.ok(result.reason.includes('stated strategy'));
});

test('target weights penalize a lopsided split within priorities', () => {
  const grants = [
    grant({ grant_id: 'a', amount: 1000, pcs_subject: ['SB'] }),
  ];
  const even = alignmentScore(grants, 'pcs_subject', {
    priorities: ['SB', 'SC'],
    weights: { SB: 50, SC: 50 },
  });
  const matched = alignmentScore(grants, 'pcs_subject', {
    priorities: ['SB', 'SC'],
    weights: { SB: 100, SC: 0 },
  });
  assert.ok(matched.value.score > even.value.score);
  assert.ok(Math.abs(matched.value.score - 1) < 1e-9);
});

test('buildProfile emits no impact score and separates practice from alignment', () => {
  const grants = [
    grant({ grant_id: 'a', amount: 500, pcs_subject: ['SB01'] }),
    grant({ grant_id: 'b', amount: 500, pcs_subject: ['SC01'], geo_state: 'NY' }),
  ];
  const profile = buildProfile(grants, { strategy: { subject: { priorities: ['SB'] } } });

  assert.ok(!('impact' in profile));
  assert.ok(!('impactScore' in profile));
  assert.equal(profile.totals.grantCount, 2);
  assert.equal(profile.totals.totalDollars, 1000);
  assert.ok(Math.abs(profile.alignment.dimensions.subject.value.score - 0.5) < 1e-9);
  assert.equal(profile.alignment.dimensions.population.suppressed, true);
  assert.ok(profile.practice.subjectConcentration.hhi > 0);
});

test('completeness report flags sparse PCS fields', () => {
  const grants = [grant({ pcs_population: [] }), grant({ grant_id: 'b', pcs_population: [] })];
  const report = completenessReport(grants);
  const flag = report.flags.find((f) => f.field === 'pcs_population');
  assert.ok(flag);
  assert.equal(flag.level, 'blocking');
});
