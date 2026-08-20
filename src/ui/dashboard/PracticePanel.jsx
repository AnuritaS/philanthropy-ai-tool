import { MetricValue } from '../shared/MetricValue.jsx';
import { Icon } from '../icons.jsx';

const pct = (v) => `${(v * 100).toFixed(0)}%`;
const usd = (v) => (Number.isFinite(v) ? `$${Math.round(v).toLocaleString()}` : '—');

/**
 * Descriptive measures. Nothing here is scored.
 *
 * A community foundation is supposed to concentrate geographically; a
 * disease-specific funder is supposed to concentrate by subject. Grading these
 * would encode a contested position as arithmetic, so the panel reports figures
 * and waits for a peer distribution to give them meaning.
 */
export function PracticePanel({ practice, peers = null }) {
  const c = practice;

  const concentrations = [
    { key: 'subjectConcentration', label: 'Subject concentration' },
    { key: 'populationConcentration', label: 'Population concentration' },
    { key: 'geographicConcentration', label: 'Geographic concentration' },
    { key: 'recipientConcentration', label: 'Recipient concentration' },
  ];

  return (
    <div className="card">
      <div className="card-head">
        <p className="card-title">Practice profile</p>
        <span className="chip chip-blue">descriptive</span>
      </div>
      <p className="card-sub" style={{ marginBottom: 16 }}>
        {peers
          ? `Not scored. Your value against ${peers.size} peer foundations of similar size and subject mix.`
          : 'Not scored. These figures describe strategy, not quality — they acquire meaning against a peer distribution.'}
      </p>

      <div className="stack-lg">
        <MetricValue
          label="Flexible funding"
          metric={c.flexibility}
          format={pct}
          bar={c.flexibility?.value}
        />
        <MetricValue
          label="Multi-year support"
          metric={c.multiYear}
          format={pct}
          bar={c.multiYear?.value}
        />

        {concentrations.map(({ key, label }) => {
          const m = c[key];
          const measured = m.attributedDollars > 0;
          return (
            <div key={key}>
              <div className="row-head">
                <span className="row-label">
                  {label}
                  {measured && (
                    <span className="row-note"> HHI {m.hhi.toFixed(2)} · {m.categoryCount} categories</span>
                  )}
                </span>
                {measured ? (
                  <span className="row-value">
                    <strong>{m.effectiveCategories.toFixed(1)}</strong>
                    <span className="row-note"> effective categories</span>
                  </span>
                ) : (
                  <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>no coded dollars</span>
                )}
              </div>
              {measured ? (
                <div className="track">
                  <div
                    className="track-fill"
                    style={{ width: `${Math.min(1, m.normalizedHHI) * 100}%`, background: 'var(--teal-bar-soft)' }}
                  />
                </div>
              ) : (
                <div className="note note-sm note-amber">
                  <Icon name="alert-triangle" size={15} color="var(--amber-text)" style={{ marginTop: 1 }} />
                  <span className="note-body-sm">
                    No dollars carry this classification, so concentration cannot be measured.
                  </span>
                </div>
              )}
            </div>
          );
        })}

        <div>
          <div className="row-head">
            <span className="row-label">Top-10 recipient share</span>
            <span className="row-value"><strong>{pct(c.topTenRecipientShare)}</strong></span>
          </div>
          <div className="track">
            <div className="track-fill" style={{ width: `${c.topTenRecipientShare * 100}%`, background: 'var(--teal-bar-soft)' }} />
          </div>
        </div>

        <div>
          <div className="row-head">
            <span className="row-label">Grant size</span>
            <span className="row-value">
              <strong>{usd(c.grantSize.median)}</strong>
              <span className="row-note"> median</span>
            </span>
          </div>
          <p style={{ fontSize: 12.5, color: 'var(--text-2)' }}>
            Interquartile range {usd(c.grantSize.p25)} – {usd(c.grantSize.p75)} · range {usd(c.grantSize.min)} – {usd(c.grantSize.max)}
          </p>
          <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 3 }}>
            Median rather than mean: grant portfolios are heavily right-skewed, and the mean is
            usually a description of the single largest grant.
          </p>
        </div>
      </div>

      {!peers && (
        <div className="note note-blue" style={{ marginTop: 16 }}>
          <Icon name="database" size={17} color="var(--blue)" style={{ marginTop: 1 }} />
          <div>
            <p className="note-title">Peer percentiles are not available yet</p>
            <p className="note-body">
              Percentiles need a peer corpus built from IRS Form 990-PF filings. Until that exists
              these figures stand alone — a number invented here would be worse than none.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

export default PracticePanel;
