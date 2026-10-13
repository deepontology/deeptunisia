# Pre-registration: DT Research 001

**Working title:** What Does Democracy Mean to Tunisians?
**Registration:** [PLATFORM] on [DATE], with the frozen instrument hash below.
**Registration DOI:** [pending]
**Status:** draft, 2026-09-15. Not filed. Every bracketed field is filled at the freeze gate (M3).
**Companion documents:** `protocol.md` (full design), `instrument-v0.yaml` (item bank, not yet frozen), `participant-protections.md`, `translation-brief.md`, `../m2-contract.md` (platform behaviour).

This document is the pre-registration pack. It states, before data exist, what will be asked, of whom, what will be estimated, and what would count as a result in each direction. Changes after filing are logged as amendments with dates; no amendment is made after the fielding window opens, except to fix a fault that would invalidate the data, and any such fix is reported.

---

## 1. Study

**Type:** cross-sectional, open-participation, self-administered online survey. Three locales: Modern Standard Arabic, French, English.

**Population:** anyone aged 18 or over who reaches the survey page. No residence requirement, no quota, no sampling frame. Location is a self-reported analysis variable, not an eligibility gate.

**Instrument:** `dt001-democracy`, version [VERSION], content hash [SHA256]. Approximately 31 essentiality items, a 15-item MaxDiff block (8 choice sets of 4), 12 present-in-Tunisia items, 7 support and regime items, 3 safety and mode items, 1 optional open-text item, and 12 demographics. The exact wording is the instrument file at the registered hash.

**Fielding window:** [START] to [END], approximately 8 weeks. No incentive of any kind. Recruitment channels, each with a distinct link parameter: [channels confirmed at freeze].

**Target:** 1,500 completed responses. The realized n is reported whatever it is; the analysis plan states the minimum n for each model family, and below those minima the corresponding model is not run.

## 2. Research questions and hypotheses

Directional hypotheses are pre-specified. Items marked exploratory are reported as estimates with intervals and never as confirmatory tests.

**RQ1, structure.** A five-family structure (electoral, liberal, participatory, deliberative, egalitarian) plus a distinct anti-democratic cluster is recoverable from the essentiality ratings.
*H1:* confirmatory factor analysis meets conventional fit thresholds (CFI ≥ 0.90, RMSEA ≤ 0.08) for the six-factor solution after any pre-specified modifications; the anti-democratic items load on their own factor.

**RQ2, prevalence.** *H2:* at least 70% of respondents rate free elections, civil rights and gender equality 9 or 10. *Exploratory:* the share rating each anti-democratic item 9 or 10, and the share rating an anti-democratic item 9 or 10 while also rating elections 9 or 10.

**RQ3, prioritization.** *H3:* the MaxDiff utility ranking differs from the mean-rating ranking; at least one item moves by five or more rank positions between the two.

**RQ4, ideal versus present.** *H4, exploratory:* the largest essentiality-minus-presence gaps are on corruption and equality before the law; the smallest is on elections.

**RQ5, support.** *H5:* higher electoral and liberal conception scores predict higher support for democracy; higher outcome-oriented scores (government type unimportant if it delivers) predict lower support and greater acceptance of a strong leader. This is the main confirmatory test.

**RQ6, measurement.** *H6:* mean differences between block-order arms are below 0.3 scale points on a 0 to 10 scale, and interactions with education and political interest are small and reported regardless of direction.

**RQ7, benchmarking.** *H7:* the online sample differs from WVS-7 Tunisia and Arab Barometer IX on shared items in the direction implied by a younger, more educated, more urban, more politically interested composition. Magnitudes are reported; no correction is presented as making the sample representative.

**RQ8, diaspora, exploratory.** Differences between respondents inside and outside Tunisia on conceptions and support.

**RQ9, open text, exploratory.** Coded definition categories and their association with the closed-battery classes.

## 3. Design and randomization

Two between-subject experiments are embedded in the instrument:

1. **Block order.** The essentiality modules are presented as WVS core first or extended first, 50/50.
2. **Scale direction.** The visible anchor labels of the essentiality scale are shown ascending or descending, 50/50.

Assignment is made server-side when the instrument is fetched, returned with a signed assignment, and verified at submission; the client cannot choose its arm. Both design variables are stored with every response. Analysis of the experiments is by intention-to-treat on the stored arm.

There is no blinding: respondents know they are answering a survey, and the team does not see individual responses as identifiable data because none are stored.

## 4. Data collection

- **Consent** is collected before any item; the consent version is stored with the response.
- **Identifiers:** none stored. No IP address, user agent, device fingerprint, geolocation, email, name or account. Rate limiting uses a rotating salted hash; the address itself is not stored.
- **Bot defence:** a CAPTCHA challenge, edge rate limiting, a honeypot field, a minimum completion time, and post-hoc duplicate detection. A fraud audit is published with the release.
- **Withdrawal:** a random receipt code deletes a response while the study is open. After the dataset is frozen, deletion is impossible; the consent states this before participation.
- **Retention:** raw rows are replaced by the released anonymized dataset; open text is purged after coding. The released microdata coarsens location, age and education as described in `participant-protections.md`.

## 5. Exclusion rules

These are fixed before fielding. Every exclusion is counted and published by rule and by channel.

