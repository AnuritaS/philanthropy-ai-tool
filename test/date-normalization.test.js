/**
 * Regression tests for calendar-date normalization.
 *
 * `new Date()` reads '2024-12-31' as UTC midnight and '12/31/2024' as *local*
 * midnight. Two spellings of one calendar day therefore landed hours apart,
 * which is enough to push a year-end grant into the wrong reporting period
 * once dollars are aggregated by year.
 *
 * These tests must hold in every timezone; the suite is run under several in
 * CI-equivalent form. core.test.js is unmodified, per BUILD_SPEC section 6.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { normalizeGrant, deriveDurationMonths } from '../src/core/schema.js';

const dateOf = (raw) =>
  normalizeGrant({ grant_id: '1', recipient_name: 'Org', amount: 1, award_date: raw }).record.award_date;

const DEC_31_2024 = Date.UTC(2024, 11, 31);

/* ── the reported drift ── */

test('every spelling of one calendar day resolves to the same instant', () => {
  const spellings = ['2024-12-31', '12/31/2024', '2024/12/31', 'Dec 31, 2024', 'December 31, 2024'];
  const instants = spellings.map((s) => dateOf(s).getTime());

  for (let i = 0; i < spellings.length; i += 1) {
    assert.equal(instants[i], DEC_31_2024, `${spellings[i]} drifted from UTC midnight`);
  }
  assert.equal(new Set(instants).size, 1, 'all spellings must agree');
});

test('a year-end date keeps its calendar year in UTC', () => {
  // The failure this prevents: local-midnight parsing of '12/31/2024' west of
  // UTC yields 2025-01-01T05:00Z, moving the grant into the following year.
  for (const s of ['2024-12-31', '12/31/2024', 'Dec 31, 2024']) {
    assert.equal(dateOf(s).getUTCFullYear(), 2024, `${s} landed in the wrong year`);
    assert.equal(dateOf(s).getUTCMonth(), 11);
    assert.equal(dateOf(s).getUTCDate(), 31);
  }
});

test('a new-year date keeps its calendar year in UTC', () => {
  // The mirror failure, east of UTC: '01/01/2024' as local midnight can read
  // back as 2023-12-31.
  for (const s of ['2024-01-01', '01/01/2024', '1/1/2024', 'Jan 1, 2024']) {
    assert.equal(dateOf(s).getUTCFullYear(), 2024, `${s} landed in the wrong year`);
    assert.equal(dateOf(s).getUTCMonth(), 0);
    assert.equal(dateOf(s).getUTCDate(), 1);
  }
});

/* ── genuine instants are left alone ── */

test('values carrying a time or an explicit zone are preserved, not flattened', () => {
  assert.equal(dateOf('2024-12-31T14:30:00Z').toISOString(), '2024-12-31T14:30:00.000Z');
  assert.equal(dateOf('2024-12-31T09:30:00-05:00').toISOString(), '2024-12-31T14:30:00.000Z');
});

test('an existing Date instance passes through untouched', () => {
  const d = new Date('2024-06-15T12:00:00Z');
  assert.equal(dateOf(d).getTime(), d.getTime());
});

test('epoch milliseconds are accepted', () => {
  assert.equal(dateOf(DEC_31_2024).getTime(), DEC_31_2024);
});

/* ── invalid input is reported, never silently rolled over ── */

test('impossible calendar dates are rejected rather than rolling into next month', () => {
  // Date.UTC(2024, 1, 31) silently yields March 2. Both spellings must refuse.
  for (const s of ['2024-02-31', '2/31/2024']) {
    assert.equal(dateOf(s), null, `${s} should not parse`);
  }
});

test('unparseable dates are reported as issues, not dropped', () => {
  const { record, issues } = normalizeGrant({
    grant_id: '1', recipient_name: 'Org', amount: 1, award_date: '31/12/2024',
  });
  assert.equal(record.award_date, null);
  assert.ok(issues.some((i) => i.includes('unparseable date')));
  assert.ok(issues.some((i) => i.includes('missing required field: award_date')));
});

test('blank dates are missing, not unparseable', () => {
  const { issues } = normalizeGrant({ grant_id: '1', recipient_name: 'Org', amount: 1, award_date: '' });
  assert.ok(issues.some((i) => i.includes('missing required field: award_date')));
  assert.ok(!issues.some((i) => i.includes('unparseable')));
});

/* ── duration reads the same clock the dates are stored on ── */

test('duration is exact across a year boundary regardless of spelling', () => {
  const cases = [
    [['2023-01-01', '2026-01-01'], 36],
    [['1/1/2023', '1/1/2026'], 36],
    [['2024-01-31', '2024-12-31'], 11],
    [['12/31/2024', '12/31/2025'], 12],
  ];
  for (const [[start, end], expected] of cases) {
    const { record } = normalizeGrant({
      grant_id: '1', recipient_name: 'Org', amount: 1,
      award_date: start, start_date: start, end_date: end,
    });
    assert.equal(record.duration_months, expected, `${start} → ${end}`);
  }
});

test('mixed spellings on the two endpoints still derive the same term', () => {
  const { record } = normalizeGrant({
    grant_id: '1', recipient_name: 'Org', amount: 1,
    award_date: '2024-01-01', start_date: '1/1/2024', end_date: '2026-01-01',
  });
  assert.equal(record.duration_months, 24);
});

test('an explicit duration_months still wins over the derived one', () => {
  assert.equal(
    deriveDurationMonths({ duration_months: 18, start_date: new Date('2024-01-01'), end_date: new Date('2026-01-01') }),
    18,
  );
});

test('a term with a missing endpoint is null, not a guess', () => {
  assert.equal(deriveDurationMonths({ duration_months: null, start_date: new Date('2024-01-01'), end_date: null }), null);
});
