/**
 * CSV / delimited text reader.
 *
 * RFC 4180: quoted fields, escaped quotes (""), embedded commas and newlines,
 * CRLF or LF, optional UTF-8 BOM. Kept in-repo rather than taking a dependency
 * — the grammar is small and the edge cases are the ones that corrupt data
 * silently, so they are worth owning and testing directly.
 */

import { dedupeHeaders, toRecords } from './records.js';

const DELIMITERS = [',', ';', '\t', '|'];

/**
 * Choose the delimiter giving the most consistent column count over the first
 * lines. Counting raw occurrences is fooled by commas inside quoted prose,
 * which is exactly what a grant "purpose" column is full of.
 */
export function sniffDelimiter(text) {
  const sample = text.slice(0, 64 * 1024);
  let best = ',';
  let bestScore = -Infinity;

  for (const delim of DELIMITERS) {
    const rows = parseWithDelimiter(sample, delim).slice(0, 10);
    if (rows.length === 0) continue;
    const widths = rows.map((r) => r.length);
    const first = widths[0];
    if (first < 2) continue;
    const consistent = widths.filter((w) => w === first).length / widths.length;
    const score = consistent * 100 + first;
    if (score > bestScore) {
      bestScore = score;
      best = delim;
    }
  }
  return best;
}

function parseWithDelimiter(text, delim) {
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;
  let i = 0;

  const pushField = () => { row.push(field); field = ''; };
  const pushRow = () => { rows.push(row); row = []; };

  while (i < text.length) {
    const ch = text[i];

    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') { field += '"'; i += 2; continue; }
        inQuotes = false; i += 1; continue;
      }
      field += ch; i += 1; continue;
    }

    if (ch === '"' && field === '') { inQuotes = true; i += 1; continue; }
    if (ch === delim) { pushField(); i += 1; continue; }
    if (ch === '\r') { i += 1; continue; }
    if (ch === '\n') { pushField(); pushRow(); i += 1; continue; }
    field += ch; i += 1;
  }

  if (field !== '' || row.length > 0) { pushField(); pushRow(); }
  return rows.filter((r) => r.some((c) => c.trim() !== ''));
}

/**
 * @param {string} text
 * @param {{ delimiter?: string }} options
 * @returns {{ headers: string[], rows: object[], delimiter: string }}
 */
export function parseCsv(text, { delimiter } = {}) {
  const clean = String(text ?? '').replace(/^﻿/, '');
  if (clean.trim() === '') return { headers: [], rows: [], delimiter: delimiter ?? ',' };

  const delim = delimiter ?? sniffDelimiter(clean);
  const grid = parseWithDelimiter(clean, delim);
  if (grid.length === 0) return { headers: [], rows: [], delimiter: delim };

  const headers = dedupeHeaders(grid[0]);
  const body = grid.slice(1).map((r) => {
    const out = r.slice(0, headers.length);
    while (out.length < headers.length) out.push('');
    return out;
  });

  return { headers, rows: toRecords(headers, body), delimiter: delim };
}

/** Serialize back to CSV — used for the schema template download. */
export function toCsv(headers, rows) {
  const esc = (v) => {
    const s = v === null || v === undefined ? '' : String(v);
    return /["\n\r,]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const body = rows.map((r) => (Array.isArray(r) ? r : headers.map((h) => r[h])).map(esc).join(','));
  return `${[headers.map(esc).join(','), ...body].join('\n')}\n`;
}
