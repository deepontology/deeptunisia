# Inter-annotator study — protocol v1.0

**Status:** instrument ready to run, not run. Dry run on 10 records completed 2026-09-02.  
**Funding:** later study execution (not pre-award). No raters recruited or paid pre-award.  
**Research question:** *Can human epistemic judgment be made consistent enough to feed a mechanically enforced contract?*

This document is the complete study protocol as it will be administered to funded raters. The sibling files are the administered instrument:

- `rubric-v2.md` — the grading rubric (confidence A–D, basis, verification)
- `participant-protections.md` — research ethics, pseudonymous participation, withdrawal, risk briefing
- `sample-300.json` / `sample-300-blinded.json` / `sample-300-key.json` — stratified sample and blinding harness
- `rater-template.csv` — the sheet raters fill
- `scripts/study-sampler.ts`, `scripts/study-blinding.ts`, `scripts/study-kappa.ts`, `scripts/study-model-arm.ts` — the computational harness

---

## 1. Why this study

DeepTunisia's *compiler* half is measured (§8.1 mutation campaign, 25/26 kills). The *human* half — the editorial judgment that declares a claim `documented` vs `reported` vs `inferred` vs `unsubstantiated` — is specified, not measured. The architecture's division of labour (Axiom A1) makes the compiler enforce the *contract* and humans exercise *judgment*; until the consistency of that judgment is measured, the loop is architecturally specified but not empirically validated.

The study is therefore a research question, not a marketing figure. Either outcome is scientifically valuable:

- **High agreement** (κ at or above the pre-specified targets): the rubric is applied reliably at volume.
- **Low agreement**: the disagreement taxonomy names the ceiling of what a two-axis rubric can enforce — where evidence grading is underspecified.

Both outcomes publish under the same source-backed discipline as the data, including negative results.

---

## 2. Design overview

| Element | Decision | Rationale |
|---|---|---|
| **Sample** | 300 records, stratified by kind and risk, oversampled to the difficult tail | Disagreement lives in the murky middle; agreement on A-grade gazette appointments is a floor, not a finding |
| **Raters** | 3 independent raters, none of whom authored the records they grade | Independence is the point; author self-rating is a calibration step only (dry run) |
| **Blinding** | Double-blind: raters never see project grades, never see each other's grades, records in independently shuffled order | Prevents anchoring; the harness is mechanical, not honor-system |
| **Rounds** | 2 rounds: Round 1 grades all 300; disagreement set is *analysed into a taxonomy* (not adjudicated); rubric revised where ambiguous; Round 2 regrades only the disagreement set | The calibration round is where the cost and the value sit — the taxonomy tells the field where grading is underspecified |
| **Parallel arm** | Same 300 records graded by a language model under two prompt regimes (rubric-only vs rubric + examples) | Measures whether the rubric is *expressible* enough that a machine applies it consistently; human-vs-model divergence is itself a finding |
| **Measures** | Fleiss' κ (three raters) per field (confidence, basis) and per record kind; Krippendorff's α (nominal) alongside | κ for the three-rater categorical case; α as a complementary measure robust to uneven category use (expected: A/B dominate, D rare) |
| **Targets** | Pre-specified before the study runs: **κ ≥ 0.80 for basis, κ ≥ 0.70 for confidence** — conventions the field commonly works with, not laws of nature | Agreed upfront; a kappa that stays low after revision is a finding, not a failure; Round 2 deltas are reported regardless of threshold |

The design mirrors the paper's §10.1 scoping exactly, so a reviewer comparing proposal to instrument finds no drift.

---

## 3. Population and sampling

### 3.1 Population

All claim-bearing records in the built graph at the study's sampling date (`src/generated/dataset.json`), across the kinds:

- `positions` (422), `relationships` (362), `events` (100)
- v0.0.2 kinds: `companies` (25), `contracts` (15), `licences` (11), `declarations` (9), `education` (25)

