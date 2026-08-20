/**
 * Canonical grant record.
 *
 * Every ingestion path (CSV, Excel, JSON, 990-PF, Candid connector) must
 * produce records in this shape. Nothing downstream reads raw uploads.
 *
 * PCS fields are arrays because the Philanthropy Classification System allows
 * multiple codes per grant (up to 5 subject codes, for example). See
 * METHODOLOGY.md section "Fractional attribution" for how dollars are split.
 */

export const FIELDS = {
  // Identity
  grant_id: { type: 'string', required: true },
  funder_id: { type: 'string', required: false },
  funder_name: { type: 'string', required: false },
  recipient_id: { type: 'string', required: false },
  recipient_name: { type: 'string', required: true },

  // Money
  amount: { type: 'number', required: true },
  currency: { type: 'string', required: false, default: 'USD' },

  // Time
  award_date: { type: 'date', required: true },
  start_date: { type: 'date', required: false },
  end_date: { type: 'date', required: false },
  duration_months: { type: 'number', required: false },

  // PCS classification (arrays of PCS codes)
  pcs_subject: { type: 'codes', required: false },
  pcs_population: { type: 'codes', required: false },
  pcs_support_strategy: { type: 'codes', required: false },
  pcs_transaction_type: { type: 'codes', required: false },

  // Geography of intended benefit (not recipient HQ)
  geo_country: { type: 'string', required: false },
  geo_state: { type: 'string', required: false },
  geo_locality: { type: 'string', required: false },

  // Free text — the input to auto-classification for uncoded portfolios
  description: { type: 'string', required: false },
};

export const REQUIRED_FIELDS = Object.entries(FIELDS)
  .filter(([, def]) => def.required)
  .map(([name]) => name);

/** Fields that carry PCS codes, for iteration by the metrics layer. */
export const PCS_FIELDS = Object.entries(FIELDS)
  .filter(([, def]) => def.type === 'codes')
  .map(([name]) => name);

const NUMERIC_CLEAN = /[$,\s]/g;

function coerceNumber(value) {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  const cleaned = String(value).replace(NUMERIC_CLEAN, '');
  const parenNegative = /^\(.*\)$/.test(cleaned);
  const n = Number(parenNegative ? cleaned.slice(1, -1) : cleaned);
  if (!Number.isFinite(n)) return null;
  return parenNegative ? -n : n;
}

/*
 * Grant dates are calendar dates, not instants. `new Date()` disagrees about
 * which: it reads '2024-12-31' as UTC midnight but '12/31/2024' as *local*
 * midnight, so two spellings of the same day land hours apart and a year-end
 * grant can fall into the wrong reporting period. Every date-only value is
 * therefore pinned to UTC midnight, whatever its spelling.
 */
const ISO_DATE_ONLY = /^(\d{4})-(\d{1,2})-(\d{1,2})$/;
const ISO_SLASH = /^(\d{4})\/(\d{1,2})\/(\d{1,2})$/;
const US_SLASH = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/;
/** Presence of a clock time or an explicit zone means a real instant was meant. */
const HAS_TIME_OR_ZONE = /[T:]|\d\s*Z$|[+-]\d{2}:?\d{2}$/;

/** Build a UTC-midnight date, rejecting rollovers like 2024-02-31. */
function utcDate(year, month, day) {
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const d = new Date(Date.UTC(year, month - 1, day));
  if (d.getUTCFullYear() !== year || d.getUTCMonth() !== month - 1 || d.getUTCDate() !== day) {
    return null;
  }
  return d;
}

