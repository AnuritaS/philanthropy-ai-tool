/**
 * Shared row shape for every parser.
 *
 * Parsers differ in how they read bytes; they must not differ in what they hand
 * to ingestion. All three return { headers, rows } where each row is an object
 * keyed by source column name — the shape core/schema.js normalizeGrant expects,
 * since it resolves values as raw[mapping[field]].
 */

/** Spreadsheets export duplicate and empty header cells; the UI needs distinct labels. */
export function dedupeHeaders(headers) {
  const seen = new Map();
  return headers.map((h, i) => {
    const base = String(h ?? '').trim() === '' ? `Column ${i + 1}` : String(h).trim();
    const n = seen.get(base) ?? 0;
    seen.set(base, n + 1);
    return n === 0 ? base : `${base} (${n + 1})`;
  });
}

/** Turn a header row plus a grid of cells into row objects. */
export function toRecords(headers, grid) {
  return grid.map((cells) => {
    const record = {};
    headers.forEach((h, i) => {
      record[h] = cells[i] ?? '';
    });
    return record;
  });
}
