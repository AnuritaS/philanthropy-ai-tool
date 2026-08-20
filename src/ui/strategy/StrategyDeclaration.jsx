import { useMemo, useState } from 'react';
import { roots, labelFor } from '../../taxonomy/index.js';
import { Icon } from '../icons.jsx';

/**
 * Step 3: declare priorities.
 *
 * Alignment is the only scored dimension, and it is scored against what the
 * foundation says its strategy is. Nothing is inferred here — an undeclared
 * dimension stays undeclared and is excluded from the composite rather than
 * counted as a zero.
 */

const DIMENSIONS = [
  { key: 'subject', facet: 'subjects', title: 'Subject priorities', help: 'Which fields of work the portfolio is meant to fund.' },
  { key: 'population', facet: 'populations', title: 'Population priorities', help: 'Which communities the portfolio is meant to reach.' },
];

export function StrategyDeclaration({ grants, strategy, onChange, onContinue, onSkip }) {
  const [open, setOpen] = useState('subject');

  const states = useMemo(
    () => [...new Set(grants.map((g) => g.geo_state).filter(Boolean))].sort(),
    [grants],
  );

  /* Functional update, not a read of the current prop: two selections made
     before a re-render would otherwise each start from the same stale value
     and the second would discard the first. */
  const toggle = (dimension, code) => {
    onChange((prev) => {
      const current = prev[dimension]?.priorities ?? [];
      const next = current.includes(code) ? current.filter((c) => c !== code) : [...current, code];
      return {
        ...prev,
        [dimension]: next.length ? { priorities: next } : undefined,
        source: 'user',
        declaredAt: new Date().toISOString(),
      };
    });
  };

  const declaredCount = ['subject', 'population', 'geography']
    .filter((d) => (strategy[d]?.priorities ?? []).length > 0).length;

  return (
    <div className="card">
      <div className="card-head">
        <p className="card-title">Declare your strategy</p>
        <span className="chip chip-teal">optional</span>
      </div>
      <p className="card-sub" style={{ marginBottom: 16 }}>
        Alignment asks one question with a defensible answer: does the money go where you say it
        goes? Declare only the dimensions you actually have a strategy for — silence is not
        misalignment, and undeclared dimensions are left unscored.
      </p>

      {DIMENSIONS.map(({ key, facet, title, help }) => {
        const selected = strategy[key]?.priorities ?? [];
        const isOpen = open === key;
        return (
          <div key={key} style={{ borderTop: '0.5px solid var(--hairline)', paddingTop: 12, marginTop: 12 }}>
            <button
              onClick={() => setOpen(isOpen ? null : key)}
              style={{ display: 'flex', width: '100%', alignItems: 'baseline', justifyContent: 'space-between', gap: 10, padding: 0 }}
              aria-expanded={isOpen}
            >
              <span style={{ fontSize: 14, fontWeight: 500, color: 'var(--text)' }}>{title}</span>
              <span style={{ fontSize: 12.5, color: selected.length ? 'var(--teal-text)' : 'var(--text-muted)' }}>
                {selected.length ? `${selected.length} selected` : 'not declared'}
              </span>
            </button>
            <p style={{ fontSize: 12.5, color: 'var(--text-muted)', marginTop: 3 }}>{help}</p>

            {isOpen && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 10 }}>
                {roots(facet).map((node) => {
                  const code = node.code.slice(0, 2);
                  const on = selected.includes(code);
                  return (
                    <button
                      key={node.code}
                      onClick={() => toggle(key, code)}
                      className="chip"
                      style={{
                        border: `0.5px solid ${on ? 'var(--teal-bar)' : 'var(--control-line)'}`,
                        background: on ? 'var(--teal-fill)' : 'var(--card)',
                        color: on ? 'var(--teal-text)' : 'var(--text-2)',
                        display: 'inline-flex', alignItems: 'center', gap: 5,
                      }}
                      aria-pressed={on}
                    >
                      {on && <Icon name="check" size={12} color="var(--teal-bar)" />}
                      {node.label}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}

      {states.length > 0 && (
        <div style={{ borderTop: '0.5px solid var(--hairline)', paddingTop: 12, marginTop: 12 }}>
          <button
            onClick={() => setOpen(open === 'geography' ? null : 'geography')}
            style={{ display: 'flex', width: '100%', alignItems: 'baseline', justifyContent: 'space-between', gap: 10, padding: 0 }}
            aria-expanded={open === 'geography'}
          >
            <span style={{ fontSize: 14, fontWeight: 500, color: 'var(--text)' }}>Geographic priorities</span>
            <span style={{ fontSize: 12.5, color: (strategy.geography?.priorities ?? []).length ? 'var(--teal-text)' : 'var(--text-muted)' }}>
              {(strategy.geography?.priorities ?? []).length ? `${strategy.geography.priorities.length} selected` : 'not declared'}
            </span>
          </button>
          <p style={{ fontSize: 12.5, color: 'var(--text-muted)', marginTop: 3 }}>
            Drawn from the states present in your data.
          </p>
          {open === 'geography' && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 10 }}>
              {states.map((s) => {
                const on = (strategy.geography?.priorities ?? []).includes(s);
                return (
                  <button
                    key={s} onClick={() => toggle('geography', s)} className="chip" aria-pressed={on}
                    style={{
                      border: `0.5px solid ${on ? 'var(--teal-bar)' : 'var(--control-line)'}`,
                      background: on ? 'var(--teal-fill)' : 'var(--card)',
                      color: on ? 'var(--teal-text)' : 'var(--text-2)',
                      fontFamily: 'var(--font-mono)',
                    }}
                  >
                    {s}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}

      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 18 }}>
        <button className="btn btn-primary" onClick={onContinue} disabled={declaredCount === 0}>
          Score alignment on {declaredCount} dimension{declaredCount === 1 ? '' : 's'}
          <Icon name="arrow-right" size={15} color="#fff" />
        </button>
        <button className="btn" onClick={onSkip}>Skip — show practice profile only</button>
      </div>

      <p className="card-foot">
        Codes resolve against the pinned PCS release, so {labelFor('subjects', 'SB')} means the same
        thing here as in any other PCS-coded portfolio.
      </p>
    </div>
  );
}

export default StrategyDeclaration;
