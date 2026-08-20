/**
 * Ingestion tests: parsers, column mapping, and the end-to-end path from a
 * real file on disk to a profile.
 *
 * BUILD_SPEC Phase 1 exit: profileFromRows(parseCsv(file), mapping) returns a
 * valid profile for all three sample files.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

import { parseCsv, sniffDelimiter, toCsv } from '../src/ingestion/parsers/csv.js';
import { parseJson } from '../src/ingestion/parsers/json.js';
import { parseExcel, parseWorkbook } from '../src/ingestion/parsers/excel.js';
import { readZip } from '../src/ingestion/parsers/zip.js';
import { suggestMapping, inferColumnType, missingRequired, isMappingComplete } from '../src/ingestion/mapping.js';
import { profileFromRows } from '../src/core/index.js';
import { normalizeGrant } from '../src/core/schema.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const sample = (name) => readFileSync(resolve(HERE, '../sample_data', name), 'utf8');

/* ── CSV ── */

test('quoted fields, escaped quotes and embedded newlines survive', () => {
  const { headers, rows } = parseCsv('a,b,c\n"1,000","He said ""hi""","multi\nline"\n');
  assert.deepEqual(headers, ['a', 'b', 'c']);
  assert.equal(rows[0].a, '1,000');
  assert.equal(rows[0].b, 'He said "hi"');
  assert.equal(rows[0].c, 'multi\nline');
});

test('delimiter is sniffed by column consistency, not by counting commas', () => {
  assert.equal(sniffDelimiter('a;b;c\n1;2;3\n'), ';');
  assert.equal(sniffDelimiter('a\tb\n1\t2\n'), '\t');
  assert.equal(sniffDelimiter('a|b\n1|2\n'), '|');
  // Prose full of commas inside one quoted column must not win the vote.
  assert.equal(sniffDelimiter('name;purpose\nOrg;"food, shelter, and legal aid"\n'), ';');
});

test('a UTF-8 BOM and duplicate or empty headers are handled', () => {
  const { headers } = parseCsv('﻿a,a,\n1,2,3\n');
  assert.deepEqual(headers, ['a', 'a (2)', 'Column 3']);
});

test('short and long rows are padded and truncated to the header width', () => {
  const { rows } = parseCsv('a,b\n1\n1,2,3\n');
  assert.deepEqual(rows[0], { a: '1', b: '' });
  assert.deepEqual(rows[1], { a: '1', b: '2' });
});

test('empty input yields no headers rather than throwing', () => {
  assert.deepEqual(parseCsv(''), { headers: [], rows: [], delimiter: ',' });
  assert.deepEqual(parseCsv('   \n  \n').rows, []);
});

test('toCsv round-trips values that need quoting', () => {
  const text = toCsv(['a', 'b'], [['x,y', 'he said "hi"']]);
  assert.equal(parseCsv(text).rows[0].a, 'x,y');
  assert.equal(parseCsv(text).rows[0].b, 'he said "hi"');
});

/* ── JSON ── */

test('JSON accepts a bare array, an envelope, and NDJSON', () => {
  assert.equal(parseJson('[{"x":1}]').rows.length, 1);
  assert.equal(parseJson('{"grants":[{"x":1},{"x":2}]}').rows.length, 2);
  assert.equal(parseJson('{"x":1}\n{"x":2}\n').rows.length, 2);
  assert.equal(parseJson([{ x: 1 }]).rows.length, 1, 'already-parsed data passes through');
});

test('nested JSON objects are flattened into addressable column names', () => {
  const { headers, rows } = parseJson('[{"amount":5,"funder":{"name":"Ford","ein":"1"}}]');
  assert.deepEqual(headers, ['amount', 'funder.name', 'funder.ein']);
  assert.equal(rows[0]['funder.name'], 'Ford');
});

test('sparse JSON records are unioned so every key becomes a column', () => {
  const { headers, rows } = parseJson('[{"a":1},{"b":2}]');
  assert.deepEqual(headers, ['a', 'b']);
  assert.equal(rows[0].b, '');
  assert.equal(rows[1].a, '');
});

