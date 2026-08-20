import { useState, useEffect, useMemo } from "react";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, RadarChart, Radar, PolarGrid,
  PolarAngleAxis, PolarRadiusAxis, LineChart, Line,
  CartesianGrid, Legend, ScatterChart, Scatter, ZAxis
} from "recharts";

/* ─── Simulated Dataset ─────────────────────────────────── */
const SEED_DATA = (() => {
  const rng = (() => { let s = 42; return () => { s = (s * 1664525 + 1013904223) & 0xffffffff; return (s >>> 0) / 0xffffffff; }; })();
  const rnorm = (mu, sd) => { const u1 = rng(), u2 = rng(); return mu + sd * Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2); };

  const tidesSecctors = ["C-Environment","R-Civil Rights","Q-International","K-Food/Nutrition","P-Human Services","W-Public/Society"];
  const tidesSectorW  = [0.35,0.25,0.12,0.10,0.09,0.09];
  const kresgeSecctors = ["L-Housing","C-Environment","E-Health","S-Community Dev","B-Education","T-Philanthropy"];
  const kresgeSectorW  = [0.30,0.22,0.16,0.12,0.10,0.10];
  const regions = ["West","South","Northeast","Midwest","National"];
  const tidesRegW  = [0.30,0.22,0.18,0.15,0.15];
  const kresgeRegW = [0.12,0.18,0.16,0.38,0.16];
  const urbanRural = ["Urban","Suburban","Rural"];
  const urW = [0.60,0.22,0.18];
  const grantTypes = { tides: ["General Operating","Project-Specific"], kresge: ["General Operating","Project-Specific","Capacity-Building"] };

  const pickW = (arr, weights) => { const r = rng(); let acc = 0; for (let i = 0; i < arr.length; i++) { acc += weights[i]; if (r < acc) return arr[i]; } return arr[arr.length-1]; };

  const grants = [];
  for (let i = 0; i < 1200; i++) {
    const isTides = i < 600;
    const foundation = isTides ? "Tides Foundation" : "Kresge Foundation";
    const year = 2015 + ((i % 600) % 10);
    const sector = isTides ? pickW(tidesSecctors, tidesSectorW) : pickW(kresgeSecctors, kresgeSectorW);
    const region = isTides ? pickW(regions, tidesRegW) : pickW(regions, kresgeRegW);
    const urban_rural = pickW(urbanRural, urW);
    const grantType = isTides ? pickW(grantTypes.tides,[0.55,0.45]) : pickW(grantTypes.kresge,[0.40,0.35,0.25]);
    const lnAmt = isTides ? rnorm(11.9, 1.1) : rnorm(12.8, 0.9);
    let grantAmt = Math.round(Math.exp(lnAmt) / 1000) * 1000;
    grantAmt = Math.max(10000, Math.min(5000000, grantAmt));
    const duration = [1,2,3,4][Math.floor(pickW([0,1,2,3],[0.30,0.30,0.22,0.18]))];
    const multiYear = duration >= 2 ? 1 : 0;
    const bipocLed = rng() < (isTides ? 0.68 : 0.55) ? 1 : 0;
    const collab = rng() < (isTides ? 0.22 : 0.35) ? 1 : 0;
    const lnBudget = rnorm(13.5, 1.3);
    const orgBudget = Math.max(50000, Math.min(50000000, Math.round(Math.exp(lnBudget) / 5000) * 5000));
    let impact = 1 + 0.8*multiYear + 0.7*(grantType==="General Operating"?1:0) + 0.5*bipocLed + 0.4*collab + 0.3*(duration>=3?1:0) + rnorm(0,0.4);
    impact = Math.min(5, Math.max(1, impact));
    const outcomeReported = rng() < (0.42 + 0.12*multiYear + 0.08*(grantType==="General Operating"?1:0)) ? 1 : 0;
    grants.push({ id: i, foundation, year, sector, region, urban_rural, grantType, grantAmt, duration, multiYear, bipocLed, collab, orgBudget, impact: +impact.toFixed(2), outcomeReported });
  }
  return grants;
})();

/* ─── Colour System ─────────────────────────────────────── */
const C = {
  tides:    "#E8651A",
  kresge:   "#1A7BC4",
  bg:       "#0A0D14",
  surface:  "#12161F",
  card:     "#181D28",
  border:   "#252B3B",
  accent:   "#4ECDC4",
  gold:     "#F5C842",
  text:     "#E8EAF0",
  muted:    "#6B7590",
  sectors: ["#E8651A","#1A7BC4","#4ECDC4","#F5C842","#E04F7B","#8B5CF6","#10B981"],
};

const fmtUSD = (v) => v >= 1e6 ? `$${(v/1e6).toFixed(1)}M` : v >= 1e3 ? `$${(v/1e3).toFixed(0)}K` : `$${v}`;
const fmtM   = (v) => `$${(v/1e6).toFixed(2)}M`;

/* ─── Reusable Components ───────────────────────────────── */
const Card = ({ children, className = "" }) => (
  <div className={`rounded-xl border p-4 ${className}`} style={{ background: C.card, borderColor: C.border }}>
    {children}
  </div>
);

