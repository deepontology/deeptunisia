# Rubric v2 — confidence / basis grading (as administered)

**Version:** 2.0 — 2026-09-02  
**Status:** administered rubric for the inter-annotator study (protocol `research/study/protocol.md` §6).  
**Revision rule:** Round 1 disagreements coded as *rubric ambiguity* produce a v2.1 patch with changes logged in `protocol.md` §7; v2 is retained for pre/post comparison.

This is the single document raters see when grading. It is deliberately self-contained: no prior DeepTunisia knowledge is assumed beyond the source-register note in §1.

---

## 1. Source register (what raters actually read)

Every record prompt shows:

- the **claim text** (what the record asserts: e.g. "X held post Y between these dates", "X is son of Y", "event E occurred on this date");
- the **date span** as the sources state it (raw tokens and the resolved interval);
- the **sources** cited for this record — each with `title`, `publisher`, `tier` (1–5), `excerpt` (quoted), and `url` (for verification, not for re-searching at grading time);
- optional `reasoning` / `falsifiable_by` / `disputes` already authored (when present).

**Important:** the prompt does **not** show the project's grade. The rater's job is to assign one from the evidence shown.

Raters see the original Arabic/French excerpts plus the project's own `excerpt_fr`/`excerpt_ar` reading aids (marked `machine` — explicitly unreviewed). A reading aid is subordinate, never authoritative; grading rests on the original `excerpt` and the tier.

Tiers:

| Tier | Meaning | Examples |
|---|---|---|
| 1 | Official / primary record | JORT decree text, government portal decree list, legislation-securite.tn database, ministry official site |
| 2 | Institutional or peer-reviewed | academic press, DCAF security-legislation DB, Carnegie, BCT annual report |
| 3 | Established international journalism | Reuters, AP, AFP, Le Monde |
| 4 | Reputable regional media | Leaders, Kapitalis, Business News, Webdo, Tunisie Numérique |
| 5 | Lead requiring corroboration | single-writer blog, unverified wire copy, fr.wiki list (useful but never sufficient alone) |

A tier-1 source states a fact; a tier-3/4 source *reports* that someone states a fact; a tier-5 source *circulates* a claim.

---

## 2. What you are grading

Each record receives **two independent grades**:

| Field | Values | Question it answers |
|---|---|---|
| **confidence** | `A` · `B` · `C` · `D` | *How strong is the evidence?* (quantity / independence of sources) |
| **basis** | `documented` · `reported` · `inferred` · `unsubstantiated` | *What kind of claim is this?* (relationship between claim and sources) |

They are not the same axis:

- A reasoned estimate and a thinly-sourced report can both be weak (confidence C), but they are weak in completely different ways. **Basis** captures that difference; **confidence** captures the strength.
- Basis is *derived* from confidence + verification by the build (`deriveBasis` truth table below), but **you grade basis directly**, on the evidence, not by applying the derivation rule. The derivation is the build's enforcement; your judgment is the measurement of whether humans apply it consistently.

Optional per-field flag: `unsure` (leave the cell blank + write `unsure` in `notes`). Treated as missing for κ/α; reported separately. Do not guess — `unsure` is data.

---

## 3. Confidence — how strong

| Grade | Label | Condition | Typical source pattern |
|---|---|---|---|
| **A** | Primary | An official record states this directly, or ≥2 independent tier ≤3 sources converge on an official fact | JORT decree text; ministry decree list + corroborating portal; 2× tier-3 with independent reporting |
| **B** | Corroborated | ≥2 *independent* credible sources agree; no primary located | 2–3× tier ≤4, independent lineages (not the same wire copy) |
| **C** | Single-source / estimate | One credible source, or a reasoned estimate where no direct source exists | 1× tier ≤4; or `needs-primary-source` with reasoning |
| **D** | Circulating | No reliable source located; claim circulates in the popular account | Tier 5 only, or no tier ≤4 source |

**Independence matters.** Three newspapers copying the same TAP wire count as **one** lineage, not three sources. A JORT decree republished on a ministry portal is still **one** primary lineage. Grade B requires independent corroboration, not copy count.

**Downgrade rule:** if the only sources are tier 5 (fr.wiki list, single blog, headline-only), the grade is D even if three such sources agree — three leads are not corroboration.

---

## 4. Basis — what kind of claim

| Basis | Meaning | When to choose |
|---|---|---|
| **documented** | An official record, decree, gazette entry or primary document states this | Tier-1 source directly states the claim; the excerpt contains the fact |
| **reported** | Credible publication(s) report this; attributed, not independently verified against a primary | Tier-3/4 reporting; no primary, but credible outlet(s) assert it |
| **inferred** | **Nobody states this directly.** It is reasoned from structure and **must carry `reasoning` + `falsifiable_by`** | The sources give the premises; the record draws the conclusion; you see `reasoning` and `falsifiable_by` in the prompt when this is the project's view |
| **unsubstantiated** | Circulates without reliable evidence; recorded rather than deleted | Grade D; the map shows the popular account exists, but marks it as unchecked |

