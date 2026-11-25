# Pre-registration: DT Research 003, Citizen Budget 2027

**Study:** `dt-research-003` · **Instrument:** `dt003-citizen-budget` · **Version:** 1.1.0
**Instrument hash (sha256):** `277583e4b4b0c6ea8582fff1ad7b155308a1e7f52647a11faddc584a0036a67f`
**Fielding window:** 2026-11-22 (opens) to 2027-10-15 (closes)
**Registered:** 2026-11-22
**Companion documents:** `protocol.md`, `instrument-v0.yaml` (workshop copy), the frozen copy in `data/studies/dt-research-003/`, `legal-brief.md`, `figures-2027.yaml`.

This document is fixed before the first response is collected. It is committed to the public repository next to the instrument, and the commit date is the registration date. There is no external registry entry and no DOI yet. Section 9 lists the amendments made on 22 and 25 November 2026, before the first answer; they take precedence over the earlier draft text where the two differ.

This document is the pre-registration plan for DT Research 003. It defines the research questions, estimands, exclusion rules, and analysis plan before data collection begins. No amendments will be made after the fielding window opens, except to repair technical faults that would otherwise invalidate the data, with any amendment logged and published.

---

## 1. Study and population

**Type:** cross-sectional, open-participation, self-administered online budget reallocation task. Locales: Modern Standard Arabic, French, English.

**Population:** adults aged 18 or over worldwide who access the study. There is no residence requirement, no sampling frame, and no quotas. Participation is self-selected.

**Unit of analysis:** one valid submitted budget.

**Fielding window:** opens on 22 November 2026, on the 2027 draft (amendment A1), and closes on 15 October 2027, when the 2028 draft budget is expected in parliament. When the 2027 finance law is adopted, a new instrument version takes the adopted figures (amendment A1).

**Target:** 1,000 valid submitted budgets. The realized sample size is published regardless of target achievement, with no single recruitment channel exceeding 50% of valid responses.

**Population statement:** every published report, chart, and release includes the following notice: "Among respondents to an open, self-selected online survey of adults. Results describe the people who took part, not Tunisians as a whole."

## 2. Research questions

**Primary research question:** Among the people who took part, how would they move money between the lines of Tunisia's 2027 state budget, and how much do they agree with each other?

**Secondary research questions:**
1. Knowing that the gap is borrowed, should total spending be lower, the same, or higher?
2. How much say do citizens have today over how the budget is spent? (measured on a 0 to 10 scale)

The study does not claim to measure what the wider population prefers, what the budget should be, or whether any spending line is wasteful.

## 3. Design

Respondents move money between movable spending systems on a board, one coin of 100 MD at a time. A coin moves from one system to another, or between a system and the purse. The last coin out of a system, or into a system at 200% of its draft, is short, so a system can reach exactly 0% or 200%. Each respondent starts from the draft. Locked lines (debt interest, reserve) are fixed. To finish, the purse must be empty, and the respondent must either have made at least one move or tick "I would keep the draft exactly as it is". The tick sets every line back to the draft and records kept_draft; Finish stays disabled without a move or the tick. Every finished board places the whole movable envelope to the dinar.

The 2027 subsidy memo is 11,846 MD inside the Industry and Trade lines. It is presented as two lines, fuel and electricity versus basic food, because one line cannot distinguish a respondent who would cut fuel and protect food from one who would do the opposite. The 2027 split by type has not been reported. It is apportioned between the two ministry lines that contain the memo, in proportion to their 2027 draft totals (Industry 7,890.2, Trade 4,228.6); the two rows sum to the memo to the dinar. The apportionment is a presentation assumption, not a reported figure, and the board labels it as derived. Results for the two sub-lines are conditional on it. The combined subsidy total, which does not depend on it, is reported alongside. No official 2027 programme split exists at the freeze, so the sub-line estimands are conditional on the apportionment and the combined subsidy total is the primary subsidy estimate (amendment A4). What remains of the two ministry lines after the memo, 272.8 MD, is shown as a derived line: it is not a ministry budget, and results for it are read with that in mind. If the memo sits wholly inside those lines, as assumed here, energy can only fall between 7,617.4 and 7,890.2 MD; the apportionment is within 177.6 MD of any split that keeps both lines non-negative. The 2027 memo is a press total; past years are two programme lines.

The board shows 30 movable lines; no catch-all line hides a large share of the budget. The small missions whose 2027 drafts are reported only as one group are split into Religious Affairs, Communication Technologies, State Domains and Land Affairs, and Courts and Oversight, by their shares in the 2026 adopted law (amendment A8). The National Council of Regions and Districts is counted with Parliament, and the Higher Council of Education with Higher Education and Research. It also shows the adopted budgets of 2020, 2022, 2023, 2024, 2025 and 2026 for every line, on by default, each year switchable by the respondent (see game-design.md, "Past years"). This is part of the stimulus and is the same for every respondent at the start. 2018 is not shown because its tableau C is organised by ministry chapter, includes debt principal and has no programme split; 2015 was not sourced. Past years are on by default. Version 1.1.0 does not record which years were shown at submission (amendment A5).

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
| Edge challenge | First-party proof of work fails; Turnstile only when the operator switches it on | Blocked at edge |
| Honeypot | Hidden bot-detection field completed | Excluded |
| Balance failure | Movable total outside plus or minus 0.5% tolerance | Submission rejected at edge |
| Speed floor | Completion time below 144 seconds (40% of the estimated 6 minutes; no pretest was run, amendment A3) | Refused at submission, nothing stored |
| Fast draft | Unchanged draft allocation and completion time below 216 seconds (1.5 times the floor) | Excluded from primary estimands |

