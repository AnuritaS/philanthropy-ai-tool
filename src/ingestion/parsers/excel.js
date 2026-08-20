/**
 * .xlsx reader.
 *
 * Produces the same shape as the CSV and JSON parsers: a header row plus rows
 * of strings, so ingestion downstream never knows which format it came from.
 *
 * Dependency-free by design. SheetJS is the usual choice, but the whole job
 * here is "read a sheet of cells", and an xlsx is a ZIP of XML that Node's own
 * zlib can already open.
 */

import { readZip } from './zip.js';
import { dedupeHeaders, toRecords } from './records.js';

const MAIN_NS = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';

/* Excel serial dates count days from 1899-12-30 (Lotus leap-year bug included). */
const EXCEL_EPOCH_MS = Date.UTC(1899, 11, 30);
const MS_PER_DAY = 86400000;

/** Number formats that mean "this is a date", by builtin id. */
const DATE_FORMAT_IDS = new Set([14, 15, 16, 17, 18, 19, 20, 21, 22, 45, 46, 47, 27, 30, 36, 50, 57]);

const decoder = new TextDecoder('utf-8');

/* A tag-level scanner. Sheet XML is machine-generated and shallow, and this
   avoids pulling in a full XML parser for four element types. */
function* tags(xml, name) {
  // Lazy attrs: a greedy [^>]* swallows the trailing slash of a self-closing
  // tag, so <sheet .../> would be read as an open tag with no matching close.
  const open = new RegExp(`<${name}(\\s[^>]*?)?\\s*(/)?>`, 'g');
  let m;
  while ((m = open.exec(xml)) !== null) {
    const attrs = m[1] || '';
    if (m[2]) { yield { attrs, inner: '' }; continue; }
    const close = `</${name}>`;
    const end = xml.indexOf(close, open.lastIndex);
    if (end === -1) return;
    yield { attrs, inner: xml.slice(open.lastIndex, end) };
    open.lastIndex = end + close.length;
  }
}

const attr = (attrs, name) => {
  const m = new RegExp(`${name}="([^"]*)"`).exec(attrs);
  return m ? m[1] : null;
};

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };
function unescapeXml(s) {
  return s.replace(/&(#x?[0-9a-fA-F]+|amp|lt|gt|quot|apos);/g, (full, code) => {
    if (code[0] === '#') {
      const n = code[1] === 'x' || code[1] === 'X' ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10);
      return Number.isFinite(n) ? String.fromCodePoint(n) : full;
    }
    return ENTITIES[code] ?? full;
  });
}

/** Concatenate every <t> run inside a shared-string or inline-string element. */
function textOf(xml) {
  let out = '';
  for (const t of tags(xml, 't')) out += unescapeXml(t.inner);
  return out;
}

/** "BC7" -> 80 (zero-based column index). */
function columnIndex(ref) {
  const letters = /^([A-Z]+)/.exec(ref);
  if (!letters) return 0;
  let n = 0;
  for (const ch of letters[1]) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}

function parseSharedStrings(files) {
  const part = files.get('xl/sharedStrings.xml');
  if (!part) return [];
  const xml = decoder.decode(part);
  return [...tags(xml, 'si')].map((si) => textOf(si.inner));
}