function coerceDate(value) {
  if (value === null || value === undefined || value === '') return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  if (typeof value === 'number') {
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? null : d;
  }

  const s = String(value).trim();
  if (s === '') return null;

  let m;
  if ((m = ISO_DATE_ONLY.exec(s))) return utcDate(+m[1], +m[2], +m[3]);
  if ((m = ISO_SLASH.exec(s))) return utcDate(+m[1], +m[2], +m[3]);
  if ((m = US_SLASH.exec(s))) return utcDate(+m[3], +m[1], +m[2]);

  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return null;

  // Textual date-only forms ('Dec 31, 2024') parse as local midnight; re-pin
  // them to the same calendar day in UTC. Values carrying a time or zone are
  // genuine instants and are left alone.
  if (!HAS_TIME_OR_ZONE.test(s)) {
    return new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  }
  return d;
}

function coerceCodes(value) {
  if (value === null || value === undefined || value === '') return [];
  const raw = Array.isArray(value) ? value : String(value).split(/[;,|]/);
  const seen = new Set();
  for (const item of raw) {
    const code = String(item).trim().toUpperCase();
    if (code) seen.add(code);
  }
  return [...seen];
}

function coerceString(value) {
  if (value === null || value === undefined) return null;
  const s = String(value).trim();
  return s === '' ? null : s;
}

/**
 * Derive duration in months from start/end dates when not supplied directly.
 * Returns null rather than guessing when either endpoint is missing.
 */
export function deriveDurationMonths(record) {
  if (record.duration_months !== null && record.duration_months !== undefined) {
    return record.duration_months;
  }
  if (!record.start_date || !record.end_date) return null;
  // UTC getters, to match the UTC-midnight normalization in coerceDate. Local
  // getters would shift both endpoints in negative-offset zones and silently
  // mis-derive terms that begin or end on the first of a month.
  const months =
    (record.end_date.getUTCFullYear() - record.start_date.getUTCFullYear()) * 12 +
    (record.end_date.getUTCMonth() - record.start_date.getUTCMonth());
  return months >= 0 ? months : null;
}

/**
 * Normalize one raw row into a canonical record.
 *
 * @param {object} raw - a row from the uploaded file
 * @param {object} mapping - { canonicalField: sourceColumnName }
 * @returns {{ record: object, issues: string[] }}
 */
export function normalizeGrant(raw, mapping = {}) {
  const record = {};
  const issues = [];

  for (const [name, def] of Object.entries(FIELDS)) {
    const sourceKey = mapping[name] ?? name;
    const value = raw[sourceKey];

    let coerced;
    switch (def.type) {
      case 'number':
        coerced = coerceNumber(value);
        break;
      case 'date':
        coerced = coerceDate(value);
        break;
      case 'codes':
        coerced = coerceCodes(value);
        break;
      default:
        coerced = coerceString(value);
    }

    if (coerced === null && def.default !== undefined) coerced = def.default;

    if (def.required && (coerced === null || coerced === undefined)) {
      issues.push(`missing required field: ${name}`);
    }
    if (def.type === 'number' && value != null && value !== '' && coerced === null) {
      issues.push(`unparseable number in ${name}: ${JSON.stringify(value)}`);
    }
    if (def.type === 'date' && value != null && value !== '' && coerced === null) {
      issues.push(`unparseable date in ${name}: ${JSON.stringify(value)}`);
    }

    record[name] = coerced;
  }

  if (record.amount !== null && record.amount <= 0) {
    issues.push(`non-positive amount: ${record.amount}`);
  }

  record.duration_months = deriveDurationMonths(record);

  return { record, issues };
}

/**
 * Normalize a whole dataset. Rows with blocking issues are quarantined rather
 * than silently dropped, so the validation layer can report on them.
 */
export function normalizeDataset(rows, mapping = {}) {
  const accepted = [];
  const rejected = [];

  rows.forEach((raw, index) => {
    const { record, issues } = normalizeGrant(raw, mapping);
    const blocking = issues.filter((i) => i.startsWith('missing required'));
    if (blocking.length > 0) {
      rejected.push({ row: index, record, issues });
    } else {
      accepted.push(record);
      if (issues.length > 0) rejected.push({ row: index, record, issues, warningOnly: true });
    }
  });

  return { grants: accepted, problems: rejected };
}