test('ambiguous or invalid JSON is refused with a usable message', () => {
  assert.throws(() => parseJson('{"a":[1],"b":[2]}'), /Ambiguous JSON/);
  assert.throws(() => parseJson('[1,2'), /Invalid JSON/);
  assert.throws(() => parseJson('{"a":1}'), /array of grant objects/);
});

/* ── Excel ── */

test('a workbook round-trips through the ZIP and sheet readers', async () => {
  // Built by hand rather than fixtured, so the test owns its own input.
  const xlsx = buildMinimalXlsx();
  assert.ok((await readZip(xlsx)).has('xl/workbook.xml'));

  const { sheetNames } = await parseWorkbook(xlsx);
  assert.deepEqual(sheetNames, ['Grants']);

  const { headers, rows } = await parseExcel(xlsx);
  assert.deepEqual(headers, ['funder', 'amount']);
  assert.deepEqual(rows, [{ funder: 'Ford', amount: '1000' }, { funder: 'Mellon', amount: '2500' }]);
});

test('a non-workbook is rejected clearly', async () => {
  await assert.rejects(() => parseWorkbook(Buffer.from('not a zip at all')), /Not a ZIP archive/);
});

test('a DEFLATE-compressed entry inflates', async () => {
  // The real PCS workbook is deflated, not stored; the stored-only fixture
  // above would not exercise the inflate path at all.
  const { deflateRawSync } = await import('node:zlib');
  const xlsx = buildMinimalXlsx({ compress: (buf) => deflateRawSync(buf) });
  const { rows } = await parseExcel(xlsx);
  assert.deepEqual(rows[0], { funder: 'Ford', amount: '1000' });
});

/* ── Column mapping ── */

test('unfamiliar headers map onto canonical fields', () => {
  const headers = ['Grant Number', 'Foundation Name', 'Grantee', 'Award Amount ($USD)', 'Date Awarded', 'NTEE Code', 'Grant Purpose', 'Internal Notes'];
  const rows = [{
    'Grant Number': 'G-1', 'Foundation Name': 'Ford', Grantee: 'Org A',
    'Award Amount ($USD)': '$1,250,000', 'Date Awarded': '2024-03-01',
    'NTEE Code': 'SB050200', 'Grant Purpose': 'General support', 'Internal Notes': 'reviewed',
  }];
  const { mapping, confidence, unmapped } = suggestMapping(headers, rows);

  assert.equal(mapping.grant_id, 'Grant Number');
  assert.equal(mapping.funder_name, 'Foundation Name');
  assert.equal(mapping.recipient_name, 'Grantee');
  assert.equal(mapping.amount, 'Award Amount ($USD)');
  assert.equal(mapping.award_date, 'Date Awarded');
  assert.equal(mapping.pcs_subject, 'NTEE Code');
  assert.equal(mapping.description, 'Grant Purpose');
  assert.deepEqual(unmapped, ['Internal Notes']);
  assert.ok(confidence.amount > 0.5 && confidence.amount <= 1);
  assert.ok(isMappingComplete(mapping));
});

test('one column is never claimed by two fields', () => {
  const { mapping } = suggestMapping(['grant type', 'grant amount', 'grant date'], []);
  const used = Object.values(mapping);
  assert.equal(new Set(used).size, used.length);
});

test('missingRequired names the fields that block ingestion', () => {
  const { mapping } = suggestMapping(['recipient', 'purpose'], []);
  assert.deepEqual(missingRequired(mapping).sort(), ['amount', 'award_date', 'grant_id'].sort());
  assert.equal(isMappingComplete(mapping), false);
});

test('column type inference separates codes, dates, numbers and text', () => {
  assert.equal(inferColumnType(['$1,000', '2,500', '(300)']), 'number');
  assert.equal(inferColumnType(['2024-01-01', '12/31/2024']), 'date');
  assert.equal(inferColumnType(['Dec 31, 2024', 'Jan 1, 2025']), 'date');
  assert.equal(inferColumnType(['SB050200', 'SB05; SC01']), 'code');
  assert.equal(inferColumnType(['G-1', 'G-2']), 'text', 'an identifier is not a date');
  assert.equal(inferColumnType([]), 'text');
});