/** Map each cell style index to whether its number format is a date format. */
function parseDateStyles(files) {
  const part = files.get('xl/styles.xml');
  if (!part) return new Set();
  const xml = decoder.decode(part);

  const customDateFormats = new Set();
  for (const f of tags(xml, 'numFmt')) {
    const id = Number(attr(f.attrs, 'numFmtId'));
    const code = (attr(f.attrs, 'formatCode') || '').toLowerCase();
    // A date format contains y/m/d or h/s outside a literal quoted section.
    if (/[ymdhs]/.test(code.replace(/\[[^\]]*\]|"[^"]*"/g, ''))) customDateFormats.add(id);
  }

  const dateStyles = new Set();
  const cellXfs = [...tags(xml, 'cellXfs')][0];
  if (!cellXfs) return dateStyles;
  [...tags(cellXfs.inner, 'xf')].forEach((xf, i) => {
    const id = Number(attr(xf.attrs, 'numFmtId'));
    if (DATE_FORMAT_IDS.has(id) || customDateFormats.has(id)) dateStyles.add(i);
  });
  return dateStyles;
}

/** Resolve sheet name -> part path via the workbook relationships. */
function parseSheetIndex(files) {
  const wb = decoder.decode(files.get('xl/workbook.xml'));
  const relsPart = files.get('xl/_rels/workbook.xml.rels');
  const rels = new Map();
  if (relsPart) {
    const relsXml = decoder.decode(relsPart);
    for (const rel of tags(relsXml, 'Relationship')) {
      rels.set(attr(rel.attrs, 'Id'), attr(rel.attrs, 'Target'));
    }
  }

  const sheets = [];
  for (const sh of tags(wb, 'sheet')) {
    const name = unescapeXml(attr(sh.attrs, 'name') || '');
    const rid = attr(sh.attrs, 'r:id') || attr(sh.attrs, 'id');
    let target = rels.get(rid) || '';
    if (!target) continue;
    target = target.replace(/^\//, '');
    if (!target.startsWith('xl/')) target = `xl/${target}`;
    sheets.push({ name, path: target });
  }
  return sheets;
}

function parseSheet(xml, shared, dateStyles) {
  const rows = [];

  for (const row of tags(xml, 'row')) {
    const cells = [];
    let width = 0;

    for (const c of tags(row.inner, 'c')) {
      const ref = attr(c.attrs, 'r');
      const type = attr(c.attrs, 't');
      const style = attr(c.attrs, 's');
      const index = ref ? columnIndex(ref) : width;

      let value = '';
      if (type === 'inlineStr') {
        value = textOf(c.inner);
      } else {
        const v = [...tags(c.inner, 'v')][0];
        const raw = v ? unescapeXml(v.inner) : '';
        if (raw === '') value = '';
        else if (type === 's') value = shared[Number(raw)] ?? '';
        else if (type === 'str' || type === 'e') value = raw;
        else if (type === 'b') value = raw === '1' ? 'TRUE' : 'FALSE';
        else if (style !== null && dateStyles.has(Number(style)) && raw !== '') {
          // Hand downstream an ISO calendar date, not a floating-point serial.
          const ms = EXCEL_EPOCH_MS + Number(raw) * MS_PER_DAY;
          value = Number.isFinite(ms) ? new Date(Math.round(ms)).toISOString().slice(0, 10) : raw;
        } else value = raw;
      }

      while (cells.length < index) cells.push('');
      cells[index] = String(value).trim();
      width = cells.length;
    }
    rows.push(cells);
  }

  // Pad every row to the widest, so callers can index by column safely.
  const widest = rows.reduce((w, r) => Math.max(w, r.length), 0);
  for (const r of rows) while (r.length < widest) r.push('');
  return rows.filter((r) => r.some((c) => c !== ''));
}

/**
 * Read every sheet in a workbook. Async because inflation goes through the
 * platform's DecompressionStream, which is the only DEFLATE available in both
 * Node and the browser.
 * @param {Uint8Array|ArrayBuffer} buffer
 * @returns {{ sheetNames: string[], sheets: Record<string, string[][]> }}
 */
export async function parseWorkbook(buffer) {
  const files = await readZip(buffer);
  if (!files.has('xl/workbook.xml')) throw new Error('Not an .xlsx workbook: xl/workbook.xml is missing.');

  const shared = parseSharedStrings(files);
  const dateStyles = parseDateStyles(files);

  const sheets = {};
  const sheetNames = [];
  for (const { name, path } of parseSheetIndex(files)) {
    const part = files.get(path);
    if (!part) continue;
    sheetNames.push(name);
    sheets[name] = parseSheet(decoder.decode(part), shared, dateStyles);
  }
  return { sheetNames, sheets };
}

/**
 * Parse one sheet into the { headers, rows } shape the ingestion layer expects.
 * @param {Uint8Array|ArrayBuffer} buffer
 * @param {{ sheet?: string }} options - sheet name; defaults to the first.
 */
export async function parseExcel(buffer, { sheet } = {}) {
  const { sheetNames, sheets } = await parseWorkbook(buffer);
  if (sheetNames.length === 0) return { headers: [], rows: [], sheetNames: [] };

  const name = sheet ?? sheetNames[0];
  const grid = sheets[name];
  if (!grid) throw new Error(`Sheet "${name}" not found. Available: ${sheetNames.join(', ')}`);
  if (grid.length === 0) return { headers: [], rows: [], sheetNames, sheet: name };

  const headers = dedupeHeaders(grid[0]);
  return { headers, rows: toRecords(headers, grid.slice(1)), sheetNames, sheet: name };
}
