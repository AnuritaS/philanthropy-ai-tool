# Open Philanthropy Benchmark — Build Specification

Implementation spec for converting the existing two-foundation React/Recharts dashboard
into a reusable, AI-assisted benchmarking engine.

**Read `METHODOLOGY.md` before writing any scoring or AI code.** It defines every measure
and encodes three constraints that are not negotiable during implementation. Violating
them silently is the main failure mode for this project.

---

## 0. Non-negotiable constraints

These are architectural, not stylistic. Tests must enforce them.

1. **No impact score.** The engine never emits a number claiming social outcome from
   transaction data. `buildProfile` output must contain no `impact` or `impactScore` key.
   There is an existing test asserting this — do not delete it.
2. **AI explains, never scores.** Every number shown to a user is computed by
   deterministic JavaScript in `src/core/`. LLM calls may classify unstructured input and
   narrate computed results. An LLM must never produce a score, percentile, or metric
   value. Any AI-generated finding must carry a `metricRef` pointing at the computed value
   it describes; findings without one are dropped before render.
3. **Coverage gating is load-bearing.** No metric renders without its coverage figure.
   Below threshold, metrics return `null` with a reason and the UI shows the reason, not a
   blank or a zero.

---

## 1. What already exists

`src/core/` is complete, dependency-free ESM, 18 passing tests (`npm test`).

| File | Exports |
|---|---|
| `schema.js` | `FIELDS`, `REQUIRED_FIELDS`, `PCS_FIELDS`, `normalizeGrant`, `normalizeDataset`, `deriveDurationMonths` |
| `validation.js` | `DEFAULT_COVERAGE_THRESHOLD`, `fieldCoverage`, `completenessReport`, `gated` |
| `metrics.js` | `dollarDistribution`, `dollarDistributionByKey`, `hhi`, `normalizedHHI`, `effectiveCategories`, `concentration`, `topRecipientShare`, `flexibilityRate`, `multiYearShare`, `grantSizeDistribution`, `portfolioTotals` |
| `alignment.js` | `descendsFrom`, `matchesAnyPriority`, `priorityCoverage`, `totalVariationDistance`, `actualPriorityShares`, `alignmentScore`, `compositeAlignment` |
| `index.js` | `buildProfile`, `profileFromRows` |

Do not rewrite these. Extend them.

The legacy dashboard lives in the existing repo's `src/` with simulated data and hardcoded
foundation assumptions. It is Version 0. Its Recharts components are worth keeping; its
data layer is not.

---

## 2. Target repository structure

