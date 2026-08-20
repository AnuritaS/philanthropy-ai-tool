import { FIELDS, REQUIRED_FIELDS } from '../../core/schema.js';
import { Icon } from '../icons.jsx';

/**
 * Step 2: confirm how the file's columns land on the canonical schema.
 *
 * Suggestions are never auto-applied silently — each row shows how it was
 * arrived at, and anything the heuristics were unsure of is marked for the user
 * to confirm rather than quietly accepted.
 */

const IGNORE = '';

function confidenceState(field, column, confidence) {
  if (!column) return REQUIRED_FIELDS.includes(field)
    ? { label: 'required', cls: 'chip-amber' }
    : { label: 'not mapped', cls: 'chip-muted' };
  if (confidence >= 0.95) return { label: 'exact', cls: 'chip-teal' };
  if (confidence >= 0.7) return { label: 'suggested', cls: 'chip-blue' };
  return { label: 'confirm', cls: 'chip-amber' };
}

export function ColumnMapper({ file, headers, rowCount, mapping, confidence, onChange }) {
  const fields = Object.keys(FIELDS);
  const mappedCount = Object.values(mapping).filter(Boolean).length;

  return (
    <div className="card">
      <div className="hstack" style={{ gap: 9, marginBottom: 3 }}>
        <Icon name="file-spreadsheet" size={18} color="var(--teal-bar)" />
        <p className="card-title">{file}</p>
      </div>
      <p className="card-sub" style={{ marginBottom: 14 }}>
        {rowCount.toLocaleString()} rows · {headers.length} columns detected · {mappedCount} mapped
      </p>

      <div className="stack-sm">
        {fields.map((field) => {
          const column = mapping[field] ?? IGNORE;
          const state = confidenceState(field, column, confidence[field] ?? 0);
          return (
            <div className="map-row" key={field}>
              <select
                className="control map-src"
                value={column}
                onChange={(e) => onChange(field, e.target.value)}
                aria-label={`Source column for ${field}`}
              >
                <option value={IGNORE}>— ignore this field —</option>
                {headers.map((h) => <option key={h} value={h}>{h}</option>)}
              </select>
              <Icon name="arrow-right" size={15} color="var(--rule-soft)" />
              <span className="map-dst">
                {field}
                {REQUIRED_FIELDS.includes(field) && <span style={{ color: 'var(--amber-text)' }}> *</span>}
              </span>
              <span className={`map-chip ${state.cls}`}>{state.label}</span>
            </div>
          );
        })}
      </div>

      <div className="trace" style={{ alignItems: 'flex-start' }}>
        <Icon name="sparkles" size={15} color="var(--blue)" style={{ marginTop: 2 }} />
        <p style={{ margin: 0, fontSize: 12.5, color: 'var(--text-2)', lineHeight: 1.6, flex: 1 }}>
          Suggested mappings are proposals from header names and column contents. Nothing is applied
          until you continue. Fields marked <span style={{ color: 'var(--amber-text)' }}>*</span> are required.
        </p>
      </div>
    </div>
  );
}

export default ColumnMapper;
