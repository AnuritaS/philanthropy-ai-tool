# Methodology

This document defines every measure the engine produces. If a number appears in the
dashboard and is not defined here, that is a bug.

## 1. What this tool measures, and what it does not

The engine reads grant transaction data. From that it can establish where money went,
to whom, on what terms, over what period, and how that compares to a foundation's own
stated priorities and to peer distributions.

It cannot establish what the money caused. A $1M education grant is observable; a 20%
improvement in student outcomes is not observable from the grant record. Any tool that
converts transaction data into an "impact score" is asserting a causal claim its inputs
cannot support.

The engine therefore produces two separate things, and refuses to blend them:

| | Source | Status |
|---|---|---|
| **Portfolio Practice Profile** | Grant transaction data | Implemented |
| **Outcome Evidence Score** | Evaluations, indicators, self-reported results | Not implemented |

An overall effectiveness figure combining both is only meaningful once outcome evidence
exists for a substantial share of a portfolio. Until then, there is no overall score.

## 2. Descriptive measures are not scored

Most of what a grant portfolio reveals is strategy, not quality.

A community foundation is *supposed* to concentrate geographically. A disease-specific
funder is *supposed* to concentrate by subject. General operating support is treated as
near-axiomatic by trust-based philanthropy and as one tool among several by strategic
philanthropy; the field has not settled it, and this tool does not settle it either.

Scoring these on a 0–100 scale would encode a contested position as arithmetic. So the
engine reports them as raw figures with peer percentiles attached, and lets the reader
judge:

> Flexible funding: 91% of dollars — 88th percentile among peer foundations

not:

> Grant Flexibility: 91/100

**Descriptive (percentile only):** subject / population / geographic / recipient
concentration, top-10 recipient share, flexibility rate, multi-year share, grant size
distribution, support strategy mix.

**Scored:** alignment with stated strategy only (§6).

## 3. Fractional dollar attribution

PCS permits multiple codes per grant — up to five subject codes. A grant coded to three
subjects contributes **one third of its dollars to each**.

The alternative, counting the full amount against every code, inflates attributed dollars
above portfolio total and makes concentration figures incomparable between a portfolio
that codes grants sparsely and one that codes them richly. Fractional attribution keeps
shares summing to 1, which HHI requires.

Consequence worth stating plainly: a foundation that codes its grants more thoroughly
will appear more diversified than an identical foundation that codes only a primary
subject. Coding depth is reported alongside concentration for this reason.

## 4. Concentration

**Herfindahl-Hirschman Index**, over dollar shares:

```
HHI = Σ sᵢ²        where sᵢ = category i's share of attributed dollars
```

Range (0, 1]. Reported because it is the measure used in published philanthropy research
and is therefore comparable to outside work.

**Normalized HHI**, correcting for the number of categories present:

```
HHI* = (HHI − 1/N) / (1 − 1/N)        N = number of categories, N > 1
```

Raw HHI is bounded below by 1/N. A portfolio spread perfectly evenly across 4 categories
scores 0.25; across 40, it scores 0.025 — though both are maximally diversified given
their opportunity set. Normalized HHI puts both at 0. This is the fairer within-portfolio
measure and the one used for peer comparison.

**Effective number of categories** (inverse Simpson), for readability:

```
N_eff = 1 / HHI
```

An HHI of 0.14 means the portfolio behaves as though spread evenly across about 7
categories, regardless of how many appear in the data.

Computed across: PCS subject, PCS population, geography (state), and recipient.

## 5. Terms measures

**Flexibility rate** — share of dollars carrying a general operating support transaction
type. Denominator is *classified* dollars, not total dollars; the coverage figure is
reported alongside so a 91% flexibility rate computed on 40% of the portfolio is visibly
weaker evidence than the same rate on 95%.

**Multi-year share** — share of dollars in grants with a committed duration of 24 months
or more. Duration is taken from `duration_months` when supplied, otherwise derived from
start and end dates. Grants with neither are excluded from both numerator and denominator.

**Grant size** — reported as median and interquartile range. Grant portfolios are heavily
right-skewed; the mean is usually a description of the single largest grant.

## 6. Alignment: the only scored dimension

Alignment answers one question that does have a defensible right answer: **does the money
go where the foundation says it goes?**

The foundation declares its priorities as PCS codes, optionally with target weights.

### Coverage

Share of classified dollars falling within the stated priority set. PCS codes are
hierarchical and fixed-width by level, so ancestry is a prefix test: a grant coded
`SB050200` counts toward a stated priority of `SB`.

```
coverage = aligned dollars / classified dollars
```

### Distributional match

When target weights are supplied, the actual split across priority buckets is compared to
the intended split using total variation distance:

```
TVD = ½ Σ |actualᵢ − targetᵢ|
```

Bounded [0, 1]; zero means an exact match.

### Score

```
without weights:  score = coverage
with weights:     score = coverage × (1 − TVD)
```

The multiplicative form prevents a foundation from earning credit for a well-balanced
split of a small fraction of its portfolio.

### Silence is not misalignment

A foundation that declares no population priority receives **no population alignment
score** — not a zero. Undeclared dimensions are excluded from the composite denominator
entirely. The engine will not penalize a foundation for declining to state a strategy it
does not have.

## 7. Data completeness gates

Every metric is gated on the coverage of the fields it consumes. Below a default 70%
dollar-coverage threshold, the metric returns `null` with a stated reason rather than a
number.

Coverage is measured **by dollars, not by row count**. A portfolio can have 95% of grants
coded and still be missing codes on the three grants carrying half the money. Both figures
are reported; the dollar figure governs.

Every metric returns the coverage it was computed on, so the interface can always render
"78% — based on 84% of portfolio dollars" rather than a bare number.

## 8. Peer benchmarking

*Not yet implemented. Design notes.*

Percentiles require a peer corpus. The corpus is bootstrapped from IRS Form 990-PF e-file
data, which is public and available in bulk, and in which private foundations itemize
grants with recipient, amount, and purpose text. Purpose text is not PCS-coded, so a
classification pass maps free text to PCS subject and population codes.

That classification pipeline is the project's substantive asset. It is also what makes
the tool usable by the large majority of foundations whose data is not PCS-coded at all.

Peer groups are selected on: total annual grantmaking, subject portfolio similarity,
geographic scope, and foundation type. Percentiles are reported with the peer group size,
and suppressed entirely below a minimum group size.

## 9. Federated benchmarking

Grant-level data never needs to leave a foundation's environment. Benchmark participation
transmits only aggregated statistics: grant count, total giving, HHI values, flexibility
and multi-year rates, coverage figures. This is a design constraint on the benchmark API,
not an optional mode.

## 10. Taxonomy

Classification uses Candid's Philanthropy Classification System (PCS), November 2024
release, licensed CC BY 4.0. See `NOTICE.md` for attribution and version pinning.

PCS is reviewed roughly every three to four years. Peer benchmarks are computed against a
pinned version; a taxonomy revision requires re-mapping the corpus before percentiles from
different versions can be compared.
