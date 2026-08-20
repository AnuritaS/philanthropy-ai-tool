/* ─── Standardized Grant Schema ──────────────────────────────────────────
   Every dataset the dashboard renders — the bundled demo set or a CSV the
   user uploads — is normalized into records with exactly these fields.
   Nothing downstream (metrics, charts) may assume anything about *which*
   funders appear, only that records have this shape.
   ──────────────────────────────────────────────────────────────────────── */

export const GRANT_FIELDS = [
  {
    key: "funder", label: "Funder", type: "string", required: true,
    help: "Organization making the grant. Drives every funder comparison.",
    aliases: ["funder", "foundation", "grantmaker", "grantor", "donor", "funder name", "foundation name"],
  },
  {
    key: "recipient", label: "Recipient", type: "string", required: false,
    help: "Grantee organization.",
    aliases: ["recipient", "grantee", "organization", "org", "recipient name", "grantee name", "nonprofit"],
  },
  {
    key: "year", label: "Year", type: "integer", required: true,
    help: "Fiscal or award year. Used for the disbursement trend.",
    aliases: ["year", "fiscal year", "award year", "grant year", "fy", "date"],
  },
  {
    key: "amount", label: "Grant Amount", type: "number", required: true,
    help: "Award amount in dollars. Currency symbols and commas are stripped.",
    aliases: ["amount", "grant amount", "grantamt", "award amount", "amount usd", "value", "grant size", "sum"],
  },
  {
    key: "sector", label: "Sector", type: "string", required: false,
    help: "Program area or NTEE code. An 'X-Label' prefix is shortened for display.",
    aliases: ["sector", "ntee", "ntee code", "program area", "focus area", "subject", "issue area", "category"],
  },
  {
    key: "region", label: "Region", type: "string", required: false,
    help: "Geographic region served.",
    aliases: ["region", "census region", "geography", "geo", "area", "state", "location"],
  },
  {
    key: "locale", label: "Urban / Rural", type: "string", required: false,
    help: "Settlement type, e.g. Urban / Suburban / Rural.",
    aliases: ["locale", "urban rural", "urban_rural", "urbanicity", "rurality", "settlement", "urban or rural"],
  },
  {
    key: "grantType", label: "Grant Type", type: "string", required: false,
    help: "e.g. General Operating, Project-Specific, Capacity-Building.",
    aliases: ["grant type", "granttype", "support type", "type", "award type", "funding type"],
  },
  {
    key: "durationYears", label: "Duration (years)", type: "number", required: false,
    help: "Grant term in years. Used to derive multi-year status when that column is absent.",
    aliases: ["duration", "duration years", "term", "years", "grant duration", "term years"],
  },
  {
    key: "multiYear", label: "Multi-Year", type: "boolean", required: false,
    help: "Whether the grant spans 2+ years. Derived from duration if not supplied.",
    aliases: ["multiyear", "multi year", "multi-year", "is multiyear", "multiyr"],
  },
  {
    key: "bipocLed", label: "BIPOC-Led", type: "boolean", required: false,
    help: "Whether the grantee is BIPOC-led.",
    aliases: ["bipocled", "bipoc led", "bipoc", "bipoc-led", "poc led", "leader of color", "bipoc leadership"],
  },
  {
    key: "collaborative", label: "Collaborative / Co-Funded", type: "boolean", required: false,
    help: "Whether the grant was co-funded with other funders.",
    aliases: ["collab", "collaborative", "co funded", "cofunded", "co-funded", "pooled", "joint"],
  },
  {
    key: "orgBudget", label: "Recipient Budget", type: "number", required: false,
    help: "Annual budget of the grantee organization.",
    aliases: ["orgbudget", "org budget", "organization budget", "budget", "recipient budget", "annual budget"],
  },
  {
    key: "impact", label: "Impact Score", type: "number", required: false,
    help: "Effectiveness rating on a 1–5 scale. Values outside 1–5 are clamped.",
    aliases: ["impact", "impact score", "score", "effectiveness", "rating", "outcome score"],
  },
  {
    key: "outcomeReported", label: "Outcome Reported", type: "boolean", required: false,
    help: "Whether the grantee filed an outcome report.",
    aliases: ["outcomereported", "outcome reported", "reported", "has outcome", "outcome", "reporting"],
  },
];

