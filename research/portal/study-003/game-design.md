# Citizen Budget 2027: game design (board, version 1)

Status: design for review. Draft figures, not verified. Nothing is collected.
This file replaces the five-round design. The rounds are parked in parked/.

## Premise
The 2027 draft budget is a set of systems and a total. The respondent moves money between the systems on a board, to rebuild the budget as a citizen. The purse holds money not yet placed. The board finishes when the purse is within 0.5% of the envelope.

## What is on screen
- The purse: money not yet placed, in dinars and as a row of coin marks.
- The systems: one bar per movable line, on one scale in dinars, so the largest line is long and the smallest is a sliver. A tick marks the draft. Each bar shows what the line holds now and how far from the draft it is.
- Each system has two buttons: take one step (5% of its draft) to the purse, and give one step from the purse. Each button shows its own price in dinars.
- A refused move stays visible and says why, in words: at zero, at 200% of draft, or the purse does not hold one step.
- The locked block: debt interest and the unforeseen reserve, shown as already spent before the start.
- Two stacked bars: the draft and yours, by share of the envelope.
- The last five moves, in words.
- Undo, reset to the start, keep the draft, and a table view of every line.

## Start states (decision D2)
- Draft start (default): every system at its draft, the purse empty. This is the version 1 study arm.
- Empty start: every system at zero, the purse holds the whole envelope. This is a prototype view only and is not a study arm.
- One flag chooses between them in the prototype. The prototype reads `?start=empty`.

## Rules (enforced by src/lib/budget-game/board.ts)
1. The envelope is the sum of the movable drafts. One step for a line is 5% of its draft. A level runs from 0 to 40 steps (0% to 200%); the draft is 20.
2. Take: a level falls by one and the purse rises by one step. Refused at zero.
3. Give: a level rises by one and the purse falls by one step. Refused at 200% and when the purse does not hold one step.
4. Finish when the purse is within 0.5% of the envelope.
5. Keep the draft sets every level to the draft and is recorded.
6. No borrowing lever in version 1 (decision D4).
7. No score, no rank, no winner, no praise, no timer, no auto-balance.

## Answer
The board serialises to the allocation item: basis points per line (10000 is the draft), locked lines at 10000, and `kept_draft`, true exactly when every line is at the draft. The contract validates it.

## Not in version 1
- The salary band per line. The official salary split by mission is not in hand, so the board does not show it. It must not be invented.
- A borrowing lever (D4).
- A randomised presentation order (see the preregistration).
- Round-based events and consequence narratives (the rounds are parked).

## Figures
Every line is a sum of rows from data/studies/dt-research-003/figures-2027.yaml. The subsidies line is the memo row. The energy and trade line is what remains of the Industry and Trade rows after the subsidies are taken out, on the stated assumption that all subsidies sit inside those two rows. It is a derived line, not a ministry budget, and its label and note say so on the board. Every figure is labelled draft, not verified.

## Open
- Owner plays both start modes (plan step 12).
- The plate image (decision D5) is a placeholder until the owner supplies or approves one.