| Rule | Definition |
|---|---|
| Age | self-reported under 18, not stored |
| Consent | not given, not stored |
| Challenge | CAPTCHA failed after two attempts |
| Honeypot | hidden field completed |
| Speed | completion below 40% of the pretest median [median and threshold recorded at freeze] |
| Incomplete | fewer than 80% of required items answered |
| Straight-lining | zero variance across all essentiality items |
| Duplicates | near-identical response vectors above a pre-specified similarity threshold |

Sensitivity analyses repeat the primary results with and without duplicates and with and without the fastest decile.

## 6. Variables

**Outcomes.** Item-level essentiality ratings (0 against democracy, 1 to 10, or skip); MaxDiff best and worst choices; present-in-Tunisia ratings (0 to 10); support items (4-point agreement, or 0 to 10 for satisfaction and the country rating); open-text category.

**Conception scores.** Family scores from the final factor solution; conceptual complexity as the count of items rated 9 or 10 and a profile-entropy measure.

**Covariates.** Age band, sex, governorate or abroad region, education, employment, subjective financial situation, political interest, religiosity, language of completion, previous survey participation, comfort answering, screen visibility, and the mode-expectation item.

**Design variables.** Block order, scale direction.

## 7. Analysis plan

Within each family, p-values are corrected with Benjamini-Hochberg at 5%. All estimates are reported weighted and unweighted. Weights are raked to INS 2024 census margins on sex, age band and governorate, capped at 5, with the design effect and effective sample size reported.

1. **Descriptives.** Item distributions, percent choosing 9 or 10, percent choosing "against democracy", percent skipping, by locale, channel and arm. The "against democracy" and skip categories are outcomes in their own right.
2. **Structure.** Exploratory factor analysis, then confirmatory factor analysis on the solution suggested by the EFA. Primary treatment of the rating scale is continuous; an ordinal robustness check is reported.
3. **Classes.** Latent profile analysis on family scores; model range 2 to 6; selection by BIC, entropy above 0.7, minimum class size 5%, and substantive interpretability. A MaxDiff mixture model runs in parallel; the two solutions are compared, not merged.
4. **Prioritization.** MaxDiff utilities per item and per respondent; Spearman rank correlation with mean ratings; the items that move most.
5. **Gap.** Paired essentiality-minus-presence differences per item with FDR correction; a residents-versus-diaspora difference in gaps as an exploratory comparison.
6. **Support models.** Ordinal logistic regressions of each support item on family scores, complexity and covariates, with average marginal effects. H5 is the primary test.
7. **Measurement.** Arm differences in item means with pre-specified interactions by education and political interest.
8. **Open text.** Coding scheme derived from the first 100 responses by two independent coders, frozen, applied to the rest; category frequencies, association with classes, and an inter-coder agreement statistic.
9. **Robustness.** Primary results repeated unweighted, excluding organic-channel responses, excluding the fastest decile, and excluding respondents reporting low comfort.

**Missing data.** Skips are reported, not imputed in the primary analysis. A complete-case and a multiple-imputation sensitivity check are reported for the confirmatory models.

**Software.** Analysis scripts are versioned with a pinned environment and published. A repository check recomputes the published aggregate tables from the released microdata.

## 8. Inference criteria

- H1 is supported if the six-factor model meets the fit thresholds after modifications that are pre-specified in type (correlated residuals within a family, no cross-loadings) and logged in the analysis script.
- H2 is supported if each of the three named items reaches 70% at 9 or 10; the estimate and its interval are reported either way.
- H3 is supported if at least one item moves five or more rank positions; the full movement table is published regardless.
- H5 is supported if the sign pattern of the family coefficients matches the hypothesis and survives FDR correction; the effect sizes are reported whether or not it survives.
- H6 is not a null-hypothesis test of "no effect". The estimated arm differences and their intervals are reported, and the 0.3-point threshold is a descriptive benchmark, declared in advance so that a claim of "no order effects" cannot be made from a non-significant test alone.
- A study with a thin sample still reports descriptives and states which models were not run.

## 9. Stopping rule

The fielding window closes at [END] or earlier if the fraud audit crosses the pre-registered tolerance [threshold set at freeze, from the pretest and the first week of monitoring], or if a legal or safety risk to participants emerges. Pausing and restarting are both reported with reasons.

## 10. Data and materials

- Instrument and translation report: deposited with a DOI at freeze.
- Anonymized microdata and codebook: CC BY 4.0, deposited with a DOI at release.
- Analysis code: published in the repository.
- Negative results: published with the same care as positive ones. If the factor structure fails, that is reported first.

## 11. Ethics, funding, conflicts

- **Ethics:** independent external review, reviewer named on the study page, conditions recorded. [Reviewer and date at freeze.]
- **Data protection:** review against applicable Tunisian law and, where relevant, the GDPR; storage and retention decisions recorded. [Reference at freeze.]
- **Funding:** [declared at freeze; no party, campaign or foreign-government funding].
- **Conflicts:** [team disclosures at freeze].

## 12. Timeline

| Phase | Window |
|---|---|
| Freeze and registration | [M3 dates] |
| Fielding | [8 weeks] |
| Analysis and release | [M5 dates] |
| Preprint and submission | [M6 dates] |

---

*Draft v0.1, 2026-09-15. Not filed. No data exist. This document is a pre-registration in waiting: it becomes citable only when registered with the frozen hash.*
