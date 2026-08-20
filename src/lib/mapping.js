/* ─── Column mapping ─────────────────────────────────────────────────────
   Bridges an arbitrary CSV's headers to the canonical schema. autoMap makes
   a best guess the user can override; applyMapping turns the raw grid into
   canonical records plus a readable error report.
   ──────────────────────────────────────────────────────────────────────── */

import { GRANT_FIELDS, REQUIRED_FIELDS, FIELD_BY_KEY, buildRecord } from "./schema.js";

export const UNMAPPED = "";

/* "Grant Amount ($USD)" -> "grant amount usd" */
const normalize = (s) =>
  String(s).toLowerCase().replace(/[_\-.]+/g, " ").replace(/[^a-z0-9 ]/g, "").replace(/\s+/g, " ").trim();

/* Similarity in [0,1]. Exact match beats prefix beats containment beats
   token overlap, so "amount" prefers a column literally named "amount"
   over "amount requested". */
function similarity(header, alias) {
  const h = normalize(header);
  const a = normalize(alias);
  if (!h || !a) return 0;
  if (h === a) return 1;
  if (h.startsWith(a) || a.startsWith(h)) return 0.85;
  if (h.includes(a) || a.includes(h)) return 0.7;

  const ht = new Set(h.split(" "));
  const at = a.split(" ");
  const hits = at.filter(t => ht.has(t)).length;
  if (!hits) return 0;
  return 0.6 * (hits / Math.max(ht.size, at.length));
}

function scoreHeaderForField(header, field) {
  let best = 0;
  for (const alias of [field.key, field.label, ...field.aliases]) {
    best = Math.max(best, similarity(header, alias));
  }
  return best;
}

const MATCH_THRESHOLD = 0.55;

/* autoMap(headers) -> { [fieldKey]: headerIndex | UNMAPPED }
   Greedy best-first assignment so one column is never claimed by two
   fields — without it, "grant amount" and "grant type" fight over both. */
export function autoMap(headers) {
  const candidates = [];
  headers.forEach((header, hi) => {
    GRANT_FIELDS.forEach(field => {
      const score = scoreHeaderForField(header, field);
      if (score >= MATCH_THRESHOLD) candidates.push({ hi, key: field.key, score });
    });
  });

  candidates.sort((a, b) => b.score - a.score);

  const mapping = Object.fromEntries(GRANT_FIELDS.map(f => [f.key, UNMAPPED]));
  const usedHeaders = new Set();
  for (const c of candidates) {
    if (mapping[c.key] !== UNMAPPED || usedHeaders.has(c.hi)) continue;
    mapping[c.key] = c.hi;
    usedHeaders.add(c.hi);
  }
  return mapping;
}

export function missingRequired(mapping) {
  return REQUIRED_FIELDS.filter(k => mapping[k] === UNMAPPED || mapping[k] === null || mapping[k] === undefined);
}

export function isMappingValid(mapping) {
  return missingRequired(mapping).length === 0;
}

/* applyMapping(headers, rows, mapping) -> {
     grants,        canonical records that passed validation
     rowErrors,     [{ row, errors:[{field,value,message}] }] for rejected rows
     issues,        [{ field, message, count }] rolled up for display
     skipped,       count of rejected rows
   }
   A row is rejected only when a *required* field is missing or unparseable.
   A bad optional value nulls that one cell and keeps the row. */
export function applyMapping(headers, rows, mapping) {
  const grants = [];
  const rowErrors = [];
  const issueCounts = new Map();

  const note = (field, message) => {
    const k = `${field}||${message}`;
    issueCounts.set(k, (issueCounts.get(k) || 0) + 1);
  };

  rows.forEach((row, ri) => {
    const rawByField = {};
    for (const field of GRANT_FIELDS) {
      const hi = mapping[field.key];
      rawByField[field.key] = hi === UNMAPPED || hi === null || hi === undefined ? "" : row[hi];
    }

    const { record, errors } = buildRecord(rawByField, ri);
    errors.forEach(e => note(e.field, e.message.replace(/^".*?"/, "A value")));

    const fatal = errors.filter(e => FIELD_BY_KEY[e.field]?.required);
    if (fatal.length) {
      rowErrors.push({ row: ri + 2, errors: fatal }); // +2 = 1-indexed, past header
      return;
    }
    grants.push(record);
  });

  const issues = [...issueCounts.entries()]
    .map(([k, count]) => {
      const [field, message] = k.split("||");
      return { field, label: FIELD_BY_KEY[field]?.label ?? field, message, count };
    })
    .sort((a, b) => b.count - a.count);

  return { grants, rowErrors: rowErrors.slice(0, 50), issues, skipped: rowErrors.length };
}

/* Small preview of what a mapping will produce, for the mapping UI. */
export function previewMapping(headers, rows, mapping, limit = 5) {
  const { grants } = applyMapping(headers, rows.slice(0, limit * 4), mapping);
  return grants.slice(0, limit);
}
