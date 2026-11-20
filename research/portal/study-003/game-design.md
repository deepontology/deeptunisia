# Citizen Budget 2027: game design (board, version 1)

Status: design for review. Draft figures, not verified. Nothing is collected.
This file replaces the five-round design. The rounds are parked in parked/.

## Premise
The 2027 draft budget is a set of systems and a total. The respondent moves money between the systems on a board, to rebuild the budget as a citizen. The purse holds money taken out and not yet placed. The board finishes when the purse is empty.

## What is on screen
- The purse: money not yet placed, in dinars and as a row of coin marks.
- The systems, in three groups. Each system shows two bars on one scale in dinars: the state's 2027 draft (the reference) and the respondent's own allocation, with the difference in MD and in percent.
- Drag one system onto another to move one coin of 100 MD; hold still over the target to keep money flowing. Drag a system onto the purse to take, or the purse onto a system to give. Every system also has take and give buttons, and the arrow keys do the same on a focused row.
- A refused move says why, in words: at zero, at 200% of draft, the purse is empty, or a move into itself.
- The locked block: debt interest and the unforeseen reserve, shown as already spent before the start.
- The last moves, in words. Undo, reset, keep the draft, and a table view of every line.

## Start states (decision D2)
- Draft start (default): every system at its draft, the purse empty. This is the version 1 study arm.
- Empty start: every system at zero, the purse holds the whole envelope. This is a prototype view only and is not a study arm. The prototype reads `?start=empty`.

## Move rule (decision A or B, owner to confirm)
- A, the default: every move carries one coin of 100 MD, whatever the system. A transfer between two systems leaves the purse as it was. The last coin out of a system, or into a system at its 200% cap, is short, so a system can reach exactly 0% or 200% and the purse can always be emptied to the dinar.
- B, kept behind `?rule=step`: every move carries 5% of that system's draft. Transfers between systems of different size leave the gap in the purse, and the board finishes within 0.5% of the envelope.
- Why A: the same gesture moves the same money everywhere, the purse empties exactly, and the average of finished boards is itself a balanced budget.

## Rules (enforced by src/lib/budget-game/board.ts)
1. Money is held in whole dinars. The envelope is the sum of the movable drafts. A system holds from 0% to 200% of its draft.
2. Take moves one coin from a system to the purse. Give moves one coin from the purse to a system. Transfer moves one coin from one system to another, and one undo takes it back.
3. Finish when the purse is empty (rule A) or within 0.5% of the envelope (rule B).
4. Keep the draft sets every system to the draft and is recorded.
5. No borrowing lever in version 1 (decision D4).
6. No score, no rank, no winner, no praise, no timer, no auto-balance.

## Answer
The board serialises to the allocation item: basis points per line (10000 is the draft), locked lines at 10000, and `kept_draft`, true exactly when every line is at the draft. The contract validates it.

## Not in version 1
- The salary band per line. The official salary split by mission is not in hand, so the board does not show it. It must not be invented.
- A borrowing lever (D4).
- A randomised presentation order (see the preregistration).
- Round-based events and consequence narratives (the rounds are parked).

## Figures
Every line is a sum of rows from data/studies/dt-research-003/figures-2027.yaml. The subsidies line is the memo row. The energy and trade line is what remains of the Industry and Trade rows after the subsidies are taken out, on the stated assumption that all subsidies sit inside those two rows. It is a derived line, not a ministry budget, and its label and note say so on the board. Every figure is labelled draft, not verified.

The board has 22 movable lines. There is no catch-all "everything else" line: Finance, Transport, Jobs and vocational training, Economy and regional development, Environment and Tourism each have their own line, from press-reported 2027 drafts. The only remainder is small and named: Religious Affairs, Communication Technologies, State Domains, the Court of Accounts, the National Council of Regions and Districts and two councils, 533.3 MD, derived as the total less every other line because their 2027 drafts are not yet reported one by one. In the 2026 law the same missions came to 565.1 MD.

## Past years
The board shows the adopted budgets of 2024, 2025 and 2026 beside the 2027 draft, on by default (owner decision, 14 November 2026). Each row has a small trend line from 2024 to the 2027 draft, with the respondent's own amount as a dot. Each year can be switched off in the legend (one switch for all years on a phone). The chosen system shows the amounts year by year and the change since the first year shown. The table view adds a column per year.

The past years come from data/studies/dt-research-003/history-lf-2024-2026.yaml: tableau C of each finance law in the Journal Officiel (French translation), every mission with its printed page, every year adding up to the law's total to the dinar. They are the budgets as voted, not as spent, in dinars of each year (not adjusted for inflation). Every mission lands on exactly one board line. Subsidies are not a mission in those laws, so the board reads them as the energy programme of Industry, Mines and Energy plus the domestic trade programme of Commerce; this is close to, not the same as, the 2027 subsidies memo, and the board says so on that line.

Showing past years is part of the stimulus. Before fielding, the preregistration must fix whether they are on by default for every respondent, and the instrument should record which years were shown at submission.

## Open
- Owner plays both start modes and both move rules, and confirms rule A.
- The plate image (decision D5) is a placeholder until the owner supplies or approves one.
