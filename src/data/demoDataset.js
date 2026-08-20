/* ─── Bundled demo dataset ───────────────────────────────────────────────
   The dashboard opens on this so it is never an empty shell. It is ordinary
   data, not a special case: it is generated into the canonical schema and
   flows through exactly the same code path as an uploaded CSV.

   The funder profiles below are *parameters*, not assumptions — add or
   remove entries and every chart, filter and metric follows.
   ──────────────────────────────────────────────────────────────────────── */

const FUNDER_PROFILES = [
  {
    name: "Tides Foundation",
    n: 600,
    sectors: [["C-Environment", 0.35], ["R-Civil Rights", 0.25], ["Q-International", 0.12],
              ["K-Food/Nutrition", 0.10], ["P-Human Services", 0.09], ["W-Public/Society", 0.09]],
    regions: [["West", 0.30], ["South", 0.22], ["Northeast", 0.18], ["Midwest", 0.15], ["National", 0.15]],
    grantTypes: [["General Operating", 0.55], ["Project-Specific", 0.45]],
    amountLn: { mu: 11.9, sd: 1.1 },
    bipocRate: 0.68,
    collabRate: 0.22,
  },
  {
    name: "Kresge Foundation",
    n: 600,
    sectors: [["L-Housing", 0.30], ["C-Environment", 0.22], ["E-Health", 0.16],
              ["S-Community Dev", 0.12], ["B-Education", 0.10], ["T-Philanthropy", 0.10]],
    regions: [["West", 0.12], ["South", 0.18], ["Northeast", 0.16], ["Midwest", 0.38], ["National", 0.16]],
    grantTypes: [["General Operating", 0.40], ["Project-Specific", 0.35], ["Capacity-Building", 0.25]],
    amountLn: { mu: 12.8, sd: 0.9 },
    bipocRate: 0.55,
    collabRate: 0.35,
  },
];

const LOCALES = [["Urban", 0.60], ["Suburban", 0.22], ["Rural", 0.18]];
const DURATIONS = [[1, 0.30], [2, 0.30], [3, 0.22], [4, 0.18]];
const YEAR_SPAN = { start: 2015, years: 10 };

export function generateDemoGrants(profiles = FUNDER_PROFILES) {
  /* Deterministic LCG — the demo dataset must be identical on every load so
     screenshots, tests and the published site all agree. */
  let s = 42;
  const rng = () => { s = (s * 1664525 + 1013904223) & 0xffffffff; return (s >>> 0) / 0xffffffff; };
  const rnorm = (mu, sd) => {
    const u1 = rng(), u2 = rng();
    return mu + sd * Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  };
  const pick = (pairs) => {
    const r = rng();
    let acc = 0;
    for (const [value, weight] of pairs) { acc += weight; if (r < acc) return value; }
    return pairs[pairs.length - 1][0];
  };

  const grants = [];
  let id = 0;

  for (const p of profiles) {
    for (let i = 0; i < p.n; i++) {
      /* Draw order is load-bearing: it reproduces the exact dataset the v1
         dashboard shipped with, so the demo view is unchanged by this refactor. */
      const year = YEAR_SPAN.start + (i % YEAR_SPAN.years);
      const sector = pick(p.sectors);
      const region = pick(p.regions);
      const locale = pick(LOCALES);
      const grantType = pick(p.grantTypes);
      const amount = Math.max(10000, Math.min(5000000,
        Math.round(Math.exp(rnorm(p.amountLn.mu, p.amountLn.sd)) / 1000) * 1000));
      const durationYears = pick(DURATIONS);
      const multiYear = durationYears >= 2;
      const bipocLed = rng() < p.bipocRate;
      const collaborative = rng() < p.collabRate;
      const orgBudget = Math.max(50000, Math.min(50000000,
        Math.round(Math.exp(rnorm(13.5, 1.3)) / 5000) * 5000));

      const genOp = grantType === "General Operating" ? 1 : 0;
      let impact = 1 + 0.8 * (multiYear ? 1 : 0) + 0.7 * genOp + 0.5 * (bipocLed ? 1 : 0)
                     + 0.4 * (collaborative ? 1 : 0) + 0.3 * (durationYears >= 3 ? 1 : 0) + rnorm(0, 0.4);
      impact = Math.min(5, Math.max(1, impact));

      const outcomeReported = rng() < (0.42 + 0.12 * (multiYear ? 1 : 0) + 0.08 * genOp);

      grants.push({
        id: id++,
        funder: p.name,
        recipient: null,
        year,
        amount,
        sector,
        region,
        locale,
        grantType,
        durationYears,
        multiYear,
        bipocLed,
        collaborative,
        orgBudget,
        impact: +impact.toFixed(2),
        outcomeReported,
      });
    }
  }
  return grants;
}

export const DEMO_GRANTS = generateDemoGrants();

export const DEMO_SOURCE = {
  kind: "demo",
  name: "Simulated dataset",
  rowCount: DEMO_GRANTS.length,
};
