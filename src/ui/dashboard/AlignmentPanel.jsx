import { CalculationTrace } from '../shared/CalculationTrace.jsx';

const LABEL = { subject: 'Subject', population: 'Population', geography: 'Geography' };

/** Bar colour tracks how far the score sits from the stated intent. */
const barColor = (score) =>
  score >= 0.75 ? 'var(--teal-bar)' : score >= 0.5 ? 'var(--amber-bar)' : 'var(--amber-bar)';

/**
 * The only scored panel. Everything here is measured against the foundation's
 * own declared priorities, never against other foundations — alignment scores
 * are not comparable across portfolios.
 */
export function AlignmentPanel({ alignment }) {
  const dimensions = Object.entries(alignment?.dimensions ?? {});
  const scored = dimensions.filter(([, r]) => !r.suppressed && r.value);
  const traceable = scored.find(([, r]) => r.value?.components);

  return (
    <div className="card">
      <div className="card-head">
        <p className="card-title">Alignment with your stated strategy</p>
        <span className="chip chip-teal">scored</span>
      </div>
      <p className="card-sub" style={{ marginBottom: 14 }}>
        Measured against priorities you declared. Not compared to peers.
      </p>

      <div className="stack">
        {dimensions.map(([name, result]) => {
          const label = LABEL[name] ?? name;

          if (result.suppressed) {
            const undeclared = /stated strategy/.test(result.reason ?? '');
            return (
              <div key={name}>
                <div className="row-head">
                  <span className="row-label">{label}</span>
                  <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>
                    {undeclared ? 'not declared' : 'suppressed'}
                  </span>
                </div>
                <div className="track-empty" />
                {!undeclared && (
                  <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 5 }}>{result.reason}</p>
                )}
              </div>
            );
          }

          const score = result.value.score;
          return (
            <div key={name}>
              <div className="row-head">
                <span className="row-label">{label}</span>
                <span className="row-value">
                  <strong>{score.toFixed(2)}</strong>
                  <span className="row-note"> on {(result.coverage * 100).toFixed(0)}% of dollars</span>
                </span>
              </div>
              <div className="track">
                <div className="track-fill" style={{ width: `${score * 100}%`, background: barColor(score) }} />
              </div>
            </div>
          );
        })}
      </div>

      {traceable && <CalculationTrace dimension={LABEL[traceable[0]]} result={traceable[1]} />}

      {scored.length === 0 && (
        <p className="card-foot">
          No priorities declared yet, so nothing is scored. Alignment appears once you state what the
          portfolio is meant to fund.
        </p>
      )}
    </div>
  );
}

export default AlignmentPanel;
