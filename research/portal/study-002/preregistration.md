# Pre-registration: Study 002, Police Satisfaction Index (PSI), monthly series

**Study:** `dt-research-002` · **Instrument:** `dt002-police-index` · **Version:** recorded at freeze
**Instrument hash (sha256):** `RECORDED AT FREEZE`
**Fielding window:** `RECORDED AT FREEZE` (opens) to `RECORDED AT FREEZE` (closes)
**Registered:** `RECORDED AT FREEZE`

This document is fixed before the first response is collected. The hash above is the content hash of the instrument as fielded. It covers every question's wording in English, French and Arabic, every response option and scale label, the display conditions, and the whole scoring block: the formula, bands, exclusions, regions, cell floor and the monthly series settings. Any change to any of those produces a different hash and a new instrument version, which starts a new series, and the change is logged under §11. This document is committed to the public repository next to the instrument, and the commit date is the registration date.

---

## 1. What is being measured

One construct: **how strongly respondents sense that they live under a police state**. It is measured in three parts, and the parts are kept separate before they are combined:

| Component | Items | Meaning |
|---|---|---|
| Trust (T) | pti_t1 to pti_t5 | Whether the police are seen as fair, accountable, safe to approach and on the public's side |
| Grip (G) | pti_g1 to pti_g6 | Whether respondents feel afraid, watched and unfree around the police |
| Harm (H) | pti_e1, pti_e3, pti_e4, pti_e5 | Bad encounters in the last 12 months: the respondent's own, and those of people close to them |

Two context items (pti_c1, compared with before 2011; pti_c2, change in trust over a year) are reported beside the index and never enter it.

**Nothing about the respondent.** The instrument asks no age, gender or residence. Its only question about the respondent is an optional governorate, offered last, with "I live outside Tunisia" and "prefer not to answer" among its options. It is published only as the seven INS regions, under the cell floor.

## 2. Population and sampling

Open, self-selected online participation by adults (18 and over, confirmed by a consent statement, never by asking an age), recruited through DeepTunisia's channels and whatever links others share. There is no probability of selection, and because the instrument collects no demographics there is nothing to weight by. Every number is reported as describing **respondents**, never Tunisians as a population. The registry's population statement is: *"Among respondents to an open, self-selected online survey of adults. Results describe the people who took part, not Tunisians as a whole."*

## 3. Scoring

The formula is the instrument's `scoring` block, which is hashed. In words:

- Every 0 to 10 answer becomes x/10. pti_g2 is reverse-keyed (1 − x/10).
- **T** is the mean of answered trust items. It is missing if fewer than 3 of the 5 are answered. **G** is the same for the six grip items, and is missing if fewer than 4 of the 6 are answered.
- **Harm.** Direct harm D is the mean of (1 − treatment/10) and min(1, abuses ticked / 3). Close harm V is min(1, abuses ticked for people close / 3). For a respondent with contact, H = (2·D + V) / 3; otherwise H = V. "None of these" scores 0. A skipped item is missing; missing parts drop out and the weights renormalise.
- **Index:** I = 100 · (T + (1 − G) + (1 − H)) / 3, with equal weights. T and G are required. If H is missing, the index renormalises over T and G.
- **Bands:** Police state [0, 20), Coercive [20, 40), Divided [40, 60), Accountable [60, 80), Guardian [80, 100].

## 4. Exclusions

These are applied before any aggregate and published live with their counts:

1. **Speed:** completion in under 40 seconds.
2. **Straight-lining:** the identical answer on all eleven index items (pti_t1 to pti_t5, pti_g1 to pti_g6). Because pti_g2 is reverse-keyed, an honest extreme respondent does not trip this rule.

These are refused at submission and never stored:

- a completion under 20 seconds;
- more than five submissions per address per hour, counted by a salted, daily-rotating hash of the address;
- a submission without a solved first-party bot check;
- answers to questions that were not shown;
- an answer outside the declared options.

## 5. Estimands and analysis

**Headline:** the monthly index (§7a), with its 95% interval and its band. It is the registered headline. Two further readings of the same answers are published beside it, and a reader may show either in its place:
- **the last 12 months:** every valid response from the current calendar month and the 11 before it, pooled and counted equally (`series.window_months`), with a percentile bootstrap 95% interval;
- **all time:** every valid response since the series began, pooled and counted equally, with the same interval.

The components, the T × G grid, the band counts, the item distributions and the splits are shown over the last 12 months. Each month's own figures are shown in the series.

For each month on its own:
- the mean I over valid respondents, with a percentile bootstrap 95% interval (seeded; 1,000 resamples). The interval covers sampling noise only; it says nothing about how the self-selected respondents differ from the population, and the page says so;
- the median;
- band counts.

**Components:** the mean T, G and H, each with its n.

**Distributions:**
- the full 0 to 10 distribution of every scale item;
- option counts for the checklists, with respondents not shown an item counted separately from those who skipped it;
- the T × G density on the published 10 × 10 grid.

