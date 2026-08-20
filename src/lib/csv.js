/* ─── CSV parsing ────────────────────────────────────────────────────────
   A small RFC 4180 parser: quoted fields, escaped quotes (""), embedded
   commas and newlines, CRLF or LF, optional UTF-8 BOM. Kept in-repo rather
   than pulling a dependency — the grammar is small and fully covered by the
   cases below.
   ──────────────────────────────────────────────────────────────────────── */

const DELIMITERS = [",", ";", "\t", "|"];

/* Picks the delimiter that yields the most consistent column count across
   the first few lines — more reliable than counting occurrences, which is
   fooled by commas inside quoted prose. */
export function sniffDelimiter(text) {
  const sample = text.slice(0, 64 * 1024);
  let best = ",";
  let bestScore = -Infinity;

  for (const delim of DELIMITERS) {
    const rows = parseWithDelimiter(sample, delim).slice(0, 10);
    if (rows.length < 1) continue;
    const widths = rows.map(r => r.length);
    const first = widths[0];
    if (first < 2) continue; // a delimiter that finds no columns is not the delimiter
    const consistent = widths.filter(w => w === first).length / widths.length;
    const score = consistent * 100 + first;
    if (score > bestScore) { bestScore = score; best = delim; }
  }
  return best;
}

function parseWithDelimiter(text, delim) {
  const rows = [];
  let row = [];
  let field = "";
  let inQuotes = false;
  let i = 0;

  const pushField = () => { row.push(field); field = ""; };
  const pushRow = () => { rows.push(row); row = []; };

  while (i < text.length) {
    const ch = text[i];

    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') { field += '"'; i += 2; continue; }
        inQuotes = false; i++; continue;
      }
      field += ch; i++; continue;
    }

    if (ch === '"' && field === "") { inQuotes = true; i++; continue; }
    if (ch === delim) { pushField(); i++; continue; }
    if (ch === "\r") { i++; continue; }
    if (ch === "\n") { pushField(); pushRow(); i++; continue; }
    field += ch; i++;
  }

  // trailing field / row (file may not end with a newline)
  if (field !== "" || row.length > 0) { pushField(); pushRow(); }

  // drop rows that are entirely empty (blank lines between records)
  return rows.filter(r => r.some(c => c.trim() !== ""));
}

/* parseCsv(text) -> { headers, rows, delimiter }
   headers: string[]  — de-duplicated, trimmed
   rows:    string[][] — padded/truncated to headers.length          */
export function parseCsv(text, delimiter) {
  const clean = String(text).replace(/^﻿/, "");
  if (clean.trim() === "") return { headers: [], rows: [], delimiter: delimiter || "," };

  const delim = delimiter || sniffDelimiter(clean);
  const all = parseWithDelimiter(clean, delim);
  if (all.length === 0) return { headers: [], rows: [], delimiter: delim };

  const headers = dedupeHeaders(all[0].map(h => h.trim()));
  const rows = all.slice(1).map(r => {
    const out = r.slice(0, headers.length);
    while (out.length < headers.length) out.push("");
    return out;
  });

  return { headers, rows, delimiter: delim };
}

/* Spreadsheets happily export duplicate or empty header cells; downstream
   code addresses columns by index, but the UI needs distinct labels. */
function dedupeHeaders(headers) {
  const seen = new Map();
  return headers.map((h, i) => {
    const base = h === "" ? `Column ${i + 1}` : h;
    const n = seen.get(base) || 0;
    seen.set(base, n + 1);
    return n === 0 ? base : `${base} (${n + 1})`;
  });
}

/* Serializes rows back to CSV — used for the downloadable template. */
export function toCsv(headers, rows) {
  const esc = (v) => {
    const s = v === null || v === undefined ? "" : String(v);
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [headers.map(esc).join(","), ...rows.map(r => r.map(esc).join(","))].join("\n") + "\n";
}