test('values break a header tie when the header lies', () => {
  // Named like a date, holding money: the type check should cost it the match.
  const honest = suggestMapping(['amount'], [{ amount: '$5,000' }]);
  const lying = suggestMapping(['amount'], [{ amount: '2024-01-01' }]);
  assert.ok(honest.confidence.amount > lying.confidence.amount);
});

/* ── End to end: BUILD_SPEC Phase 1 exit criterion ── */

const profileFor = (file) => {
  const { headers, rows } = parseCsv(sample(file));
  const { mapping } = suggestMapping(headers, rows);
  return { profile: profileFromRows(rows, mapping), mapping, rows, headers };
};

test('pcs-coded-sample.csv produces a complete profile', () => {
  const { profile, mapping } = profileFor('pcs-coded-sample.csv');
  assert.ok(isMappingComplete(mapping));
  assert.equal(profile.ingestion.problems.length, 0, 'a clean file should have no problems');
  assert.equal(profile.totals.grantCount, 120);
  assert.ok(profile.totals.totalDollars > 0);
  assert.ok(profile.practice.subjectConcentration.attributedDollars > 0);
  assert.equal(profile.practice.multiYear.suppressed, false);
  assert.ok(profile.practice.grantSize.median > 0);
  assert.ok(!('impact' in profile) && !('impactScore' in profile));
});

test('fractional attribution holds on real multi-coded sample rows', () => {
  const { profile } = profileFor('pcs-coded-sample.csv');
  const shares = [...profile.practice.subjectConcentration.shares.values()];
  assert.ok(Math.abs(shares.reduce((a, b) => a + b, 0) - 1) < 1e-9, 'subject shares must sum to 1');
});

test('uncoded-sample.csv ingests cleanly and suppresses what it cannot support', () => {
  const { profile, mapping } = profileFor('uncoded-sample.csv');
  assert.ok(isMappingComplete(mapping));
  assert.equal(profile.ingestion.problems.length, 0);
  assert.equal(profile.totals.grantCount, 80);

  // No PCS codes anywhere, so the gated metrics must refuse rather than guess.
  assert.equal(profile.practice.flexibility.suppressed, true);
  assert.match(profile.practice.flexibility.reason, /below the 70% threshold/);
  assert.equal(profile.practice.multiYear.suppressed, true);

  const blocking = profile.dataQuality.flags.filter((f) => f.level === 'blocking').map((f) => f.field);
  assert.ok(blocking.includes('pcs_subject'));
  // Dollar-denominated measures do not depend on coding and still work.
  assert.ok(profile.practice.grantSize.median > 0);
});

test('messy-sample.csv reports every defect rather than dropping it', () => {
  const { profile, rows } = profileFor('messy-sample.csv');
  assert.equal(rows.length, 12);

  const problems = profile.ingestion.problems;
  const issuesFor = (needle) => problems.filter((p) => p.issues.some((i) => i.includes(needle)));

  // Rows missing a required field are quarantined, not silently discarded.
  const rejected = problems.filter((p) => !p.warningOnly);
  assert.equal(profile.ingestion.accepted + rejected.length, 12, 'every row is either accepted or quarantined');
  assert.ok(rejected.length > 0);

  assert.ok(issuesFor('recipient_name').length > 0, 'blank recipient reported');
  assert.ok(issuesFor('award_date').length > 0, 'missing and ambiguous dates reported');
  assert.ok(issuesFor('unparseable number').length > 0, 'non-numeric amount reported');
  assert.ok(issuesFor('non-positive').length >= 2, 'the negative and the zero are both flagged');

  // A duplicate grant_id is a warning on the dataset, not a row rejection.
  const dupeFlag = profile.dataQuality.flags.find((f) => f.field === 'grant_id');
  assert.ok(dupeFlag && /duplicate/.test(dupeFlag.message));
});

