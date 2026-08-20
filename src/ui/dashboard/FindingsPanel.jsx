import { Icon } from '../icons.jsx';

const TONE = {
  strength: { cls: 'note-green', color: 'var(--green-text)' },
  opportunity: { cls: 'note-amber', color: 'var(--amber-text)' },
  gap: { cls: 'note-blue', color: 'var(--blue)' },
};

/**
 * Findings are detected deterministically in report/findings.js; this only
 * renders them. Each carries a metricRef into the profile, so every claim on
 * screen points at the computed value behind it.
 */
export function FindingsPanel({ findings }) {
  return (
    <div className="card">
      <p className="card-title" style={{ marginBottom: 14 }}>Findings</p>

      {findings.length === 0 ? (
        <p className="card-sub">
          Nothing stood out. Findings appear when alignment diverges from a stated strategy, when
          coverage is too thin to report on, or — once a peer corpus exists — when a measure sits
          far from the peer median.
        </p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {findings.map((f) => {
            const tone = TONE[f.level] ?? TONE.gap;
            return (
              <div className={`note ${tone.cls}`} key={f.id}>
                <Icon name={f.icon} size={17} color={tone.color} style={{ marginTop: 1 }} />
                <div>
                  <p className="note-title">{f.headline}</p>
                  <p className="note-body">{f.body}</p>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <p className="card-foot">
        <Icon name="math-function" size={14} color="var(--text-muted)" style={{ display: 'inline-block', verticalAlign: -2, marginRight: 4 }} />
        Detected by rule from computed metrics. Every number traces to a calculation — no wording is
        model-generated.
      </p>
    </div>
  );
}

export default FindingsPanel;
