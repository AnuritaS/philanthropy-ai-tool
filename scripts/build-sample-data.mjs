/**
 * Generate the three sample files used by the ingestion tests and demos.
 *
 *   node scripts/build-sample-data.mjs
 *
 * Deterministic: a fixed seed so committed fixtures never churn. PCS codes are
 * drawn from the pinned taxonomy rather than invented, so the samples stay
 * valid against lookup() and ancestry.
 */

import { writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

import { lookup } from '../src/taxonomy/index.js';
import { toCsv } from '../src/ingestion/parsers/csv.js';

const OUT = resolve(dirname(fileURLToPath(import.meta.url)), '../sample_data');
mkdirSync(OUT, { recursive: true });

let seed = 20241101;
const rng = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
const pick = (arr) => arr[Math.floor(rng() * arr.length)];
const money = (min, max) => Math.round((min + rng() * (max - min)) / 1000) * 1000;

const FUNDERS = [
  { name: 'Cascadia Community Trust', ein: '91-1234567' },
  { name: 'Merrivale Foundation', ein: '13-7654321' },
  { name: 'Ostrander Family Fund', ein: '45-2468013' },
];

const RECIPIENTS = [
  ['Northside Youth Collective', '94-1112223'], ['Riverbend Housing Alliance', '94-2223334'],
  ['Clearwater Conservation Trust', '94-3334445'], ['Harbor Health Partners', '94-4445556'],
  ['Foothills Literacy Project', '94-5556667'], ['Delta Arts Coalition', '94-6667778'],
  ['Prairie Food Network', '94-7778889'], ['Meridian Legal Aid', '94-8889990'],
];

/* Real PCS codes, verified against the pinned taxonomy below. */
const SUBJECTS = ['SB050200', 'SB020000', 'SC010000', 'SE000000', 'SJ000000', 'SR000000', 'SD000000'];
const POPULATIONS = ['PA010000', 'PA020000', 'PC010000', 'PC040000', 'PD010000', 'PB000000'];
const STRATEGIES = ['UA000000', 'UB000000', 'UC000000', 'UD010000'];
const TRANSACTIONS = ['TA000000', 'TC000000', 'TB000000'];
const STATES = ['CA', 'OR', 'WA', 'NY', 'MI', 'TX'];

for (const [facet, codes] of [
  ['subjects', SUBJECTS], ['populations', POPULATIONS],
  ['support-strategy', STRATEGIES], ['transaction-type', TRANSACTIONS],
]) {
  for (const c of codes) {
    if (!lookup(facet, c)) throw new Error(`Sample data uses ${c}, which is not in the pinned ${facet} facet.`);
  }
}

const iso = (y, m, d) => `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;

/* ── 1. PCS-coded sample: a clean export from a funder that codes its grants ── */

const codedHeaders = [
  'Grant ID', 'Funder Name', 'Funder EIN', 'Grantee', 'Grantee EIN', 'Award Amount',
  'Date Awarded', 'Period Start', 'Period End', 'PCS Subject', 'PCS Population',
  'Support Strategy', 'Transaction Type', 'State', 'City', 'Grant Purpose',
];

const codedRows = [];
for (let i = 0; i < 120; i += 1) {
  const funder = FUNDERS[i % FUNDERS.length];
  const [recipient, ein] = pick(RECIPIENTS);
  const year = 2021 + Math.floor(rng() * 4);
  const month = 1 + Math.floor(rng() * 12);
  const termYears = pick([1, 1, 2, 3]);
  // Multi-coded on roughly a third of grants, to exercise fractional attribution.
  const subject = rng() < 0.33 ? `${pick(SUBJECTS)}; ${pick(SUBJECTS)}` : pick(SUBJECTS);

  codedRows.push([
    `CG-${String(1000 + i)}`, funder.name, funder.ein, recipient, ein,
    money(15000, 900000), iso(year, month, 15), iso(year, month, 1),
    iso(year + termYears, month, 1), subject, pick(POPULATIONS),
    pick(STRATEGIES), pick(TRANSACTIONS), pick(STATES), pick(['Portland', 'Oakland', 'Seattle', 'Detroit']),
    pick([
      'General operating support for core programs.',
      'Project support for a two-year expansion of direct services.',
      'Capacity building: financial systems and staff development.',
      'Support for policy research and community organizing.',
    ]),
  ]);
}
writeFileSync(resolve(OUT, 'pcs-coded-sample.csv'), toCsv(codedHeaders, codedRows));

/* ── 2. Uncoded sample: the common case — free text, no PCS anywhere ──
   Phase 3's classifier is what turns this into a codeable portfolio. Until
   then it must ingest cleanly and honestly suppress the PCS-dependent metrics. */

const uncodedHeaders = ['grant_no', 'foundation', 'organization', 'amount', 'date', 'purpose', 'state'];
const PURPOSES = [
  'To support undergraduate scholarships for first-generation students',
  'For general operating support of a community health clinic',
  'To expand affordable housing development in the east district',
  'Support for watershed restoration and salmon habitat monitoring',
  'For legal representation of tenants facing eviction',
  'To fund a mobile food pantry serving rural households',
  'General support for youth arts programming',
  'For capacity building and executive leadership transition',
];
const uncodedRows = [];
for (let i = 0; i < 80; i += 1) {
  const funder = FUNDERS[i % FUNDERS.length];
  const [recipient] = pick(RECIPIENTS);
  uncodedRows.push([
    `U-${2000 + i}`, funder.name, recipient, money(5000, 400000),
    iso(2022 + Math.floor(rng() * 3), 1 + Math.floor(rng() * 12), 1 + Math.floor(rng() * 28)),
    pick(PURPOSES), pick(STATES),
  ]);
}
writeFileSync(resolve(OUT, 'uncoded-sample.csv'), toCsv(uncodedHeaders, uncodedRows));

/* ── 3. Messy sample: every defect BUILD_SPEC Phase 1 step 6 names, plus a few
   that real exports actually contain. Each row is annotated in the Notes
   column so a failing assertion is traceable to an intended defect. ── */

const messyHeaders = [
  'Grant ID', 'Funder', 'Grantee', 'Amount', 'Award Date', 'Start', 'End',
  'Subject', 'Transaction Type', 'State', 'Purpose', 'Notes',
];
const messyRows = [
  ['MG-001', 'Cascadia Community Trust', 'Northside Youth Collective', '$1,250,000', '2024-01-15', '2024-01-01', '2026-01-01', 'SB050200', 'TA000000', 'CA', 'Scholarship endowment', 'currency symbol and thousands separators'],
  ['MG-002', 'Cascadia Community Trust', 'Riverbend Housing Alliance', '(5000)', '2024-02-01', '2024-02-01', '2025-02-01', 'SJ000000', 'TA000000', 'OR', 'Refunded portion of prior award', 'parenthesized negative'],
  ['MG-003', 'Cascadia Community Trust', '', '75000', '2024-03-01', '', '', 'SC010000', 'TA000000', 'WA', 'Recipient withheld', 'blank recipient: required field'],
  ['MG-004', 'Merrivale Foundation', 'Clearwater Conservation Trust', '250000', '12/31/2024', '12/31/2024', '12/31/2026', 'SE000000', 'TA000000', 'CA', 'Habitat restoration', 'US slash date'],
  ['MG-004', 'Merrivale Foundation', 'Harbor Health Partners', '180000', '2024-12-31', '2024-12-31', '2025-12-31', 'SD000000', 'TA000000', 'NY', 'Clinic operations', 'duplicate grant id, ISO date'],
  ['MG-006', 'Merrivale Foundation', 'Foothills Literacy Project', '1.2e5', '2023-06-15', '2023-06-15', '2024-06-15', 'SB020000', 'TC000000', 'MI', 'Tutoring programme', 'scientific notation amount'],
  ['MG-007', 'Merrivale Foundation', 'Delta Arts Coalition', 'not disclosed', '2023-07-01', '', '', 'SR000000', 'TA000000', 'TX', 'Confidential award', 'unparseable amount'],
  ['MG-008', 'Ostrander Family Fund', 'Prairie Food Network', '45000', '31/12/2024', '', '', 'SJ000000', 'TA000000', 'OR', 'Mobile pantry', 'ambiguous day-first date: rejected, not guessed'],
  ['MG-009', 'Ostrander Family Fund', 'Meridian Legal Aid', '90000', '', '2024-01-01', '2024-07-01', 'SC010000', 'TA000000', 'WA', 'Eviction defense', 'missing award date: required field'],
  ['MG-010', 'Ostrander Family Fund', 'Northside Youth Collective', '  62,500  ', 'Mar 1, 2024', '2024-03-01', '2027-03-01', 'sb050200; SE000000', 'TA000000', 'ca', 'Youth programming', 'padded amount, textual date, lowercase multi-codes'],
  ['MG-011', 'Ostrander Family Fund', 'Harbor Health Partners', '0', '2024-04-01', '', '', 'SD000000', 'TA000000', 'NY', 'Zero-dollar administrative record', 'non-positive amount'],
  ['MG-012', 'Ostrander Family Fund', 'Clearwater Conservation Trust', '310000', '2024-05-01', '2026-05-01', '2024-05-01', 'SE000000', 'TA000000', 'CA', 'Reversed period', 'end before start: duration must be null, not negative'],
];
writeFileSync(resolve(OUT, 'messy-sample.csv'), toCsv(messyHeaders, messyRows));

process.stdout.write(
  `pcs-coded-sample.csv  ${codedRows.length} rows\n` +
  `uncoded-sample.csv    ${uncodedRows.length} rows\n` +
  `messy-sample.csv      ${messyRows.length} rows (each with a documented defect)\n`,
);