test('messy amounts and dates are coerced to the right values', () => {
  const { profile } = profileFor('messy-sample.csv');
  // $1,250,000 with symbol and separators; 1.2e5 in scientific notation;
  // "  62,500  " padded. All three must survive into the totals.
  assert.ok(profile.totals.totalDollars > 2_000_000);

  const { rows, mapping } = profileFor('messy-sample.csv');
  const byId = (id) => rows.find((r) => r['Grant ID'] === id);

  assert.equal(normalizeGrant(byId('MG-001'), mapping).record.amount, 1250000);
  assert.equal(normalizeGrant(byId('MG-006'), mapping).record.amount, 120000);
  assert.equal(normalizeGrant(byId('MG-010'), mapping).record.amount, 62500);

  // Both spellings of 31 December 2024 land on the same instant.
  const slash = normalizeGrant(byId('MG-004'), mapping).record.award_date;
  assert.equal(slash.toISOString(), '2024-12-31T00:00:00.000Z');
});

test('a reversed grant period yields a null term, not a negative one', () => {
  const { rows, mapping } = profileFor('messy-sample.csv');
  const reversed = rows.find((r) => r['Grant ID'] === 'MG-012');
  assert.equal(normalizeGrant(reversed, mapping).record.duration_months, null);
});

/* ── helper: a hand-built minimal xlsx ── */

function buildMinimalXlsx({ compress } = {}) {
  const files = [
    ['[Content_Types].xml',
      '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
      '<Default Extension="xml" ContentType="application/xml"/></Types>'],
    ['_rels/.rels',
      '<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>'],
    ['xl/workbook.xml',
      '<?xml version="1.0"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" ' +
      'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">' +
      '<sheets><sheet name="Grants" sheetId="1" r:id="rId1"/></sheets></workbook>'],
    ['xl/_rels/workbook.xml.rels',
      '<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>'],
    ['xl/worksheets/sheet1.xml',
      '<?xml version="1.0"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>' +
      '<row r="1"><c r="A1" t="inlineStr"><is><t>funder</t></is></c><c r="B1" t="inlineStr"><is><t>amount</t></is></c></row>' +
      '<row r="2"><c r="A2" t="inlineStr"><is><t>Ford</t></is></c><c r="B2"><v>1000</v></c></row>' +
      '<row r="3"><c r="A3" t="inlineStr"><is><t>Mellon</t></is></c><c r="B3"><v>2500</v></c></row>' +
      '</sheetData></worksheet>'],
  ];
  return zipStore(files, compress);
}

/** Build a zip, stored by default or DEFLATE-compressed when given a compressor. */
function zipStore(entries, compress) {
  const crcTable = (() => {
    const t = new Int32Array(256);
    for (let n = 0; n < 256; n += 1) {
      let c = n;
      for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      t[n] = c;
    }
    return t;
  })();
  const crc32 = (buf) => {
    let c = -1;
    for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8);
    return (c ^ -1) >>> 0;
  };

  const locals = [];
  const centrals = [];
  let offset = 0;

  for (const [name, content] of entries) {
    const nameBuf = Buffer.from(name, 'utf8');
    const uncompressed = Buffer.from(content, 'utf8');
    const data = compress ? compress(uncompressed) : uncompressed;
    const method = compress ? 8 : 0;
    const crc = crc32(uncompressed);

    const local = Buffer.alloc(30 + nameBuf.length);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(method, 8);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(uncompressed.length, 22);
    local.writeUInt16LE(nameBuf.length, 26);
    nameBuf.copy(local, 30);
    locals.push(local, data);

    const central = Buffer.alloc(46 + nameBuf.length);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(method, 10);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(data.length, 20);
    central.writeUInt32LE(uncompressed.length, 24);
    central.writeUInt16LE(nameBuf.length, 28);
    central.writeUInt32LE(offset, 42);
    nameBuf.copy(central, 46);
    centrals.push(central);

    offset += local.length + data.length;
  }

  const centralBuf = Buffer.concat(centrals);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(entries.length, 8);
  eocd.writeUInt16LE(entries.length, 10);
  eocd.writeUInt32LE(centralBuf.length, 12);
  eocd.writeUInt32LE(offset, 16);

  return Buffer.concat([...locals, centralBuf, eocd]);
}