export const FIELD_BY_KEY = Object.fromEntries(GRANT_FIELDS.map(f => [f.key, f]));
export const REQUIRED_FIELDS = GRANT_FIELDS.filter(f => f.required).map(f => f.key);

/* ─── Coercion ─────────────────────────────────────────────────────────── */

const TRUEY  = new Set(["1", "true", "t", "yes", "y", "si", "x"]);
const FALSEY = new Set(["0", "false", "f", "no", "n", "", "na", "n/a", "null", "none", "-"]);

export const isBlank = (v) => v === null || v === undefined || String(v).trim() === "";

export function coerceString(v) {
  if (isBlank(v)) return null;
  return String(v).trim();
}

/* Tolerates "$1,250,000", "1 250 000", "(500)" for negatives, and "1.2e6". */
export function coerceNumber(v) {
  if (isBlank(v)) return null;
  let s = String(v).trim();
  const parenNegative = /^\(.*\)$/.test(s);
  if (parenNegative) s = s.slice(1, -1);
  s = s.replace(/[$£€¥,\s_]/g, "");
  if (s === "" || !/^[+-]?(\d+\.?\d*|\.\d+)(e[+-]?\d+)?$/i.test(s)) return NaN;
  const n = Number(s);
  if (!Number.isFinite(n)) return NaN;
  return parenNegative ? -n : n;
}

export function coerceInteger(v) {
  const n = coerceNumber(v);
  if (n === null || Number.isNaN(n)) return n;
  return Math.round(n);
}

export function coerceBoolean(v) {
  if (isBlank(v)) return null;
  const s = String(v).trim().toLowerCase();
  if (TRUEY.has(s)) return true;
  if (FALSEY.has(s)) return false;
  const n = coerceNumber(s);
  if (n !== null && !Number.isNaN(n)) return n !== 0;
  return NaN; // signals "present but uninterpretable"
}

const COERCERS = {
  string: coerceString,
  number: coerceNumber,
  integer: coerceInteger,
  boolean: coerceBoolean,
};

export function coerceField(fieldKey, raw) {
  const field = FIELD_BY_KEY[fieldKey];
  if (!field) return null;
  return COERCERS[field.type](raw);
}

/* ─── Record construction ──────────────────────────────────────────────── */

/* Fields the dashboard can fill in when a source doesn't supply them. */
function applyDerivations(rec) {
  if (rec.multiYear === null && rec.durationYears !== null && !Number.isNaN(rec.durationYears)) {
    rec.multiYear = rec.durationYears >= 2;
  }
  if (rec.durationYears === null && rec.multiYear !== null) {
    rec.durationYears = rec.multiYear ? 2 : 1;
  }
  if (rec.impact !== null && !Number.isNaN(rec.impact)) {
    rec.impact = Math.min(5, Math.max(1, rec.impact));
  }
  return rec;
}

/* Builds one canonical record from a { fieldKey: rawValue } bag.
   Returns { record, errors } — errors are per-field and human-readable. */
export function buildRecord(rawByField, id) {
  const record = { id };
  const errors = [];

  for (const field of GRANT_FIELDS) {
    const raw = rawByField[field.key];
    const value = coerceField(field.key, raw);

    if (Number.isNaN(value)) {
      errors.push({ field: field.key, value: raw, message: `"${raw}" is not a valid ${field.type}` });
      record[field.key] = null;
      continue;
    }
    if (value === null && field.required) {
      errors.push({ field: field.key, value: raw, message: `${field.label} is required but empty` });
    }
    record[field.key] = value;
  }

  return { record: applyDerivations(record), errors };
}

/* A blank canonical record — useful for tests and for the CSV template. */
export function emptyRecord(id = 0) {
  return buildRecord({}, id).record;
}

/* CSV header row + one example row, for the downloadable template. */
export function templateCsv() {
  const header = GRANT_FIELDS.map(f => f.key).join(",");
  const example = GRANT_FIELDS.map(f => {
    switch (f.type) {
      case "boolean": return "yes";
      case "integer": return "2024";
      case "number":  return f.key === "impact" ? "4.1" : "250000";
      default:        return f.key === "funder" ? "Example Foundation" : "Example value";
    }
  }).join(",");
  return `${header}\n${example}\n`;
}
