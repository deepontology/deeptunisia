# Citizen Budget 2027: game design (board, version 1.1)

Status: design for review, 16 November 2026. Draft figures, not verified. Nothing is collected.
This file replaces the five-round design and the 1.0 description that no longer matched the
build. The rounds are parked in parked/.

## Premise
The 2027 draft budget is a set of systems and a total. The respondent moves money between the
systems on a board, to rebuild the budget as a citizen. The purse holds money taken out and not
yet placed. The board finishes when the purse is empty, or when the respondent explicitly says
they would keep the draft.

## What is on screen
- The purse: money not yet placed, in dinars, with a progress meter. It is not a row of coin
  marks; the meter is the whole visible state of the purse.
- The systems, in the order of the finance law's tableau C (mission 1 first), one flat list in
  two columns on a desk and one scrolling list on a phone. Each system shows two bars on one
  scale in dinars: the state's 2027 draft (the reference) and the respondent's own allocation,
  with the difference in MD and in percent. Above the two bars, small dots on the same scale
  mark the adopted budgets of each past year, oldest first. The 2027 plan is the vertical mark
  across the bars; the respondent's own amount is the accent bar.
- Drag one system onto another to move one coin of 100 MD; hold still over the target to keep
  money flowing. Drag a system onto the purse to take, or the purse onto a system to give. The
  selected system has Take and Give in the dock, and the arrow keys do the same on a focused row.
- The dock's detail panel, opened with Details, shows the line's 2026 programme rows with their
  printed page, and three actions: set it back to the draft, set it to zero, or, as a prototype
  aid outside the study task, set it to its 2024 level. Each action is one undo.
- A refused move says why, in words: at zero, at 200% of draft, the purse is empty, or a move
  into itself.
- The locked block: debt interest and the unforeseen reserve, shown as already spent before the
  start.
- The last moves, in words. Undo, reset, the explicit keep-draft tick, and a table view of every
  line.

## The explicit keep-draft control
Finish is disabled while the board is at the draft. The respondent must either move money or
tick "I would keep the draft exactly as it is". Ticking the box puts every line back on the
draft and records the answer as `kept_draft: true`. Any later move clears the tick. This is the
control the protocol promised; a finish at zero without a move or a tick is no longer possible.

## Start states (decision D2)
- Draft start (default): every system at its draft, the purse empty. This is the version 1
  study arm.
- Empty start: every system at zero, the purse holds the whole envelope. This is a prototype
  view only and is not a study arm. The prototype reads `?start=empty`.

## Move rule (decision A or B, owner to confirm)
- A, the default: every move carries one coin of 100 MD, whatever the system. A transfer
  between two systems leaves the purse as it was. The last coin out of a system, or into a
  system at its 200% cap, is short, so a system can reach exactly 0% or 200% and the purse can
  always be emptied to the dinar.
- B, kept behind `?rule=step`: every move carries 5% of that system's draft. Transfers between
  systems of different size leave the gap in the purse, and the board finishes within 0.5% of
  the envelope.
- Why A: the same gesture moves the same money everywhere, the purse empties exactly, and the
  average of finished boards is itself a balanced budget.

## Rules (enforced by src/lib/budget-game/board.ts)
1. Money is held in whole dinars. The envelope is the sum of the movable drafts. A system holds
   from 0% to 200% of its draft.
2. Take moves one coin from a system to the purse. Give moves one coin from the purse to a
   system. Transfer moves one coin from one system to another, and one undo takes it back.
3. Finish when the purse is empty (rule A) or within 0.5% of the envelope (rule B), and either a
   move has been made or the keep-draft tick is set.
4. The detail panel's set actions (draft, zero, and the prototype 2024 aid) are exact amounts: the difference
   comes from or goes to the purse, and one undo takes the whole action back. A set above the
   purse is refused; a set above 200% is clamped.
5. Keep the draft sets every system to the draft and is recorded.
6. No borrowing lever in version 1 (decision D4).
7. No score, no rank, no winner, no praise, no timer, no auto-balance.

## Answer
The board serialises to the allocation item: basis points per line (10000 is the draft), locked
lines at 10000, and `kept_draft`, true exactly when every line is at the draft. The contract
validates it.

## Not in version 1
- The salary band per line. The official salary split by mission is not in hand, so the board
  does not show it. It must not be invented.
- A borrowing lever (D4).
- A randomised presentation order (see the preregistration).
- Round-based events and consequence narratives (the rounds are parked).

## Figures
Every line is a sum of rows from data/studies/dt-research-003/figures-2027.yaml. The 2027
subsidy memo (11,846 MD) is split into two derived rows, fuel and electricity versus basic
food, so the largest line can be cut in the way people argue about it. The split is not
reported for 2027: it is apportioned between the two ministry lines that contain the memo, in
proportion to their 2027 draft totals (Industry 7,890.2, Trade 4,228.6). The two rows sum to
the memo. They carry status `draft-derived` and are labelled as derived on screen. The energy
and trade line is what remains of the Industry and Trade rows after both subsidy rows are taken
out, on the stated assumption that the memo sits inside those two rows. It is a derived line,
not a ministry budget, and its label and note say so on the board. Every figure is labelled
draft, not verified.

The board has 27 movable lines. There is no catch-all "everything else" line. Social affairs and
family are separate; government offices, foreign affairs, parliament and elections are separate.
The only remainder is small and named: Religious Affairs, Communication Technologies, State
Domains, the Court of Accounts, the National Council of Regions and Districts and two councils,
533.3 MD, derived as the total less every other line because their 2027 drafts are not yet
reported one by one. In the 2026 law the same missions came to 565.1 MD.

## Past years
The board shows the adopted budgets of 2020, 2022, 2023, 2024, 2025 and 2026 beside the 2027
draft, on by default. Each row has a dot for each past year on the common scale, oldest first,
with the 2027 draft mark at the end. Each year can be switched off in the legend (one switch for
all years on a phone). The chosen system shows the amounts year by year and the change since the
first year shown, labelled nominal. The table view adds a column per year.

The past years come from data/studies/dt-research-003/history-lf-2020-2026.yaml: tableau C of
each finance law in the Journal Officiel (French translation), every mission with its printed
page, every year adding up to the law's total to the dinar. They are the budgets as voted, not
as spent, in dinars of each year (not adjusted for inflation). Every mission lands on exactly
one board line. Subsidies are not a mission in those laws, so the board reads them as the energy
programme of Industry, Mines and Energy plus the domestic trade programme of Commerce. The 2027
memo covers all subsidy types; the past years count the two programmes that hold most of them.
The memo sits inside the Industry and Trade lines, so energy can only fall between 7,617.4 and
7,890.2 MD, and the apportionment is within about 140 MD of any split that keeps both lines
non-negative. The 2027 memo is a press total; past years are two programme lines. The board says
so in visible text under the legend, not in a tooltip alone. 2018 is not shown: its tableau C is
organised by ministry chapter, it includes debt principal, and it has no programme split, so it
cannot sit on the same bars honestly. 2015 was not sourced.

Showing past years is part of the stimulus. Before fielding, the preregistration must fix
whether they are on by default for every respondent, and the instrument should record which
years were shown at submission.

## Open
- Owner plays both start modes and both move rules, and confirms rule A.
- Owner confirms the derived 2027 subsidy split, or asks for the estimand to be "subsidies in
  total". The split method is one constant in figures-2027.yaml.
- The plate image (decision D5) is a placeholder until the owner supplies or approves one.
