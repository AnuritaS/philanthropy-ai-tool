import { useCallback, useMemo, useState } from 'react';

import { parseCsv } from './ingestion/parsers/csv.js';
import { parseJson } from './ingestion/parsers/json.js';
import { parseExcel } from './ingestion/parsers/excel.js';
import { suggestMapping, missingRequired } from './ingestion/mapping.js';
import { normalizeDataset } from './core/schema.js';
import { profileFromRows } from './core/index.js';
import { detectFindings } from './report/findings.js';

import { Icon } from './ui/icons.jsx';
import DropZone from './ui/upload/DropZone.jsx';
import ColumnMapper from './ui/upload/ColumnMapper.jsx';
import ValidationReport from './ui/upload/ValidationReport.jsx';
import StrategyDeclaration from './ui/strategy/StrategyDeclaration.jsx';
import Dashboard from './ui/dashboard/Dashboard.jsx';

import pcsCodedSample from '../sample_data/pcs-coded-sample.csv?raw';
import uncodedSample from '../sample_data/uncoded-sample.csv?raw';
import messySample from '../sample_data/messy-sample.csv?raw';

const STEPS = ['Upload', 'Map columns', 'Declare strategy', 'Profile'];

const SAMPLES = [
  { name: 'pcs-coded-sample.csv', text: pcsCodedSample, blurb: 'a funder that codes its grants' },
  { name: 'uncoded-sample.csv', text: uncodedSample, blurb: 'free text, no PCS codes' },
  { name: 'messy-sample.csv', text: messySample, blurb: 'defects on purpose' },
];

/** Route a file to the right parser by extension, falling back to content sniffing. */
async function parseFile(file) {
  const name = file.name.toLowerCase();
  if (name.endsWith('.xlsx')) return parseExcel(await file.arrayBuffer());

  const text = await file.text();
  if (name.endsWith('.json') || name.endsWith('.ndjson')) return parseJson(text);
  if (text.trimStart().startsWith('[') || text.trimStart().startsWith('{')) return parseJson(text);
  return parseCsv(text);
}

