# Execution plan: DeepTunisia Research and Study 001

**Version:** 0.1, 2026-09-14.
**Branch:** `t3code/research-portal-survey`.
**Status legend:** `[ ]` todo, `[~]` in progress, `[x]` done.
**Scope:** from the Phase 0 drafts that exist now to a published Study 001 and a platform that takes Study 002 as configuration. It does not cover fundraising, hiring, or any study other than 001.

Companion documents: `README.md` (program and platform design), `study-001/protocol.md`, `study-001/instrument-v0.yaml`, `study-001/participant-protections.md`, `backend.md` (backend and data handling), `roadmap.md` (long horizon).

Estimates are calendar ranges, not effort hours. Two facts shape them: instrument translation with cognitive testing is the long pole, and fielding is calendar-bound. Legal review can invalidate the capture design, so it starts in week 1, not at launch.

---

## 1. End state (definition of done)

The plan ends when all of the following are true. This is the acceptance list, not a summary.

**Study 001**

- [ ] Protocol v1.0 published, with a pre-registration identifier and the frozen instrument hash.
- [ ] Instrument v1.0 in Arabic, French and English, with a published translation report and no machine-translated text.
- [ ] Participant protections published, matching what the API actually stores.
- [ ] Ethics review and data-protection review complete, with the reviewers named on the study page.
- [ ] Fielding window completed; write endpoint disabled; dataset frozen.
- [ ] Exclusion counts and the fraud audit published.
- [ ] Analysis complete: descriptives, structure, latent profiles, MaxDiff, ideal-present gap, support models, experiment effects, open-text coding with an agreement statistic, robustness.
- [ ] Results pages live, every number carrying its n and the population statement.
- [ ] Anonymized microdata and codebook deposited with a DOI, CC BY 4.0.
- [ ] Analysis code published and runnable from the deposited microdata.
- [ ] Published aggregate tables recomputed from the released microdata by a repository check, green.
- [ ] Preprint public; paper submitted.
- [ ] New `data/questions.yaml` records created from the findings and linked to the study.

**Platform**

- [ ] `/research` and the study routes live, in all three locales, with charts carrying table alternatives.
- [ ] `data/studies/` schema, validators S1 to S8 and `test-studies.ts` green, including the assertion that no study record enters any graph statistic.
- [ ] Submission API live behind `RESEARCH_OPEN`, storing no identifiers, with receipt-based withdrawal.
- [ ] Export pipeline reproducible: responses to CSV to aggregates to committed `results.yaml` to static pages, with the build never reading the database.
- [ ] A runbook exists: adding a study means manifest, protocol, instrument, pre-registration. No new code.
- [ ] No public surface claims representativeness, enforcement of any budget or hold, or any figure that was not measured.

**Program**

- [ ] Public charter live: pre-registration, open data, funding disclosure, conflicts, corrections, negative results, named roles.
- [ ] Study 002 manifest drafted as configuration only.

---

## 2. Workstreams and owners

| ID | Workstream | Owner | Notes |
|---|---|---|---|
| A | Design and instrument | Maintainer; translators; @dt-research for provenance | Long pole: translation and cognitive interviews |
| B | Ethics and legal | Maintainer; counsel; external ethics advisor | Gate on fielding; starts week 1 |
| C | Platform | Agent; @dt-editor for schema; @dt-testing for tests; @dt-i18n for chrome | Parallel to A and B |
| D | Recruitment and communications | Maintainer | Copy frozen before fielding; no launch before gates |
| E | Analysis and release | Agent; maintainer reviews | Python for MaxDiff/LPA; TS verifier for published tables |
| F | Paper and feedback | Maintainer; agent drafts | Preprint, submission, questions.yaml |

Role names (PI, methods reviewer, ethics reviewer, data steward, external advisor) are decision D6 and must be assigned before M3.

---

## 3. Milestones

### M0. Review, decisions, and review packages (week 1)

- [x] Phase 0 drafts written: protocol, instrument v0, protections, portal design.
- [ ] Maintainer reviews `protocol.md`, `instrument-v0.yaml`, `participant-protections.md` and marks changes.
- [ ] Resolve decisions D1 to D7 (section 5), or assign an owner and a date to each.
- [ ] Name the five roles (D6).
- [ ] Draft and send the legal and data-protection brief (capture design, stored fields, retention, storage location, consent, Decree-Law 54 context). Agent drafts; maintainer sends.
- [ ] Send the ethics package (protocol, instrument, protections) to the external advisor.
- [ ] Kick off the benchmark verification memo (@dt-research): WVS-7 Tunisia field dates; Q246 wording variant; strong-leader item numbers in WVS-7 and Arab Barometer; Arab Barometer item wording; Afrobarometer round and field dates; INS 2024 education margins. Output appended to protocol §15.

