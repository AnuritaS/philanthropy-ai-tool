/**
 * Deterministic column mapping.
 *
 * Runs before any LLM call and reports a confidence per field, so the AI
 * mapper in Phase 3 only has to reason about what this could not resolve.
 * Nothing here auto-applies: the output is a suggestion the user confirms.
 */

import { FIELDS, REQUIRED_FIELDS } from '../core/schema.js';

/**
 * Known header spellings per canonical field. Extend freely — an alias only
 * ever adds a candidate, and greedy assignment prevents one column being
 * claimed twice.
 */
export const FIELD_ALIASES = {
  grant_id: ['grant id', 'id', 'grant number', 'grant no', 'award id', 'award number', 'reference', 'transaction id'],
  funder_id: ['funder id', 'funder ein', 'ein', 'foundation id', 'grantmaker id', 'filer ein'],
  funder_name: ['funder', 'funder name', 'foundation', 'foundation name', 'grantmaker', 'grantor', 'donor', 'filer name'],
  recipient_id: ['recipient id', 'recipient ein', 'grantee id', 'grantee ein', 'organization id', 'org id'],
  recipient_name: ['recipient', 'recipient name', 'grantee', 'grantee name', 'organization', 'organization name', 'org name', 'nonprofit', 'payee'],
  amount: ['amount', 'grant amount', 'grantamt', 'award amount', 'amount usd', 'amount awarded', 'value', 'grant size', 'total', 'sum', 'dollars', 'payment amount'],
  currency: ['currency', 'currency code', 'ccy'],
  award_date: ['award date', 'date', 'grant date', 'date awarded', 'approved date', 'approval date', 'fiscal year', 'year', 'award year', 'grant year'],
  start_date: ['start date', 'period start', 'begin date', 'grant start', 'from date', 'effective date'],
  end_date: ['end date', 'period end', 'expiry date', 'grant end', 'to date', 'expiration date'],
  duration_months: ['duration months', 'duration', 'term months', 'months', 'grant duration', 'term', 'period months'],
  pcs_subject: ['pcs subject', 'subject', 'subject code', 'subject codes', 'ntee', 'ntee code', 'program area', 'focus area', 'issue area', 'category', 'sector', 'theme'],
  pcs_population: ['pcs population', 'population', 'population code', 'population served', 'beneficiary', 'beneficiaries', 'target population', 'demographic'],
  pcs_support_strategy: ['pcs support strategy', 'support strategy', 'strategy', 'support type', 'grant type', 'funding type', 'type of support'],
  pcs_transaction_type: ['pcs transaction type', 'transaction type', 'transaction', 'award type', 'instrument', 'vehicle'],
  geo_country: ['country', 'geo country', 'nation', 'country name', 'country code'],
  geo_state: ['state', 'geo state', 'province', 'state code', 'region', 'state or province'],
  geo_locality: ['city', 'locality', 'geo locality', 'county', 'municipality', 'town', 'place'],
  description: ['description', 'purpose', 'grant purpose', 'purpose text', 'project description', 'summary', 'narrative', 'notes', 'grant description'],
};

/** What each field's values should look like, used to break header ties. */
const EXPECTED_TYPE = {
  amount: 'number',
  duration_months: 'number',
  award_date: 'date',
  start_date: 'date',
  end_date: 'date',
  pcs_subject: 'code',
  pcs_population: 'code',
  pcs_support_strategy: 'code',
  pcs_transaction_type: 'code',
};

const normalize = (s) =>
  String(s ?? '').toLowerCase().replace(/[_\-.]+/g, ' ').replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();

/**
 * Similarity in [0,1]. Exact beats prefix beats containment beats token
 * overlap, so a column literally named "amount" outranks "amount requested".
 */
function similarity(header, alias) {
  const h = normalize(header);
  const a = normalize(alias);
  if (!h || !a) return 0;
  if (h === a) return 1;
  if (h.startsWith(a) || a.startsWith(h)) return 0.85;
  if (h.includes(a) || a.includes(h)) return 0.7;

  const hTokens = new Set(h.split(' '));
  const aTokens = a.split(' ');
  const hits = aTokens.filter((t) => hTokens.has(t)).length;
  if (hits === 0) return 0;
  return 0.6 * (hits / Math.max(hTokens.size, aTokens.length));
}

