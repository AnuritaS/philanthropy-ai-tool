import { useMemo, useRef, useState } from "react";
import { parseCsv } from "../lib/csv.js";
import { GRANT_FIELDS, templateCsv } from "../lib/schema.js";
import { autoMap, applyMapping, missingRequired, previewMapping, UNMAPPED } from "../lib/mapping.js";
import { C } from "../lib/theme.js";

const MAX_BYTES = 25 * 1024 * 1024;

/* Upload a CSV, confirm how its columns map onto the canonical schema, and
   load it into the dashboard. Parsing and mapping live in lib/ — this file
   is only the interface over them. */
export default function DataImport({ source, onApply, onReset }) {
  const fileInput = useRef(null);
  const [parsed, setParsed] = useState(null);   // { headers, rows, delimiter, fileName }
  const [mapping, setMapping] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  const result = useMemo(
    () => (parsed && mapping ? applyMapping(parsed.headers, parsed.rows, mapping) : null),
    [parsed, mapping]
  );
  const preview = useMemo(
    () => (parsed && mapping ? previewMapping(parsed.headers, parsed.rows, mapping) : []),
    [parsed, mapping]
  );
  const missing = mapping ? missingRequired(mapping) : [];

  async function handleFile(file) {
    if (!file) return;
    setError(null);
    setBusy(true);
    try {
      if (file.size > MAX_BYTES) throw new Error(`File is ${(file.size / 1e6).toFixed(1)}MB; the limit is 25MB.`);
      const text = await file.text();
      const { headers, rows, delimiter } = parseCsv(text);
      if (!headers.length) throw new Error("No columns found — is this a CSV?");
      if (!rows.length) throw new Error("The file has a header row but no data rows.");
      setParsed({ headers, rows, delimiter, fileName: file.name });
      setMapping(autoMap(headers));
    } catch (e) {
      setError(e.message || String(e));
      setParsed(null);
      setMapping(null);
    } finally {
      setBusy(false);
    }
  }

  function apply() {
    if (!result || missing.length) return;
    onApply(result.grants, {
      kind: "upload",
      name: parsed.fileName,
      rowCount: result.grants.length,
      skipped: result.skipped,
    });
  }

  function clear() {
    setParsed(null);
    setMapping(null);
    setError(null);
    if (fileInput.current) fileInput.current.value = "";
  }

  function downloadTemplate() {
    const blob = new Blob([templateCsv()], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "grant-schema-template.csv";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  return (
    <div className="flex flex-col gap-6">
      {/* ── Current dataset ── */}
      <Panel>
        <Title>Active Dataset</Title>
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <p className="text-sm" style={{ color: C.text }}>
              {source.name}
              <span style={{ color: C.muted }}> · {source.rowCount.toLocaleString()} grants</span>
            </p>
            <p className="text-xs mt-1" style={{ color: C.muted }}>
              {source.kind === "demo"
                ? "Bundled simulation. Upload a CSV to analyse your own portfolio."
                : `Loaded from ${source.name}${source.skipped ? ` · ${source.skipped} row(s) skipped` : ""}`}
            </p>
          </div>
          <div className="flex gap-2">
            <Button onClick={downloadTemplate} tone="ghost">Download template</Button>
            {source.kind !== "demo" && <Button onClick={onReset} tone="ghost">Restore demo data</Button>}
          </div>
        </div>
      </Panel>

      {/* ── Upload ── */}
      <Panel>
        <Title>1 · Upload CSV</Title>
        <input
          ref={fileInput}
          type="file"
          accept=".csv,text/csv,text/plain"
          onChange={e => handleFile(e.target.files?.[0])}
          className="text-xs"
          style={{ color: C.muted }}
        />
        <p className="text-xs mt-2" style={{ color: C.muted }}>
          Comma, semicolon, tab or pipe separated. Quoted fields and embedded newlines are handled.
          Required columns: <strong style={{ color: C.text }}>funder</strong>,{" "}
          <strong style={{ color: C.text }}>year</strong>,{" "}
          <strong style={{ color: C.text }}>amount</strong> — everything else is optional and unlocks
          the matching panels.
        </p>
        {busy && <p className="text-xs mt-2" style={{ color: C.accent }}>Reading file…</p>}
        {error && (
          <p className="text-xs mt-2 px-3 py-2 rounded"
             style={{ color: "#FCA5A5", background: "#7F1D1D33", border: "1px solid #7F1D1D" }}>
            {error}
          </p>
        )}
      </Panel>

      {/* ── Mapping ── */}
      {parsed && mapping && (
        <>
          <Panel>
            <div className="flex items-center justify-between flex-wrap gap-2 mb-1">
              <Title>2 · Map Columns</Title>
              <Button onClick={clear} tone="ghost">Cancel</Button>
            </div>
            <p className="text-xs mb-4" style={{ color: C.muted }}>
              Matched {parsed.headers.length} column(s) in <strong style={{ color: C.text }}>{parsed.fileName}</strong>{" "}
              ({parsed.rows.length.toLocaleString()} rows). Adjust anything the auto-match got wrong.
            </p>

            <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))" }}>
              {GRANT_FIELDS.map(field => {
                const value = mapping[field.key];
                const unset = value === UNMAPPED;
                const isMissing = field.required && unset;
                return (
                  <div key={field.key}>
                    <label className="text-xs flex items-center gap-1.5 mb-1" style={{ color: C.text }}>
                      {field.label}
                      {field.required && <span style={{ color: C.gold }}>*</span>}
                      <span style={{ color: C.muted, fontFamily: "monospace", fontSize: 10 }}>{field.type}</span>
                    </label>
                    <select
                      value={value}
                      onChange={e => {
                        const v = e.target.value;
                        setMapping({ ...mapping, [field.key]: v === UNMAPPED ? UNMAPPED : Number(v) });
                      }}
                      className="text-xs px-2 py-1.5 rounded-lg w-full"
                      style={{
                        background: C.card,
                        border: `1px solid ${isMissing ? "#B91C1C" : C.border}`,
                        color: unset ? C.muted : C.text,
                        outline: "none",
                      }}
                    >
                      <option value={UNMAPPED}>— not mapped —</option>
                      {parsed.headers.map((h, i) => <option key={i} value={i}>{h}</option>)}
                    </select>
                    <p className="text-xs mt-1" style={{ color: C.muted, fontSize: 10 }}>{field.help}</p>
                  </div>
                );
              })}
            </div>

            {missing.length > 0 && (
              <p className="text-xs mt-4 px-3 py-2 rounded"
                 style={{ color: "#FCA5A5", background: "#7F1D1D33", border: "1px solid #7F1D1D" }}>
                Map the required field(s) before loading: {missing.join(", ")}
              </p>
            )}
          </Panel>

          {/* ── Preview & load ── */}
          <Panel>
            <Title>3 · Preview &amp; Load</Title>
            {result && (
              <div className="flex flex-wrap gap-6 mb-4">
                <Stat label="Valid grants" value={result.grants.length.toLocaleString()} color={C.accent} />
                <Stat label="Rows skipped" value={result.skipped.toLocaleString()} color={result.skipped ? C.gold : C.muted} />
                <Stat label="Funders found"
                      value={new Set(result.grants.map(g => g.funder)).size.toLocaleString()} color={C.text} />
              </div>
            )}

            {result?.issues.length > 0 && (
              <div className="mb-4">
                <p className="text-xs mb-1" style={{ color: C.gold }}>Data issues</p>
                <ul className="flex flex-col gap-1">
                  {result.issues.slice(0, 6).map((iss, i) => (
                    <li key={i} className="text-xs" style={{ color: C.muted }}>
                      <strong style={{ color: C.text }}>{iss.label}</strong>: {iss.message} ({iss.count}×)
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {preview.length > 0 && (
              <div className="overflow-x-auto mb-4">
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
                  <thead>
                    <tr style={{ borderBottom: `1px solid ${C.border}` }}>
                      {GRANT_FIELDS.map(f => (
                        <th key={f.key} className="text-left py-2 px-2"
                            style={{ color: C.muted, fontWeight: 700, textTransform: "uppercase", fontSize: 9, whiteSpace: "nowrap" }}>
                          {f.label}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {preview.map((row, i) => (
                      <tr key={i} style={{ borderBottom: `1px solid ${C.border}44` }}>
                        {GRANT_FIELDS.map(f => (
                          <td key={f.key} className="py-1.5 px-2"
                              style={{ color: row[f.key] === null ? C.muted : C.text, whiteSpace: "nowrap" }}>
                            {row[f.key] === null ? "—" : String(row[f.key])}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            <Button onClick={apply} disabled={!result || missing.length > 0 || !result.grants.length}>
              Load {result?.grants.length.toLocaleString() ?? 0} grants into dashboard
            </Button>
          </Panel>
        </>
      )}
    </div>
  );
}

/* ── local presentational bits ── */

const Panel = ({ children }) => (
  <div className="rounded-xl border p-4" style={{ background: C.card, borderColor: C.border }}>{children}</div>
);

const Title = ({ children }) => (
  <h2 className="text-xs font-bold tracking-widest uppercase mb-3"
      style={{ color: C.accent, fontFamily: "monospace" }}>◈ {children}</h2>
);

const Stat = ({ label, value, color }) => (
  <div>
    <p className="text-xs" style={{ color: C.muted }}>{label}</p>
    <p className="text-xl font-black" style={{ fontFamily: "serif", color }}>{value}</p>
  </div>
);

const Button = ({ children, onClick, disabled, tone }) => (
  <button
    onClick={onClick}
    disabled={disabled}
    className="text-xs font-bold px-3 py-2 rounded-lg transition-all"
    style={{
      background: tone === "ghost" ? "transparent" : disabled ? C.border : C.accent + "22",
      color: disabled ? C.muted : tone === "ghost" ? C.muted : C.accent,
      border: `1px solid ${tone === "ghost" ? C.border : disabled ? C.border : C.accent + "66"}`,
      cursor: disabled ? "not-allowed" : "pointer",
    }}
  >
    {children}
  </button>
);