**Exit gate G0:** decisions logged, roles named, legal and ethics packages sent, verification memo requested.

### M1. English source freeze and translation (weeks 2 to 7)

- [ ] Apply protocol review changes; freeze English source as v0.2-src.
- [x] Write translation briefs per item per locale: construct, intent, register, forbidden interpretations, scale labels, the "against democracy" option explained (`translation-brief.md`, pinned to instrument 0.1.0-draft).
- [ ] Contract two translators per locale plus a back-translator per locale; send the kickoff pack.
- [ ] Per locale: independent translation, reconciliation, single draft.
- [ ] Per locale: back-translation, divergence resolution, revised draft.
- [ ] Cognitive interviews: 12 to 15 per locale, mixed education and region; script and consent prepared; findings logged per item.
- [ ] Revise failing items; re-test the revised subset only.
- [ ] Write the translation report; item bank becomes v1.0-rc.

**Exit gate G1:** translation report complete; every locale tested; provenance memo folded into the protocol.

### M2. Platform build (weeks 2 to 10, parallel to M1)

Bootstrap

- [x] `npm ci --ignore-scripts`, then `npm run build`, then `npx svelte-kit sync`.
- [x] Baseline gates green on the branch: `npm run data && npm run test && npm run check`.

Schema and validators

- [x] `data/studies/` created with `studies.yaml` (instrument files land at freeze).
- [x] Zod schemas: Study, Instrument, Item, ResultBlock; validators S1 to S5 of §10 (S6 DOI and hash cross-check at release, S7 chrome keys, S8 renderer assertion remain).
- [x] `test-studies.ts`: schema, lifecycle gates, hash immutability, and the graph-exclusion assertion.
- [x] Registry entry for study 001 at status `design`.
- [ ] Instrument compiler: item bank to runtime instrument JSON with a content hash; test that any text or response change moves the hash.

Storage and API

- [x] Separate D1 binding and local adapter; `responses` table with no identifier columns.
- [x] `POST /api/studies/:slug/submit` validating against the frozen hash; Turnstile; salted-hash rate limit reused from `community/ratelimit.ts`; honeypot; minimum completion time.
- [x] `GET /api/studies/:slug/instrument`, `POST /withdraw`, `GET /count`.
- [x] `RESEARCH_OPEN` flag, separate from `AGORA_OPEN`; writes rejected while off.
- [x] Local end-to-end test: submit synthetic responses, withdraw one, count the rest.
- [x] Runner completion: experiment arms assigned server-side at instrument fetch with an HMAC token verified at submit; the runner orders the blocks and the scale from it and stores both arms. MaxDiff design generated (seed 20260915), compiled, rendered as its own step, and its choices stored. Minimum-completion floor enforced, waived under the dev override.
- [x] Local dev fielding mode (`RESEARCH_DEV_STUDY`) with configurable ports (`PORT`, `DT_API_PORT`): the survey is answerable end to end before the registry reaches fielding. Under the override only, the bot challenge is skipped and the MaxDiff requirement is waived; production stays strict. First live run verified: submit through the UI, receipt, a stored row with no identifier columns, count and withdraw.

Routes and interface

- [x] `/research` added to `VIEWS`, nav, guide and README table; `nav.research` and `guide.research.*` keys in en, fr and ar; test-i18n green.
- [x] Static routes: `/research` and `/[slug]` (methodology, data, results and paper render as sections on the study page until they have content worth a route; the smoke guide-row count is bumped to 16 and `/research` is in the sitemap).
- [x] Dynamic routes: `/participate` (consent, progress, receipt; save-and-resume pending) and `/withdraw`.
- [ ] Results route renders from committed aggregates; asserts population statement and n on every block.
- [ ] Accessibility and low-bandwidth pass; smoke test desktop and phone, both themes (needs a dev server and a browser).
- [ ] Translate the study title and any short registry copy (title_fr, title_ar) at freeze. The manifest schema carries no provenance field for manifest translations yet, so this stays English until the freeze step adds one or the translators sign off.

Export pipeline

- [x] `npm run studies:export`: D1 to working CSV; exclusion rules applied mechanically; counts per rule and channel.
- [x] Aggregation script writes `data/studies/dt-research-001/results.yaml` (draft from synthetic data).
- [x] `npm run studies:build`: validate results, emit `src/generated/studies.json` and static exports.
- [ ] Verifier test: published aggregate tables recomputed from a released CSV.

**Exit gate G2:** all three gates green, local end-to-end demo works, no deployment, `RESEARCH_OPEN` off.

