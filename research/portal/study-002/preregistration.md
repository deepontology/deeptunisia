# Pre-registration: Study 002, Tunisia Police Index, Wave 01

**Study:** `dt-research-002` · **Instrument:** `dt002-police-index` · **Version:** recorded at freeze
**Instrument hash (sha256):** `RECORDED AT FREEZE`
**Fielding window:** `RECORDED AT FREEZE` (opens) to `RECORDED AT FREEZE` (closes)
**Registered:** `RECORDED AT FREEZE`

This document is fixed before the first response is collected. The hash above is the content hash of the instrument as fielded. It covers every question's wording in English, French and Arabic, every response option and scale label, the display conditions, and the whole scoring block: the formula, bands, exclusions, regions and cell floor. Any change to any of those produces a different hash and a new instrument version, and the change is logged under §11. This document is committed to the public repository next to the instrument, and the commit date is the registration date.

---

## 1. What is being measured

One construct: **how strongly respondents sense that they live under a police state**. It is measured in three parts, and the parts are kept separate before they are combined:

| Component | Items | Meaning |
|---|---|---|
| Trust (T) | pti_t1 to pti_t5 | Whether the police are seen as fair, accountable, safe to approach and on the public's side |
| Grip (G) | pti_g1 to pti_g5 | Whether respondents feel afraid, watched and unfree around the police |
| Harm (H) | pti_e1, pti_e3, pti_e4, pti_e5 | Bad encounters in the last 12 months: the respondent's own, and those of people close to them |

Two context items (pti_c1, compared with before 2011; pti_c2, change in trust over a year) are reported beside the index and never enter it.

## 2. Population and sampling

Open, self-selected online participation by adults (18 and over), recruited through DeepTunisia's channels and whatever links others share. There is no probability of selection. Every number is reported as describing **respondents**, never Tunisians as a population. The registry's population statement is: *"Among respondents to an open, self-selected online survey of adults. Results describe the people who took part, not Tunisians as a whole."*

## 3. Scoring

The formula is the instrument's `scoring` block, which is hashed. In words:

- Every 0 to 10 answer becomes x/10. pti_g2 is reverse-keyed (1 − x/10).
- **T** is the mean of answered trust items. It is missing if fewer than 3 of the 5 are answered. **G** is the same for the grip items.
- **Harm.** Direct harm D is the mean of (1 − treatment/10) and min(1, abuses ticked / 3). Close harm V is min(1, abuses ticked for people close / 3). For a respondent with contact, H = (2·D + V) / 3; otherwise H = V. "None of these" scores 0. A skipped item is missing; missing parts drop out and the weights renormalise.
- **Index:** I = 100 · (T + (1 − G) + (1 − H)) / 3, with equal weights. T and G are required. If H is missing, the index renormalises over T and G.
- **Bands:** Police state [0, 20), Coercive [20, 40), Divided [40, 60), Accountable [60, 80), Guardian [80, 100].

## 4. Exclusions

These are applied before any aggregate and published live with their counts:

1. **Speed:** completion in under 40 seconds.
2. **Straight-lining:** the identical answer on all ten index items (pti_t1 to pti_t5, pti_g1 to pti_g5). Because pti_g2 is reverse-keyed, an honest extreme respondent does not trip this rule.

These are refused at submission and never stored:

- a completion under 20 seconds;
- more than five submissions per address per hour, counted by a salted, daily-rotating hash of the address;
- a submission without a solved first-party bot check;
- answers to questions that were not shown;
- an answer outside the declared options.

## 5. Estimands and analysis

**Headline:**
- the mean I over valid respondents, with a percentile bootstrap 95% interval (seeded; 1,000 resamples live, 2,000 at close);
- the median;
- band counts.

**Components:** the mean T, G and H, each with its n.

**Distributions:**
- the full 0 to 10 distribution of every scale item;
- option counts for the checklists, with respondents not shown an item counted separately from those who skipped it;
- the T × G density on the published 10 × 10 grid.

**Splits:**
- police contact in the last 12 months (yes / no);
- region (the seven INS regions).

A cell with fewer than 20 respondents is suppressed, and its size is not shown.

**Weighting:** the headline is unweighted. At close, an estimate raked to INS 2024 margins (age band, gender, region) is published beside it and labelled as weighted.

## 6. Hypotheses

These are registered before data. They are directional, and each is tested once at close:

- **H1:** Respondents who report police contact in the last 12 months have a lower mean I than those who report none. Test: difference in means with a bootstrap 95% interval excluding 0.
- **H2:** T and G are negatively correlated (Pearson r below −0.3). If they are not, the two-axis model is reported as unsupported for this wave.
- **H3:** The trust items and the grip items each form a reliable scale (Cronbach's alpha ≥ 0.70). If either falls short, the wave says so beside its headline.

Everything else on the results page is descriptive. A pattern noticed after the data comes in is reported as exploratory.

## 7. Live publication

Results are published live during fielding (a departure, §10). The live page shows only aggregates computed from the current instrument hash. To make attempts to move the number visible, it also shows submissions per hour for the last 72 hours, including excluded ones, and the exclusion counts by rule. At close, the live endpoint is frozen and the final figures are recomputed offline from the exported data with the same code. The final figures are the published wave result.

## 8. Release at close

- **Aggregates:** committed as `results.yaml` and rendered with their n and the population statement.
- **Microdata:**
  - region instead of governorate;
  - age bands only;
  - dates no finer than the day;
  - no receipt codes;
  - no recruitment channel codes.

  Licence CC BY 4.0, deposited with a DOI.
- **Raw rows:** deleted after the release is verified to reproduce the published tables.

## 9. Close and stopping

The wave closes at the end of the fielding window. It closes early only for a security incident that puts respondents or the data at risk. An early close, and its reason, is published.

## 10. Departures from the platform's own rules

- **Live results.** The platform's default is counts only until close. This wave publishes results live, with the integrity record described in §7.
- **Interim translations.** The French and Arabic were prepared by the project and reviewed by its editor. They are not the independent human translation, back-translation and cognitive interviewing the platform requires. They will be replaced before a later wave.
- **No external ethics review.** The protections published on the study page are the project's own.

## 11. Changes after registration

None yet. Any change to the instrument after this document is fixed produces a new version and hash, and is listed here with its date and reason. A change during fielding starts a new wave.
