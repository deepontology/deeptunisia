# Pre-fix fixture tree — 2026-08-07 audit snapshot

**What this is:** The 7 distinct ways the build could be bypassed before the hardening contract (spec v0.0.2-v2 §2, validators V18–V24). Each case here is a *minimal invalid record* that **shipped green** on the 2026-08-07 build and **fails** on the current build.

**Why it exists (C1):** Peer Review 5.2 + Dual M4 — "reproducible in principle, unverifiable in practice (repo squashed 26 Aug, 790→884)". This folder makes the audit replayable: `npm run test` proves each bypass is closed, and a reader can diff this folder against `data/` to see what a "quietly wrong" record looks like.

**How to use:**

```bash
# All 7 should be rejected — this is the gate that proves the fix:
npm run test:validators   # pure-schema fixtures (V18/V20/V23/V21)
npm run test:pipeline     # full-pipeline fixtures (V8/V9/V22/V24)
npm run data              # real dataset is clean — these fixtures are NOT in data/
```

A checkout of the tree at `2026-08-07` with these records *in* `data/` would fail `npm run data` with the validator IDs below. The current tree with them *out* passes.

**The 7 cases:**

| # | Spec | Defect that shipped | Validator that now closes it | Real record that shipped it |
|---|---|---|---|---|
| H1 | V18 | `inferred` derived from `C + needs-primary-source` ships without `reasoning`/`falsifiable_by` — refine only checked authored basis, and only on positions | V18 `inferred completeness` (derived basis, all kinds) | `rel-beji-caid-essebsi-youssef-chahed-political-conflict` (`data/relationships.yaml:2577` C/nps → inferred, no reasoning) |
| H2 | V19 | `attributed_to`/`reasoning` on people/positions/institutions silently stripped — schema in strip mode, field not declared | V19 `schema-field audit` (strict objects + envelope composition) | 10 people + 2 positions + 3 institutions (e.g. `data/people.yaml`) |
| H3 | V20 | Grade C/D without `attributed_to` ships on positions/people/events — refine only on relationships/agreements | V20 `attribution completeness` (all kinds) | any C-grade position/event (pre-fix) |
| H4 | V21 | `2018-02-31` silently becomes `2018-03-03` via `Date.UTC` rollover — `dateToken` accepted any string | V21 `calendar-date validity` (round-trip) | synthetic — `parseBare` accepted it |
| H5 | V22 | Contradictory interval silently trimmed; old end-only clamp inverted `p-foreign-drif` (`2010` → `2010-01-14` → `endEarliest > endLatest`) | V22 `interval contradiction` + inversion guard + `interval-trims.json` published | `p-foreign-drif` (`data/positions.yaml:2048`) |
| H6 | V23 | Any `review` object counted as human review — `date` unvalidated, `method` free text | V23 `review provenance` (ISO date + enum) | 27/719 counted under old definition |
| H7 | V24 | Succession chained by nearest-dated adjacency with unpublished 1-year gap threshold + unknown-end exemption hidden in code | V24 `succession sanity` (thresholds in `meta`, reproducible) | any role with adjacency gaps |

**Files in this folder:**

- `cases.yaml` — the 7 minimal invalid payloads + expected validator message (machine-readable)
- `cases.json` — same, for tooling
- This README — human-readable provenance

This is not a full `data/` dump — it is the *smallest* reproducer per defect, so the test can pin the validator without needing a full graph.
