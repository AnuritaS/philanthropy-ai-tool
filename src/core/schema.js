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

function coerceDate(value) {
  if (!value) return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
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
  const months =
    (record.end_date.getFullYear() - record.start_date.getFullYear()) * 12 +
    (record.end_date.getMonth() - record.start_date.getMonth());
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