### M3. Pretest, freeze, and approvals (weeks 8 to 12)

- [x] Draft the pre-registration pack (`preregistration.md`): questions, hypotheses, design, exclusions, analysis plan, inference criteria, stopping rule. Filing happens with the frozen hash.
- [ ] Recruit 30 to 60 pretesters outside the eventual sample; all three locales; mixed devices, education, regions.
- [ ] Run the full instrument; measure completion time, drop-off by item, comprehension complaints, skip rates.
- [ ] Apply the pre-registered optional-item drop rule if median completion exceeds 15 minutes.
- [ ] Freeze instrument v1.0 and the study manifest; record the hash.
- [ ] Publish the pre-registration with protocol, hash and analysis plan.
- [ ] Ethics sign-off and legal and data-protection sign-off; if the storage path changes, apply it and rerun the end-to-end test.
- [ ] Draft and archive: study page copy, recruitment post texts per channel, population statement, press note.
- [ ] Confirm that the protections document matches what the API stores, item by item.

**Exit gate G3:** signed pre-registration, frozen hash, ethics and legal sign-off, pretest report, recruitment copy archived.

### M4. Fielding (weeks 12 to 20)

- [ ] Deploy with `RESEARCH_OPEN` on; nav link live; posts per channel with channel parameters.
- [ ] Weekly monitoring: counts by channel and locale, exclusion flags, duplicate incidence, completion time, drop-off.
- [ ] Maintain a data-quality log. No interim findings published.
- [ ] Midpoint check against the pre-registered stopping rule; pause or continue, logged either way.
- [ ] At close: disable writes, export, freeze the dataset.

**Exit gate G4:** eight-week window complete (or closed early by the stopping rule), dataset frozen, write endpoint off.

### M5. Analysis and release (weeks 20 to 26)

- [ ] Apply exclusions mechanically; publish counts by rule and channel.
- [ ] Compute the fraud audit.
- [ ] Run the analysis plan: descriptives, structure, latent profiles, MaxDiff, gap, support models, experiments, robustness.
- [ ] Open-text coding by two independent coders; agreement statistic; category scheme published.
- [ ] Commit `results.yaml`; build the results pages; every table and chart carries n and the population statement.
- [ ] Deposit microdata and codebook; record the DOI on the data page and in the manifest.
- [ ] Run the verifier: published aggregates recomputed from the released CSV; green.
- [ ] Publish the release note and the corrections path entry.

**Exit gate G5:** public release complete, DOI live, verifier green, gates green.

### M6. Paper, outreach, feedback (weeks 26 to 40)

- [ ] Post the preprint with the DOI and the population statement.
- [ ] Submit to a comparative politics or public opinion journal; if the benchmark stands alone, prepare a methods note.
- [ ] Publish the press note and share assets.
- [ ] Add findings-driven records to `data/questions.yaml`; cross-link from relevant graph pages.
- [ ] Postmortem: what to change for Study 002; update this plan and the runbook.

**Exit gate G6:** preprint public, paper submitted, questions live, postmortem written.

### M7. Institution (ongoing)

- [ ] Publish the program charter.
- [ ] Write the runbook: how to add a study without new code.
- [ ] Draft the Study 002 manifest (candidate: institutional trust or media trust).
- [ ] Decide the Study 001 repeat wave schedule for trend measurement.

**Exit gate G7:** Study 002 can begin as configuration only.

---

## 4. Critical path and parallelization

Critical path: M0 decisions and legal brief, then M1 translation and cognitive interviews, then M3 freeze and approvals, then M4 eight weeks of fielding, then M5 release. Roughly 6 to 8 months if the long poles start in week 1.

Runs in parallel throughout: M2 platform (does not depend on the translations), benchmark verification, recruitment copy drafting after the instrument wording stabilizes.

Cannot run in parallel: fielding before ethics and legal sign-off; any results publication before the dataset freeze; any nav link before the launch gate.

Serialization rules:

1. Legal review starts in week 1 because it can change the capture path.
2. Translation starts as soon as the English source is frozen, not after the platform is built.
3. Pretest requires both the platform and the translated instrument.
4. No public deployment with a live write endpoint before G3.

---

## 5. Decisions (blocking inputs)

