# External ethics review package: DT Research 001

**Prepared for:** [ETHICS ADVISER NAME], independent reviewer.
**Prepared by:** [MAINTAINER], DeepTunisia.
**Date:** 2026-09-14.
**Status:** draft for review.
**Decision requested:** an independent ethical opinion and either approval, conditional approval or refusal, in writing, before fielding.

---

## 1. Why an external review

DeepTunisia is a research project, not a university, and Tunisia has no institutional review board process we can use by default. Rather than self-certify, the study seeks an independent reviewer, named publicly on the study page. The reviewer's conclusions and any conditions are recorded in the study file. This is the same posture the project took for its earlier methods study (`research/study/participant-protections.md`).

Your independence matters: if you have a financial, political or institutional stake in the findings, say so and we will find another reviewer. An honorarium for review time, if any, is disclosed on the study page and is not conditional on the outcome.

## 2. The study

Open online survey, ages 18 and over, worldwide, three languages (Modern Standard Arabic, French, English), no payment. It measures how people understand democracy: essentiality ratings of 31 components, a forced-choice prioritization task, a present-in-Tunisia rating block, government-support items, an optional free-text definition, and demographics. Target 1,500 to 2,000 completed responses over eight weeks. Weighted to the Tunisian census, with the limits of an open sample stated on every surface.

Materials:

- `protocol.md`: full design, research questions, analysis plan, exclusions, risks.
- `instrument-v0.yaml`: the questionnaire, item by item, with sources noted.
- `participant-protections.md`: consent, data handling, withdrawal, publication.
- `legal-brief.md`: the parallel legal and data-protection review.

## 3. Risks to participants

| Risk | Who | Assessment | Mitigation |
|---|---|---|---|
| Re-identification from answers | Participants in small governorates | Low but not zero in raw rows; the combination of location, age, sex and education can narrow to a person | No identifiers stored; raw rows never published; public microdata coarsened; small cells suppressed; free text purged |
| Political exposure under Decree-Law 2022-54 | Participants who answer questions about courts, corruption, the army | Real in the current climate; the project has documented prosecutions of journalists under this instrument | Anonymity by design; no IP stored; skip permitted on every item; consent states exactly what is stored; no email or account required |
| Device or network observation | Participants in shared or monitored environments | Cannot be eliminated by the study | Consent notes it; private browsing and personal connections suggested; the mode and screen-visibility questions document the exposure respondents report |
| Distress or discomfort | Some participants | Low; the subject is political, not traumatic | Every item skippable; no forced answers; a closing note |
| Coercion or undue influence | None expected | Participation is unpaid and non-institutional | No incentive, no employer or university involvement in recruitment |
| Exclusion from research | People without reliable internet or written literacy | The mode structurally excludes part of the population | Named as a limitation; benchmarked against face-to-face probability surveys; no claim of representativeness |

Risks to third parties: none identified. The study makes no claims about named living persons and publishes no individual responses.

## 4. Protections in the design

1. 18-and-over gate; no data stored for anyone who declines or is underage.
2. No payment or incentive of any kind.
3. No accounts, no email, no names, no IP addresses stored.
4. Every item, including the anti-democratic items, carries a skip option.
5. Withdrawal by random receipt while the study is open; the limit after the freeze is stated before participation.
6. Public release is coarsened microdata plus aggregates; no individual rows; no channel-level individual data.
7. Free text is optional, capped at 500 characters, purged after coding, and quoted only under separate explicit permission after de-identification.
8. A fraud audit is published; exclusion rules are pre-registered and counted.
9. The study can be paused by a pre-registered stopping rule, and pausing is reported.

## 5. Questions for the reviewer

1. **Overall:** approve, approve with conditions, or refuse? What conditions?
2. **Consent:** is the outline in `participant-protections.md` §11 adequate and comprehensible for the intended population, including people with limited written literacy? What would you change?
3. **Withdrawal:** is receipt-based deletion during the open window ethically adequate, and is the post-freeze limit communicated fairly?
4. **Sensitive items:** the instrument includes items asking whether military rule, religious rule, obedience and a strong leader are essential to democracy. Is the wording acceptable, and should any be moved, softened or paired with a note?
5. **Mode probe:** the survey asks whether answers would differ face-to-face. Do you see this as useful calibration or as a question that increases risk for respondents in the home?
6. **Free text:** is the handling (purge after coding; quotation only with permission) sufficient?
7. **Retention:** is the schedule ethically adequate?
8. **Exclusions:** do the pre-registered rules (speed, straight-lining, duplicates, honeypot) risk unfairly discarding genuine respondents, and what safeguards would you require?
9. **Open sample:** given that anyone can take part and manipulation is possible, what additional ethical safeguards would you require, if any?
10. **Data-protection interface:** does this review need to await the legal opinion, or can the ethical and legal reviews proceed in parallel with conditions?
11. **Participant contact:** is the complaint channel sufficient? Would you require an independent contact who is not the principal investigator?
12. **Anything else** you would require before fielding.

## 6. What approval means

Approval (or conditional approval with the conditions applied) is a gate in the execution plan at M3. Fielding does not begin without it. The reviewer is named on the study page, their conditions are recorded, and any deviation from the approved design is logged in the study's change log and, if substantive, re-submitted for review.

---

*Package v0.1, 2026-09-14. No participant has been contacted. This package has not yet been sent.*