```
open-philanthropy-benchmark/
├── README.md
├── METHODOLOGY.md              # exists — the defensibility layer
├── NOTICE.md                   # exists — PCS CC BY 4.0 attribution
├── LICENSE
├── package.json
│
├── src/
│   ├── core/                   # EXISTS — deterministic engine, zero deps
│   │   ├── schema.js
│   │   ├── validation.js
│   │   ├── metrics.js
│   │   ├── alignment.js
│   │   └── index.js
│   │
│   ├── taxonomy/
│   │   ├── pcs/
│   │   │   ├── subjects.json           # PCS Nov 2024, pinned
│   │   │   ├── populations.json
│   │   │   ├── support-strategy.json
│   │   │   ├── transaction-type.json
│   │   │   └── version.json            # { release, retrievedAt, sourceUrl }
│   │   ├── index.js                    # load, lookup, ancestry, label resolution
│   │   └── mappings/                   # non-PCS vocabularies → PCS
│   │       ├── ntee-to-pcs.json
│   │       └── README.md
│   │
│   ├── ingestion/
│   │   ├── parsers/
│   │   │   ├── csv.js
│   │   │   ├── excel.js
│   │   │   └── json.js
│   │   ├── mapping.js                  # deterministic column-name heuristics
│   │   └── form990pf/
│   │       ├── fetch.js                # IRS bulk index + XML retrieval
│   │       ├── parse.js                # XML → raw grant rows
│   │       └── build-corpus.js         # CLI: assemble peer corpus
│   │
│   ├── ai/
│   │   ├── client.js                   # single Anthropic API wrapper
│   │   ├── column-mapper.js            # headers + samples → mapping suggestion
│   │   ├── classifier.js               # purpose text → PCS codes
│   │   ├── strategy-extractor.js       # mission text → PCS priority codes
│   │   ├── narrator.js                 # computed metrics → findings prose
│   │   └── prompts/
│   │       ├── column-mapper.md
│   │       ├── classifier.md
│   │       ├── strategy-extractor.md
│   │       └── narrator.md
│   │
│   ├── benchmark/
│   │   ├── peer-groups.js
│   │   ├── distributions.js
│   │   ├── percentile.js
│   │   └── aggregate.js                # federated payload builder
│   │
│   ├── report/
│   │   ├── findings.js                 # deterministic finding detection
│   │   └── export.js                   # PDF / JSON export
│   │
│   ├── ui/                             # migrated from V0
│   │   ├── upload/
│   │   │   ├── DropZone.jsx
│   │   │   ├── ColumnMapper.jsx
│   │   │   └── ValidationReport.jsx
│   │   ├── strategy/
│   │   │   └── StrategyDeclaration.jsx
│   │   ├── dashboard/
│   │   │   ├── PortfolioOverview.jsx
│   │   │   ├── PracticePanel.jsx
│   │   │   ├── AlignmentPanel.jsx
│   │   │   ├── FindingsPanel.jsx
│   │   │   └── charts/                 # SALVAGED from V0 Recharts components
│   │   ├── benchmark/
│   │   │   └── PeerComparison.jsx
│   │   └── shared/
│   │       ├── MetricValue.jsx         # renders value + coverage + why-link
│   │       └── CalculationTrace.jsx    # the "why did I get 78?" drawer
│   │
│   └── state/
│       └── store.js
│
├── corpus/
│   ├── .gitignore                      # raw 990-PF XML is not committed
│   └── distributions/                  # committed aggregate percentiles only
│
├── sample_data/
│   ├── pcs-coded-sample.csv
│   ├── uncoded-sample.csv
│   └── messy-sample.csv                # bad dates, $ strings, dupes, blanks
│
└── test/
    ├── core.test.js                    # EXISTS
    ├── taxonomy.test.js
    ├── ingestion.test.js
    ├── ai.test.js                      # mocked API, no live calls
    ├── benchmark.test.js
    └── fixtures/
```

---

## 3. Build phases

Execute in order. Each phase ends with passing tests and a demoable state.

### Phase 1 — Taxonomy + ingestion (no AI)

Goal: a real CSV in, a real profile out. Deterministic only.

1. Download PCS Nov 2024 release from `https://taxonomy.candid.org/resources/downloads`.
   Convert each facet to JSON: `{ code, label, parent, definition, level }`. Write
   `version.json` recording release date, retrieval date, and source URL.
2. Build `src/taxonomy/index.js` (§4.1).
3. Build CSV/Excel/JSON parsers producing raw row arrays.
4. Build `suggestMapping` heuristics (§4.2) — string similarity against known aliases, no
   LLM yet.
5. Wire `profileFromRows` end to end. Verify against `sample_data/pcs-coded-sample.csv`.
6. Create `messy-sample.csv` deliberately containing `$1,250,000`, `(5000)`, blank
   recipients, duplicate grant IDs, `12/31/2024` and `2024-12-31` mixed. Assert the
   quarantine path reports them rather than dropping them.

**Exit:** `profileFromRows(parseCSV(file), mapping)` returns a valid profile for all three
sample files.

### Phase 2 — Migrate V0 dashboard onto the real engine

Do not rewrite the charts. Adapt the data.

1. Inventory V0's Recharts components. For each, record the exact prop shape it consumes.
2. Write `src/ui/dashboard/adapters.js` converting `buildProfile` output into those shapes.
   This is the cheapest path and preserves working visualizations.
3. Delete V0's simulated dataset and all hardcoded foundation names, sector lists, and
   two-foundation comparison logic.
4. Build `MetricValue.jsx` — the component every number renders through. Signature:
   value, coverage, suppressed reason, and a `trace` object. It must be impossible to
   render a bare metric without its coverage.
