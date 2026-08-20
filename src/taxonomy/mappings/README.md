# Non-PCS vocabulary mappings

Source vocabularies that are not PCS are crosswalked here before classification.
Everything downstream — concentration, alignment, peer percentiles — assumes PCS
codes, so a mapping is the point where a foreign vocabulary either becomes
comparable or quietly stops being comparable.

## `ntee-to-pcs.json`

NTEE is what most US grant data is actually coded in, and PCS ships its own
crosswalk: every subject in the PCS workbook records its "Former GCS/NTEE Code".
`scripts/build-ntee-mapping.mjs` inverts that column.

The mapping is therefore **Candid's**, not ours. That distinction matters. A
hand-built crosswalk would be an unreviewed editorial claim sitting underneath
every figure computed from NTEE-coded data, and there would be no way for a
foundation to audit it.

Regenerate with:

```
node scripts/build-ntee-mapping.mjs
```

### Ambiguity

Where one NTEE code crosswalks to several PCS subjects, the file records the
shallowest as `mapping[ntee]` and keeps the rest under `ambiguous`. Rolling up
is the conservative choice: it loses specificity but never asserts a subject the
source data does not support.

### What this mapping does not do

It covers subjects only. NTEE has no equivalent of the PCS population, support
strategy or transaction type facets, so a portfolio coded solely in NTEE will
still have those fields empty — and the coverage gate will suppress the metrics
that depend on them. That is the correct outcome, not a gap to paper over.

Grants whose NTEE code has no PCS counterpart are left uncoded rather than
guessed. They become missing data, which the completeness report surfaces.

## Adding a vocabulary

1. Add `<source>-to-pcs.json` with a `mapping` object and a `derivedFrom` field
   naming the authority for the crosswalk.
2. Record ambiguity explicitly. Never collapse a genuine one-to-many silently.
3. Note the PCS release it was built against — a taxonomy revision requires
   re-mapping before percentiles from different versions can be compared
   (METHODOLOGY section 10).