const NUMERIC = /^[+-]?[$£€¥]?\s*\(?\d[\d,\s]*\.?\d*\)?$/;
const PCS_CODE = /^[A-Z]{2}\d{6}$/i;
const SHORT_CODE = /^[A-Z]{1,4}[\d.]{1,6}[A-Z]?$/i;
const ISO_DATE = /^\d{4}[-/]\d{1,2}[-/]\d{1,2}/;
const SLASH_DATE = /^\d{1,2}\/\d{1,2}\/\d{4}$/;
/* 'Dec 31, 2024' and '31 December 2024'. Explicit patterns only: Date.parse is
   permissive enough to read an identifier like 'G-1' as a date. */
const TEXTUAL_DATE = /^[A-Za-z]{3,9}\.?\s+\d{1,2},?\s+\d{4}$|^\d{1,2}\s+[A-Za-z]{3,9}\.?,?\s+\d{4}$/;

/**
 * Infer a column's type from its values.
 * Codes are tested before numbers because a code list is the more specific
 * reading, and dates before numbers because a bare year is ambiguous.
 */
export function inferColumnType(values) {
  const seen = (values ?? []).map((v) => String(v ?? '').trim()).filter((v) => v !== '');
  if (seen.length === 0) return 'text';

  const rate = (pred) => seen.filter(pred).length / seen.length;

  const codeLike = (v) => v.split(/[;,|]/).every((part) => {
    const p = part.trim();
    return p !== '' && (PCS_CODE.test(p) || SHORT_CODE.test(p));
  });
  if (rate(codeLike) >= 0.8) return 'code';

  if (rate((v) => ISO_DATE.test(v) || SLASH_DATE.test(v) || TEXTUAL_DATE.test(v)) >= 0.8) return 'date';
  if (rate((v) => NUMERIC.test(v)) >= 0.8) return 'number';
  return 'text';
}

const HEADER_MATCH_FLOOR = 0.55;

function sampleValues(sampleRows, header, limit = 25) {
  return (sampleRows ?? []).slice(0, limit).map((row) => (Array.isArray(row) ? undefined : row?.[header]));
}

/**
 * @param {string[]} headers
 * @param {object[]} sampleRows - row objects from a parser
 * @returns {{ mapping: Record<string,string>, confidence: Record<string,number>,
 *            unmapped: string[], columnTypes: Record<string,string> }}
 */
export function suggestMapping(headers, sampleRows = []) {
  const cols = headers ?? [];
  const columnTypes = {};
  for (const h of cols) columnTypes[h] = inferColumnType(sampleValues(sampleRows, h));

  const candidates = [];
  for (const field of Object.keys(FIELDS)) {
    const aliases = [field, ...(FIELD_ALIASES[field] ?? [])];
    for (const header of cols) {
      let score = 0;
      for (const alias of aliases) score = Math.max(score, similarity(header, alias));
      if (score < HEADER_MATCH_FLOOR) continue;

      // Values corroborate or contradict the header. A column called "amount"
      // holding dates is more likely a mislabel than a match.
      const expected = EXPECTED_TYPE[field];
      const actual = columnTypes[header];
      if (expected) {
        if (actual === expected) score = Math.min(1, score + 0.1);
        else if (actual !== 'text') score -= 0.25;
      }
      candidates.push({ field, header, score });
    }
  }

  // Greedy best-first: one column per field, one field per column.
  candidates.sort((a, b) => b.score - a.score || a.field.localeCompare(b.field));

  const mapping = {};
  const confidence = {};
  const usedHeaders = new Set();
  for (const c of candidates) {
    if (mapping[c.field] || usedHeaders.has(c.header)) continue;
    if (c.score < HEADER_MATCH_FLOOR) continue;
    mapping[c.field] = c.header;
    confidence[c.field] = Math.round(Math.max(0, Math.min(1, c.score)) * 100) / 100;
    usedHeaders.add(c.header);
  }

  return {
    mapping,
    confidence,
    unmapped: cols.filter((h) => !usedHeaders.has(h)),
    columnTypes,
  };
}

/** Required canonical fields with no column assigned. */
export function missingRequired(mapping) {
  return REQUIRED_FIELDS.filter((f) => !mapping?.[f]);
}

export function isMappingComplete(mapping) {
  return missingRequired(mapping).length === 0;
}