Total population at time of writing: **969 claim-bearing records** (894 when counting only those with a basis bucket in the stats snapshot; the sampler records the live count in its metadata, so the sampling frame is always explicit).

Institution and person *cards* and other non-claim-bearing scaffolding are **not** in the population — the study is about claim records a correction could reach, not about inventory rows.

### 3.2 Risk buckets (oversampled)

The natural distribution is heavily skewed toward `reported`/`documented` A/B. The study deliberately over-represents the tail where disagreement is informative:

| Priority | Bucket | Definition | Approx. population | Sample target (of 300) | Share vs natural |
|---|---|---|---|---|---|
| 1 | **unsubstantiated** | `basis = unsubstantiated` (confidence D, circulating claims kept per rule 6) | 12 (1.3%) | 12 (take all) — 4.0% | 3× |
| 2 | **inferred** | `basis = inferred` (reasoned, not directly stated; carries `reasoning` + `falsifiable_by`) | 20 (2.2%) | 20 (take all) — 6.7% | 3× |
| 3 | **disputed** | `disputes.length > 0` OR `verification = disputed` (competing versions, never silently resolved) | ~30 (3%) | 50 — 16.7% | 5× |
| 4 | **attributed C/D** | `confidence = C or D`, not already bucketed (requires `attributed_to`) | ~70 (7–8%) | 60 — 20% | 2.5× |
| 5 | **reported** | `basis = reported`, remaining | ~665 (74%) | 100 — 33% | under |
| 6 | **documented** | `basis = documented`, remaining | ~197 (22%) | 58 — 19% | under |

Buckets are **mutually exclusive by priority**: a record matching several buckets is assigned to the highest-priority one. This ensures the oversampled tail is genuinely tail, not double-counted.

The exact counts are recorded in `sample-300.json` `meta.bucketTargets` / `meta.bucketActuals` and in the sampler's stdout, so a re-run on a larger graph is recomputable. If any bucket's population is smaller than its target, the sampler takes the entire population and redistributes the deficit pro rata to the reported/documented buckets — never by inventing records.

### 3.3 Kind stratification

Within each bucket the sampler stratifies by `kind` (position / relationship / event / company / contract / licence / declaration / education) so no kind dominates the bucket. The per-kind caps are proportional to the bucket's kind composition, with a floor of 1 per kind present in the bucket.

### 3.4 Selection mechanics

- **Deterministic PRNG**: seeded `mulberry32` with seed = SHA-1(commitSha + bucket + kind). Same commit + same seed = byte-identical sample (reproducibility; the sampler logs the seed).
- **Shuffling**: within-bucket random draw without replacement; final concatenation shuffled with an independent seed so presentation order does not leak bucket.
- **Dry run**: identical mechanics at n=10 (targets scaled: 1 unsubstantiated, 1 inferred, 2 disputed, 2 C/D, 2 reported, 2 documented) — proves the harness end-to-end (see §9).

### 3.5 Temporal and evidential coverage

- The sampler also reports coverage on two auxiliary axes (for description, not quotas): `verification` (`verified` / `needs-primary-source` / `disputed`) and whether the record's interval is a **disputed span** (has disputes about dates). The `disputed` bucket already oversamples these, but the report confirms the sample is not accidentally all-`verified`.

---

## 4. Rater requirements

Graders must hold **all three** of:

1. **Fluent reading in Arabic and French** — the source register is majority-Arabic and majority-French (gazette, press, ministry portals). Machine translation is not a substitute at grading time; raters see original excerpts plus the project's own `excerpt_ar`/`excerpt_fr` reading aids at the `machine` tier only (i.e. explicitly unreviewed).
2. **Working knowledge of Tunisian institutions** — e.g. Interior vs Defence vs Interior's SecState for Security are distinct portfolios; a municipality is not a governorate; the BCT is not a ministry. The distinction is load-bearing for whether a source supports a claim.
3. **Ability to apply a four-grade / four-basis rubric consistently** after training (rubric v2, 90-minute calibration call, 5-record practice set with feedback before Round 1).

