import { PCS_FIELDS } from '../../core/schema.js';
import { Icon } from '../icons.jsx';

const usdCompact = (v) => {
  if (!Number.isFinite(v)) return '—';
  if (v >= 1e9) return `$${(v / 1e9).toFixed(1)}B`;
  if (v >= 1e6) return `$${(v / 1e6).toFixed(1)}M`;
  if (v >= 1e3) return `$${Math.round(v / 1e3)}K`;
  return `$${Math.round(v)}`;
};

const year = (d) => (d instanceof Date ? d.getUTCFullYear() : null);

/** Header plus the four headline tiles: white with a hairline, colour only in the type. */
export function PortfolioOverview({ profile, sourceName, onExport, onReset }) {
  const t = profile.totals;
  const coverage = PCS_FIELDS
    .map((f) => profile.dataQuality.coverage[f]?.byDollars ?? 0)
    .reduce((a, b, _, arr) => a + b / arr.length, 0);

  const from = year(t.firstAward);
  const to = year(t.lastAward);
  const span = from && to ? (from === to ? `${from}` : `${from}–${to}`) : 'undated';

  const tiles = [
    { label: 'Total giving', value: usdCompact(t.totalDollars), labelColor: 'var(--teal-text)', valueColor: 'var(--teal-deep)' },
    { label: 'Organizations', value: t.recipientCount.toLocaleString(), labelColor: 'var(--blue)', valueColor: 'var(--blue-deep)' },
    { label: 'Median grant', value: usdCompact(profile.practice.grantSize.median), labelColor: 'var(--green-text)', valueColor: 'var(--green-deep)' },
    { label: 'PCS coverage', value: `${Math.round(coverage * 100)}%`, labelColor: 'var(--teal-text)', valueColor: 'var(--teal-deep)' },
  ];

  return (
    <>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: '1.25rem', flexWrap: 'wrap' }}>
        <div className="hstack">
          <div className="icon-tile">
            <Icon name="wave-sine" size={19} color="var(--teal-text)" />
          </div>
          <div>
            <p style={{ fontSize: 15, fontWeight: 500, color: 'var(--text)' }}>{sourceName}</p>
            <p style={{ fontSize: 13, color: 'var(--text-2)' }}>
              {span} portfolio · {t.grantCount.toLocaleString()} grants
            </p>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn" onClick={onReset}>
            <Icon name="refresh" size={15} color="var(--text-2)" />
            New upload
          </button>
          <button className="btn" onClick={onExport}>
            <Icon name="download" size={15} color="var(--text-2)" />
            Export
          </button>
        </div>
      </div>

      <div className="tiles">
        {tiles.map((tile) => (
          <div className="tile" key={tile.label}>
            <p className="tile-label" style={{ color: tile.labelColor }}>{tile.label}</p>
            <p className="tile-value" style={{ color: tile.valueColor }}>{tile.value}</p>
          </div>
        ))}
      </div>
    </>
  );
}

export default PortfolioOverview;
