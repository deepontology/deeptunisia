# Pre-registration: DT Research 003

**Working title:** Citizen Budget 2027
**Registration:** [PLATFORM] on [DATE], with the frozen instrument hash below.
**Registration DOI:** [pending]
**Status:** draft, 2026-11-09. Not yet filed or registered. The study has not opened and no data exist.
**Companion documents:** `protocol.md`, `instrument-v0.yaml` (draft item bank), `legal-brief.md`, `figures-2027.yaml`.

This document is the pre-registration plan for DT Research 003. It defines the research questions, estimands, exclusion rules, and analysis plan before data collection begins. No amendments will be made after the fielding window opens, except to repair technical faults that would otherwise invalidate the data, with any amendment logged and published.

---

## 1. Study and population

**Type:** cross-sectional, open-participation, self-administered online budget reallocation task. Locales: Modern Standard Arabic, French, English.

**Population:** adults aged 18 or over worldwide who access the study. There is no residence requirement, no sampling frame, and no quotas. Participation is self-selected.

**Unit of analysis:** one valid submitted budget.

**Fielding window:** opens after the 2027 finance law is adopted and published in the official gazette (scheduled for December 2026) and closes when the 2028 draft budget is tabled in parliament in mid-October 2027.

**Target:** 1,000 valid submitted budgets. The realized sample size is published regardless of target achievement, with no single recruitment channel exceeding 50% of valid responses.

**Population statement:** every published report, chart, and release includes the following notice: "Among respondents to an open, self-selected online survey of adults. Results describe the people who took part, not Tunisians as a whole."

## 2. Research questions

**Primary research question:** Among the people who took part, how would they move money between the lines of Tunisia's 2027 state budget, and how much do they agree with each other?

**Secondary research questions:**
1. Knowing that the gap is borrowed, should total spending be lower, the same, or higher?
2. How much say do citizens have today over how the budget is spent? (measured on a 0 to 10 scale)

The study does not claim to measure what the wider population prefers, what the budget should be, or whether any spending line is wasteful.

## 3. Design

Respondents move money between movable spending systems on a board, one step at a time, where a step is 5% of a system's draft. Each respondent starts from the draft or from an empty purse, according to the study version. Locked lines (debt interest, reserve) are fixed. To finish, the purse must be placed to within 0.5% of the movable envelope. Respondents may also keep the draft explicitly.

**Presentation order:** systems are shown in official budget order for every respondent in this version. A randomised presentation order (an order arm) is not part of version 1 and is not estimated. A later version that adds it must amend this preregistration first.

## 4. Data collection and protections

- **Consent:** collected before items appear; under 18 terminates the session and stores nothing.
- **Identifiers:** none stored. No IP address, user agent, browser fingerprint, email, name, or user account. Edge rate limiting uses a rotating salted hash.
- **Storage:** responses are stored in Cloudflare D1.
- **Withdrawal:** a random receipt code is generated at submission. A participant can enter this receipt code on the withdrawal page to delete their entry while the study window remains open. Once the window closes and data is frozen for release, deletion is technically impossible.

## 5. Exclusion rules

Exclusions are applied mechanically. Every exclusion is logged and reported by rule and recruitment channel:

| Rule | Definition | Handling |
|---|---|---|
| Age gate | Self-reported under 18 | Session terminated, nothing stored |
| Consent | Consent statements not confirmed | Session terminated, nothing stored |
| Edge challenge | Turnstile failure or bot detection | Blocked at edge |
| Honeypot | Hidden bot-detection field completed | Excluded |
| Balance failure | Movable total outside plus or minus 0.5% tolerance | Submission rejected at edge |
| Speed exclusion | Completion time below threshold derived from pretest median | Excluded from primary estimands |
| Fast draft | Unchanged draft allocation and completion time below 1.5 times speed threshold | Excluded from primary estimands |

## 6. Estimands and analysis plan

All estimands are pre-specified:

1. **Headline per category:** the share of respondents who give each category more, the same, or less than the draft baseline, alongside the median change in percent with its interquartile range (IQR).
2. **The average citizen budget:** the mean allocation per category. Because the mean of balanced budgets sums exactly to the envelope, this produces a mathematically valid budget. Reported with a bootstrap 95% interval, labelled "average of the budgets submitted". Medians do not sum to the envelope and are never displayed as a combined budget.
3. **Spread and consensus:** individual change distributions displayed via strip or box plots per category; consensus measured as the share of respondents allocating within plus or minus 10% of the category median.
4. **Secondary estimands:** percentage distribution on overall spending direction (lower, same, higher) and mean and median ratings of perceived citizen say (0 to 10 scale).

## 7. Sensitivity checks and reporting rules

**Sensitivity checks:** published alongside primary results:
- Excluding responses from the largest recruitment link channel.
- 5% trimmed mean allocations across categories.
- Primary estimands evaluated with and without respondents who kept the draft unchanged.

**Reporting floors and presentation rules:**
- No statistics published until at least 100 valid responses are reached.
- Subgroup analyses on optional governorate report only at the level of the seven INS regions; any cell with fewer than 20 respondents is suppressed, with complementary suppression applied.
- Categories are displayed strictly in official budget order, never sorted into winners and losers.

## 8. Data and materials

Anonymized microdata (allocation vectors, INS region, month, locale, coarsened completion time) and codebooks will be released under CC BY 4.0 with a DOI. Analysis scripts will be versioned in the project repository with an automated verification script that reproduces all published figures.
