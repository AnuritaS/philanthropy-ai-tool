import { useState } from 'react';
import { Icon } from '../icons.jsx';

/**
 * The "why did I get 0.41?" drawer.
 *
 * Reads the `components` object alignmentScore already returns, so the shown
 * arithmetic is the arithmetic that ran — not a re-derivation that could drift
 * from it.
 */
export function CalculationTrace({ dimension, result }) {
  const [open, setOpen] = useState(false);
  const c = result?.value?.components;
  if (!c) return null;

  const usd = (n) => `$${Math.round(n).toLocaleString()}`;
  const hasWeights = c.totalVariationDistance !== null && c.totalVariationDistance !== undefined;
  const score = result.value.score;

  const formula = hasWeights
    ? `${dimension} ${score.toFixed(2)} = coverage ${c.coverage.toFixed(2)} × (1 − TVD ${c.totalVariationDistance.toFixed(2)})`
    : `${dimension} ${score.toFixed(2)} = coverage ${c.coverage.toFixed(2)}`;

  return (
    <>
      <div className="trace">
        <Icon name="math-function" size={16} color="var(--blue)" />
        <span className="trace-text">{formula}</span>
        <button
          className="trace-text"
          onClick={() => setOpen((v) => !v)}
          style={{ marginLeft: 'auto', color: 'var(--blue)', padding: 0 }}
          aria-expanded={open}
        >
          {open ? 'Hide trace' : 'Full trace'}
        </button>
      </div>

      {open && (
        <div style={{ marginTop: 10, background: 'var(--blue-fill)', borderRadius: 'var(--r-md)', padding: '0.85rem 1rem' }}>
          <dl style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '6px 16px', fontSize: 13, margin: 0 }}>
            <dt style={{ color: 'var(--blue)' }}>Declared priorities</dt>
            <dd style={{ color: 'var(--blue-deep)', fontFamily: 'var(--font-mono)', fontSize: 12.5 }}>{c.priorities.join(', ')}</dd>

            <dt style={{ color: 'var(--blue)' }}>Aligned dollars</dt>
            <dd style={{ color: 'var(--blue-deep)' }}>{usd(c.alignedDollars)}</dd>

            <dt style={{ color: 'var(--blue)' }}>Classified dollars</dt>
            <dd style={{ color: 'var(--blue-deep)' }}>{usd(c.classifiedDollars)}</dd>

            <dt style={{ color: 'var(--blue)' }}>Coverage</dt>
            <dd style={{ color: 'var(--blue-deep)' }}>
              {usd(c.alignedDollars)} ÷ {usd(c.classifiedDollars)} = {c.coverage.toFixed(4)}
            </dd>

            {hasWeights && (
              <>
                <dt style={{ color: 'var(--blue)' }}>Total variation distance</dt>
                <dd style={{ color: 'var(--blue-deep)' }}>{c.totalVariationDistance.toFixed(4)}</dd>
              </>
            )}

            <dt style={{ color: 'var(--blue)' }}>Score</dt>
            <dd style={{ color: 'var(--blue-deep)', fontWeight: 500 }}>{score.toFixed(4)}</dd>
          </dl>
          <p style={{ marginTop: 10, fontSize: 12, color: 'var(--blue)', lineHeight: 1.6 }}>
            Dollars are attributed fractionally: a grant carrying three subject codes contributes a
            third of its amount to each.
          </p>
        </div>
      )}
    </>
  );
}

export default CalculationTrace;