**Splits:**
- police contact in the last 12 months (yes / no);
- region (the seven INS regions), over the respondents who chose to answer the optional governorate question.

A cell with fewer than 20 respondents is suppressed, and its size is not shown.

**Weighting:** none. The instrument collects no age or gender, so no estimate is raked to population margins. Every figure is labelled as describing respondents.

## 6a. The publication floor

No figure is published from too few answers. A figure from a handful of people is noise, it is the easiest number to push, it is the one most likely to be quoted, and a small grid can point at the people in it.

- **Until 100 valid answers in total** (`series.first_figure_n`), the live results publish counts only: how many answers there are, in all and per month, the submissions per hour and the exclusion counts. No index, component, distribution, band count, grid or split is published.
- **After that,** a month's own figures need 30 valid answers in that month (`series.min_month_n`), and the 12-month reading needs 100 answers inside its window. Splits keep their cell floor of 20.
- **The server enforces the floor.** Below it the figures are not sent at all, so they cannot be read from the page or the API.
- **Each respondent sees their own score at once,** with their square on the T × G grid, from the first answer. It is computed in their browser from their own answers and never sent or published.

**The readings arrive in stages.** At the floor, one figure is shown: every answer so far. Once two months have a level, the monthly reading (§7a) becomes the headline, with "since launch" beside it. Once the series is longer than 12 months, the last 12 months and all time are shown separately.

## 7a. The monthly series

The index is a series, published once per calendar month. Months are drawn in Tunisia's time (UTC+1, no daylight saving).

- **A month's own figures** are the estimands above, computed over the valid responses submitted in that month.
- **The published index for a month** is the level of a local-level model run through that month by a Kalman filter. The true level is assumed to drift by a random step each month with SD 2.5 index points (`process_sd`); each month's mean is a measurement of it with variance sd² / n. The first observed month starts the series at its own mean. Each later month moves the level toward its own mean by its gain: P / (P + sd²/n), where P is the previous level's variance plus 2.5². A month of 1,000 answers therefore moves the index further than a month of 200, and every earlier month still counts.
- **A month with fewer than 30 scored respondents** (`min_month_n`) is not used as a measurement. The previous level carries forward, and its interval widens by one month of drift.
- **The filter runs forward only.** A month's published value uses that month and the months before it, so it never changes once the month has closed.
- **The month in progress** is shown live and labelled provisional. It becomes final when the month ends.

What the filter does not do is correct for who answered. A month that draws a different crowd moves the index as if opinion had changed. Each month's n and gain are published so a reader can see how much a month rests on. As a sensitivity check, at each 12-month review the series is also published with `process_sd` 1.5 and 5.

## 6. Hypotheses

These are registered before data. They are directional, and each is tested once, at the first 12-month review, over every valid response to that date:

- **H1:** Respondents who report police contact in the last 12 months have a lower mean I than those who report none. Test: difference in means with a bootstrap 95% interval excluding 0.
- **H2:** T and G are negatively correlated (Pearson r below −0.3). If they are not, the two-axis model is reported as unsupported for this series.
- **H3:** The trust items and the grip items each form a reliable scale (Cronbach's alpha ≥ 0.70). If either falls short, the page says so beside the headline.

Everything else on the results page is descriptive. A pattern noticed after the data comes in is reported as exploratory.

## 7. Live publication

Results are published live during fielding (a departure, §10). The live page shows only aggregates computed from the current instrument hash, month by month. To make attempts to move the number visible, it also shows submissions per hour for the last 72 hours, including excluded ones, and the exclusion counts by rule. When a month ends, its figures are recomputed offline from the exported data with the same code and committed to the repository. Those committed figures are the published result for that month.

## 8. Release at close

- **Aggregates:** committed month by month and rendered with their n and the population statement.
- **Microdata** (at each 12-month review):
  - region instead of governorate, for those who answered it;
  - dates no finer than the month;
  - no receipt codes;
  - no recruitment channel codes.

  Licence CC BY 4.0, deposited with a DOI.
- **Raw rows:** deleted after the release is verified to reproduce the published tables.

## 9. Months, deletion and stopping

A receipt deletes its answers only during the month they were given in. Once a month closes, its answers are fixed, so its published figure can be reproduced.

The series runs until a later instrument version replaces it, with a public review every 12 months. It stops early only for a security incident that puts respondents or the data at risk. An early stop, and its reason, is published.

## 10. Departures from the platform's own rules

- **Live results.** The platform's default is counts only until close. This series publishes results live, with the integrity record described in §7.
- **A continuous series.** The platform's default is a wave with a fixed close. This study fields continuously and publishes monthly (§7a).
- **Interim translations.** The French and Arabic were prepared by the project and reviewed by its editor. They are not the independent human translation, back-translation and cognitive interviewing the platform requires. They will be replaced in a later instrument version.
- **No external ethics review.** The protections published on the study page are the project's own.

## 11. Changes after registration

None yet. Any change to the instrument after this document is fixed produces a new version and hash, and is listed here with its date and reason. A change during fielding starts a new series, and the page shows where one series ends and the next begins.
