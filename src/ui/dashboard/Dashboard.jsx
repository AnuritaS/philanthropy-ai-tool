import { useMemo, useState } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, LineChart, Line, CartesianGrid, Legend,
} from 'recharts';

import { PCS_FIELDS } from '../../core/schema.js';
import { Icon } from '../icons.jsx';
import { MetricValue } from '../shared/MetricValue.jsx';
import { CalculationTrace } from '../shared/CalculationTrace.jsx';
import FindingsPanel from './FindingsPanel.jsx';
import {
  toChartRecords, deriveFunders, breakdownBy, sliceBy, yearSeries, yearExtent,
  sizeSeries, SERIES, fmtUSD, fmtM, pct,
} from './adapters.js';

const TABS = ['overview', 'sectors', 'geography', 'grant size', 'impact', 'strategy'];

const AXIS = { fill: '#90A8A2', fontSize: 11 };
const GRID = '#DBE9E4';
const TIP = {
  background: '#FFFFFF',
  border: '0.5px solid #DBE9E4',
  borderRadius: 10,
  fontSize: 12,
  color: '#0F2E27',
  boxShadow: '0 2px 10px rgba(15,46,39,0.06)',
};

/* PCS subject labels run long ("Public safety and disaster management"); at an
   angle they otherwise run into the legend below the plot. */
const truncate = (n) => (v) => (String(v).length > n ? `${String(v).slice(0, n - 1)}…` : v);

const Empty = ({ children }) => (
  <div className="note note-amber">
    <Icon name="alert-triangle" size={17} color="var(--amber-text)" style={{ marginTop: 1 }} />
    <div><p className="note-body">{children}</p></div>
  </div>
);

const Section = ({ children }) => <h3 className="section-title">{children}</h3>;

