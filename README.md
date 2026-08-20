# 📊 Philanthropy Effectiveness Evaluation Tool

> A grantmaking analysis dashboard that works on **any** philanthropic portfolio. Upload a CSV of grants,
> map your columns onto a standardized schema, and get sector concentration, geographic focus, grant
> structure and impact evaluation across every funder in your data.

[![Live Demo](https://img.shields.io/badge/Live-Dashboard-4ECDC4?style=for-the-badge)](https://anuritas.github.io/philanthropy-ai-tool/)
[![React](https://img.shields.io/badge/React-19-61DAFB?style=for-the-badge&logo=react)](https://react.dev/)
[![Recharts](https://img.shields.io/badge/Recharts-2.x-E8651A?style=for-the-badge)](https://recharts.org/)

---

## 🎯 Project Overview

v1 of this tool compared two specific foundations. **v2 is funder-agnostic**: funders, sectors, regions,
years and grant types are all discovered from whatever data is loaded. Nothing about any particular
foundation is hard-coded, so the same analysis runs on a two-funder comparison or a fifty-funder portfolio.

It opens on a bundled simulated dataset so there is always something to look at, then swaps to your data
on upload.

**Questions the dashboard answers, for any loaded portfolio:**
- How concentrated is each funder's sector allocation (Herfindahl–Hirschman Index)?
- Which grant structures — general operating vs. project-specific — correlate with higher impact scores?
- How does BIPOC-led organization prioritization relate to measurable outcomes?
- Where does each funder concentrate geographically, and where are the gaps?

---

## 📥 Loading Your Own Data

The **Data** tab handles the whole path: upload → map → preview → load.

1. **Upload** a CSV. Comma, semicolon, tab and pipe delimited files all work, as do quoted fields,
   embedded newlines and a UTF-8 BOM.
2. **Map columns.** Headers are auto-matched against the schema — `Grantmaker` finds `funder`,
   `Award Amount (USD)` finds `amount` — and every guess is editable.
3. **Preview** the first parsed rows plus a validation report, then load.

Only three columns are required: **`funder`**, **`year`**, **`amount`**. Every other field is optional and
unlocks the panels that depend on it; panels whose column is absent say so rather than drawing an empty
chart. Rows are rejected only when a *required* field is missing or unparseable — a bad optional value
nulls that one cell and keeps the row.

`Download template` on the Data tab emits a CSV with the full schema and an example row.

### Standardized grant schema

| Field | Type | Required | Notes |
|---|---|:--:|---|
| `funder` | string | ✅ | Drives every funder comparison |
| `year` | integer | ✅ | Fiscal or award year |
| `amount` | number | ✅ | `$1,250,000`, `(500)` and `1.2e6` all parse |
| `recipient` | string | | Grantee organization |
| `sector` | string | | Program area or NTEE code; an `X-Label` prefix is shortened for display |
| `region` | string | | Geographic region |
| `locale` | string | | Urban / Suburban / Rural |
| `grantType` | string | | General Operating, Project-Specific, Capacity-Building… |
| `durationYears` | number | | Grant term |
| `multiYear` | boolean | | Derived from `durationYears` when absent |
| `bipocLed` | boolean | | `yes/no`, `true/false`, `1/0`, `y/n` |
| `collaborative` | boolean | | Co-funded with other funders |
| `orgBudget` | number | | Grantee annual budget |
| `impact` | number | | 1–5 scale, clamped |
| `outcomeReported` | boolean | | Whether an outcome report was filed |

---

## 📊 Dashboard Features

| Tab | Analysis |
|---|---|
| **Data** | CSV upload, column mapping, validation report, template download |
| **Overview** | KPIs, disbursement trend, per-funder comparison cards |
| **Sectors** | Allocation by count and dollars, per-funder sector mix, HHI |
| **Geography** | Regional focus, urban/rural classification |
| **Grant Size** | Size bucket distribution, grant type breakdown, concentration metrics |
| **Impact** | OECD DAC radar, impact score by grant type, BIPOC equity differential |
| **Strategy** | Best-practice scorecard, strategic recommendations |

Every number is computed from the loaded data. The OECD DAC radar, the best-practice star ratings and the
strategic recommendations were hand-authored constants in v1; in v2 they are derived — the radar from each
funder's grant structure, reporting rate, multi-year share, sector diversity and BIPOC-led share, and the
scorecard by scoring observed rates against the published sector benchmarks named in its evidence column.

---

## 🏗️ Architecture

```
src/
├── lib/
│   ├── schema.js      Canonical field definitions, type coercion, record construction
│   ├── csv.js         RFC 4180 parser + delimiter sniffing
│   ├── mapping.js     Header auto-matching, mapping application, validation
│   ├── metrics.js     Every calculation, as pure (grants, funders) → data functions
│   ├── funders.js     Funder discovery and stable colour assignment
│   └── theme.js       Chrome colours
├── data/
│   └── demoDataset.js Bundled simulation, generated into the canonical schema
├── components/
│   ├── DataImport.jsx Upload / mapping / preview interface
│   └── ui.jsx         Shared presentational primitives
└── App.jsx            Dashboard shell and chart composition
```

Calculations live in `lib/metrics.js` as pure functions with no React dependency, so they can be tested
directly with `node` and reused outside the dashboard.

---

## 🗃️ Demo Dataset

A deterministic simulation (n=1,200) of two foundations across 2015–2024, generated by
`src/data/demoDataset.js`. The funder profiles in that file are *parameters* — edit, add or remove them and
every chart, filter and metric follows. It flows through the same code path as an uploaded CSV.

---

## 🛠️ Stata Simulation Code

Please reach out for the working code that generates the full 1,200-observation dataset the demo is based on.

---

## 🚀 Development

```bash
npm install
npm run dev      # http://localhost:5173
npm run build
```

Deploys to GitHub Pages via `.github/workflows/deploy.yml` on every push to `main`.

---

## 📚 References

- OECD DAC (2019). *Better Criteria for Better Evaluation*. OECD Publishing.
- Twersky, F., Buchanan, P., & Threlfall, V. (2013). Listening to Those Who Matter Most: The Beneficiaries. *Stanford Social Innovation Review.*
- Center for Effective Philanthropy (2021). *What Donors Know.* CEP Research.
- National Committee for Responsive Philanthropy (2023). *Power-Building Philanthropy Standards.*
- Candid (2022). *Philanthropy Classification System Update.*

---

## 👤 Author — Anurita Srivastava

Built as a portfolio project demonstrating expertise in philanthropic capital analysis, impact evaluation
methodology, and public policy data visualization.
