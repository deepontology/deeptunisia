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

1. **Step 1: Study page** (`/research/citizen-budget`, static): introduces the task, estimates completion time (about five to seven minutes), outlines data privacy safeguards, identifies the research team, and notes the official source and date of baseline figures.
2. **Step 2: Consent module:** presents informed consent items (`consent_read`, `consent_withdrawal`, `consent_age`). If a respondent indicates they are under 18, the session terminates immediately and no data is stored.
3. **Step 3: Framing screen:** neutral orientation instructing participants: "Answer as yourself, a citizen. Not as a minister, an economist or a party member. There is no right answer and no score." Displays three verified context facts: total 2027 expenditure, revenue sources (tax, non-tax, borrowing), and the fact that public salaries constitute the bulk of departmental spending. Persuasive or editorial advocacy frames are strictly prohibited inside the instrument.
4. **Step 4: The Treasury board:** the participant moves money between systems, one step at a time. A step is 5% of a system's draft. Taking from a system moves money to a purse; giving from the purse moves it into a system. The participant starts from the draft (every system at its draft, the purse empty). The empty-purse start is a prototype view only and is not a study arm. The purse must be placed to finish, within 0.5% of the movable envelope; the purse cannot be over-placed, so up to 0.5% may stay unspent and the analysis reports that shortfall. Systems are shown in official budget order, the same for every participant in this version. Locked rows (debt interest, reserve) are shown with the amount spent before the start and cannot be moved. The subsidies line is a memo inside the Industry and Trade lines; the 272.8 MD left of those two lines after the memo is a derived line, not a ministry budget. The board has a table view of every line. Mobile-friendly, keyboard-accessible, with RTL support for Arabic.
5. **Step 5: Two short items and optional region:**
   - Total spending direction item: lower, the same, or higher.
   - Citizen say rating: 0 (none) to 10 (a lot).
   - Optional governorate selection, reported only as one of seven INS regions subject to cell suppression floors.
6. **Step 6: Submission:** payload submitted via the existing platform submission pipeline. A random receipt code is displayed once to enable withdrawal.
7. **Step 7: End screen:** displays the participant's budget beside the official draft baseline, computed locally in the browser. An optional client-side summary card may be downloaded; it contains only chosen numbers and zero identifiers.

## 3. Game rules and constraints

- **Allocation range:** each system moves from 0% to 200% of its draft baseline in 5% steps (stored as integer basis points, where 10000 represents the draft baseline and steps are 500).
- **Balance constraint:** movable expenditure must balance to the movable envelope within plus or minus 0.5% (50 basis points) before submission is enabled. No automated balancing tool is provided, avoiding proportional scaling bias toward the baseline.
- **Locked rows:** debt interest (sovereign legal obligation) and the contingency reserve fund remain locked at baseline amounts.
- **Keep-draft choice:** keeping the draft baseline is a valid response, enabled through an explicit "I would keep the draft" control. It sets every system to the draft and is recorded as kept_draft.

## 4. Figures and the placeholder-figure rule

All figures in current draft documents and prototype interfaces are placeholders derived from initial press reports of parliamentary hearings.

**The placeholder-figure rule:** figures are frozen only from adopted-law rows with page references to the official adopted finance law published in the official gazette (JORT). No unverified figures may enter the frozen instrument. The movable envelope and per-citizen calculations will be recomputed strictly against adopted statutory numbers and official census population data.

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

**Floors:** minimum 100 valid responses before publishing counts; cells under 20 suppressed with complementary suppression.

## 7. Governance

Pre-registration occurs prior to fielding. External legal and ethical reviews must conclude before public deployment. No political party, electoral campaign, or foreign state financing is permitted.
