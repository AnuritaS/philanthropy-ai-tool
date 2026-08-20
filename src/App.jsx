import { useMemo, useState } from "react";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, RadarChart, Radar, PolarGrid,
  PolarAngleAxis, PolarRadiusAxis, LineChart, Line,
  CartesianGrid, Legend,
} from "recharts";

import { C } from "./lib/theme.js";
import { deriveFunders } from "./lib/funders.js";
import { DEMO_GRANTS, DEMO_SOURCE } from "./data/demoDataset.js";
import DataImport from "./components/DataImport.jsx";
import { Card, Tag, KPI, SectionTitle, CustomTip, Empty, TOOLTIP_STYLE } from "./components/ui.jsx";
import {
  computeKpis, summarizeFunders, sectorBreakdown, regionBreakdown, grantTypeBreakdown,
  sliceBy, yearTrend, yearExtent, sizeDistribution, impactByGrantType, equityStats,
  frameworkScores, strategyMetrics, scorecard, recommendations, geographyNotes, sizeNotes,
  shortSector, fmtUSD, fmtM, pct,
} from "./lib/metrics.js";

const TABS = ["data", "overview", "sectors", "geography", "grant size", "impact", "strategy"];

export default function App() {
  const [grants, setGrants] = useState(DEMO_GRANTS);
  const [source, setSource] = useState(DEMO_SOURCE);
  const [activeFunder, setActiveFunder] = useState("all");
  const [activeYear, setActiveYear] = useState("all");
  const [activeTab, setActiveTab] = useState("overview");

  /* Funders come from the data, and are derived from the *unfiltered* set so
     each keeps its colour when a filter narrows the view. */
  const allFunders = useMemo(() => deriveFunders(grants), [grants]);
  const years = useMemo(
    () => [...new Set(grants.map(g => g.year).filter(y => y !== null))].sort((a, b) => a - b),
    [grants]
  );

  const filtered = useMemo(() => grants.filter(g =>
    (activeFunder === "all" || g.funder === activeFunder) &&
    (activeYear === "all" || g.year === +activeYear)
  ), [grants, activeFunder, activeYear]);

  /* Series actually drawn: narrowed by the funder filter, colours preserved. */
  const funders = useMemo(
    () => (activeFunder === "all" ? allFunders : allFunders.filter(f => f.name === activeFunder)),
    [allFunders, activeFunder]
  );

  const kpis        = useMemo(() => computeKpis(filtered), [filtered]);
  const summaries   = useMemo(() => summarizeFunders(filtered, funders), [filtered, funders]);
  const sectorData  = useMemo(() => sectorBreakdown(filtered, funders), [filtered, funders]);
  const regionData  = useMemo(() => regionBreakdown(filtered, funders), [filtered, funders]);
  const typeData    = useMemo(() => grantTypeBreakdown(filtered, funders), [filtered, funders]);
  const trendData   = useMemo(() => yearTrend(filtered, funders), [filtered, funders]);
  const sizeData    = useMemo(() => sizeDistribution(filtered, funders), [filtered, funders]);
  const impactTypes = useMemo(() => impactByGrantType(filtered), [filtered]);
  const radarData   = useMemo(() => frameworkScores(filtered, funders), [filtered, funders]);
  const stratTiles  = useMemo(() => strategyMetrics(filtered, funders), [filtered, funders]);
  const scoreRows   = useMemo(() => scorecard(filtered, funders), [filtered, funders]);
  const recs        = useMemo(() => recommendations(filtered, funders), [filtered, funders]);
  const geoNotes    = useMemo(() => geographyNotes(filtered, funders), [filtered, funders]);
  const sizeCaption = useMemo(() => sizeNotes(filtered, funders), [filtered, funders]);
  const extent      = useMemo(() => yearExtent(filtered), [filtered]);

  /* Which optional columns the loaded dataset actually carries. Panels that
     depend on a missing column say so instead of rendering an empty chart. */
  const has = useMemo(() => ({
    sector:  grants.some(g => g.sector !== null),
    region:  grants.some(g => g.region !== null),
    locale:  grants.some(g => g.locale !== null),
    type:    grants.some(g => g.grantType !== null),
    impact:  grants.some(g => g.impact !== null),
    outcome: grants.some(g => g.outcomeReported !== null),
    bipoc:   grants.some(g => g.bipocLed !== null),
  }), [grants]);

  function loadGrants(next, nextSource) {
    setGrants(next);
    setSource(nextSource);
    setActiveFunder("all");
    setActiveYear("all");
    setActiveTab("overview");
  }

  const spanLabel = extent ? (extent.min === extent.max ? `${extent.min}` : `${extent.min}–${extent.max}`) : "—";
  const funderLine = allFunders.map(f => f.name).join(" · ");

  return (
    <div style={{ background: C.bg, minHeight: "100vh", color: C.text, fontFamily: "'DM Sans', 'Segoe UI', sans-serif" }}>
      <link href="https://fonts.googleapis.com/css2?family=DM+Serif+Display&family=DM+Sans:wght@400;500;700&display=swap" rel="stylesheet" />

      {/* ── Header ── */}
      <div style={{ background: C.surface, borderBottom: `1px solid ${C.border}` }} className="px-8 py-5">
        <div className="flex items-start justify-between flex-wrap gap-4">
          <div>
            <h1 style={{ fontFamily: "'DM Serif Display', Georgia, serif", fontSize: "1.75rem", color: C.text, lineHeight: 1.2 }}>
              Philanthropy Effectiveness <span style={{ color: C.accent }}>Evaluation Dashboard</span>
            </h1>
            <p className="text-xs mt-1" style={{ color: C.gold }}>
              {funderLine || "No funders loaded"} · {spanLabel}
            </p>
          </div>
          {/* ── Project note ── */}
          <a
            href="https://www.linkedin.com/feed/update/urn:li:activity:7435606470022307840/"
            target="_blank"
            rel="noopener noreferrer"
            className="project-note"
            style={{ marginLeft: "auto", textAlign: "right", color: C.muted, textDecoration: "none" }}
          >
            If you want to read why I built this website,{" "}
            <span style={{ color: C.accent, textDecoration: "underline" }}>check my LinkedIn Post here</span>
          </a>
        </div>
      </div>

      {/* ── Filters ── */}
      <div className="px-8 py-3 flex flex-wrap gap-3 items-center"
           style={{ background: C.surface, borderBottom: `1px solid ${C.border}` }}>
        <span className="text-xs font-mono uppercase" style={{ color: C.muted }}>Filter:</span>

        <Select value={activeFunder} onChange={setActiveFunder}
                options={[["all", "All Funders"], ...allFunders.map(f => [f.name, f.name])]} />
        <Select value={activeYear} onChange={setActiveYear}
                options={[["all", "All Years"], ...years.map(y => [y, y])]} />

        <span className="text-xs ml-auto" style={{ color: C.muted }}>
          Showing <strong style={{ color: C.text }}>{filtered.length.toLocaleString()}</strong> grants ·{" "}
          <strong style={{ color: C.text }}>{fmtM(kpis.totalDisbursed)}</strong> disbursed
        </span>
      </div>

      {/* ── Tabs ── */}
      <div className="px-8 pt-4 flex gap-1 flex-wrap" style={{ borderBottom: `1px solid ${C.border}` }}>
        {TABS.map(t => (
          <button key={t} onClick={() => setActiveTab(t)}
            className="px-4 py-2 text-xs font-bold uppercase tracking-wider rounded-t-lg transition-all"
            style={{
              fontFamily: "monospace",
              background: activeTab === t ? C.card : "transparent",
              color: activeTab === t ? C.accent : C.muted,
              borderBottom: activeTab === t ? `2px solid ${C.accent}` : "2px solid transparent",
            }}>
            {t}
          </button>
        ))}
      </div>

      <div className="p-8">
        {/* ══════════ DATA ══════════ */}
        {activeTab === "data" && (
          <DataImport
            source={source}
            onApply={loadGrants}
            onReset={() => loadGrants(DEMO_GRANTS, DEMO_SOURCE)}
          />
        )}

        {/* ══════════ OVERVIEW ══════════ */}
        {activeTab === "overview" && (
          <div className="flex flex-col gap-6">
            <div className="grid grid-cols-2 gap-4" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))" }}>
              <Card><KPI label="Total Disbursed" value={fmtM(kpis.totalDisbursed)} color={C.accent} /></Card>
              <Card><KPI label="Avg Grant Size" value={fmtUSD(kpis.avgGrant)} color={C.gold} /></Card>
              <Card><KPI label="BIPOC-Led Orgs" value={has.bipoc ? pct(kpis.bipocShare) : "—"} color={C.sectors[0]} sub="of all grantees" /></Card>
              <Card><KPI label="Multi-Year Grants" value={pct(kpis.multiYearShare)} color={C.sectors[1]} sub="≥2 year duration" /></Card>
              <Card><KPI label="Avg Impact Score" value={kpis.avgImpact === null ? "—" : kpis.avgImpact.toFixed(2)} color={C.accent} sub="/ 5.0 OECD-aligned" /></Card>
              <Card><KPI label="Total Grants" value={kpis.count.toLocaleString()} color={C.text} /></Card>
            </div>

            {/* Per-funder headline comparison — one card per funder in the data */}
            <div className="grid gap-4" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))" }}>
              {summaries.map(s => {
                const topSectors = sliceBy(s.grants, "sector", shortSector).slice(0, 4);
                const topRegion = sliceBy(s.grants, "region")[0];
                return (
                  <Card key={s.key}>
                    <div className="flex items-center gap-2 mb-3">
                      <div className="w-3 h-3 rounded-full" style={{ background: s.color }} />
                      <span className="font-bold text-sm">{s.name}</span>
                    </div>
                    <div className="grid grid-cols-2 gap-3 mb-3">
                      <Metric label="Total Grants" value={s.count.toLocaleString()} color={s.color} big />
                      <Metric label="Total Disbursed" value={fmtM(s.totalDisbursed)} color={s.color} big />
                      <Metric label="Sector HHI" value={s.sectorHHI.toFixed(3)} />
                      <Metric label="Avg Impact" value={s.avgImpact === null ? "--" : s.avgImpact.toFixed(2)} />
                    </div>
                    <p className="text-xs mb-2 leading-relaxed" style={{ color: C.muted }}>
                      {pct(s.genOpShare)} general operating · {pct(s.multiYearShare)} multi-year
                      {topRegion ? ` · concentrated in ${topRegion.name}` : ""}.
                    </p>
                    <div className="flex flex-wrap gap-1">
                      {topSectors.map(t => <Tag key={t.name} label={t.name} color={s.color} />)}
                    </div>
                  </Card>
                );
              })}
            </div>

            <Card>
              <SectionTitle>Disbursement Trend {spanLabel}</SectionTitle>
              <ResponsiveContainer width="100%" height={200}>
                <LineChart data={trendData} margin={{ right: 16 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={C.border} />
                  <XAxis dataKey="year" tick={{ fill: C.muted, fontSize: 10 }} />
                  <YAxis tickFormatter={v => `$${(v / 1e6).toFixed(0)}M`} tick={{ fill: C.muted, fontSize: 10 }} />
                  <Tooltip content={<CustomTip fmt={v => fmtM(v)} />} />
                  <Legend wrapperStyle={{ fontSize: 10, color: C.muted }} />
                  {funders.map(f => (
                    <Line key={f.key} type="monotone" dataKey={`${f.key}Amt`} name={f.name}
                          stroke={f.color} strokeWidth={2} dot={false} />
                  ))}
                </LineChart>
              </ResponsiveContainer>
            </Card>
          </div>
        )}

        {/* ══════════ SECTORS ══════════ */}
        {activeTab === "sectors" && (
          <div className="flex flex-col gap-6">
            <Card>
              <SectionTitle>Sector Allocation by Grant Count</SectionTitle>
              {has.sector ? (
                <ResponsiveContainer width="100%" height={280}>
                  <BarChart data={sectorData} margin={{ left: 8 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke={C.border} />
                    <XAxis dataKey="label" tick={{ fill: C.muted, fontSize: 10 }} />
                    <YAxis tick={{ fill: C.muted, fontSize: 10 }} />
                    <Tooltip content={<CustomTip />} />
                    <Legend wrapperStyle={{ fontSize: 10, color: C.muted }} />
                    {funders.map(f => (
                      <Bar key={f.key} dataKey={f.key} name={f.name} fill={f.color} radius={[3, 3, 0, 0]} />
                    ))}
                  </BarChart>
                </ResponsiveContainer>
              ) : <Empty>No sector column in this dataset. Map one on the Data tab to enable this panel.</Empty>}
            </Card>

            {has.sector && (
              <>
                <div className="grid gap-4" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))" }}>
                  {summaries.map(s => {
                    const pd = sliceBy(s.grants, "sector", shortSector);
                    return (
                      <Card key={s.key}>
                        <SectionTitle>{s.name} — Sector Mix</SectionTitle>
                        <ResponsiveContainer width="100%" height={200}>
                          <PieChart>
                            <Pie data={pd} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80} label={e => e.name}>
                              {pd.map((_, i) => <Cell key={i} fill={C.sectors[i % C.sectors.length]} />)}
                            </Pie>
                            <Tooltip contentStyle={TOOLTIP_STYLE} />
                          </PieChart>
                        </ResponsiveContainer>
                        <div className="mt-2 text-xs" style={{ color: C.muted }}>
                          Sector HHI: <strong style={{ color: s.color }}>{s.sectorHHI.toFixed(3)}</strong>
                          <span> (0 = diverse · 1 = concentrated)</span>
                        </div>
                      </Card>
                    );
                  })}
                </div>

                <Card>
                  <SectionTitle>Sector-Level Disbursement ($M)</SectionTitle>
                  <ResponsiveContainer width="100%" height={220}>
                    <BarChart data={sectorData.map(s => ({ ...s, amt: +(s.amount / 1e6).toFixed(2) }))} layout="vertical">
                      <CartesianGrid strokeDasharray="3 3" stroke={C.border} horizontal={false} />
                      <XAxis type="number" tick={{ fill: C.muted, fontSize: 10 }} tickFormatter={v => `$${v}M`} />
                      <YAxis type="category" dataKey="label" tick={{ fill: C.muted, fontSize: 10 }} width={110} />
                      <Tooltip content={<CustomTip fmt={v => `$${v}M`} />} />
                      <Bar dataKey="amt" name="Disbursed $M" radius={[0, 4, 4, 0]}>
                        {sectorData.map((_, i) => <Cell key={i} fill={C.sectors[i % C.sectors.length]} />)}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </Card>
              </>
            )}
          </div>
        )}

        {/* ══════════ GEOGRAPHY ══════════ */}
        {activeTab === "geography" && (
          <div className="flex flex-col gap-6">
            <Card>
              <SectionTitle>Regional Focus — Grants by Region</SectionTitle>
              {has.region ? (
                <>
                  <ResponsiveContainer width="100%" height={280}>
                    <BarChart data={regionData}>
                      <CartesianGrid strokeDasharray="3 3" stroke={C.border} />
                      <XAxis dataKey="label" tick={{ fill: C.muted, fontSize: 10 }} />
                      <YAxis tick={{ fill: C.muted, fontSize: 10 }} />
                      <Tooltip content={<CustomTip />} />
                      <Legend wrapperStyle={{ fontSize: 10, color: C.muted }} />
                      {funders.map(f => (
                        <Bar key={f.key} dataKey={f.key} name={f.name} fill={f.color} radius={[3, 3, 0, 0]} />
                      ))}
                    </BarChart>
                  </ResponsiveContainer>
                  <p className="text-xs mt-3 leading-relaxed" style={{ color: C.muted }}>
                    {geoNotes.map((n, i) => (
                      <span key={n.name}>
                        {i > 0 && <>&nbsp;&nbsp;</>}
                        <strong style={{ color: n.color, fontWeight: 900 }}>{n.name}</strong> {n.text}
                      </span>
                    ))}
                  </p>
                </>
              ) : <Empty>No region column in this dataset. Map one on the Data tab to enable this panel.</Empty>}
            </Card>

            {has.locale && (
              <div className="grid gap-4" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))" }}>
                {summaries.map(s => {
                  const pd = sliceBy(s.grants, "locale");
                  return (
                    <Card key={s.key}>
                      <SectionTitle>{s.name} — Urban/Rural Mix</SectionTitle>
                      <ResponsiveContainer width="100%" height={180}>
                        <PieChart>
                          <Pie data={pd} dataKey="value" nameKey="name" cx="50%" cy="50%"
                               innerRadius={50} outerRadius={75} paddingAngle={3} label>
                            {pd.map((_, i) => <Cell key={i} fill={[s.color, C.accent, C.gold, C.sectors[4]][i % 4]} />)}
                          </Pie>
                          <Tooltip contentStyle={TOOLTIP_STYLE} />
                        </PieChart>
                      </ResponsiveContainer>
                    </Card>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* ══════════ GRANT SIZE ══════════ */}
        {activeTab === "grant size" && (
          <div className="flex flex-col gap-6">
            <Card>
              <SectionTitle>Grant Size Distribution — Concentration Analysis</SectionTitle>
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={sizeData}>
                  <CartesianGrid strokeDasharray="3 3" stroke={C.border} />
                  <XAxis dataKey="label" tick={{ fill: C.muted, fontSize: 10 }} />
                  <YAxis tick={{ fill: C.muted, fontSize: 10 }} />
                  <Tooltip content={<CustomTip />} />
                  <Legend wrapperStyle={{ fontSize: 10, color: C.muted }} />
                  {funders.map(f => (
                    <Bar key={f.key} dataKey={f.key} name={f.name} fill={f.color} radius={[3, 3, 0, 0]} />
                  ))}
                </BarChart>
              </ResponsiveContainer>
              <p className="text-xs mt-3 leading-relaxed" style={{ color: C.muted }}>
                {sizeCaption.map((n, i) => (
                  <span key={n.name}>
                    {i > 0 && <>&nbsp;&nbsp;</>}
                    <strong style={{ color: n.color, fontWeight: 900 }}>{n.name}</strong> {n.text}
                  </span>
                ))}
              </p>
            </Card>

            <div className="grid gap-4" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))" }}>
              <Card>
                <SectionTitle>Grant Type Breakdown</SectionTitle>
                {has.type ? typeData.map(row => {
                  const total = funders.reduce((s, f) => s + row[f.key], 0) || 1;
                  return (
                    <div key={row.full} className="mb-3">
                      <div className="flex justify-between text-xs mb-1">
                        <span style={{ color: C.text }}>{row.label}</span>
                        <span style={{ color: C.muted }}>
                          {funders.map(f => `${f.name.slice(0, 1)}:${row[f.key]}`).join(" · ")}
                        </span>
                      </div>
                      <div className="flex gap-1 h-2 rounded overflow-hidden">
                        {funders.map(f => (
                          <div key={f.key} style={{ width: `${(row[f.key] / total) * 100}%`, background: f.color }} />
                        ))}
                      </div>
                    </div>
                  );
                }) : <Empty>No grant type column in this dataset.</Empty>}
                {has.type && (
                  <p className="text-xs mt-3" style={{ color: C.muted, fontWeight: 900 }}>
                    General operating support is a best-practice marker per CEP research.
                  </p>
                )}
              </Card>

              <Card>
                <SectionTitle>Concentration Metrics</SectionTitle>
                <div className="flex flex-col gap-4 mt-2">
                  {summaries.map(s => (
                    <div key={s.key}>
                      <p className="text-xs" style={{ color: C.muted }}>{s.name} — Sector HHI</p>
                      <p className="text-xl font-black" style={{ fontFamily: "serif", color: s.color }}>{s.sectorHHI.toFixed(3)}</p>
                      <p className="text-xs" style={{ color: C.muted }}>Avg grant {fmtUSD(s.avgGrant)}</p>
                    </div>
                  ))}
                  <p className="text-xs" style={{ color: C.muted }}>Higher HHI = more concentrated in fewer sectors.</p>
                </div>
              </Card>
            </div>
          </div>
        )}

        {/* ══════════ IMPACT ══════════ */}
        {activeTab === "impact" && (
          <div className="flex flex-col gap-6">
            <Card>
              <SectionTitle>OECD DAC Evaluation Criteria — Funder Scores</SectionTitle>
              <p className="text-xs mb-3" style={{ color: C.muted, fontWeight: 900 }}>
                Composite scores (1–5) computed from each funder's grant structure, outcome reporting
                rate, multi-year commitments, sector diversity and BIPOC-led portfolio share.
              </p>
              <ResponsiveContainer width="100%" height={300}>
                <RadarChart data={radarData} cx="50%" cy="50%" outerRadius={110}>
                  <PolarGrid stroke={C.border} />
                  <PolarAngleAxis dataKey="dim" tick={{ fill: C.muted, fontSize: 10 }} />
                  <PolarRadiusAxis angle={90} domain={[0, 5]} tick={{ fill: C.muted, fontSize: 9 }} />
                  {funders.map(f => (
                    <Radar key={f.key} name={f.name} dataKey={f.key}
                           stroke={f.color} fill={f.color} fillOpacity={0.2} strokeWidth={2} />
                  ))}
                  <Legend wrapperStyle={{ fontSize: 10, color: C.muted }} />
                  <Tooltip contentStyle={TOOLTIP_STYLE} />
                </RadarChart>
              </ResponsiveContainer>
            </Card>

            <Card>
              <SectionTitle>Avg Impact Score by Grant Type</SectionTitle>
              {has.impact && has.type ? (
                <>
                  <ResponsiveContainer width="100%" height={200}>
                    <BarChart data={impactTypes}>
                      <CartesianGrid strokeDasharray="3 3" stroke={C.border} />
                      <XAxis dataKey="type" tick={{ fill: C.muted, fontSize: 10 }} />
                      <YAxis domain={[0, 5]} tick={{ fill: C.muted, fontSize: 10 }} />
                      <Tooltip content={<CustomTip />} />
                      <Bar dataKey="avg" name="Avg Impact" radius={[4, 4, 0, 0]}>
                        {impactTypes.map((_, i) => <Cell key={i} fill={C.sectors[i % C.sectors.length]} />)}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                  <p className="text-xs mt-2" style={{ color: C.muted, fontWeight: 900 }}>
                    General operating support consistently yields higher impact scores — aligns with CEP's
                    "What Donors Know" research (2021).
                  </p>
                </>
              ) : <Empty>Needs both an impact score and a grant type column.</Empty>}
            </Card>

            {has.impact && has.bipoc && (
              <div className="grid gap-4" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))" }}>
                {summaries.map(s => {
                  const eq = equityStats(s.grants);
                  return (
                    <Card key={s.key}>
                      <div className="flex items-center gap-2 mb-3">
                        <div className="w-2.5 h-2.5 rounded-full" style={{ background: s.color }} />
                        <span className="text-sm font-bold">{s.name}</span>
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <Metric label="Outcome Reported" value={pct(eq.outcomeShare)} color={s.color} big />
                        <Metric label="BIPOC-Led Avg Impact" value={eq.bipocImpact?.toFixed(2) ?? "--"} color={C.accent} big />
                        <Metric label="Non-BIPOC Avg Impact" value={eq.otherImpact?.toFixed(2) ?? "--"} color={C.muted} big />
                        <Metric label="Equity Differential" color={C.gold} big
                                value={eq.differential === null ? "--" : `${eq.differential > 0 ? "+" : ""}${eq.differential.toFixed(2)}`} />
                      </div>
                    </Card>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* ══════════ STRATEGY ══════════ */}
        {activeTab === "strategy" && (
          <div className="flex flex-col gap-6">
            <div className="grid gap-4" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))" }}>
              {stratTiles.map((m, i) => (
                <Card key={i}>
                  <p className="text-xs mb-1" style={{ color: C.muted }}>{m.label}</p>
                  <p className="text-xl font-black" style={{ fontFamily: "serif", color: m.color }}>{m.val}</p>
                </Card>
              ))}
            </div>

            <Card>
              <SectionTitle color={C.gold}>Strategic Recommendations from the Loaded Portfolio</SectionTitle>
              <div className="grid gap-4" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))" }}>
                {recs.map(f => (
                  <div key={f.key}>
                    <p className="text-xs font-bold mb-2" style={{ color: f.color }}>{f.name}</p>
                    <ul className="flex flex-col gap-1.5">
                      {f.recs.map((r, i) => (
                        <li key={i} className="flex items-start gap-2 text-xs" style={{ color: C.muted }}>
                          <span style={{ color: f.color, marginTop: 2 }}>→</span>
                          <span><strong style={{ fontWeight: 900, color: C.text }}>{r.headline}</strong> — {r.detail}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            </Card>

            <Card>
              <SectionTitle>Grant Strategy Scorecard — Best Practice Alignment</SectionTitle>
              <div className="overflow-x-auto">
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "12px" }}>
                  <thead>
                    <tr style={{ borderBottom: `1px solid ${C.border}` }}>
                      {["Best Practice Standard", ...funders.map(f => f.name), "Evidence Base"].map(h => (
                        <th key={h} className="text-left py-2 px-3"
                            style={{ color: C.muted, fontWeight: 700, textTransform: "uppercase", fontSize: 10, letterSpacing: "0.05em" }}>
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {scoreRows.map(row => (
                      <tr key={row.standard} style={{ borderBottom: `1px solid ${C.border}22` }}>
                        <td className="py-2 px-3" style={{ color: C.text }}>{row.standard}</td>
                        {row.cells.map(cell => (
                          <td key={cell.key} className="py-2 px-3" style={{ color: cell.color, whiteSpace: "nowrap" }}
                              title={`${pct(cell.value)} against a ${pct(row.target)} benchmark`}>
                            {cell.label}
                          </td>
                        ))}
                        <td className="py-2 px-3" style={{ color: C.muted }}>{row.evidence}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="text-xs mt-3" style={{ color: C.muted }}>
                Stars scale each funder's observed rate against the sector benchmark in the evidence column;
                hover a cell for the underlying figure.
              </p>
            </Card>
          </div>
        )}
      </div>

      {/* ── Footer ── */}
      <div className="px-8 py-4 flex items-center justify-between flex-wrap gap-2"
           style={{ borderTop: `1px solid ${C.border}`, background: C.surface }}>
        <p className="text-xs" style={{ color: C.muted }}>
          {source.name} (n={source.rowCount.toLocaleString()}) · v2.0
        </p>
        <p className="text-xs font-mono" style={{ color: C.muted }}>
          Framework: OECD DAC · CEP · Candid PCS · NCRP · MacArthur Big Bets
        </p>
      </div>

      <div className="px-8 py-2 flex items-center justify-center" style={{ background: C.bg }}>
        <p className="text-xs font-mono" style={{ color: C.muted }}>
          © {new Date().getFullYear()} <strong style={{ color: C.text }}>Anurita Srivastava</strong> · All rights reserved ·
          Built for academic &amp; portfolio purposes ·
        </p>
      </div>
    </div>
  );
}

/* ── local helpers ── */

const Select = ({ value, onChange, options }) => (
  <select value={value} onChange={e => onChange(e.target.value)}
    className="text-xs px-3 py-1.5 rounded-lg"
    style={{ background: C.card, border: `1px solid ${C.border}`, color: C.text, outline: "none" }}>
    {options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
  </select>
);

const Metric = ({ label, value, color, big }) => (
  <div>
    <p className="text-xs" style={{ color: C.muted }}>{label}</p>
    <p className={big ? "font-black text-lg" : "font-bold text-sm"}
       style={{ fontFamily: big ? "serif" : undefined, color: color || C.text }}>{value}</p>
  </div>
);