Exclusions: authors of the records in the sample; anyone with a financial or political stake in the grades coming out well.

Compensation is framed as **research participation** (clinical wording, §6), never as a bounty for a desired kappa.

---

## 5. Blinding harness

The harness is mechanical. No rater sees:

- the project's published `confidence` / `basis` / `verification` for any record in the sample;
- any other rater's grades;
- the bucket or kind label of a record (the prompt shows only the record's content).

Concretely:

- `sample-300-key.json` holds the answer key (project grades). It is **never distributed** to raters; it lives only with the study coordinator and in the repository for recomputability, behind the harness.
- `sample-300-blinded.json` holds the 300 prompts raters see — each with: a stable `study_id` (S001…S300), the record's `kind` + `id` (so a correction can be traced back, but not its grade), the claim text/dates/sources/excerpts, and empty fields `confidence` / `basis` to be filled. No grade fields are present.
- Per-rater views (`raters/rater-{A,B,C}/sample.csv`) are independently shuffled (different PRNG seeds per rater) and carry only `study_id` (S-codes), not the original id's sort order.
- `scripts/study-blinding.ts` enforces the invariant: it **fails** (exit 1) if any blinded file contains a `confidence`/`basis`/`verification` value, if any per-rater file leaks the key, or if two raters receive the identical order (detecting a missed shuffle).

The harness is runnable as `npx tsx scripts/study-blinding.ts --verify` (check) or `--build` (regenerate per-rater views).

---

## 6. Rubric v2 (as administered)

The full rubric is `rubric-v2.md`. Summary for the protocol:

| Axis | Value | Meaning | Entry condition |
|---|---|---|---|
| **confidence** | **A** | Primary/official record (gazette decree, government portal) states this directly | Tier 1 source, or ≥2 independent tier ≤3 sources converging |
| | **B** | Several credible secondaries agree (no primary located) | ≥2 independent tier ≤4 sources |
| | **C** | Single credible source, or a reasoned estimate | 1 source tier ≤4, or needs-primary-source |
| | **D** | Circulating claim with no reliable evidence located | Tier 5 only, or no tier ≤4 source |
| **basis** | **documented** | An official record states this | Derived from A, or explicit override |
| | **reported** | Credible publication(s) report this; attributed, not independently verified vs primary | Derived from B, or C/verified |
| | **inferred** | No source states this; reasoned from structure; **must carry `reasoning` + `falsifiable_by`** | Derived from C/needs-primary-source |
| | **unsubstantiated** | Circulates without reliable evidence; recorded, not rendered as fact | Derived from D |

**Derivation** (`deriveBasis`, schema-v2 truth table) is published in the rubric and tested exhaustively; raters grade *basis* directly (the derived label), not the derivation rule. A grade C record with `needs-primary-source` that the rater judges to be a reasoned estimate is `inferred`; the same grade C record judged to be a thin report is `reported` — the distinction is the core of the study.

The rubric includes:

- A one-page **decision tree** (confidence → basis → required fields).
- **Five worked examples** drawn from the real graph (one per basis + one disputed-span).
- **Edge cases**: `verified:2026-08` is not `ongoing`; a French excerpt is not the ruling; three newspapers copying one wire count as one lineage.

Raters receive the rubric + the 5-record practice set; feedback on the practice set is given before Round 1 begins and is logged.

---

## 7. Procedure (two rounds)

**Pre-round**

1. Coordinator runs `npx tsx scripts/study-sampler.ts --n 300` → emits `sample-300*.json` + per-rater shuffled views + `rater-template.csv`.
2. Coordinator verifies blinding: `npx tsx scripts/study-blinding.ts --verify`.
3. Raters receive: rubric v2, practice set, their personal shuffled CSV, and the `study_id → prompt` map (blinded JSON). No key.

**Round 1**

4. Each rater grades all 300 records independently on two fields: `confidence` {A,B,C,D} and `basis` {documented, reported, inferred, unsubstantiated}. Grades are entered in their CSV (`confidence`, `basis` columns; `notes` optional). Raters may flag `unsure` per field (treated as missing for kappa; reported separately).
5. Raters submit CSVs to the coordinator (not to each other). Coordinator runs `npx tsx scripts/study-kappa.ts --round 1` over the three CSVs.

**Analysis between rounds**

6. Coordinator produces:

   - Per-field, per-kind κ and α (with 95% bootstrap CIs).
   - A **disagreement taxonomy**: each disagreement is coded as one of

     - *rubric ambiguity* — the rubric admits two readings (fix: rewrite rubric);
     - *source ambiguity* — sources genuinely underdetermine the grade (fix: new source or mark `disputed`);
     - *editorial judgment* — raters weighted the same evidence differently (fix: calibrate, not rewrite).

   The taxonomy is the primary *qualitative* deliverable of Round 1. No grades are adjudicated.

7. Where the taxonomy finds rubric ambiguity, the rubric is revised to v2.1 (changes logged; v2 retained for pre/post comparison). Only ambiguous cases trigger revision; source-ambiguity and editorial-judgment cases do not change the rubric.

**Round 2**

8. Only the **disagreement set** (records where ≥2 raters diverged on at least one field in Round 1) is regraded under the revised rubric. Raters again work blind and independently; order is reshuffled.
9. Coordinator runs `npx tsx scripts/study-kappa.ts --round 2` (Round 1 κ, Round 2 κ on the disagreement subset, and projected full-sample κ under revision).

**Parallel model arm**

10. At the same time as Round 1, `npx tsx scripts/study-model-arm.ts --prompt rubric-only` and `--prompt rubric+examples` grade the same 300 blinded prompts via a language model (or the deterministic simulator when no API key is configured — the output is marked `synthetic` in that case). Model-vs-human divergence is reported, not used to adjudicate human grades. The comparison answers: where models are systematically more lenient, or where they invent basis from confidence, is exactly the failure mode the architecture exists to police.

---

## 8. Measures and analysis

### 8.1 Agreement statistics

For each of two fields (confidence, basis) and for the overall record-kind breakdown:

- **Fleiss' κ** (three raters, categorical, no weighting). Computed per Fleiss (1971): pairwise agreement corrected for chance given the observed category marginals.
- **Krippendorff's α** (nominal distance) alongside — because confidence/basis are likely imbalanced (A/B dominate, D rare), α is robust to uneven category use and to missing data (`unsure`).

Both are computed by `scripts/study-kappa.ts`:

```bash
npx tsx scripts/study-kappa.ts --raters research/study/dry-run/raters/rater-{a,b,c}.csv
# or for the full study:
npx tsx scripts/study-kappa.ts --raters research/study/raters/rater-{a,b,c}.csv --out research/study/kappa-report.json
```

Output per field: `n` (items), `k` (categories), `P_bar` (observed agreement), `P_e` (expected), `kappa`, `alpha`, plus **per-category p_j** and **bootstrap 95% CI** (1 000 resamples).

Targets are pre-specified (basis κ ≥ 0.80, confidence κ ≥ 0.70); they are **not** acceptance standards — kappas are interpreted as conventions, and the Round 2 delta is reported whether the target is met or not. A kappa that stays low after revision is a finding about the rubric's ceiling, not a failure to be hidden.

### 8.2 Reporting

Published deliverables (all with the paper, under the same source-backed discipline as the dataset):

1. The rubric as administered (v2, and v2.1 after calibration if revised).
2. The anonymised grading dataset (`rater × record × grade`, pseudonyms `Rater A/B/C`).
3. The disagreement taxonomy (coded per disagreement, with counts).
4. κ per field, per kind, per round, with CIs; α alongside.
5. Human-vs-model comparison (model arm κ, systematic leniency table).
6. The sampling frame and seed, so the 300 can be re-derived from the commit.

All results are published whether thresholds are met or not — the negative result is the finding about the rubric's limits.

---

## 9. Dry run (instrument validation)

Before funded raters are recruited, the author performs a dry run on **10 records** that exercises the entire harness end-to-end — the acceptance criterion.

Dry-run artifacts live in `research/study/dry-run/` and are **tracked** (force-added) so a reviewer can inspect them without running anything.

| Artifact | How produced | Purpose |
|---|---|---|
| `sample-10.json` + `sample-10-blinded.json` + `sample-10-key.json` | `npx tsx scripts/study-sampler.ts --n 10 --out research/study/dry-run/` | Proves sampler + blinding on a small n |
| `raters/rater-{a,b,c}.csv` | Author grades the 10 three times, with deliberate variation to create a non-trivial κ (not all identical) | Proves rater sheet + submission path |
| `kappa-report.json` + `kappa-report.md` | `npx tsx scripts/study-kappa.ts --raters research/study/dry-run/raters/rater-{a,b,c}.csv --out research/study/dry-run/kappa-report.json` | Proves computation script |
| `model-arm/regime-a.json` + `regime-b.json` | `npx tsx scripts/study-model-arm.ts --n 10 --prompt rubric-only --out dry-run/model-arm/` etc. | Proves model arm (synthetic if no API key) |
| This protocol (`protocol.md`) + `rubric-v2.md` + `participant-protections.md` | Authored | Proves the paper instrument |

The dry run is **not** a substitute for the funded study — author-graded agreement is not independent, and the simulated model grades are not model grades. It is a *harness test*: does every file exist, does every script run, does the output contain the fields the analysis needs?

To reproduce the dry run:

```bash
npm run data
npx tsx scripts/study-sampler.ts --n 10 --out research/study/dry-run --seed 20260902
npx tsx scripts/study-blinding.ts --verify --sample research/study/dry-run/sample-10-blinded.json --key research/study/dry-run/sample-10-key.json
# grade the 10 (or use the committed example grades):
npx tsx scripts/study-kappa.ts --raters research/study/dry-run/raters/rater-{a,b,c}.csv --out research/study/dry-run/kappa-report.json
npx tsx scripts/study-model-arm.ts --sample research/study/dry-run/sample-10-blinded.json --out research/study/dry-run/model-arm --prompt rubric-only
npx tsx scripts/study-model-arm.ts --sample research/study/dry-run/sample-10-blinded.json --out research/study/dry-run/model-arm --prompt rubric+examples
```

---

## 10. Timeline and resourcing

| Phase | Duration | Cost driver | Status |
|---|---|---|---|
| Instrument build (this PR) | 3–4 days | Author time only | **Done — dry run committed** |
| Study execution (Round 1) | 2–3 weeks after award | Rater compensation (research participation), coordinator synthesis | Later milestone — not pre-spent |
| Round 2 + write-up | 1–2 weeks | Same | Funded |
| Publication of deliverables | With paper v0.2 | — | — |

No rater recruitment, payment, or management occurs before an award. The instrument is ready to run; running it is the funded work.

---

## 11. References

- Fleiss, J. L. (1971). Measuring nominal scale agreement among many raters. *Psychological Bulletin*, 76(5), 378–382.
- Krippendorff, K. (2018). *Content Analysis: An Introduction to Its Methodology* (4th ed.), Ch. 12 (α).
- The DeepTunisia evidence envelope and `deriveBasis` truth table — `scripts/schema.ts`, paper §5.2.
- The paper's §10.1 scoping — `output/deeptunisia-release-paper-v0.1.1.md` §10.1 — which this protocol implements verbatim.

---

*Version 1.0 — 2026-09-02. Seed and sample are bound to commit `8e2caf7b`. Re-sampling after data changes produces a new `meta.sampledAt` and `meta.commitSha`.*