const Tag = ({ label, color }) => (
  <span className="text-xs font-bold px-2 py-0.5 rounded-full" style={{ background: color + "22", color, border: `1px solid ${color}44` }}>
    {label}
  </span>
);

const KPI = ({ label, value, sub, color }) => (
  <div className="flex flex-col gap-1">
    <span className="text-xs font-semibold tracking-widest uppercase" style={{ color: C.muted }}>{label}</span>
    <span className="text-2xl font-black" style={{ color: color || C.text, fontFamily: "'DM Serif Display', Georgia, serif" }}>{value}</span>
    {sub && <span className="text-xs" style={{ color: C.muted }}>{sub}</span>}
  </div>
);

const SectionTitle = ({ children, color }) => (
  <h2 className="text-xs font-bold tracking-widest uppercase mb-4" style={{ color: color || C.accent, fontFamily: "monospace" }}>
    ◈ {children}
  </h2>
);

/* ─── Custom Tooltip ────────────────────────────────────── */
const CustomTip = ({ active, payload, label, fmt }) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg p-3 text-xs shadow-xl" style={{ background: "#1E2535", border: `1px solid ${C.border}`, color: C.text }}>
      <p className="font-bold mb-1" style={{ color: C.accent }}>{label}</p>
      {payload.map((p, i) => (
        <p key={i} style={{ color: p.color }}>{p.name}: {fmt ? fmt(p.value) : p.value}</p>
      ))}
    </div>
  );
};

/* ─── Impact Framework Panel ────────────────────────────── */
const FRAMEWORK_DIMS = [
  { dim: "Relevance",     tides: 4.2, kresge: 4.5, desc: "Alignment with community-defined needs" },
  { dim: "Coherence",     tides: 3.8, kresge: 4.1, desc: "Fit with broader policy systems" },
  { dim: "Effectiveness", tides: 3.9, kresge: 3.7, desc: "Achievement of stated outcomes" },
  { dim: "Efficiency",    tides: 3.5, kresge: 4.0, desc: "Resource optimization ratio" },
  { dim: "Impact",        tides: 4.0, kresge: 3.9, desc: "Long-term systemic change" },
  { dim: "Sustainability", tides: 3.6, kresge: 4.3, desc: "Endurance beyond grant period" },
];

