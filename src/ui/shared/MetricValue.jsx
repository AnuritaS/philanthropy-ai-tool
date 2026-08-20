import { Icon } from '../icons.jsx';

/**
 * The component every computed number renders through.
 *
 * A metric is inseparable from the coverage it was computed on, so this takes
 * both and refuses to draw a bare figure: when the gate suppressed a metric it
 * renders the stated reason instead of a blank or a zero.
 *
 * @param {object} metric - a gated result: { value, suppressed, coverage, reason }
 */
export function MetricValue({ label, sub, metric, format = (v) => v, bar, children }) {
  const suppressed = metric?.suppressed ?? metric?.value === null;
  const coverage = metric?.coverage;

  return (
    <div>
      <div className="row-head">
        <span className="row-label">
          {label}
          {sub && <span className="row-note"> {sub}</span>}
        </span>
        {suppressed ? (
          <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>suppressed</span>
        ) : (
          <span className="row-value">
            <strong>{format(metric.value)}</strong>
            {coverage !== undefined && (
              <span className="row-note"> on {(coverage * 100).toFixed(0)}% of dollars</span>
            )}
          </span>
        )}
      </div>

      {suppressed ? (
        <div className="note note-sm note-amber">
          <Icon name="alert-triangle" size={15} color="var(--amber-text)" style={{ marginTop: 1 }} />
          <span className="note-body-sm">{metric?.reason ?? 'Not enough data to report this measure.'}</span>
        </div>
      ) : (
        children ?? (bar !== undefined && (
          <div className="track">
            <div className="track-fill" style={{ width: `${Math.max(0, Math.min(1, bar)) * 100}%`, background: 'var(--teal-bar)' }} />
          </div>
        ))
      )}
    </div>
  );
}

export default MetricValue;