**The `inferred` vs `reported` distinction is the core of the study.** Both are weaker than `documented`, but for different reasons:

- *Reported*: someone credible said so, but you have not seen the primary.
- *Inferred*: **no one** said so — the claim is a conclusion drawn from the surrounding records (e.g. tenure dates, succession, ownership structure), and the record therefore owes you *why* and *what would refute it*.

If the prompt shows `reasoning` + `falsifiable_by`, ask: does the reasoning actually follow from the sources shown, and is the falsifier specific? A vague falsifier (`"more evidence"`) is not a falsifier.

**Derivation reference** (the build's `deriveBasis` truth table — you do not apply this mechanically, but it is the enforcement behind the grades):

| confidence | verification | derived basis |
|---|---|---|
| A | any | `documented` |
| B | any | `reported` |
| C | `verified` | `reported` |
| C | `needs-primary-source` | `inferred` |
| C | `disputed` | `reported` |
| D | any | `unsubstantiated` |
| (explicit `basis` authored) | — | the authored value overrides all rows |

A record whose `verification` is `needs-primary-source` and whose confidence you judge to be C should therefore usually be `inferred` — unless the single source actually *states* the claim (then it is `reported`). That judgment is the interesting one.

---

## 5. Verification (context, not graded)

Raters do **not** grade `verification` in this study (confidence + basis only), but the prompt shows it because it shapes the basis question:

- `verified` — the claim has been checked against its sources.
- `needs-primary-source` — a primary record is expected but not yet located (common for pre-2011 dates).
- `disputed` — competing versions exist; the record carries a `disputes` array (recorded, never silently resolved). A disputed record is not automatically low-confidence — the dispute may be about a one-day boundary.

---

## 6. Decision tree (one page)

Grade each record by walking this tree top to bottom. Stop at the first matching condition.

```
1. How many INDEPENDENT credible sources (tier ≤4) support the claim?
   ├─ 0 (only tier-5 or nothing)  →  confidence D  →  basis unsubstantiated
   │                                (if clearly a guess: inferred instead — rare; note why)
   ├─ 1  →  confidence C
   │        ├─ Does any source DIRECTLY state the claim?
   │        │   ├─ yes  →  basis reported
   │        │   └─ no, the claim is reasoned from structure (reasoning + falsifier present or clearly owed)
   │        │           →  basis inferred
   │        └─ Is there a primary (tier-1) that directly states it, despite being single?
   │            └─ single tier-1 stating it directly  →  consider A (see step 3)
   └─ ≥2 independent
        ├─ Is at least one a PRIMARY record (tier 1) directly stating the claim?
        │   ├─ yes  →  confidence A  →  basis documented
        │   └─ no   →  confidence B  →  basis reported
        │              (unless the synthesis is itself an inference: then C/inferred — see §7 edge cases)

2. If the record carries `disputes`: confidence is not automatically C/D.
   A well-sourced claim with a recorded one-day disagreement is still A/B; the dispute
   is the honesty mechanism. Grade the main claim, then note the dispute scope in `notes`.

3. Tier-1 single-source A: a single JORT decree directly naming a minister IS grade A —
   it is a primary record, not a single newspaper. The "≥2 sources" rule for A applies
   to non-primary convergence; a decree is sufficient alone.
```

---

## 7. Worked examples (real graph records, anonymised to study_ids in the live sample)

The five examples below are fixed in the repository (`research/study/examples/`) and are shown to raters before Round 1. They are **not** part of the 300.

### Example 1 — documented / A

> **Claim:**  `president` role held by H. Bourguiba 1957-07-25 → 1987-11-07
> **Sources:** JORT 1957 Constituante decree (tier 1) + Le Monde 1987-11-08 coup report (tier 3) — two independent lineages, one primary.
> **Grade:** **A / documented** — primary record directly states the tenure; dates are exact.

### Example 2 — reported / B

> **Claim:**  `p-def-baly` tenure ~1979 → 1980 (Defence minister Slaheddine Baly)
> **Sources:** Fr.wiki defence list (tier 5) + Leaders article referencing the 1979 appointment (tier 4) — two independent, no gazette located.
> **Grade:** **B / reported** — corroborated secondaries, no primary; `verification: needs-primary-source` does not push this to inferred because the sources *state* the tenure directly.

### Example 3 — inferred / C (the key case)

> **Claim:**  `p-media-attessia-ouertani` inferred ownership (presenter Mo.A. Ouertani as owner of Attessia TV)
> **Sources:** Wikipedia infobox (tier 5) claiming ownership; contemporaneous press describes him only as presenter/production partner — no corporate filing.
> **Grade:** **C / inferred** — the single infobox is not a direct statement the press corroborates; the claim is reasoned from the infobox, requires `reasoning` ("Wikipedia infobox lists...") and `falsifiable_by` ("corporate filing for Cactus Prod / Attessia TV showing shareholder list"), `verification: needs-primary-source`. Downgrading to D/unsubstantiated is also defensible — the disagreement here is the finding.

### Example 4 — unsubstantiated / D

> **Claim:**  `p-foreign-drif` — Foreign minister Rachid Drif 2010-01-14 → present (single-day C-grade, later shown to be a ghost — no person of that name in any minister list)
> **Sources:** Only the project's own placeholder; the succession Abdallah → Morjane is continuous with no gap; no second source names Drif.
> **Grade:** **D / unsubstantiated** — circulating only in the project's early data, no reliable source; `attributed_to` names the list that does show the era's cabinet without him. The record is kept per rule 6 (the popular account is shown, not deleted).

### Example 5 — disputed span / B-reported with a dispute

> **Claim:**  `p-justice-tekkari` tenure 1999-11-17 → 2010-01-15, with dispute: source A says end 2010-01-14, source B says 15 (one-day slip between decree signing and publication).
> **Sources:** Fr.wiki dated list (tier 5) + Jeune Afrique report 2010-01-16 (tier 3) + decree list (tier 1) — converged, but the day disagrees.
> **Grade:** **B / reported**, with `disputes: [{claim: "end 14 Jan", held_by: "Source A", status: "open"}]` — the main claim is B-reported (corroborated), the one-day disagreement is recorded, not graded down to C. A rater who grades this C/inferred should note why (is the one-day uncertainty material?).

---

## 8. Edge cases and common traps

| Trap | How to handle |
|---|---|
| **Three newspapers, one wire** | Count as **one** lineage. If all three cite the same TAP dispatch, the claim is single-source (C), not corroborated (B). Check excerpts for wire attribution. |
| **`verified:2026-08` vs `ongoing`** | `verified:YYYY-MM` = "documented in place at this date, may have continued" (status `last-verified`); `ongoing` = "positively confirmed at cutoff, still in post." They are different claims and render differently. |
| **French excerpt is not the ruling** | A French or English excerpt is a reading aid (`excerpt_fr`, `machine` tier). Grade from the original `excerpt` and its tier; the translation is subordinate. |
| **`inferred` without reasoning/falsifier** | The build **fails** on this; the study sample contains no such record. If you judge a claim to be inferred but the prompt shows no reasoning/falsifier, grade it inferred and note "reasoning owed but not authored" — the disagreement is data. |
| **Disputed ≠ low confidence** | A dispute about a one-day boundary does not make a 10-year tenure C-grade. Grade the tenure; note the dispute scope. |
| **Company/contract zeros** | A capital of 0 or award of "~0" is not an error — it may be a declared zero or a placeholder for an undisclosed figure. Grade the claim about the figure, not the figure. |
| **`attributed_to` is not a source** | A record that says `attributed_to: "Fr.wiki finance list"` but cites no source is still **unsubstantiated** (D) until the source is added. Attribution names *who says so*; the source proves they said so. Both are required for C/D. |
| **Falsifier vagueness** | `"More evidence"` or `"Further research"` is **not** a falsifier. A valid `falsifiable_by` names a concrete record: a JORT decree number, a ministry list, a corporate filing, a dated primary that would overturn the claim. |

---

## 9. What to enter

Per record (one row per `study_id`):

| Column | Values | Required |
|---|---|---|
| `study_id` | S001…S300 | (given) |
| `confidence` | `A` / `B` / `C` / `D` | yes |
| `basis` | `documented` / `reported` / `inferred` / `unsubstantiated` | yes |
| `notes` | free text; use for `unsure`, edge-case flags, falsifier assessment | optional but encouraged for disagreements |

Leave `confidence` or `basis` blank only to mark `unsure` — write `unsure` in the cell or in `notes` (the harness treats blank-or-`unsure` as missing for α). Do not leave blanks silently.

---

## 10. Calibration and practice

- Raters complete the 5-record practice set from §7 **before** Round 1. Coordinator returns feedback (model grades + the project's grades) and raters may ask questions. Practice grades are not part of the analysis.
- Raters may consult rubric v2, the source excerpts in the prompt, and — for Arabic/French sources — a dictionary. They may **not** re-search the web for new sources (the study grades the record from its cited evidence, not from a new literature search).
- Time estimate: ~4–6 minutes per record after calibration; 300 records ≈ 20–30 hours per rater across 2–3 weeks. Rater schedules are self-paced.

---

## 11. What happens to your grades

See `participant-protections.md` §3–§5: grades are pseudonymised (Rater A/B/C), no individual judgments are published, participation may be withdrawn at any point, and raw grading sheets are stored encrypted and deleted after publication of the anonymised dataset.

---

*Rubric v2 anchors: `deriveBasis` truth table — `scripts/schema.ts:1226`; paper §5.2 Table 4 — `output/deeptunisia-release-paper-v0.1.1.md` §5.2; verification enum — `scripts/schema.ts:49`.*

*End of rubric v2.*