5. Build `CalculationTrace.jsx` — the "why did I get 78?" drawer. Reads the `components`
   object already returned by `alignmentScore`.

**Exit:** upload a CSV, see the V0 charts populated with real uploaded data.

### Phase 3 — AI layer

Now add the LLM. Each module is independently testable with mocked responses.

1. `src/ai/client.js` — one wrapper, retry, timeout, JSON-mode enforcement (§4.3).
2. `column-mapper.js` — suggests mapping, user confirms. Never auto-applies.
3. `classifier.js` — the load-bearing piece. Free-text purpose → PCS codes with
   confidence. Batched, cached, deterministic-seeded where possible (§4.4).
4. `strategy-extractor.js` — paste a mission statement, get proposed PCS priority codes
   for the user to confirm. Removes the biggest onboarding barrier to alignment scoring.
5. `narrator.js` — takes computed findings, writes prose. Enforces `metricRef` (§4.6).

**Exit:** an uncoded CSV with only free-text purposes produces a full profile including
alignment scoring.

### Phase 4 — Peer corpus and benchmarking

1. `form990pf/fetch.js` — IRS e-file bulk index, filter to 990-PF, download XML.
2. `form990pf/parse.js` — extract Part XV grant records: recipient, amount, purpose,
   foundation EIN.
3. Run the Phase 3 classifier over the corpus purpose text. This is the expensive step —
   cache aggressively, run once, commit only aggregates.
4. `peer-groups.js`, `distributions.js`, `percentile.js` (§4.7).
5. Commit `corpus/distributions/*.json`. Never commit raw grant records.

**Exit:** a first-time uploader sees real percentiles with no other foundation having
opted in. This is what makes the tool usable on day one.

### Phase 5 — Federated contribution and open-source release

1. `aggregate.js` — build the anonymous statistics payload (§4.8).
2. Contribution endpoint accepting only that payload shape. Reject anything containing
   grant-level fields.
3. Docker, contributor guidelines, GitHub Actions running `npm test`.

---

## 4. Function contracts

Signatures are the contract. Implementations may vary; shapes may not.

### 4.1 Taxonomy — `src/taxonomy/index.js`

```js
/** @typedef {{code:string,label:string,parent:string|null,definition:string,level:number}} PCSNode */

/** Load a pinned facet into memory. Facet: 'subjects'|'populations'|'support-strategy'|'transaction-type' */
export function loadFacet(facet): Map<string, PCSNode>

/** Resolve a code to its node. Returns null for unknown codes — never throws. */
export function lookup(facet, code): PCSNode | null

/** Human label for a code, for chart axes and findings prose. */
export function labelFor(facet, code): string

/** Full ancestor chain, root first. Used for roll-up views. */
export function ancestors(facet, code): PCSNode[]

/** Direct children. Used by the strategy declaration picker. */
export function children(facet, code): PCSNode[]

/** Roll a code up to a given depth. Subject SB050200 at depth 1 → SB. */
export function rollUp(facet, code, depth): string

/** Every leaf code, for classifier prompt construction. */
export function leaves(facet): PCSNode[]

/** Validate a user-declared priority list. Returns unknown codes. */
export function validateCodes(facet, codes): { valid: string[], unknown: string[] }
```

Note: `core/alignment.js` already implements ancestry as a prefix test and does not import
this module. Keep it that way — core stays dependency-free. This module is for labels,
navigation, and prompt construction.

### 4.2 Deterministic column mapping — `src/ingestion/mapping.js`

```js
/**
 * Heuristic column mapping from header names. Runs before any AI call.
 * Returns confidence per field so the AI mapper only handles what this misses.
 * @returns {{ mapping: Record<string,string>, confidence: Record<string,number>, unmapped: string[] }}
 */
export function suggestMapping(headers, sampleRows): MappingSuggestion

/** Known aliases: 'amount' ← 'grant_amount','award_amount','amt','total','$'. Extend freely. */
export const FIELD_ALIASES: Record<string, string[]>

/** Infer type from sample values to break ties: dates vs numbers vs codes. */
export function inferColumnType(values): 'number'|'date'|'code'|'text'
```

