import { PCS_FIELDS } from '../../core/schema.js';
import { fieldCoverage } from '../../core/validation.js';
import { Icon } from '../icons.jsx';

/**
 * "What came through": dollar coverage per analytic field, plus what needs
 * attention. Coverage is shown by dollars because a portfolio can have 95% of
 * rows coded and still be missing codes on the grants carrying half the money.
 */

const LABEL = {
  amount: 'Grant amounts',
  award_date: 'Award dates',
  pcs_subject: 'PCS subject',
  pcs_population: 'PCS population',
  pcs_support_strategy: 'Support strategy',
  pcs_transaction_type: 'Transaction type',
  duration_months: 'Grant duration',
  geo_state: 'Geography',
  description: 'Purpose text',
};

const TRACKED = ['amount', 'award_date', ...PCS_FIELDS, 'duration_months', 'geo_state', 'description'];
const THRESHOLD = 0.7;

export function ValidationReport({ grants, problems, onContinue }) {
  const rows = TRACKED.map((field) => ({ field, ...fieldCoverage(grants, field) }));

  const quarantined = problems.filter((p) => !p.warningOnly);
  const warnings = problems.filter((p) => p.warningOnly);
  const uncodedWithText = grants.filter(
    (g) => (!g.pcs_subject || g.pcs_subject.length === 0) && g.description,
  ).length;

  const issueSummary = summarize(problems);

  return (
    <div className="card">
      <p className="card-title" style={{ marginBottom: 14 }}>What came through</p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 11, marginBottom: 14 }}>
        {rows.map((r) => {
          const low = r.byDollars < THRESHOLD;
          return (
            <div key={r.field}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4, gap: 10 }}>
                <span style={{ fontSize: 13, color: 'var(--text)' }}>{LABEL[r.field] ?? r.field}</span>
                <span style={{ fontSize: 13, color: low ? 'var(--amber-text)' : 'var(--text-2)' }}>
                  {(r.byDollars * 100).toFixed(1)}%
                </span>
              </div>
              <div className="track-thin">
                <div
                  className="track-fill"
                  style={{
                    width: `${Math.max(r.byDollars * 100, r.byDollars > 0 ? 1.5 : 0)}%`,
                    background: low ? 'var(--amber-bar)' : 'var(--teal-bar)',
                  }}
                />
              </div>
            </div>
          );
        })}
      </div>

      {uncodedWithText > 0 && (
        <div className="note note-blue" style={{ marginBottom: 10 }}>
          <Icon name="wand" size={17} color="var(--blue)" style={{ marginTop: 1 }} />
          <div style={{ flex: 1 }}>
            <p className="note-title">
              {uncodedWithText.toLocaleString()} grant{uncodedWithText === 1 ? ' has' : 's have'} no subject code
            </p>
            <p className="note-body" style={{ marginBottom: 10 }}>
              Their purpose text could be classified into PCS codes. Low-confidence results would be
              left blank rather than guessed.
            </p>
            <button className="btn btn-blue" disabled title="Automatic classification arrives with the AI layer">
              Classify from purpose text — not yet available
            </button>
          </div>
        </div>
      )}

      {problems.length > 0 && (
        <div className="note note-amber" style={{ marginBottom: 10 }}>
          <Icon name="alert-triangle" size={17} color="var(--amber-text)" style={{ marginTop: 1 }} />
          <div>
            <p className="note-title">
              {problems.length} row{problems.length === 1 ? '' : 's'} need attention
            </p>
            <p className="note-body">
              {issueSummary}. {quarantined.length > 0
                ? `${quarantined.length} held aside, not dropped.`
                : 'All were kept; none were dropped.'}
              {warnings.length > 0 && ` ${warnings.length} kept with a warning.`}
            </p>
          </div>
        </div>
      )}

      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 4 }}>
        <button className="btn btn-primary" onClick={onContinue}>
          Continue with {grants.length.toLocaleString()} grants
          <Icon name="arrow-right" size={15} color="#fff" />
        </button>
        <span style={{ fontSize: 12.5, color: 'var(--text-muted)' }}>
          Nothing leaves your browser.
        </span>
      </div>
    </div>
  );
}

/** Roll per-row issues up into one readable sentence. */
function summarize(problems) {
  const counts = new Map();
  for (const p of problems) {
    for (const issue of p.issues) {
      const key = issue
        .replace(/^missing required field: /, 'missing ')
        .replace(/unparseable (\w+) in (\w+).*/, 'unparseable $2')
        .replace(/non-positive amount.*/, 'non-positive amount');
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
  }
  const parts = [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 4)
    .map(([label, n]) => `${n} ${label.replace(/_/g, ' ')}`);
  return parts.join(', ');
}

export default ValidationReport;
