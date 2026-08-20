/**
 * Convert Candid's PCS release workbook into the pinned JSON facets.
 *
 *   node scripts/build-pcs-taxonomy.mjs [path/to/PCS_Taxonomy_Definitions_2024.xlsx]
 *
 * With no argument it downloads the current release. The output is committed,
 * so this only needs rerunning when the pinned release changes — at which
 * point every peer distribution must be recomputed (METHODOLOGY section 10).
 */

import { writeFileSync, readFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

import { parseWorkbook } from '../src/ingestion/parsers/excel.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = resolve(HERE, '../src/taxonomy/pcs');

const SOURCE_URL =
  'https://taxonomy.candid.org/content/download/1672237/34431192/file/PCS_Taxonomy_Definitions_2024.xlsx';
const SOURCE_PAGE = 'https://taxonomy.candid.org/resources/downloads';
const RELEASE = 'November 2024';

/** sheet name -> output file. OrgType is skipped: no schema field consumes it. */
const FACETS = [
  { sheet: 'Subject', file: 'subjects.json', facet: 'subjects', prefix: 'S' },
  { sheet: 'Population', file: 'populations.json', facet: 'populations', prefix: 'P' },
  { sheet: 'Strategy', file: 'support-strategy.json', facet: 'support-strategy', prefix: 'U' },
  { sheet: 'Transaction', file: 'transaction-type.json', facet: 'transaction-type', prefix: 'T' },
];

const CODE_RE = /^[A-Z]{2}\d{6}$/;

/**
 * Discrepancies in Candid's own workbook, verified by hand against the code
 * definitions. Listing them keeps the integrity check loud about anything new
 * while not failing the build on a known upstream slip.
 */
const KNOWN_SOURCE_QUIRKS = [
  {
    facet: 'transaction-type',
    code: 'TA010000',
    note:
      'Labelled in the "Level 1" column but coded as a level-2 child of TA000000 (Cash grants). ' +
      'The definition — "Block grants are grants awarded by the federal government..." — confirms it ' +
      'is a kind of cash grant, so the code is authoritative and the column is a source typo.',
  },
];

/**
 * PCS codes are fixed-width: a two-character facet/level-1 prefix followed by
 * three two-digit pairs. Depth is one plus however many pairs are non-zero,
 * and a parent is the same code with its deepest pair zeroed.
 */
function levelFromCode(code) {
  const pairs = [code.slice(2, 4), code.slice(4, 6), code.slice(6, 8)];
  let level = 1;
  for (const p of pairs) {
    if (p === '00') break;
    level += 1;
  }
  return level;
}

function parentOf(code) {
  const level = levelFromCode(code);
  if (level === 1) return null;
  const cut = 2 + (level - 2) * 2;
  return code.slice(0, cut) + '00'.repeat((8 - cut) / 2);
}

function buildFacet(grid, { sheet, prefix }) {
  const headers = grid[0].map((h) => h.trim());
  const allTermsIdx = headers.findIndex((h) => /^all terms$/i.test(h));
  const definitionIdx = headers.findIndex((h) => /^definitions/i.test(h));
  const formerIdx = headers.findIndex((h) => /former/i.test(h));
  if (allTermsIdx === -1) throw new Error(`${sheet}: no "All Terms" column`);

  // The hierarchy columns sit between the former-code column and All Terms.
  const levelCols = [];
  for (let i = formerIdx + 1; i < allTermsIdx; i += 1) levelCols.push(i);

  const nodes = [];
  const problems = [];

  for (const row of grid.slice(1)) {
    const code = (row[0] || '').trim().toUpperCase();
    if (!CODE_RE.test(code)) continue;
    if (!code.startsWith(prefix)) {
      problems.push(`${code}: unexpected prefix for ${sheet}`);
      continue;
    }

    const label = (row[allTermsIdx] || '').trim();
    const definition = definitionIdx === -1 ? '' : (row[definitionIdx] || '').trim();
    const level = levelFromCode(code);

    // Cross-check the arithmetic against the sheet's own indentation columns.
    const filled = levelCols.findIndex((c) => (row[c] || '').trim() !== '');
    if (filled !== -1 && filled + 1 !== level) {
      problems.push(`${code}: code implies level ${level}, sheet column implies ${filled + 1}`);
    }
    if (!label) problems.push(`${code}: no label`);

    nodes.push({
      code,
      label,
      parent: parentOf(code),
      definition,
      level,
      formerCode: formerIdx === -1 ? null : (row[formerIdx] || '').trim() || null,
    });
  }

  // Every declared parent must exist, or ancestry walks break at runtime.
  const known = new Set(nodes.map((n) => n.code));
  for (const n of nodes) {
    if (n.parent && !known.has(n.parent)) problems.push(`${n.code}: parent ${n.parent} is not in the facet`);
  }

  return { nodes, problems };
}

async function loadWorkbook(argPath) {
  if (argPath) return readFileSync(resolve(argPath));
  process.stdout.write(`Downloading ${SOURCE_URL}\n`);
  const res = await fetch(SOURCE_URL);
  if (!res.ok) throw new Error(`Download failed: HTTP ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

const buffer = await loadWorkbook(process.argv[2]);
const { sheets, sheetNames } = parseWorkbook(buffer);
mkdirSync(OUT_DIR, { recursive: true });

let totalProblems = 0;
const counts = {};

for (const spec of FACETS) {
  const grid = sheets[spec.sheet];
  if (!grid) throw new Error(`Sheet "${spec.sheet}" missing. Found: ${sheetNames.join(', ')}`);

  const { nodes, problems } = buildFacet(grid, spec);
  counts[spec.facet] = nodes.length;

  const knownForFacet = KNOWN_SOURCE_QUIRKS.filter((q) => q.facet === spec.facet).map((q) => q.code);
  const unexpected = problems.filter((p) => !knownForFacet.some((code) => p.startsWith(`${code}:`)));
  const acknowledged = problems.length - unexpected.length;
  totalProblems += unexpected.length;

  writeFileSync(resolve(OUT_DIR, spec.file), `${JSON.stringify(nodes, null, 2)}\n`);
  const byLevel = nodes.reduce((acc, n) => ({ ...acc, [n.level]: (acc[n.level] ?? 0) + 1 }), {});
  process.stdout.write(
    `${spec.file.padEnd(22)} ${String(nodes.length).padStart(4)} codes  levels ${JSON.stringify(byLevel)}` +
      `${acknowledged ? `  (${acknowledged} known source quirk)` : ''}` +
      `${unexpected.length ? `  ${unexpected.length} UNEXPECTED` : ''}\n`,
  );
  for (const p of unexpected.slice(0, 10)) process.stdout.write(`    ! ${p}\n`);
}

writeFileSync(
  resolve(OUT_DIR, 'version.json'),
  `${JSON.stringify(
    {
      release: RELEASE,
      retrievedAt: new Date().toISOString().slice(0, 10),
      sourceUrl: SOURCE_URL,
      sourcePage: SOURCE_PAGE,
      license: 'CC BY 4.0',
      licenseUrl: 'https://creativecommons.org/licenses/by/4.0/',
      attribution: 'Philanthropy Classification System, Candid (https://candid.org)',
      counts,
      knownSourceQuirks: KNOWN_SOURCE_QUIRKS,
    },
    null,
    2,
  )}\n`,
);

if (totalProblems) {
  process.stdout.write(`\n${totalProblems} unexpected integrity problem(s) — see above.\n`);
  process.exitCode = 1;
} else {
  process.stdout.write('\nIntegrity checks passed (parent chains resolve, code depth matches sheet indentation).\n');
}
