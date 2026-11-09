# Citizen Budget 2027: game design (prototype v2)

Status: design for review. Placeholder amounts. Nothing is collected.

## Premise
One budget year, five rounds. Each round a pressure hits the state's budget. The respondent pays for it by cutting other lines by the same amount. The total never changes. The question is what gets given up.

## Why this is a game and still a study
- The game's output is the allocation item the study records: one share per line in basis points (10000 is the draft). Every round moves money in exact 5% steps of each line's draft, so the final budget is a valid allocation under the same rules as the submit path.
- Stakes are consequences, not points. Each response names who pays and what happens to them, in plain words, labelled "illustrative, not a forecast". There is no score and no winner, as SPEC section 1 requires.

## Gauges (all on screen, all in words too)
- **Still to find:** the amount this round's pressure asks for. Goes to zero when a response is chosen.
- **Cut so far:** total MD taken from lines below the draft, and the number of lines.
- **Added so far:** total MD added to lines above the draft.
- **Scars:** a line cut in two rounds shows a scar card at the end of the second cut.

## Round flow
1. Pressure card arrives (headline, two sentences, the amount). Motion: the card slides in once; reduced motion shows it at once.
2. Three responses. Each shows: what it pays for, which lines it cuts (with MD), and the consequence line.
3. Choosing a response: the ledger ticks each line up or down (animated count, 400 ms), the gauges move, a stamp reads FUNDED.
4. A short result line: what you chose, in words. No praise, no blame.
5. After round 5: the final card (section 6).

Invalid choices are not shown as errors: a response that would take a line past 0% or 200% of its draft is shown greyed with the reason in words.

## Rounds (exact MD; each response's pays equal its cuts)
Steps are 5% of the line's draft. Lines and drafts are placeholders from lines.ts.

R1, fuel prices jump in spring. Pays 250 MD of subsidy.
- A. Fund the fuel subsidy in full: fuel +2 steps (+250). Cuts: roads −1 (−100), universities −1 (−100), other −1 (−50). Consequence: fewer road and housing projects this year; pump prices hold.
- B. Fund half and add food support: fuel +1 (+125), food +1 (+75), other +1 (+50). Cuts: army −1 (−110), police −1 (−120), culture −1 (−20). Consequence: pump prices rise for most; basic food stays cheaper.
- C. Let prices move: no change to the budget. Consequence: household fuel costs rise this year; the budget stays as drafted.

R2, a hospital wave. The health line asks for 300 MD of staffing.
- A. Staff the hospitals: health +2 (+300). Cuts: schools −1 (−200), roads −1 (−100). Consequence: fewer teachers added in the next intake.
- B. Staff with fewer cuts to schools: health +2 (+300). Cuts: universities −1 (−100), farming −1 (−65), government −3 (−135). Consequence: government offices run with fewer staff; farm support slows.
- C. Defer to next year: no change. Consequence: a waiting list in the hospitals.

R3, a good harvest brings food and fuel prices down. The state can save 250 MD in subsidies.
- A. Save on fuel and move the saving to farming and roads: fuel −2 (−250). Pays: farming +2 (+130), roads +1 (+100), culture +1 (+20). Consequence: cheaper fuel is no longer subsidised; farm water and roads get the money.
- B. Save on food and move it to health: food −2 (−150). Pays: health +1 (+150). Consequence: basic food prices rise; hospitals get the money.
- C. Keep the subsidies: no change. Consequence: the saving is not made.

R4, the regions ask for 200 MD for local roads.
- A. Pay from government and culture: roads +2 (+200). Cuts: government −4 (−180), culture −1 (−20). Consequence: central offices shrink; local roads are repaired.
- B. Pay from schools: roads +2 (+200). Cuts: schools −1 (−200). Consequence: school repairs and classes are delayed.
- C. Pay from security and small lines: roads +2 (+200). Cuts: police −1 (−120), other −1 (−50), youth −1 (−30). Consequence: fewer police stations refurbished; youth centres wait.

R5, a court orders 160 MD of compensation to former workers. This is the last decision.
- A. Pay from universities and energy: justice +4 (+160). Cuts: universities −1 (−100), energy −1 (−60). Consequence: research grants slow; energy firms get less state support.
- B. Pay from farming and youth: justice +4 (+160). Cuts: farming −2 (−130), youth −1 (−30). Consequence: farm support is cut for a season; youth programmes shrink.
- C. Pay from government, other and culture: justice +4 (+160). Cuts: government −2 (−90), other −1 (−50), culture −1 (−20). Consequence: central administration is thinner; smaller programmes wait.

## Final card (end of round 5)
- Budget versus draft: the same table as the card in the prototype, with placeholder amounts.
- Your five decisions in order, each with its consequence line.
- The lines cut and protected, in words (for example: "You cut schools twice").
- Two short questions (SPEC section 2 step 5), then submit. Submit shows this card and stops.

## Rules the code must hold
- Every response's pays equal its cuts exactly (MD). A test checks all fifteen responses.
- Every response is a multiple of 5% of each line's draft.
- The allocation is balanced at the end: the movable lines sum to the envelope within 0.5%.
- Locked lines (debt interest, reserve) never move.
- Keep-draft is a valid choice in every round (response C in R1, R2, R3, R4 or R5 may be chosen as "no change"); the final draft choice is also offered on the first screen.

## Open for review
- Whether "stakes" as consequence lines is within SPEC section 1 ("no score, no winner, no right answer"). It is, on this reading. Owner to confirm.
- Consequence wording needs review by a person who knows the sectors. Placeholder until then.
- The five pressures are invented. They are not drawn from the 2027 draft and must not be presented as its content.