### 4.3 AI client — `src/ai/client.js`

```js
/**
 * Single point of contact with the Anthropic API.
 * Model is configured via env (OPB_MODEL), not hardcoded — verify current model strings
 * at https://docs.claude.com rather than assuming.
 *
 * Responsibilities: retry with backoff, timeout, token accounting, JSON extraction,
 * and refusing to return unparsed prose where JSON was requested.
 */
export async function complete({ system, messages, maxTokens, jsonSchema }): Promise<object>

/** Content-hash cache. The 990-PF corpus classification pass depends on this. */
export function cached(keyFn, fn): Function

/** Cost/usage accumulator, exposed so corpus builds can report spend before running. */
export function usageReport(): { calls, inputTokens, outputTokens, estimatedCost }
```

### 4.4 Classifier — `src/ai/classifier.js`

The most important module in the project. Most foundations have no PCS coding, and 990-PF
purpose text never does.

```js
/**
 * Classify one grant's free text into PCS codes.
 *
 * Candidate codes are pre-filtered by embedding or keyword retrieval before the LLM call —
 * never put the full PCS hierarchy in a prompt.
 *
 * @param {{description:string, recipientName?:string, subjectHint?:string}} input
 * @returns {Promise<{
 *   subject: Array<{code:string, confidence:number}>,
 *   population: Array<{code:string, confidence:number}>,
 *   supportStrategy: Array<{code:string, confidence:number}>,
 *   rationale: string
 * }>}
 */
export async function classifyGrant(input, options)

/** Batched classification with concurrency control and cache. Used for corpus builds. */
export async function classifyBatch(grants, { concurrency = 8, onProgress }): Promise<Map<string, Classification>>

/**
 * Retrieve plausible PCS codes for a text before the LLM sees it.
 * Keeps prompts small and results stable.
 */
export function candidateCodes(text, facet, k = 25): PCSNode[]

/**
 * Apply classifications to normalized grants, writing into pcs_* fields.
 * MUST tag provenance: each written code carries { source: 'ai', confidence }.
 * Codes below minConfidence are not written — they become missing data, which the
 * coverage gate then handles honestly.
 */
export function applyClassifications(grants, classifications, { minConfidence = 0.6 }): {
  grants: Grant[],
  applied: number,
  belowThreshold: number
}
```

**Provenance requirement:** the profile must be able to report "62% of subject codes were
AI-inferred". A foundation comparing itself to peers deserves to know how much of its own
classification was machine-guessed. Add `pcs_subject_source` etc. to the schema, or carry
a parallel provenance map.

**Validation:** the classifier must be evaluated, not trusted. Hand-code 200 grants from
the corpus, measure top-1 and top-3 accuracy against them, and commit the eval set and
scores. Publish the accuracy figure in `METHODOLOGY.md`. A benchmark built on an
unmeasured classifier is not defensible.

### 4.5 Strategy extractor — `src/ai/strategy-extractor.js`

```js
/**
 * Mission statement / strategy doc → proposed PCS priority codes.
 * Output is a PROPOSAL. The user confirms or edits before it is used for scoring.
 * Alignment scoring against unconfirmed AI-extracted priorities is circular and
 * must be blocked in the UI.
 */
export async function extractStrategy(text): Promise<{
  subject: { priorities: string[], weights?: Record<string,number>, evidence: string[] },
  population: { priorities: string[], evidence: string[] },
  geography: { priorities: string[], evidence: string[] },
  confidence: number
}>
```

`evidence` holds the phrases from the source text that produced each code, so the user can
check the extraction rather than accept it blindly.

### 4.6 Findings and narration

Deterministic detection first, prose second.

```js
// src/report/findings.js — NO AI. Pure functions over a computed profile.
/**
 * @returns {Array<{
 *   id: string,
 *   level: 'strength'|'opportunity'|'gap',
 *   metricRef: string,        // dotted path into profile, e.g. 'practice.flexibility.value'
 *   value: number,
 *   comparison: { peerMedian?: number, percentile?: number, stated?: number },
 *   magnitude: number
 * }>}
 */
export function detectFindings(profile, benchmarks): Finding[]
```

