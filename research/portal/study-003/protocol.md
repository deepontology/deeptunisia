# DT Research 003: Citizen Budget Study Protocol

**Protocol v0.1 (draft), 2026-11-09.**
**Status:** design. Not pre-registered, not reviewed, not fielded.
**Companion documents:** `preregistration.md`, `instrument-v0.yaml`, `legal-brief.md`, `figures-2027.yaml`.

This document is the study protocol for DT Research 003. It defines the implementation design, user flow, allocation constraints, data protection rules, and analysis standards.

---

## 1. Study rationale and objectives

The study provides an open, interactive platform where participants rebuild the 2027 Tunisian state budget by adjusting category allocations to reflect their civic priorities within a balanced fiscal envelope.

**Primary question:** Among the people who took part, how would they move money between the lines of Tunisia's 2027 state budget, and how much do they agree with each other?

**Secondary questions:**
1. Knowing that the gap is borrowed, should total spending be lower, the same, or higher?
2. How much say do citizens have today over how the budget is spent? (0 to 10 scale)

The experience uses interactive controls, a live balance meter, and a comparative summary. It is not a game with scores, winners, or correct answers; all screens state this explicitly.

## 2. User path

The participant experience follows seven sequential steps:

1. **Step 1: Study page** (`/research/citizen-budget`, static): introduces the task, estimates completion time (about five minutes (not yet timed)), outlines data privacy safeguards, identifies the research team, and notes the official source and date of baseline figures.
2. **Step 2: Consent module:** presents informed consent items (`consent_read`, `consent_withdrawal`, `consent_age`). If a respondent indicates they are under 18, the session terminates immediately and no data is stored.
3. **Step 3: Framing screen:** neutral orientation instructing participants: "Answer as yourself, a citizen. Not as a minister, an economist or a party member. There is no right answer and no score." Displays three verified context facts: total 2027 expenditure, revenue sources (tax, non-tax, borrowing), and the fact that public salaries constitute the bulk of departmental spending. Persuasive or editorial advocacy frames are strictly prohibited inside the instrument.
4. **Step 4: The Treasury board:** the participant moves money between 27 systems, one coin of 100 MD at a time. Dragging one system onto another moves a coin between them; taking from a system moves a coin to the purse, and giving from the purse moves it into a system. The participant starts from the draft (every system at its draft, the purse empty). The empty-purse start is a prototype view only and is not a study arm. The purse must be empty to finish, so every finished board places the whole movable envelope. Systems are shown in the finance law's tableau C order (mission 1 first), the same for every participant in this version. Locked rows (debt interest, reserve) are shown with the amount spent before the start and cannot be moved. The subsidy memo is split into two lines, fuel and electricity versus basic food, so a respondent can protect one and cut the other. The 2027 split between the two is not reported: it is derived from the two ministry lines that contain the memo and is labelled as derived. If the memo sits wholly inside Industry and Trade, as assumed here, energy can only fall between 7,617.4 and 7,890.2 MD; the apportionment is within 177.6 MD of any split that keeps both lines non-negative. The 2027 memo is a press total; past years are two programme lines. The energy and trade line is what remains of the Industry and Trade rows after both subsidy rows are taken out; it is a derived line, not a ministry budget. The board shows the adopted 2020, 2022, 2023, 2024, 2025 and 2026 budgets of every line beside the 2027 draft, on by default and switchable per year, read from the finance laws in the Journal Officiel. Each past year is a dot on the board's common scale, oldest first, and the change is labelled nominal. A selected line can be opened for its 2026 programme rows and set back to the draft, or to zero; a prototype aid can set it to its 2024 level, but that aid is not part of the study task. The board has a table view of every line. Mobile-friendly, keyboard-accessible, with RTL support for Arabic.
5. **Step 5: Two short items and optional region:**
   - Total spending direction item: lower, the same, or higher.
   - Citizen say rating: 0 (none) to 10 (a lot).
   - Optional governorate selection, reported only as one of seven INS regions subject to cell suppression floors.
6. **Step 6: Submission:** payload submitted via the existing platform submission pipeline. A random receipt code is displayed once to enable withdrawal.
7. **Step 7: End screen:** displays the participant's budget beside the official draft baseline, computed locally in the browser. An optional client-side summary card may be downloaded; it contains only chosen numbers and zero identifiers.

## 3. Game rules and constraints

- **Allocation range:** each system moves from 0% to 200% of its draft baseline in coins of 100 MD (stored as integer basis points of the draft, where 10000 represents the draft baseline).
- **Balance constraint:** the board enables submission only when the purse is empty and either at least one move has been made or the keep-draft tick is set. The server accepts a movable total within plus or minus 0.5% of the envelope, which covers basis-point rounding. No automated balancing tool is provided, avoiding proportional scaling bias toward the baseline.
- **Locked rows:** debt interest (sovereign legal obligation) and the contingency reserve fund remain locked at baseline amounts.
- **Keep-draft choice:** keeping the draft baseline is a valid response, enabled through an explicit "I would keep the draft exactly as it is" tick. Finish stays disabled until a move or the tick; ticking sets every system to the draft and records kept_draft. Any later move clears the tick.

## 4. Figures and the placeholder-figure rule

All figures in current draft documents and prototype interfaces are placeholders derived from initial press reports of parliamentary hearings.

**The placeholder-figure rule:** figures are frozen only from adopted-law rows with page references to the official adopted finance law published in the official gazette (JORT). No unverified figures may enter the frozen instrument. The movable envelope and per-citizen calculations will be recomputed strictly against adopted statutory numbers and official census population data. The 2027 subsidy split is a derived presentation of a sourced memo, not an adopted row; it must be replaced by an official programme split, or the estimand must be stated as subsidies in total, before the instrument is frozen.

## 5. Data capture and participant protections

**Data stored per response (existing `research_responses` table, no new columns):**
- instrument id, version, hash
- locale
- channel
- consent version
- timestamps and completion time
- answers (the allocation as integer basis points per category, the two items, optional governorate)
- revision flag
- random receipt

**Never stored:**
- name
- email
- IP
- user agent
- fingerprint
- location beyond the optional governorate
- account

**Never published about a single person:**
- any row with its governorate
- any cell under 20
- timestamps finer than the month
- receipt or link codes
- the share image

**Withdrawal:**
A participant holding their submission receipt code may delete their record on the withdrawal page while the fielding window remains open. Once the fielding window closes and the release dataset is frozen, withdrawal is impossible; consent copy communicates this cutoff.

## 6. Reporting and banned wording

**Presentation standards:** categories are presented strictly in official statutory budget order, never ranked as winners and losers.

**Banned wording:**
Wording that is banned on every surface per SPEC section 6: phrases imputing collective mandates to the sample (specifically prohibited: asserting what the population as a whole prefers, referring to findings as a collective spending plan of the citizenry, or asserting broad popular rejection of any line). Permitted terms: "respondents", "people who took part".

**Population statement:** all surfaces must display: "Among respondents to an open, self-selected online survey of adults. Results describe the people who took part, not Tunisians as a whole."

**Floors:** minimum 300 valid responses before publishing counts (proposed amendment, dated 16 November 2026, pending the owner's confirmation: raised from 100 before any data exist); cells under 20 suppressed with complementary suppression. The results page leads with n and the fielding dates.

## 7. Governance

Pre-registration occurs prior to fielding. External legal and ethical reviews must conclude before public deployment. No political party, electoral campaign, or foreign state financing is permitted.