## 6. Estimands and analysis plan

All estimands are pre-specified:

1. **Headline per category:** the share of respondents who give each category more, the same, or less than the draft baseline, alongside the median change in percent with its interquartile range (IQR).
2. **The average citizen budget:** the mean allocation per category. Every finished board places the whole envelope, and shares are stored as whole basis points, so each submitted budget equals the envelope within that rounding (a few MD at most). The mean of submitted budgets is therefore itself a budget that fits the envelope within the same rounding. The report shows the mean placed total against the envelope. It is labelled "average of the budgets submitted". Reported with a bootstrap 95% interval. Medians do not sum to the envelope and are never displayed as a combined budget.
3. **Spread and consensus:** individual change distributions displayed via strip or box plots per category; consensus measured as the share of respondents allocating within plus or minus 10% of the category median.
4. **Secondary estimands:** percentage distribution on overall spending direction (lower, same, higher) and mean and median ratings of perceived citizen say (0 to 10 scale).

## 7. Sensitivity checks and reporting rules

**Sensitivity checks:** published alongside primary results:
- Excluding responses from the largest recruitment link channel.
- 5% trimmed mean allocations across categories.
- Primary estimands evaluated with and without respondents who kept the draft unchanged.

**Reporting floors and presentation rules:**
- No statistics published until at least 300 valid responses are reached (amendment A2).
- When results are published, the number of valid responses and the fielding dates lead the page, not a footnote.
- Subgroup analyses on optional governorate report only at the level of the seven INS regions; any cell with fewer than 20 respondents is suppressed, with complementary suppression applied.
- Categories are displayed strictly in official budget order, never sorted into winners and losers.

## 8. Data and materials

Anonymized microdata (allocation vectors, INS region, month, locale, coarsened completion time) and codebooks will be released under CC BY 4.0 with a DOI. Analysis scripts will be versioned in the project repository with an automated verification script that reproduces all published figures.

## 9. Amendments before the first answer, 22 and 25 November 2026

These were made before the fielding window opened and before any answer existed.

**A1. Fielding opens on the 2027 draft.** The earlier draft of this document opened fielding only after the 2027 finance law was adopted. The study opens on 22 November 2026 instead. The reason: the respondent's reference on the board is the adopted budgets of 2020 to 2026, shown for every line; the 2027 draft is an extra reference, and each respondent builds their own 2027 budget against all of them. The estimands in section 6 are therefore read relative to the 2027 draft as published at the freeze, and every report says so. When the 2027 finance law is adopted and published, a new instrument version carries the adopted figures. Answers given under version 1.0.0 and under the later version are reported separately, each against the figures its respondents saw, and are never pooled without saying so.

**A2. Reporting floor.** The floor of 300 valid responses before any statistic is published is confirmed. The draft said 100.

**A3. Speed floor.** No pretest was run before opening. The speed rule is fixed at 144 seconds, 40% of the estimated 6 minutes, and applied at submission: a faster answer is refused and nothing is stored. The fast-draft rule uses 1.5 times that floor, 216 seconds.

**A4. Subsidy lines.** No official 2027 programme split of the subsidy memo exists. The two sub-line estimands are conditional on the apportionment in section 3, and the combined subsidy total is the primary subsidy estimate.

**A5. Past years.** Past years are on by default. Version 1.0.0 does not record which years a respondent had switched on at submission; a later version that records it will say so.

**A6. Optional governorate.** The board asks the optional governorate described in section 7, with the list and labels of study 002 (24 governorates, outside Tunisia, prefer not to say). It is published only as the seven INS regions, under the cell floor of 20.

**A7. Reviews and translations.** No external ethics or data-protection review has taken place; the registry states this in the same terms as study 002. French and Arabic are interim project translations, marked as such on screen, not yet reviewed by an independent reader.

**A8. Split of the residual mission group.** Before the first answer, the board's single residual line was split into four named movable lines. The residual line held 532.919 MD: Religious Affairs, Communication Technologies, State Domains, the Court of Accounts, the National Council of Regions and Districts, the Higher Council of Education, the Judicial Council and the Constitutional Court. Their 2027 drafts were reported only as one group, so the board could not show a separate digital or religious line. The split uses each mission's share in the 2026 adopted law (565.076 MD): Religious Affairs 190.883, Communication Technologies 186.105, State Domains and Land Affairs 88.806, and Courts and Oversight 34.977 (Court of Accounts 35.563, Judicial Council 1.525, Constitutional Court 0, scaled). The National Council of Regions and Districts (22.717) is counted with Parliament, and the Higher Council of Education (9.431) with Higher Education and Research. The six derived rows sum to the same 532.919 MD. Every reported 2027 line, the total envelope and the 2026 history are unchanged. The derived rows carry status `draft-derived` and are labelled as derived on screen; they are not reported 2027 figures. The board now shows 30 movable lines. The instrument version is 1.1.0; no answer was collected under 1.0.0.