```js
// src/ai/narrator.js — prose only.
/**
 * Turns detected findings into readable prose.
 *
 * HARD CONSTRAINT: the model receives findings as structured input and may only rephrase
 * them. It may not compute, infer, or introduce numbers. Any number appearing in output
 * prose must be present in the input findings — validate this and drop violations.
 */
export async function narrateFindings(findings, context): Promise<Array<{
  findingId: string,
  headline: string,
  body: string,
  metricRef: string
}>>

/** Post-hoc guard. Extracts every numeral from generated prose and asserts membership. */
export function validateNarration(narration, findings): { valid: boolean, violations: string[] }
```

### 4.7 Benchmarking — `src/benchmark/`

```js
/** Select comparable foundations. Returns null if the group is too small to report. */
export function selectPeerGroup(profile, corpus, { minGroupSize = 20, criteria }): {
  peers: ProfileSummary[],
  criteria: object,
  size: number
} | null

/** Precomputed percentile breakpoints per metric per peer group. */
export function buildDistributions(profiles): Record<string, { p10,p25,p50,p75,p90, n }>

/** Where a value falls. Returns null below minimum group size — never guesses. */
export function percentileOf(value, distribution): number | null

/**
 * Attach percentiles to every descriptive metric in a profile.
 * Alignment scores are NOT percentiled against peers — they are measured against the
 * foundation's own stated strategy and are not comparable across foundations.
 */
export function attachBenchmarks(profile, distributions): BenchmarkedProfile
```

### 4.8 Federated aggregation — `src/benchmark/aggregate.js`

```js
/**
 * Build the only payload that may leave a foundation's environment.
 * Whitelist, not blacklist. Anything not explicitly listed is excluded.
 */
export function buildAggregatePayload(profile): {
  anonymousId: string,        // random, not derived from EIN
  periodStart: string,
  periodEnd: string,
  grantCount: number,
  totalDollars: number,
  subjectHHI: number,
  geographicHHI: number,
  recipientHHI: number,
  flexibilityRate: number | null,
  multiYearShare: number | null,
  medianGrantSize: number,
  coverageBySubject: number,
  aiClassifiedShare: number,
  schemaVersion: string
}

/** Reject any payload containing recipient names, grant IDs, or amounts per grant. */
export function assertNoGrantLevelData(payload): void
```

---

## 5. Data contracts

**Grant record:** defined in `src/core/schema.js` `FIELDS`. Adding a field requires
updating the coverage report and the aggregate whitelist.

**Strategy declaration:**
```js
{
  subject:    { priorities: ['SB','SC'], weights: { SB: 70, SC: 30 } },
  population: { priorities: ['PA020000'] },
  geography:  { priorities: ['CA','NY'] },
  source: 'user' | 'ai-extracted-confirmed',
  declaredAt: '2026-08-20T00:00:00Z'
}
```
`source: 'ai-extracted'` without confirmation must not be accepted by `buildProfile`.

**Profile:** output of `buildProfile`. Shape is stable; treat it as public API once the
UI depends on it.

---

## 6. Test requirements

- `core.test.js` must continue to pass unmodified.
- No test may make a live API call. Mock `ai/client.js`.
- Classifier: committed eval set of ≥200 hand-coded grants, accuracy asserted above a
  floor, floor published in `METHODOLOGY.md`.
- Narrator: property test asserting no numeral appears in output that is absent from input.
- Aggregate: test asserting a payload containing a recipient name throws.
- Ingestion: `messy-sample.csv` round-trips with all defects reported.

---

## 7. Sequencing note

Phase 1 and 2 produce a working tool. Phase 3 makes it usable by foundations without coded
data. Phase 4 is what makes it valuable rather than merely functional.

If time is constrained, a completed Phase 1–2 running on fifty real foundations' 990-PF
data is more persuasive than a scaffolded Phase 5 running on simulated data. Resist
building the ecosystem before the engine has met real, messy input.