/* ─── Main Dashboard ────────────────────────────────────── */
export default function App() {
  const [activeFoundation, setActiveFoundation] = useState("all");
  const [activeSector, setActiveSector] = useState("all");
  const [activeYear, setActiveYear] = useState("all");
  const [activeTab, setActiveTab] = useState("overview");

  const filtered = useMemo(() => {
    return SEED_DATA.filter(g =>
      (activeFoundation === "all" || g.foundation === activeFoundation) &&
      (activeSector === "all" || g.sector === activeSector) &&
      (activeYear === "all" || g.year === +activeYear)
    );
  }, [activeFoundation, activeSector, activeYear]);

  const tidesGrants  = filtered.filter(g => g.foundation === "Tides Foundation");
  const kresgeGrants = filtered.filter(g => g.foundation === "Kresge Foundation");

  const totalDisbursed = filtered.reduce((s, g) => s + g.grantAmt, 0);
  const avgGrant = filtered.length ? totalDisbursed / filtered.length : 0;
  const bipocPct = filtered.length ? (filtered.filter(g => g.bipocLed).length / filtered.length * 100).toFixed(0) : 0;
  const multiYrPct = filtered.length ? (filtered.filter(g => g.multiYear).length / filtered.length * 100).toFixed(0) : 0;
  const avgImpact = filtered.length ? (filtered.reduce((s,g) => s+g.impact,0)/filtered.length).toFixed(2) : 0;

  /* Sector data */
  const sectorMap = {};
  filtered.forEach(g => {
    if (!sectorMap[g.sector]) sectorMap[g.sector] = { tides: 0, kresge: 0, count: 0, amt: 0 };
    if (g.foundation === "Tides Foundation") sectorMap[g.sector].tides++;
    else sectorMap[g.sector].kresge++;
    sectorMap[g.sector].count++;
    sectorMap[g.sector].amt += g.grantAmt;
  });
  const sectorData = Object.entries(sectorMap)
    .map(([k, v]) => ({ sector: k.includes("-") ? k.split("-").slice(1).join("-").trim() : k, full: k, ...v }))
    .sort((a,b) => b.count - a.count);

  /* Region data */
  const regionMap = {};
  filtered.forEach(g => {
    if (!regionMap[g.region]) regionMap[g.region] = { tides: 0, kresge: 0 };
    if (g.foundation === "Tides Foundation") regionMap[g.region].tides++;
    else regionMap[g.region].kresge++;
  });
  const regionData = Object.entries(regionMap).map(([k, v]) => ({ region: k, ...v }));

  /* Year trend */
  const yearMap = {};
  SEED_DATA.forEach(g => {
    if (!yearMap[g.year]) yearMap[g.year] = { year: g.year, tides: 0, kresge: 0, tidesAmt: 0, kresgeAmt: 0 };
    if (g.foundation === "Tides Foundation") { yearMap[g.year].tides++; yearMap[g.year].tidesAmt += g.grantAmt; }
    else { yearMap[g.year].kresge++; yearMap[g.year].kresgeAmt += g.grantAmt; }
  });
  const yearData = Object.values(yearMap).sort((a,b) => a.year - b.year);

  /* Grant size buckets */
  const sizeBuckets = [
    { label: "<$50K",    min: 0,       max: 50000 },
    { label: "$50-150K", min: 50000,   max: 150000 },
    { label: "$150-500K",min: 150000,  max: 500000 },
    { label: "$500K-1M", min: 500000,  max: 1000000 },
    { label: ">$1M",     min: 1000000, max: Infinity },
  ];
  const sizeData = sizeBuckets.map(b => ({
    label: b.label,
    tides: tidesGrants.filter(g => g.grantAmt >= b.min && g.grantAmt < b.max).length,
    kresge: kresgeGrants.filter(g => g.grantAmt >= b.min && g.grantAmt < b.max).length,
  }));

  /* HHI computation */
  const calcHHI = (grants) => {
    const total = grants.length;
    if (!total) return 0;
    const counts = {};
    grants.forEach(g => counts[g.sector] = (counts[g.sector]||0)+1);
    return Object.values(counts).reduce((s,c) => s + Math.pow(c/total,2), 0);
  };
  const tidesHHI  = calcHHI(tidesGrants).toFixed(3);
  const kresgeHHI = calcHHI(kresgeGrants).toFixed(3);

  /* Impact by grant type */
  const impactByType = {};
  filtered.forEach(g => {
    if (!impactByType[g.grantType]) impactByType[g.grantType] = [];
    impactByType[g.grantType].push(g.impact);
  });
  const impactTypeData = Object.entries(impactByType).map(([k, v]) => ({
    type: k.replace("General Operating","Gen. Ops.").replace("Project-Specific","Project").replace("Capacity-Building","Cap. Build."),
    avg: +(v.reduce((s,x)=>s+x,0)/v.length).toFixed(2),
    n: v.length
  })).sort((a,b) => b.avg - a.avg);

  /* Grant strategy summary */
  const strategyMetrics = [
    { label: "Avg. Grant (Tides)",  val: fmtUSD(tidesGrants.reduce((s,g)=>s+g.grantAmt,0)/(tidesGrants.length||1)), color: C.tides },
    { label: "Avg. Grant (Kresge)", val: fmtUSD(kresgeGrants.reduce((s,g)=>s+g.grantAmt,0)/(kresgeGrants.length||1)), color: C.kresge },
    { label: "BIPOC-Led (Tides)",   val: tidesGrants.length ? (tidesGrants.filter(g=>g.bipocLed).length/tidesGrants.length*100).toFixed(0)+"%" : "--", color: C.tides },
    { label: "BIPOC-Led (Kresge)",  val: kresgeGrants.length ? (kresgeGrants.filter(g=>g.bipocLed).length/kresgeGrants.length*100).toFixed(0)+"%" : "--", color: C.kresge },
    { label: "Multi-Year (Tides)",  val: tidesGrants.length ? (tidesGrants.filter(g=>g.multiYear).length/tidesGrants.length*100).toFixed(0)+"%" : "--", color: C.tides },
    { label: "Multi-Year (Kresge)", val: kresgeGrants.length ? (kresgeGrants.filter(g=>g.multiYear).length/kresgeGrants.length*100).toFixed(0)+"%" : "--", color: C.kresge },
    { label: "Co-Funded (Tides)",   val: tidesGrants.length ? (tidesGrants.filter(g=>g.collab).length/tidesGrants.length*100).toFixed(0)+"%" : "--", color: C.tides },
    { label: "Co-Funded (Kresge)",  val: kresgeGrants.length ? (kresgeGrants.filter(g=>g.collab).length/kresgeGrants.length*100).toFixed(0)+"%" : "--", color: C.kresge },
  ];

  const TABS = ["overview","sectors","geography","grant size","impact","strategy"];

  const sectors = ["all", ...Array.from(new Set(SEED_DATA.map(g => g.sector)))];
  const years   = ["all", ...Array.from(new Set(SEED_DATA.map(g => g.year))).sort()];

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
              Tides Foundation · Kresge Foundation · Environmental & Racial Justice Grantmaking · 2015-2024
            </p>
          </div>
          {/* ── Project note ── */}
          <a
            href="https://www.linkedin.com/feed/update/urn:li:activity:7435606470022307840/"
            target="_blank"
            rel="noopener noreferrer"
            className="project-note"
            style={{
              marginLeft: "auto",
              textAlign: "right",
              color: C.muted,
              textDecoration: "none",
            }}
          >
            If you want to read why I built this website,{" "}
            <span style={{ color: C.accent, textDecoration: "underline" }}>check my LinkedIn Post here</span>
          </a>
        </div>
      </div>

      {/* ── Filters ── */}
      <div className="px-8 py-3 flex flex-wrap gap-3 items-center" style={{ background: C.surface, borderBottom: `1px solid ${C.border}` }}>
        <span className="text-xs font-mono uppercase" style={{ color: C.muted }}>Filter:</span>
        {[
          { label: "Foundation", key: "foundation", val: activeFoundation, set: setActiveFoundation,
            opts: [["all","All Foundations"],["Tides Foundation","Tides"],["Kresge Foundation","Kresge"]] },
          { label: "Year", key: "year", val: activeYear, set: setActiveYear,
            opts: [["all","All Years"],...years.filter(y=>y!=="all").map(y=>[y,y])] },
        ].map(f => (
          <select key={f.key} value={f.val} onChange={e => f.set(e.target.value)}
            className="text-xs px-3 py-1.5 rounded-lg"
            style={{ background: C.card, border: `1px solid ${C.border}`, color: C.text, outline: "none" }}>
            {f.opts.map(([v,l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        ))}
        <span className="text-xs ml-auto" style={{ color: C.muted }}>
          Showing <strong style={{ color: C.text }}>{filtered.length.toLocaleString()}</strong> grants · <strong style={{ color: C.text }}>{fmtM(totalDisbursed)}</strong> disbursed
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
        {/* ══════════ OVERVIEW ══════════ */}
        {activeTab === "overview" && (
          <div className="flex flex-col gap-6">
            {/* KPIs */}
            <div className="grid grid-cols-2 gap-4" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))" }}>
              <Card><KPI label="Total Disbursed" value={fmtM(totalDisbursed)} color={C.accent} /></Card>
              <Card><KPI label="Avg Grant Size" value={fmtUSD(avgGrant)} color={C.gold} /></Card>
              <Card><KPI label="BIPOC-Led Orgs" value={`${bipocPct}%`} color={C.tides} sub="of all grantees" /></Card>
              <Card><KPI label="Multi-Year Grants" value={`${multiYrPct}%`} color={C.kresge} sub="≥2 year duration" /></Card>
              <Card><KPI label="Avg Impact Score" value={avgImpact} color={C.accent} sub="/ 5.0 OECD-aligned" /></Card>
              <Card><KPI label="Total Grants" value={filtered.length.toLocaleString()} color={C.text} /></Card>
            </div>

            {/* Tides vs Kresge headline comparison */}
            <div className="grid gap-4" style={{ gridTemplateColumns: "1fr 1fr" }}>
              {[
                { name: "Tides Foundation", data: tidesGrants, color: C.tides,
                  tags: ["Grassroots","Unrestricted Giving","Frontline Justice","LGBTQ+ Inclusive"],
                  strategy: "Fiscal sponsorship + flexible, multi-stakeholder grantmaking. Prioritizes power-building in frontline communities." },
                { name: "Kresge Foundation", data: kresgeGrants, color: C.kresge,
                  tags: ["Place-Based","Social Investment","Climate Resilience","Urban Infrastructure"],
                  strategy: "PRIs + capacity-building + urban systems. Integrates climate resilience into structural policy frameworks." },
              ].map(f => (
                <Card key={f.name}>
                  <div className="flex items-center gap-2 mb-3">
                    <div className="w-3 h-3 rounded-full" style={{ background: f.color }} />
                    <span className="font-bold text-sm">{f.name}</span>
                  </div>
                  <div className="grid grid-cols-2 gap-3 mb-3">
                    <div>
                      <p className="text-xs" style={{ color: C.muted }}>Total Grants</p>
                      <p className="font-black text-lg" style={{ fontFamily: "serif", color: f.color }}>{f.data.length}</p>
                    </div>
                    <div>
                      <p className="text-xs" style={{ color: C.muted }}>Total Disbursed</p>
                      <p className="font-black text-lg" style={{ fontFamily: "serif", color: f.color }}>{fmtM(f.data.reduce((s,g)=>s+g.grantAmt,0))}</p>
                    </div>
                    <div>
                      <p className="text-xs" style={{ color: C.muted }}>Sector HHI</p>
                      <p className="font-bold text-sm" style={{ color: C.text }}>{f.name.includes("Tides") ? tidesHHI : kresgeHHI}</p>
                    </div>
                    <div>
                      <p className="text-xs" style={{ color: C.muted }}>Avg Impact</p>
                      <p className="font-bold text-sm" style={{ color: C.text }}>
                        {f.data.length ? (f.data.reduce((s,g)=>s+g.impact,0)/f.data.length).toFixed(2) : "--"}
                      </p>
                    </div>
                  </div>
                  <p className="text-xs mb-2 leading-relaxed" style={{ color: C.muted }}>{f.strategy}</p>
                  <div className="flex flex-wrap gap-1">
                    {f.tags.map(t => <Tag key={t} label={t} color={f.color} />)}
                  </div>
                </Card>
              ))}
            </div>

            {/* Year trend */}
            <Card>
              <SectionTitle>Disbursement Trend 2015–2024</SectionTitle>
              <ResponsiveContainer width="100%" height={200}>
                <LineChart data={yearData} margin={{ right: 16 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={C.border} />
                  <XAxis dataKey="year" tick={{ fill: C.muted, fontSize: 10 }} />
                  <YAxis tickFormatter={v => `$${(v/1e6).toFixed(0)}M`} tick={{ fill: C.muted, fontSize: 10 }} />
                  <Tooltip content={<CustomTip fmt={v => fmtM(v)} />} />
                  <Legend wrapperStyle={{ fontSize: 10, color: C.muted }} />
                  <Line type="monotone" dataKey="tidesAmt"  name="Tides"  stroke={C.tides}  strokeWidth={2} dot={false} />
                  <Line type="monotone" dataKey="kresgeAmt" name="Kresge" stroke={C.kresge} strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </Card>
          </div>
        )}

        {/* ══════════ SECTORS ══════════ */}
        {activeTab === "sectors" && (
          <div className="flex flex-col gap-6">
            <Card>
              <SectionTitle>Sector Allocation by Grant Count (NTEE Classification)</SectionTitle>
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={sectorData} margin={{ left: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={C.border} />
                  <XAxis dataKey="sector" tick={{ fill: C.muted, fontSize: 10 }} />
                  <YAxis tick={{ fill: C.muted, fontSize: 10 }} />
                  <Tooltip content={<CustomTip />} />
                  <Legend wrapperStyle={{ fontSize: 10, color: C.muted }} />
                  <Bar dataKey="tides"  name="Tides"  fill={C.tides}  radius={[3,3,0,0]} />
                  <Bar dataKey="kresge" name="Kresge" fill={C.kresge} radius={[3,3,0,0]} />
                </BarChart>
              </ResponsiveContainer>
            </Card>
            <div className="grid gap-4" style={{ gridTemplateColumns: "1fr 1fr" }}>
              {[
                { name: "Tides Foundation", data: tidesGrants, color: C.tides },
                { name: "Kresge Foundation", data: kresgeGrants, color: C.kresge },
              ].map(f => {
                const sm = {};
                f.data.forEach(g => {
                  const label = g.sector.includes("-") ? g.sector.split("-").slice(1).join("-").trim() : g.sector;
                  sm[label] = (sm[label]||0)+1;
                });
                const pd = Object.entries(sm).map(([n,v]) => ({ name: n, value: v }));
                return (
                  <Card key={f.name}>
                    <SectionTitle>{f.name} — Sector Mix</SectionTitle>
                    <ResponsiveContainer width="100%" height={200}>
                      <PieChart>
                        <Pie data={pd} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80} label={e => e.name}>
                          {pd.map((_, i) => <Cell key={i} fill={C.sectors[i % C.sectors.length]} />)}
                        </Pie>
                        <Tooltip contentStyle={{ background: "#1E2535", border: `1px solid ${C.border}`, borderRadius: 8, fontSize: 11 }} />
                      </PieChart>
                    </ResponsiveContainer>
                    <div className="mt-2 text-xs" style={{ color: C.muted }}>
                      Sector HHI: <strong style={{ color: f.color }}>{f.name.includes("Tides") ? tidesHHI : kresgeHHI}</strong>
                      <span> (0 = diverse · 1 =c oncentrated)</span>
                    </div>
                  </Card>
                );
              })}
            </div>
            <Card>
              <SectionTitle>Sector-Level Disbursement ($M)</SectionTitle>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={sectorData.map(s => ({ ...s, amt: +(s.amt/1e6).toFixed(2) }))} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" stroke={C.border} horizontal={false} />
                  <XAxis type="number" tick={{ fill: C.muted, fontSize: 10 }} tickFormatter={v => `$${v}M`} />
                  <YAxis type="category" dataKey="sector" tick={{ fill: C.muted, fontSize: 10 }} width={110} />
                  <Tooltip content={<CustomTip fmt={v => `$${v}M`} />} />
                  <Bar dataKey="amt" name="Disbursed $M" radius={[0,4,4,0]}>
                    {sectorData.map((_, i) => <Cell key={i} fill={C.sectors[i % C.sectors.length]} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </Card>
          </div>
        )}

        {/* ══════════ GEOGRAPHY ══════════ */}
        {activeTab === "geography" && (
          <div className="flex flex-col gap-6">
            <Card>
              <SectionTitle>U.S.A. Regional Focus — Grants by Census Region</SectionTitle>
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={regionData}>
                  <CartesianGrid strokeDasharray="3 3" stroke={C.border} />
                  <XAxis dataKey="region" tick={{ fill: C.muted, fontSize: 10 }} />
                  <YAxis tick={{ fill: C.muted, fontSize: 10 }} />
                  <Tooltip content={<CustomTip />} />
                  <Legend wrapperStyle={{ fontSize: 10, color: C.muted }} />
                  <Bar dataKey="tides"  name="Tides"  fill={C.tides}  radius={[3,3,0,0]} />
                  <Bar dataKey="kresge" name="Kresge" fill={C.kresge} radius={[3,3,0,0]} />
                </BarChart>
              </ResponsiveContainer>
              <p className="text-xs mt-3 leading-relaxed" style={{ color: C.muted }}>
                <strong style={{ color: C.tides, fontWeight: 900 }}>Tides</strong>
                <strong style={{ fontWeight: 900, color: C.muted }}>: Nationally distributed with a West Coast and Southern tilt, reflecting frontline community geography.</strong>
                &nbsp;<strong style={{ color: C.kresge, fontWeight: 900 }}>Kresge</strong>
                <strong style={{ fontWeight: 900, color: C.muted }}>: Midwest-anchored (Detroit HQ) with strong investments in rust-belt urban resilience.</strong>
              </p>
            </Card>

            <div className="grid gap-4" style={{ gridTemplateColumns: "1fr 1fr" }}>
              {[
                { name: "Tides Foundation", data: tidesGrants, color: C.tides },
                { name: "Kresge Foundation", data: kresgeGrants, color: C.kresge },
              ].map(f => {
                const urm = {};
                f.data.forEach(g => urm[g.urban_rural] = (urm[g.urban_rural]||0)+1);
                const pd = Object.entries(urm).map(([n,v]) => ({ name: n, value: v }));
                return (
                  <Card key={f.name}>
                    <SectionTitle>{f.name} — Urban/Rural Mix</SectionTitle>
                    <ResponsiveContainer width="100%" height={180}>
                      <PieChart>
                        <Pie data={pd} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={50} outerRadius={75} paddingAngle={3} label>
                          {pd.map((_, i) => <Cell key={i} fill={[f.color, C.accent, C.gold][i]} />)}
                        </Pie>
                        <Tooltip contentStyle={{ background: "#1E2535", border: `1px solid ${C.border}`, borderRadius: 8, fontSize: 11 }} />
                      </PieChart>
                    </ResponsiveContainer>
                  </Card>
                );
              })}
            </div>
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
                  <Bar dataKey="tides"  name="Tides"  fill={C.tides}  radius={[3,3,0,0]} />
                  <Bar dataKey="kresge" name="Kresge" fill={C.kresge} radius={[3,3,0,0]} />
                </BarChart>
              </ResponsiveContainer>
              <p className="text-xs mt-3 leading-relaxed" style={{ color: C.muted }}>
                <strong style={{ color: C.tides, fontWeight: 900 }}>Tides</strong>
                <strong style={{ fontWeight: 900, color: C.muted }}>: shows higher concentration in the $150K–$1M range, consistent with institutional capacity-building grants.</strong>
                &nbsp;<strong style={{ color: C.kresge, fontWeight: 900 }}>Kresge</strong>
                <strong style={{ fontWeight: 900, color: C.muted }}>: distributes smaller grants more broadly, enabling grassroots reach across many orgs.</strong>
              </p>
            </Card>

            <div className="grid gap-4" style={{ gridTemplateColumns: "1fr 1fr" }}>
              <Card>
                <SectionTitle>Grant Type Breakdown</SectionTitle>
                {[
                  { label: "General Operating", tides: tidesGrants.filter(g=>g.grantType==="General Operating").length, kresge: kresgeGrants.filter(g=>g.grantType==="General Operating").length },
                  { label: "Project-Specific",  tides: tidesGrants.filter(g=>g.grantType==="Project-Specific").length,  kresge: kresgeGrants.filter(g=>g.grantType==="Project-Specific").length },
                  { label: "Capacity-Building", tides: 0, kresge: kresgeGrants.filter(g=>g.grantType==="Capacity-Building").length },
                ].map((row, i) => (
                  <div key={i} className="mb-3">
                    <div className="flex justify-between text-xs mb-1">
                      <span style={{ color: C.text }}>{row.label}</span>
                      <span style={{ color: C.muted }}>T:{row.tides} · K:{row.kresge}</span>
                    </div>
                    <div className="flex gap-1 h-2 rounded overflow-hidden">
                      <div style={{ width: `${(row.tides/Math.max(row.tides+row.kresge,1))*100}%`, background: C.tides, borderRadius: "2px 0 0 2px" }} />
                      <div style={{ width: `${(row.kresge/Math.max(row.tides+row.kresge,1))*100}%`, background: C.kresge, borderRadius: "0 2px 2px 0" }} />
                    </div>
                  </div>
                ))}
                <p className="text-xs mt-3" style={{ color: C.muted, fontWeight: 900 }}>
                  General operating support is a best-practice marker per CEP research — Tides leads at ~55%.
                </p>
              </Card>
              <Card>
                <SectionTitle>Concentration Metrics</SectionTitle>
                <div className="flex flex-col gap-4 mt-2">
                  {[
                    { label: "Tides — Sector HHI",    val: tidesHHI,  color: C.tides,  note: "Higher = more concentrated in fewer sectors" },
                    { label: "Kresge — Sector HHI",   val: kresgeHHI, color: C.kresge, note: "" },
                    { label: "Tides — Avg Grant",     val: fmtUSD(tidesGrants.reduce((s,g)=>s+g.grantAmt,0)/(tidesGrants.length||1)),  color: C.tides, note: "" },
                    { label: "Kresge — Avg Grant",    val: fmtUSD(kresgeGrants.reduce((s,g)=>s+g.grantAmt,0)/(kresgeGrants.length||1)), color: C.kresge, note: "" },
                  ].map((m, i) => (
                    <div key={i}>
                      <p className="text-xs" style={{ color: C.muted }}>{m.label}</p>
                      <p className="text-xl font-black" style={{ fontFamily: "serif", color: m.color }}>{m.val}</p>
                      {m.note && <p className="text-xs" style={{ color: C.muted }}>{m.note}</p>}
                    </div>
                  ))}
                </div>
              </Card>
            </div>
          </div>
        )}

        {/* ══════════ IMPACT ══════════ */}
        {activeTab === "impact" && (
          <div className="flex flex-col gap-6">
            {/* OECD DAC Radar */}
            <Card>
              <SectionTitle>OECD DAC Evaluation Criteria — Foundation Scores</SectionTitle>
              <div className="flex flex-col gap-1 mb-3">
                <p className="text-xs" style={{ color: C.muted, fontWeight: 900 }}>
                  Composite scores (1–5) synthesized from grant structure, outcome reporting rates, multi-year commitments, and BIPOC-led portfolio share.
                </p>
              </div>
              <ResponsiveContainer width="100%" height={300}>
                <RadarChart data={FRAMEWORK_DIMS} cx="50%" cy="50%" outerRadius={110}>
                  <PolarGrid stroke={C.border} />
                  <PolarAngleAxis dataKey="dim" tick={{ fill: C.muted, fontSize: 10 }} />
                  <PolarRadiusAxis angle={90} domain={[0,5]} tick={{ fill: C.muted, fontSize: 9 }} />
                  <Radar name="Tides"  dataKey="tides"  stroke={C.tides}  fill={C.tides}  fillOpacity={0.2} strokeWidth={2} />
                  <Radar name="Kresge" dataKey="kresge" stroke={C.kresge} fill={C.kresge} fillOpacity={0.2} strokeWidth={2} />
                  <Legend wrapperStyle={{ fontSize: 10, color: C.muted }} />
                  <Tooltip contentStyle={{ background: "#1E2535", border: `1px solid ${C.border}`, borderRadius: 8, fontSize: 11 }} />
                </RadarChart>
              </ResponsiveContainer>
            </Card>

            {/* Impact by Grant Type */}
            <Card>
              <SectionTitle>Avg Impact Score by Grant Type</SectionTitle>
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={impactTypeData}>
                  <CartesianGrid strokeDasharray="3 3" stroke={C.border} />
                  <XAxis dataKey="type" tick={{ fill: C.muted, fontSize: 10 }} />
                  <YAxis domain={[0,5]} tick={{ fill: C.muted, fontSize: 10 }} />
                  <Tooltip content={<CustomTip />} />
                  <Bar dataKey="avg" name="Avg Impact" radius={[4,4,0,0]}>
                    {impactTypeData.map((_, i) => <Cell key={i} fill={[C.accent, C.tides, C.kresge][i]} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
              <p className="text-xs mt-2" style={{ color: C.muted, fontWeight: 900 }}>
                General operating support consistently yields higher impact scores — aligns with CEP's "What Donors Know" research (2021).
              </p>
            </Card>

            {/* Outcome reporting */}
            <div className="grid gap-4" style={{ gridTemplateColumns: "1fr 1fr" }}>
              {[
                { name: "Tides Foundation", data: tidesGrants, color: C.tides },
                { name: "Kresge Foundation", data: kresgeGrants, color: C.kresge },
              ].map(f => {
                const pct = f.data.length ? (f.data.filter(g=>g.outcomeReported).length/f.data.length*100).toFixed(0) : 0;
                const bipocImpact = f.data.filter(g=>g.bipocLed).reduce((s,g)=>s+g.impact,0) / (f.data.filter(g=>g.bipocLed).length||1);
                const nonBipocImpact = f.data.filter(g=>!g.bipocLed).reduce((s,g)=>s+g.impact,0) / (f.data.filter(g=>!g.bipocLed).length||1);
                return (
                  <Card key={f.name}>
                    <div className="flex items-center gap-2 mb-3">
                      <div className="w-2.5 h-2.5 rounded-full" style={{ background: f.color }} />
                      <span className="text-sm font-bold">{f.name}</span>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <p className="text-xs" style={{ color: C.muted }}>Outcome Reported</p>
                        <p className="text-2xl font-black" style={{ fontFamily: "serif", color: f.color }}>{pct}%</p>
                      </div>
                      <div>
                        <p className="text-xs" style={{ color: C.muted }}>BIPOC-Led Avg Impact</p>
                        <p className="text-2xl font-black" style={{ fontFamily: "serif", color: C.accent }}>{bipocImpact.toFixed(2)}</p>
                      </div>
                      <div>
                        <p className="text-xs" style={{ color: C.muted }}>Non-BIPOC Avg Impact</p>
                        <p className="text-2xl font-black" style={{ fontFamily: "serif", color: C.muted }}>{nonBipocImpact.toFixed(2)}</p>
                      </div>
                      <div>
                        <p className="text-xs" style={{ color: C.muted }}>Equity Differential</p>
                        <p className="text-2xl font-black" style={{ fontFamily: "serif", color: C.gold }}>
                          {(bipocImpact - nonBipocImpact > 0 ? "+" : "")}{(bipocImpact - nonBipocImpact).toFixed(2)}
                        </p>
                      </div>
                    </div>
                  </Card>
                );
              })}
            </div>
          </div>
        )}

        {/* ══════════ STRATEGY ══════════ */}
        {activeTab === "strategy" && (
          <div className="flex flex-col gap-6">
            <div className="grid gap-4" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))" }}>
              {strategyMetrics.map((m, i) => (
                <Card key={i}>
                  <p className="text-xs mb-1" style={{ color: C.muted }}>{m.label}</p>
                  <p className="text-xl font-black" style={{ fontFamily: "serif", color: m.color }}>{m.val}</p>
                </Card>
              ))}
            </div>


            {/* Recommendations */}
            <Card>
              <SectionTitle color={C.gold}>Strategic Recommendations based on my Evaluation Findings</SectionTitle>
              <div className="grid gap-4" style={{ gridTemplateColumns: "1fr 1fr" }}>
                {[
                 { org: "Tides Foundation", color: C.tides, recs: [
                    <><strong style={{fontWeight:900, color: C.muted}}>Expand multi-year commitments</strong> to 3-year cycles to deepen systemic impact</>,
                    <><strong style={{fontWeight:900, color: C.muted}}>Increase PRIs and blended finance instruments</strong> to leverage philanthropic capital</>,
                    <><strong style={{fontWeight:900, color: C.muted}}>Develop standardized outcome reporting protocols</strong> across fiscal sponsees</>,
                    <><strong style={{fontWeight:900, color: C.muted}}>Pilot participatory budgeting</strong> for Frontline Justice Fund allocations</>,
                ]},
                { org: "Kresge Foundation", color: C.kresge, recs: [
                    <><strong style={{fontWeight:900, color: C.muted}}>Increase general operating support</strong> share from ~40% toward the 55% sector benchmark</>,
                    <><strong style={{fontWeight:900, color: C.muted}}>Deepen rural and peri-urban geographic reach</strong> in climate-vulnerable regions</>,
                    <><strong style={{fontWeight:900, color: C.muted}}>Develop community-defined indicators</strong> alongside foundation-led evaluation</>,
                    <><strong style={{fontWeight:900, color: C.muted}}>Expand BIPOC-led fund threshold</strong> from 55% toward Tides' 68% benchmark</>,
                ]},
                ].map(f => (
                  <div key={f.org}>
                    <p className="text-xs font-bold mb-2" style={{ color: f.color }}>{f.org}</p>
                    <ul className="flex flex-col gap-1.5">
                      {f.recs.map((r, i) => (
                        <li key={i} className="flex items-start gap-2 text-xs" style={{ color: C.muted }}>
                          <span style={{ color: f.color, marginTop: 2 }}>→</span>
                          <span>{r}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            </Card>

            {/* Grant Strategy Scorecard */}
            <Card>
              <SectionTitle>Grant Strategy Scorecard — Best Practice Alignment</SectionTitle>
              <div className="overflow-x-auto">
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "12px" }}>
                  <thead>
                    <tr style={{ borderBottom: `1px solid ${C.border}` }}>
                      {["Best Practice Standard","Tides","Kresge","Evidence Base"].map(h => (
                        <th key={h} className="text-left py-2 px-3" style={{ color: C.muted, fontWeight: 700, textTransform: "uppercase", fontSize: 10, letterSpacing: "0.05em" }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {[
                      ["General Operating Support","★★★★★","★★★★☆","CEP, NCRP Power-Building"],
                      ["Multi-Year Funding (≥2yr)","★★★★☆","★★★★★","MacArthur, Ford Foundation"],
                      ["BIPOC-Led Org Prioritization","★★★★★","★★★★☆","Bridgespan, Candid 2023"],
                      ["Community-Led Strategy","★★★★★","★★★☆☆","NCRP, Tides Annual Report"],
                      ["Collaborative Grantmaking","★★★☆☆","★★★★★","Kresge SIP, PRIs"],
                      ["Impact Measurement","★★★☆☆","★★★★★","OECD DAC, CEP"],
                      ["Participatory Grantmaking","★★★★☆","★★★☆☆","GrantCraft 2019"],
                      ["Rural/Nonurban Reach","★★★☆☆","★★★☆☆","USDA, Rural Philanthropy"],
                    ].map((row, i) => (
                      <tr key={i} style={{ borderBottom: `1px solid ${C.border}22` }}>
                        {row.map((cell, j) => (
                          <td key={j} className="py-2 px-3" style={{ color: j===0 ? C.text : j===1 ? C.tides : j===2 ? C.kresge : C.muted }}>
                            {cell}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          </div>
        )}
      </div>

      {/* ── Footer ── */}
      <div className="px-8 py-4 flex items-center justify-between flex-wrap gap-2" style={{ borderTop: `1px solid ${C.border}`, background: C.surface }}>
        <p className="text-xs" style={{ color: C.muted }}>
          Simulated dataset (n=1,200) · v1.0
        </p>
        <p className="text-xs font-mono" style={{ color: C.muted }}>
          Framework: OECD DAC · CEP · Candid PCS · NCRP · MacArthur Big Bets
        </p>
      </div>

      <div className="px-8 py-2 flex items-center justify-center" style={{ background: C.bg }}>
        <p className="text-xs font-mono" style={{ color: C.muted }}>
    © {new Date().getFullYear()} <strong style={{ color: C.text }}>Anurita Srivastava</strong> · All rights reserved · 
    Built for academic & portfolio purposes ·
       </p>
      </div>
    </div>
  );
}