export default function App() {
  const [step, setStep] = useState(0);
  const [source, setSource] = useState(null);      // { name, headers, rows }
  const [mapping, setMapping] = useState({});
  const [confidence, setConfidence] = useState({});
  const [strategy, setStrategy] = useState({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  /* Normalized rows for the validation report — the same path the profile uses. */
  const normalized = useMemo(() => {
    if (!source || missingRequired(mapping).length > 0) return null;
    return normalizeDataset(source.rows, mapping);
  }, [source, mapping]);

  const profile = useMemo(() => {
    if (!source || step < 3 || missingRequired(mapping).length > 0) return null;
    return profileFromRows(source.rows, mapping, { strategy });
  }, [source, mapping, strategy, step]);

  const findings = useMemo(() => (profile ? detectFindings(profile, null) : []), [profile]);

  const ingest = useCallback((name, parsed) => {
    if (!parsed.headers.length) throw new Error('No columns found — is this a spreadsheet or CSV?');
    if (!parsed.rows.length) throw new Error('The file has a header row but no data rows.');
    const suggestion = suggestMapping(parsed.headers, parsed.rows);
    setSource({ name, headers: parsed.headers, rows: parsed.rows });
    setMapping(suggestion.mapping);
    setConfidence(suggestion.confidence);
    setStep(1);
  }, []);

  const onFile = useCallback(async (file) => {
    setBusy(true);
    setError(null);
    try {
      if (file.size > 25 * 1024 * 1024) throw new Error(`File is ${(file.size / 1e6).toFixed(1)}MB; the limit is 25MB.`);
      ingest(file.name, await parseFile(file));
    } catch (e) {
      setError(e.message || String(e));
    } finally {
      setBusy(false);
    }
  }, [ingest]);

  const loadSample = useCallback((sample) => {
    setError(null);
    try {
      ingest(sample.name, parseCsv(sample.text));
    } catch (e) {
      setError(e.message || String(e));
    }
  }, [ingest]);

  const reset = () => {
    setStep(0); setSource(null); setMapping({}); setConfidence({}); setStrategy({}); setError(null);
  };

  const exportProfile = () => {
    const blob = new Blob([JSON.stringify(profile, replacer, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${source.name.replace(/\.[^.]+$/, '')}-profile.json`;
    document.body.appendChild(a); a.click(); a.remove();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="page">
      <header style={{ marginBottom: '1.5rem' }}>
        <h1 style={{ fontSize: 20, fontWeight: 500, color: 'var(--text)', letterSpacing: '-0.01em' }}>
          Open Philanthropy Benchmark
        </h1>
        <p style={{ fontSize: 13.5, color: 'var(--text-2)', marginTop: 3, maxWidth: '60ch', lineHeight: 1.6 }}>
          Reads a grant portfolio and reports where the money went, on what terms, and how closely
          that tracks the strategy you state. It does not claim to measure what the money caused.
        </p>
      </header>

      <nav className="steps" aria-label="Progress">
        {STEPS.map((label, i) => (
          <span key={label} style={{ display: 'contents' }}>
            <span
              className={`step${i === step ? ' step-active' : i < step ? ' step-done' : ''}`}
              aria-current={i === step ? 'step' : undefined}
            >
              {i + 1} {label}
            </span>
            {i < STEPS.length - 1 && <Icon name="chevron-right" size={14} color="var(--rule-soft)" />}
          </span>
        ))}
      </nav>

      {step === 0 && (
        <>
          <DropZone onFile={onFile} busy={busy} error={error} />
          <div className="card">
            <p className="card-title" style={{ marginBottom: 4 }}>Or start from a sample</p>
            <p className="card-sub" style={{ marginBottom: 14 }}>
              Three portfolios that exercise the engine in different ways.
            </p>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {SAMPLES.map((s) => (
                <button key={s.name} className="btn" onClick={() => loadSample(s)}>
                  <Icon name="file-spreadsheet" size={15} color="var(--teal-bar)" />
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12.5 }}>{s.name}</span>
                  <span style={{ color: 'var(--text-muted)', fontSize: 12.5 }}>· {s.blurb}</span>
                </button>
              ))}
            </div>
          </div>
        </>
      )}

      {step === 1 && source && (
        <>
          <ColumnMapper
            file={source.name}
            headers={source.headers}
            rowCount={source.rows.length}
            mapping={mapping}
            confidence={confidence}
            onChange={(field, column) => setMapping((m) => ({ ...m, [field]: column }))}
          />
          {normalized ? (
            <ValidationReport
              grants={normalized.grants}
              problems={normalized.problems}
              onContinue={() => setStep(2)}
            />
          ) : (
            <div className="card">
              <div className="note note-amber">
                <Icon name="alert-triangle" size={17} color="var(--amber-text)" style={{ marginTop: 1 }} />
                <div>
                  <p className="note-title">Map the required fields to continue</p>
                  <p className="note-body">
                    Still needed: {missingRequired(mapping).join(', ')}. Every grant needs an
                    identifier, a recipient, an amount and a date before anything can be computed.
                  </p>
                </div>
              </div>
            </div>
          )}
        </>
      )}

      {step === 2 && normalized && (
        <StrategyDeclaration
          grants={normalized.grants}
          strategy={strategy}
          onChange={setStrategy}
          onContinue={() => setStep(3)}
          onSkip={() => { setStrategy({}); setStep(3); }}
        />
      )}

      {step === 3 && profile && normalized && (
        <Dashboard
          profile={profile}
          grants={normalized.grants}
          findings={findings}
          sourceName={source.name}
          onExport={exportProfile}
          onReset={reset}
        />
      )}

      <footer style={{ marginTop: '2rem', paddingTop: '1rem', borderTop: '0.5px solid var(--hairline)', fontSize: 12.5, color: 'var(--text-muted)', lineHeight: 1.7 }}>
        <p>
          Classification uses Candid's{' '}
          <a href="https://taxonomy.candid.org" target="_blank" rel="noopener noreferrer">Philanthropy Classification System</a>,
          November 2024 release, under CC BY 4.0. Measures are defined in METHODOLOGY.md.
        </p>
        <p style={{ marginTop: 4 }}>
          Built by Anurita Srivastava ·{' '}
          <a href="https://www.linkedin.com/feed/update/urn:li:activity:7435606470022307840/" target="_blank" rel="noopener noreferrer">
            why I built this
          </a>
        </p>
      </footer>
    </div>
  );
}

/** Maps and Dates do not survive JSON.stringify; make the export readable. */
function replacer(_key, value) {
  if (value instanceof Map) return Object.fromEntries(value);
  return value;
}
