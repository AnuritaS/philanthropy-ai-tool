/**
 * JSON reader.
 *
 * Accepts the three shapes exports actually arrive in: a bare array of grant
 * objects, an envelope with the array under a common key, and NDJSON (one
 * object per line), which is what streaming exports and 990-PF tooling emit.
 */

import { dedupeHeaders } from './records.js';

const ENVELOPE_KEYS = ['grants', 'data', 'records', 'rows', 'results', 'items'];

function parseNdjson(text) {
  const rows = [];
  text.split(/\r?\n/).forEach((line, i) => {
    const trimmed = line.trim();
    if (trimmed === '') return;
    try {
      rows.push(JSON.parse(trimmed));
    } catch {
      throw new Error(`Line ${i + 1} is not valid JSON. If this is a JSON array, remove the line breaks between records.`);
    }
  });
  return rows;
}

function extractArray(parsed) {
  if (Array.isArray(parsed)) return parsed;
  if (parsed && typeof parsed === 'object') {
    for (const key of ENVELOPE_KEYS) {
      if (Array.isArray(parsed[key])) return parsed[key];
    }
    const arrays = Object.entries(parsed).filter(([, v]) => Array.isArray(v));
    if (arrays.length === 1) return arrays[0][1];
    if (arrays.length > 1) {
      throw new Error(`Ambiguous JSON: several arrays present (${arrays.map(([k]) => k).join(', ')}). Wrap the grants under a "grants" key.`);
    }
  }
  throw new Error('JSON must be an array of grant objects, or an object containing one.');
}

/**
 * Flatten one level of nesting so { funder: { name } } is addressable as
 * "funder.name" — a column name the mapping UI can offer like any other.
 */
function flatten(value, prefix = '', out = {}) {
  for (const [k, v] of Object.entries(value ?? {})) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === 'object' && !Array.isArray(v) && !(v instanceof Date)) flatten(v, key, out);
    else out[key] = v;
  }
  return out;
}

/**
 * @param {string|object|Array} input - JSON text, or already-parsed data
 * @returns {{ headers: string[], rows: object[] }}
 */
export function parseJson(input) {
  let parsed;
  if (typeof input === 'string') {
    const text = input.replace(/^﻿/, '').trim();
    if (text === '') return { headers: [], rows: [] };
    try {
      parsed = JSON.parse(text);
    } catch (err) {
      // A failed array parse is usually NDJSON; try that before giving up.
      if (text.startsWith('{')) parsed = parseNdjson(text);
      else throw new Error(`Invalid JSON: ${err.message}`);
    }
  } else {
    parsed = input;
  }

  const array = extractArray(parsed);
  const rows = array.map((item) =>
    item && typeof item === 'object' && !Array.isArray(item) ? flatten(item) : { value: item },
  );

  // Union of keys, first-seen order — sparse exports omit keys per record.
  const seen = [];
  const known = new Set();
  for (const row of rows) {
    for (const k of Object.keys(row)) {
      if (!known.has(k)) { known.add(k); seen.push(k); }
    }
  }

  const headers = dedupeHeaders(seen);
  // dedupeHeaders may rename a key; realign rows so headers address them.
  const renamed = rows.map((row) => {
    const out = {};
    seen.forEach((original, i) => {
      out[headers[i]] = row[original] ?? '';
    });
    return out;
  });

  return { headers, rows: renamed };
}