| ID | Decision | Recommendation | Owner | Needed by |
|---|---|---|---|---|
| D1 | Storage jurisdiction for response data | Start counsel review now; prepare a Tunisia-hosted capture fallback in case D1 fails review | Counsel; maintainer | M3 |
| D2 | Bot challenge | Cloudflare Turnstile, subject to accessibility and privacy review | Platform; maintainer | M2 |
| D3 | Pre-registration venue | OSF, with the hash and protocol attached | Maintainer | M3 |
| D4 | Aggregation release rules | Coarsen demographics in the public microdata (region groups, age bands, three education levels); minimum cell size 20 in published crosstabs; no channel or receipt codes in the release | Maintainer; ethics advisor | M3 |
| D5 | Retention | Raw rows replaced by the released anonymized dataset at release; open text purged after coding; working CSV purged after aggregation | Maintainer; counsel | M1 |
| D6 | Roles | PI, methods reviewer, ethics reviewer, data steward, external advisor named before M3 | Maintainer | M0 |
| D7 | Canonical location | `data/studies/` with the graph-exclusion test, rather than a new top-level directory | Maintainer; @dt-editor | M2 |

---

## 6. First week, concrete

1. Read `protocol.md` and mark disagreements; the decisions table above is the fastest way to steer.
2. Name the five roles (D6).
3. Agent drafts the legal and data-protection brief; maintainer sends it. This is the highest-risk unknown.
4. Agent drafts the ethics package cover note; maintainer sends it to the advisor.
5. Agent starts M2 with the bootstrap and the `data/studies/` schema plus `test-studies.ts` skeleton, because it is independent of every decision except D1 and D7.
6. Agent writes the translation briefs from the current English source; maintainer contacts translators.
7. @dt-research starts the benchmark verification memo.

---

## 7. Non-goals for v1

- No respondent panel, accounts or repeat-respondent tracking.
- No incentives, lotteries or prize draws.
- No live results during fielding; counts only.
- No per-study bespoke code.
- No public raw response browsing.
- No claims of representativeness at any point.
- No second language of administration beyond Arabic, French and English.
- No machine translation in any public artifact.

---

## 8. Change control

This plan is a checklist, not a contract. Tick items as they land, keep the status legend accurate, and add a dated line to the change log below when a milestone moves or a decision changes. If a gate fails, the plan does not advance to the next milestone; the failure is what gets worked.

| Date | Change |
|---|---|
| 2026-09-14 | Plan created; Phase 0 drafts complete; M0 open |
| 2026-09-14 | Legal brief and ethics package drafted (placeholders pending); M2 first slice landed: research schema, build-studies, test-studies, study registry, all gates green |
| 2026-09-14 | M2 slice 2 landed: runtime contract and compiler, submission API with fail-closed refusal ladder, research storage, RESEARCH_OPEN flag, /research routes with runner and withdraw, 52 i18n keys in three locales, sitemap and smoke row updated. Gates: data 0, test 0 (1,936 checks), check 0. Open items: server-side arm assignment, MaxDiff design generation at freeze, results renderer, save-and-resume, smoke run |
| 2026-09-15 | Research becomes a first-tier bubble (graph, media, agora, research) with the pill and phone budget adjusted to four; the guide shortcut hides at 640px and stays in the graph docs strip. The program and study pages now lead with the case in en/fr/ar (`src/content/research.*.md`: program, why, how, answers). Verified in a browser at 1280 and 390, en and ar, no overflow; gates: data 0, test 0 (1,942 checks), check 0, build 0 |
| 2026-09-15 | Translation brief and pre-registration pack drafted; server-side arm assignment design recorded in the contract (assigned at instrument fetch, HMAC-verified at submit, implemented at freeze). Next design artifact: the study title translations at freeze |
| 2026-09-15 | Survey first runs end to end in dev: runner fetches live status, dev fielding mode with configurable ports, MaxDiff requirement waived only under the override, withdrawal verified. `backend.md` (backend and data handling) and `roadmap.md` (four horizons) written. Gates: data 0, test 0 (1,962 checks), check 0, build 0. Next engineering: MaxDiff design generation and arms, then save-and-resume |
| 2026-09-15 | Runner completion landed: MaxDiff design generated and frozen in the instrument, signed arm assignment at instrument fetch, minimum-completion floor, MaxDiff choices stored in a new column, save-and-resume in the browser. Live dev run verified: 9 steps, 16 forced choices, arms `extended_first / descending` stored, all 8 MaxDiff sets stored, withdraw clean. Gates: data 0, test 0 (2,000 checks), check 0, build 0 |
| 2026-09-15 | Export and aggregation pipeline landed: `studies:export` (rows to working CSV, exact column set) and `studies:aggregate` (four exclusion rules counted per rule and channel, 62-block results file validated against the schema, population statement on every block). A live dry run with three complete responses produced 0 exclusions and a valid document; an incomplete drill was correctly refused with zero rows included. Gates: data 0, test 0 (2,035 checks), check 0, build 0 |

---

*Plan v0.1, 2026-09-14. Nothing here is built, fielded or published. The four Phase 0 documents exist as drafts only.*