export default function Dashboard({ profile, grants, findings, sourceName, onExport, onReset }) {
  const [tab, setTab] = useState('overview');

  const records = useMemo(() => toChartRecords(grants), [grants]);
  const funders = useMemo(() => deriveFunders(records), [records]);

  const sectors = useMemo(() => breakdownBy(records, funders, 'sector', { limit: 12 }), [records, funders]);
  const regions = useMemo(() => breakdownBy(records, funders, 'region', { limit: 12 }), [records, funders]);
  const types = useMemo(() => breakdownBy(records, funders, 'grantType'), [records, funders]);
  const recipients = useMemo(() => breakdownBy(records, funders, 'recipient', { limit: 10 }), [records, funders]);
  const trend = useMemo(() => yearSeries(records, funders), [records, funders]);
  const sizes = useMemo(() => sizeSeries(records, funders), [records, funders]);
  const extent = useMemo(() => yearExtent(records), [records]);

  const has = useMemo(() => ({
    sector: records.some((r) => r.sector),
    region: records.some((r) => r.region),
    type: records.some((r) => r.grantType),
    population: records.some((r) => r.population),
  }), [records]);

  const t = profile.totals;
  const p = profile.practice;
  const coverage = PCS_FIELDS
    .map((f) => profile.dataQuality.coverage[f]?.byDollars ?? 0)
    .reduce((a, b, _, arr) => a + b / arr.length, 0);

  const span = extent ? (extent.min === extent.max ? `${extent.min}` : `${extent.min}–${extent.max}`) : 'undated';

  return (
    <>
      {/* ── header ── */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: '1.25rem', flexWrap: 'wrap' }}>
        <div className="hstack">
          <div className="icon-tile"><Icon name="wave-sine" size={19} color="var(--teal-text)" /></div>
          <div>
            <p style={{ fontSize: 15, fontWeight: 500, color: 'var(--text)' }}>{sourceName}</p>
            <p style={{ fontSize: 13, color: 'var(--text-2)' }}>
              {span} portfolio · {t.grantCount.toLocaleString()} grants · {funders.length} funder{funders.length === 1 ? '' : 's'}
            </p>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn" onClick={onReset}><Icon name="refresh" size={15} color="var(--text-2)" />New upload</button>
          <button className="btn" onClick={onExport}><Icon name="download" size={15} color="var(--text-2)" />Export</button>
        </div>
      </div>

      {/* ── KPI tiles ── */}
      <div className="tiles">
        <Tile label="Total giving" value={fmtM(t.totalDollars)} labelColor="var(--teal-text)" valueColor="var(--teal-deep)" />
        <Tile label="Median grant" value={fmtUSD(p.grantSize.median)} labelColor="var(--green-text)" valueColor="var(--green-deep)" />
        <Tile label="Organizations" value={t.recipientCount.toLocaleString()} labelColor="var(--blue)" valueColor="var(--blue-deep)" />
        <Tile label="Total grants" value={t.grantCount.toLocaleString()} labelColor="var(--text-2)" valueColor="var(--text)" />
        <Tile label="PCS coverage" value={`${Math.round(coverage * 100)}%`} labelColor="var(--teal-text)" valueColor="var(--teal-deep)" />
      </div>

      {/* ── tabs ── */}
      <div className="tabs" role="tablist">
        {TABS.map((name) => (
          <button key={name} className="tab" role="tab" aria-selected={tab === name} onClick={() => setTab(name)}>
            {name}
          </button>
        ))}
      </div>

      {/* ══════════ OVERVIEW ══════════ */}
      {tab === 'overview' && (
        <>
          <div className="grid-2">
            {funders.slice(0, 6).map((f) => {
              const own = records.filter((r) => r.funder === f.name);
              const topSectors = sliceBy(own, 'sector', 5).slice(0, 4);
              const topRegion = sliceBy(own, 'region', 3)[0];
              return (
                <div className="card" key={f.key}>
                  <div className="hstack" style={{ gap: 8, marginBottom: 12 }}>
                    <span className="dot" style={{ background: f.color }} />
                    <span style={{ fontSize: 14, fontWeight: 500 }}>{f.name}</span>
                  </div>
                  <div className="grid-auto" style={{ gap: 12, marginBottom: 12 }}>
                    <Stat label="Grants" value={own.length.toLocaleString()} color={f.color} />
                    <Stat label="Disbursed" value={fmtM(f.dollars)} color={f.color} />
                    <Stat label="Median" value={fmtUSD(median(own.map((r) => r.amount)))} />
                    <Stat label="Recipients" value={new Set(own.map((r) => r.recipient)).size.toLocaleString()} />
                  </div>
                  {topRegion && (
                    <p style={{ fontSize: 12.5, color: 'var(--text-2)', marginBottom: 8 }}>
                      Largest share of dollars in {topRegion.name} ({pct(topRegion.value / (f.dollars || 1))}).
                    </p>
                  )}
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                    {topSectors.map((s) => (
                      <span key={s.name} className="chip chip-teal" style={{ fontSize: 11.5 }}>{s.name}</span>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>

          <div className="card">
            <Section>Disbursement trend {span}</Section>
            {trend.length > 1 ? (
              <ResponsiveContainer width="100%" height={230}>
                <LineChart data={trend} margin={{ right: 12, top: 4 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={GRID} vertical={false} />
                  <XAxis dataKey="year" tick={AXIS} axisLine={{ stroke: GRID }} tickLine={false} />
                  <YAxis tickFormatter={fmtUSD} tick={AXIS} axisLine={false} tickLine={false} width={56} />
                  <Tooltip contentStyle={TIP} formatter={(v, n) => [fmtM(v), n]} />
                  <Legend wrapperStyle={{ fontSize: 11.5, color: '#5B7A73' }} />
                  {funders.map((f) => (
                    <Line key={f.key} type="monotone" dataKey={f.key} name={f.name}
                          stroke={f.color} strokeWidth={2} dot={{ r: 2.5, strokeWidth: 0, fill: f.color }} />
                  ))}
                </LineChart>
              </ResponsiveContainer>
            ) : <Empty>Only one award year is present, so there is no trend to plot.</Empty>}
          </div>
        </>
      )}

      {/* ══════════ SECTORS ══════════ */}
      {tab === 'sectors' && (
        <>
          <div className="card">
            <Section>Subject allocation by dollars — PCS</Section>
            {has.sector ? (
              <ResponsiveContainer width="100%" height={390}>
                <BarChart data={sectors} margin={{ left: 4, bottom: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={GRID} vertical={false} />
                  <XAxis dataKey="label" tick={AXIS} axisLine={{ stroke: GRID }} tickLine={false}
                         angle={-35} textAnchor="end" interval={0} height={128} tickFormatter={truncate(26)} />
                  <YAxis tickFormatter={fmtUSD} tick={AXIS} axisLine={false} tickLine={false} width={56} />
                  <Tooltip contentStyle={TIP} formatter={(v, n) => [fmtM(v), n]} cursor={{ fill: '#F2F9F7' }} />
                  <Legend verticalAlign="top" align="left" wrapperStyle={{ fontSize: 11.5, color: '#5B7A73', paddingBottom: 10 }} />
                  {funders.map((f) => (
                    <Bar key={f.key} dataKey={f.key} name={f.name} stackId="s" fill={f.color} radius={[3, 3, 0, 0]} />
                  ))}
                </BarChart>
              </ResponsiveContainer>
            ) : <Empty>No PCS subject codes in this portfolio. Map a subject column, or classify from purpose text once the AI layer lands.</Empty>}
          </div>

          {has.sector && (
            <div className="grid-2">
              <div className="card">
                <Section>Subject mix</Section>
                <PieBlock data={sliceBy(records, 'sector')} />
                <p className="card-foot">
                  Herfindahl {p.subjectConcentration.hhi.toFixed(3)} · normalized {p.subjectConcentration.normalizedHHI.toFixed(3)} ·
                  behaves like {p.subjectConcentration.effectiveCategories.toFixed(1)} evenly-funded categories.
                  Dollars are attributed fractionally across multi-coded grants.
                </p>
              </div>
              <div className="card">
                <Section>{has.population ? 'Population mix' : 'Where the dollars sit'}</Section>
                {has.population
                  ? <PieBlock data={sliceBy(records, 'population')} />
                  : <Empty>No PCS population codes in this portfolio.</Empty>}
              </div>
            </div>
          )}
        </>
      )}

      {/* ══════════ GEOGRAPHY ══════════ */}
      {tab === 'geography' && (
        <>
          <div className="card">
            <Section>Dollars by geography</Section>
            {has.region ? (
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={regions} margin={{ left: 4 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={GRID} vertical={false} />
                  <XAxis dataKey="label" tick={AXIS} axisLine={{ stroke: GRID }} tickLine={false} />
                  <YAxis tickFormatter={fmtUSD} tick={AXIS} axisLine={false} tickLine={false} width={56} />
                  <Tooltip contentStyle={TIP} formatter={(v, n) => [fmtM(v), n]} cursor={{ fill: '#F2F9F7' }} />
                  <Legend verticalAlign="top" align="left" wrapperStyle={{ fontSize: 11.5, color: '#5B7A73', paddingBottom: 10 }} />
                  {funders.map((f) => (
                    <Bar key={f.key} dataKey={f.key} name={f.name} stackId="g" fill={f.color} radius={[3, 3, 0, 0]} />
                  ))}
                </BarChart>
              </ResponsiveContainer>
            ) : <Empty>No geography column mapped, so the geographic view is empty rather than estimated.</Empty>}
            {has.region && (
              <p className="card-foot">
                Geographic Herfindahl {p.geographicConcentration.hhi.toFixed(3)} across
                {' '}{p.geographicConcentration.categoryCount} places. Concentration is reported, not graded:
                a community foundation is supposed to concentrate.
              </p>
            )}
          </div>

          {has.region && (
            <div className="grid-2">
              <div className="card">
                <Section>Geographic mix</Section>
                <PieBlock data={sliceBy(records, 'region')} />
              </div>
              <div className="card">
                <Section>Top recipients by dollars</Section>
                <div className="scroll-x">
                  <table className="table">
                    <thead><tr><th>Recipient</th><th className="num">Dollars</th><th className="num">Grants</th></tr></thead>
                    <tbody>
                      {recipients.map((r) => (
                        <tr key={r.label}>
                          <td>{r.label}</td>
                          <td className="num">{fmtM(r.amount)}</td>
                          <td className="num">{r.count}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <p className="card-foot">Top-10 recipients hold {pct(p.topTenRecipientShare)} of all dollars.</p>
              </div>
            </div>
          )}
        </>
      )}

      {/* ══════════ GRANT SIZE ══════════ */}
      {tab === 'grant size' && (
        <>
          <div className="card">
            <Section>Grant size distribution</Section>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={sizes} margin={{ left: 4 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={GRID} vertical={false} />
                <XAxis dataKey="label" tick={AXIS} axisLine={{ stroke: GRID }} tickLine={false} />
                <YAxis tick={AXIS} axisLine={false} tickLine={false} width={40} allowDecimals={false} />
                <Tooltip contentStyle={TIP} cursor={{ fill: '#F2F9F7' }} />
                <Legend wrapperStyle={{ fontSize: 11.5, color: '#5B7A73' }} />
                {funders.map((f) => (
                  <Bar key={f.key} dataKey={f.key} name={f.name} stackId="z" fill={f.color} radius={[3, 3, 0, 0]} />
                ))}
              </BarChart>
            </ResponsiveContainer>
            <p className="card-foot">Grant counts per band. The dollar totals are heavily weighted to the top band in most portfolios.</p>
          </div>

          <div className="grid-2">
            <div className="card">
              <Section>Support strategy</Section>
              {has.type ? (
                <div className="stack">
                  {types.slice(0, 8).map((row) => (
                    <div key={row.label}>
                      <div className="row-head">
                        <span className="row-label">{row.label}</span>
                        <span className="row-value"><strong>{fmtM(row.amount)}</strong><span className="row-note"> · {row.count} grants</span></span>
                      </div>
                      <div className="track">
                        <div className="track-fill" style={{ width: `${(row.amount / (types[0].amount || 1)) * 100}%`, background: 'var(--teal-bar)' }} />
                      </div>
                    </div>
                  ))}
                </div>
              ) : <Empty>No PCS support strategy codes in this portfolio.</Empty>}
            </div>

            <div className="card">
              <Section>Size statistics</Section>
              <div className="stack">
                <StatRow label="Median" value={fmtUSD(p.grantSize.median)} />
                <StatRow label="Interquartile range" value={`${fmtUSD(p.grantSize.p25)} – ${fmtUSD(p.grantSize.p75)}`} />
                <StatRow label="Range" value={`${fmtUSD(p.grantSize.min)} – ${fmtUSD(p.grantSize.max)}`} />
                <StatRow label="Mean" value={fmtUSD(p.grantSize.mean)} />
                <StatRow label="Recipient concentration" value={`HHI ${p.recipientConcentration.hhi.toFixed(3)}`} />
              </div>
              <p className="card-foot">
                Median rather than mean: grant portfolios are heavily right-skewed, and the mean is
                usually a description of the single largest grant.
              </p>
            </div>
          </div>
        </>
      )}

      {/* ══════════ IMPACT ══════════ */}
      {tab === 'impact' && (
        <>
          <div className="card">
            <div className="card-head">
              <p className="card-title">Alignment with your stated strategy</p>
              <span className="chip chip-teal">scored</span>
            </div>
            <p className="card-sub" style={{ marginBottom: 14 }}>
              The one question grant data can answer with a defensible right answer: does the money go
              where you say it goes? Measured against your declared priorities, never against peers.
            </p>
            <AlignmentBars alignment={profile.alignment} />
          </div>

          <div className="card">
            <Section>What this tool will not claim</Section>
            <p className="card-sub">
              V1 of this dashboard scored an “impact” figure out of 5 from grant structure. That number
              asserted a causal claim its inputs cannot support: a $1M education grant is observable, a
              20% improvement in student outcomes is not. Outcome evidence is a separate ingestion path
              and a separate score, and it is not implemented — so no overall effectiveness figure is shown.
            </p>
          </div>

          <FindingsPanel findings={findings} />
        </>
      )}

      {/* ══════════ STRATEGY ══════════ */}
      {tab === 'strategy' && (
        <>
          <div className="card">
            <div className="card-head">
              <p className="card-title">Practice profile</p>
              <span className="chip chip-blue">descriptive</span>
            </div>
            <p className="card-sub" style={{ marginBottom: 16 }}>
              Not scored. These figures describe strategy, not quality — they acquire meaning against a
              peer distribution.
            </p>
            <div className="stack-lg">
              <MetricValue label="Flexible funding" metric={p.flexibility} format={pct} bar={p.flexibility?.value} />
              <MetricValue label="Multi-year support" metric={p.multiYear} format={pct} bar={p.multiYear?.value} />
              <div>
                <div className="row-head">
                  <span className="row-label">Top-10 recipient share</span>
                  <span className="row-value"><strong>{pct(p.topTenRecipientShare)}</strong></span>
                </div>
                <div className="track">
                  <div className="track-fill" style={{ width: `${p.topTenRecipientShare * 100}%`, background: 'var(--teal-bar-soft)' }} />
                </div>
              </div>
            </div>
          </div>

          <div className="card">
            <Section>Concentration</Section>
            <div className="scroll-x">
              <table className="table">
                <thead>
                  <tr><th>Dimension</th><th className="num">HHI</th><th className="num">Normalized</th><th className="num">Effective categories</th><th className="num">Attributed</th></tr>
                </thead>
                <tbody>
                  {[
                    ['Subject', p.subjectConcentration],
                    ['Population', p.populationConcentration],
                    ['Geography', p.geographicConcentration],
                    ['Recipient', p.recipientConcentration],
                  ].map(([label, m]) => (
                    <tr key={label}>
                      <td>{label}</td>
                      <td className="num">{m.attributedDollars > 0 ? m.hhi.toFixed(3) : '—'}</td>
                      <td className="num">{m.attributedDollars > 0 ? m.normalizedHHI.toFixed(3) : '—'}</td>
                      <td className="num">{m.attributedDollars > 0 ? m.effectiveCategories.toFixed(1) : '—'}</td>
                      <td className="num">{m.attributedDollars > 0 ? fmtM(m.attributedDollars) : 'no coded dollars'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="card-foot">
              Raw HHI is comparable to published philanthropy research. Normalized HHI corrects for how
              many categories are present, so a portfolio spread evenly across 4 and one spread evenly
              across 40 both score 0.
            </p>
          </div>

          <div className="note note-blue">
            <Icon name="database" size={17} color="var(--blue)" style={{ marginTop: 1 }} />
            <div>
              <p className="note-title">Peer percentiles are not available yet</p>
              <p className="note-body">
                Percentiles need a peer corpus built from IRS Form 990-PF filings. Until that exists these
                figures stand alone — a number invented here would be worse than none.
              </p>
            </div>
          </div>
        </>
      )}
    </>
  );
}

/* ── local pieces ── */

const Tile = ({ label, value, labelColor, valueColor }) => (
  <div className="tile">
    <p className="tile-label" style={{ color: labelColor }}>{label}</p>
    <p className="tile-value" style={{ color: valueColor }}>{value}</p>
  </div>
);

const Stat = ({ label, value, color }) => (
  <div>
    <p style={{ fontSize: 12, color: 'var(--text-muted)' }}>{label}</p>
    <p style={{ fontSize: 17, fontWeight: 500, color: color ?? 'var(--text)' }}>{value}</p>
  </div>
);

const StatRow = ({ label, value }) => (
  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
    <span style={{ fontSize: 13.5, color: 'var(--text-2)' }}>{label}</span>
    <span style={{ fontSize: 13.5, color: 'var(--text)', fontWeight: 500, fontVariantNumeric: 'tabular-nums' }}>{value}</span>
  </div>
);

function PieBlock({ data }) {
  return (
    <ResponsiveContainer width="100%" height={260}>
      <PieChart>
        <Pie data={data} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={52} outerRadius={92} paddingAngle={2}>
          {data.map((_, i) => <Cell key={i} fill={SERIES[i % SERIES.length]} stroke="#FFFFFF" strokeWidth={1.5} />)}
        </Pie>
        <Tooltip contentStyle={TIP} formatter={(v, n) => [fmtM(v), n]} />
        <Legend wrapperStyle={{ fontSize: 11.5, color: '#5B7A73' }} />
      </PieChart>
    </ResponsiveContainer>
  );
}

const DIM_LABEL = { subject: 'Subject', population: 'Population', geography: 'Geography' };

function AlignmentBars({ alignment }) {
  const dims = Object.entries(alignment?.dimensions ?? {});
  const traceable = dims.find(([, r]) => !r.suppressed && r.value?.components);
  const anyScored = dims.some(([, r]) => !r.suppressed);

  return (
    <>
      <div className="stack">
        {dims.map(([name, result]) => {
          const label = DIM_LABEL[name] ?? name;
          if (result.suppressed) {
            const undeclared = /stated strategy/.test(result.reason ?? '');
            return (
              <div key={name}>
                <div className="row-head">
                  <span className="row-label">{label}</span>
                  <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>{undeclared ? 'not declared' : 'suppressed'}</span>
                </div>
                <div className="track-empty" />
                {!undeclared && <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 5 }}>{result.reason}</p>}
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
                <div className="track-fill" style={{ width: `${score * 100}%`, background: score >= 0.75 ? 'var(--teal-bar)' : 'var(--amber-bar)' }} />
              </div>
            </div>
          );
        })}
      </div>
      {traceable && <CalculationTrace dimension={DIM_LABEL[traceable[0]]} result={traceable[1]} />}
      {!anyScored && (
        <p className="card-foot">
          No priorities declared, so nothing is scored. Alignment appears once you state what the
          portfolio is meant to fund.
        </p>
      )}
    </>
  );
}

function median(values) {
  const sorted = values.filter((v) => Number.isFinite(v)).sort((a, b) => a - b);
  if (!sorted.length) return NaN;
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}
