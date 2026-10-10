# DT Research 001: What Does Democracy Mean to Tunisians?

**Protocol v0.1 (draft), 2026-09-14.**
**Status:** design. Not pre-registered, not reviewed, not fielded.
**Funding:** none committed. If grant funding is used, the funder is named on the study page before fielding begins.
**Instrument:** `instrument-v0.yaml` (not frozen; Phase 1 freezes v1.0 with a content hash).
**Companion documents:** `participant-protections.md`; portal and platform design in `../README.md`.

This document is the complete study design. It follows the pattern of `research/study/protocol.md` (the inter-annotator study): pre-specified decisions, published whatever the outcome, no result claimed before it is measured. The differences are the mode (open online survey rather than paid expert raters) and the object (public attitudes rather than evidence grading).

---

## 1. Why this study

The question is not new, and the study does not pretend to be the first to ask it. Chapman, Hanson, Dzutsati and DeBell (2024) used the World Values Survey to show that "support for democracy" means different things to different people: electoral and liberal conceptualizations predict higher support for democracy, redistributive ones cut against it in more democratic countries, and a substantial share of respondents worldwide attach army rule and religious rule to the word democracy itself. They also found gender equality to be the component most commonly rated essential, ahead of elections. Arab Barometer Wave IX in Tunisia (fielded October to November 2025, 1,023 face-to-face respondents, national probability sample) found high stated support for democracy (67% say it is always preferable) alongside a strongly outcome-oriented conception of it: 78% say the type of government does not matter as long as it solves the economy, 66% want a strong leader willing to bend the rules, and when asked to name democracy's primary pillar only 5% name free elections (basic necessities 29%, absence of corruption 21%, equality before the law 21%).

What does not exist for Tunisia, and what this study adds:

1. An open, pre-registered instrument with item-level public data. WVS and Arab Barometer publish their data, but neither asks the full set of questions this study asks, and neither publishes in a form a Tunisian reader can inspect item by item and compare with the graph on this site.
2. Prioritization. Rating every component 1 to 10 produces a ceiling: almost everything is important. This study adds a forced-choice task (MaxDiff) that measures what people choose when they cannot choose everything, and tests whether the forced choice changes the ranking.
3. The ideal-versus-present gap. Rating how essential a component is to democracy, and separately how present it is in Tunisia today, produces a deficit profile. That profile is the finding most likely to matter to the public, and no existing Tunisian instrument publishes one.
4. Measurement sensitivity. The study randomizes block order and scale direction so the size of context effects is measured rather than assumed.
5. A benchmark against probability samples. This is an open online sample. Rather than hiding that, the study measures how far its respondents travel from WVS-7 Tunisia, Arab Barometer IX and Afrobarometer on shared items.

Either outcome is publishable. If the open sample tracks the probability samples closely on shared items, that is evidence about a cheap, repeatable mode for future studies. If it diverges sharply, that is evidence about the limits of open online recruitment in this political context, and it is reported first, not buried.

---

## 2. Design overview

| Element | Decision |
|---|---|
| **Mode** | 100% online, self-administered, three locales (Modern Standard Arabic, French, English). No interviewer, no phone, no in-person component. |
| **Sample** | Open participation, ages 18+, no residence requirement, no incentive. Self-selected. Target 1,500 to 2,000 completed responses over 8 weeks; no result is reported without its realized n. |
| **Weighting** | Raking to INS 2024 census margins (sex, age band, governorate), weights capped at 5. Weighted and unweighted results reported side by side. Weighting cannot correct self-selection and the write-up says so. |
| **Instrument** | `instrument-v0.yaml`, roughly 30 essentiality items, a 15-item MaxDiff block, a 12-item present-in-Tunisia block, 7 support and regime items, 3 safety and mode items, one open text item, 12 demographics. Median completion target under 15 minutes, verified by pretest. |
| **Experiments** | Primary: block order (WVS core first versus extended first), randomized. Secondary: scale direction (ascending versus descending anchor labels), randomized. Both recorded per response as design variables. |
| **Primary measures** | Essentiality ratings (0 to 10 plus an explicit "against democracy" option); MaxDiff best and worst choices; present-in-Tunisia ratings (0 to 10); support and regime items; self-reported mode expectation; open-text definition. |
| **Benchmarks** | WVS-7 Tunisia (2019), Arab Barometer IX Tunisia (2025), Afrobarometer Tunisia (2024 fieldwork; round number to verify). |
| **Pre-registration** | Public before fielding, with the frozen instrument hash. Repository and identifier recorded on the study page. |
| **Analysis code** | Published with the release. Descriptive tables recomputable from the released microdata by a verifier script in the repository. |

---

## 3. Research questions and hypotheses

Hypotheses are directional where prior work supports a direction, and marked exploratory where it does not. All are pre-registered; the exploratory items are reported as estimates with intervals, not as tests.

**RQ1. Structure.** How do Tunisian respondents organize the components of democracy? Do the five V-Dem families (electoral, liberal, participatory, deliberative, egalitarian) appear as distinguishable dimensions, and do the anti-democratic items (military rule, religious rule, obedience, strong leader) load separately?

*H1:* A five-family structure is recoverable with acceptable fit, and the anti-democratic items form a distinct factor. *Exploratory:* the degree of overlap between the distributive items and the egalitarian family.

**RQ2. Prevalence.** What share of respondents rate each component essential, optional, or opposed to democracy?

*H2:* Large majorities rate free elections, civil rights and gender equality 9 or 10. *H2b (exploratory):* a non-trivial minority rates at least one anti-democratic item 9 or 10 while also rating elections essential; the size of that overlap is a headline estimate, not a test.

**RQ3. Prioritization.** When forced to choose (MaxDiff), which components are most and least essential, and does the forced-choice ranking differ from the mean rating ranking?

*H3:* The two rankings correlate but are not identical; at least one component drops sharply under forced choice. Directional predictions for specific items are recorded in the pre-registration document before fielding and are not adjusted afterwards.

**RQ4. Ideal versus present.** For the twelve democratic-positive components asked in both blocks, how large is the gap between essentiality and presence in Tunisia today?

*H4 (exploratory):* the largest gaps are expected on corruption and equality before the law, based on Arab Barometer's pillar findings, and the smallest on elections. No directional test is pre-specified for the remaining items.

**RQ5. Support.** Do conceptualizations predict support for democracy and for the current political order? Specifically, does an outcome-oriented or distributive conception predict greater acceptance of a strong leader and of government type being unimportant, while electoral and liberal conceptions predict the opposite?

*H5:* Yes, in the direction reported by Chapman et al. This is the study's main confirmatory test on Tunisian data.

**RQ6. Measurement sensitivity.** How much do block order and scale direction move item means?

*H6:* Order effects are small on average (below 0.3 scale points on a 0 to 10 scale) but larger among respondents with lower political interest or education. This is a test, with the interaction pre-specified.

**RQ7. Benchmarking.** How do open online respondents differ from probability samples on shared items?

*H7:* The online sample is younger, more educated, more urban and more politically interested than the probability samples, and item means differ accordingly. The magnitude is reported; no correction is presented as making the sample representative.

**RQ8. Diaspora.** Do respondents who report living outside Tunisia differ from those inside on conceptions and support?

*Exploratory.* No directional hypothesis.

**RQ9. Open text.** What definitions do respondents volunteer, and how do the coded categories map onto the closed battery?

*Exploratory.* Coding categories are derived from the first 100 responses by two independent coders, then frozen for the rest, and the category scheme and agreement statistic are published.

---

## 4. Population, recruitment and the population statement

### 4.1 Who can take part

Anyone aged 18 or over who reaches the survey can take part. There is no residence requirement, no quota and no screening beyond age and consent. This is deliberate: the study has no sampling frame, so pretending to control composition would only produce a false impression of control. Location is self-reported and used as an analysis variable, not as an eligibility gate.

Minors are excluded. The consent module states the age requirement and the basis for it. Anyone who reports being under 18 is routed to a short explanation page and no data is stored.

### 4.2 Recruitment channels

Each channel gets a distinct URL parameter so responses can be attributed to a channel without collecting anything about the person. Channels planned for v1, subject to Phase 1 confirmation:

| Code | Channel | Notes |
|---|---|---|
| `reddit` | Reddit communities on Tunisia | Post text archived before fielding |
| `instagram` | Instagram story and bio link | Same |
| `facebook` | Facebook groups and pages | Same |
| `x` | X | Same |
| `newsletter` | Direct outreach to partner organizations | Same |
| `university` | University and student networks | Same |
| `diaspora` | Diaspora organizations and networks | Same |
| `organic` | No channel parameter (direct or forwarded link) | Recorded as its own category |

Any paid promotion is disclosed on the study page before fielding, with the platform and the amount. Recruitment post wording is frozen before fielding and archived in the study folder so that the exact solicitation can be audited later. No post may characterize the study as polling or claim representativeness.

### 4.3 The population statement

Every publication surface (results page, data page, paper, press note, social post) carries the following statement in the language of the surface, with the numbers filled in at release:

> DT Research 001 is an open, self-selected online study. Results describe the N respondents who completed the instrument through the listed channels between [start] and [end]. Participation was open to anyone aged 18 or over; there was no sampling frame and no probability of selection. These results are about the people who took part, not about Tunisians as a population. Where comparable, estimates from probability surveys (WVS-7 Tunisia, Arab Barometer IX, Afrobarometer) are shown alongside, and the differences are part of the analysis.

No surface may say "Tunisians believe", "the Tunisian public thinks" or any equivalent. The unit is always respondents, with n, channel and window attached.

---

## 5. Instrument

The full item bank is `instrument-v0.yaml`. This section states the structure and the design decisions behind it. Item wording is frozen at v1.0 only after translation and cognitive testing.

### 5.1 Modules

| Module | Items | Required | Purpose |
|---|---|---|---|
| Consent and age | 4 | yes | Informed consent, age gate, data-use confirmation |
| Essentiality, WVS core | 10 | yes | Comparability with WVS and the published literature |
| Essentiality, extended | 21 | core tier yes, optional tier no | Five V-Dem families plus a Tunisia module |
| MaxDiff | 15-item pool, 8 choice sets of 4 | yes | Prioritization under forced choice |
| Present in Tunisia | 12 | yes | Ideal-versus-present gap |
| Support and regime | 7 | yes | Dependent variables and regime evaluation |
| Safety and mode | 3 | no | Response-environment covariates |
| Open text | 1 | no | Voluntary definition in the respondent's own words |
| Demographics | 12 | mostly | Weighting, subgroup analysis, design checks |
| Experiment variables | 2 | automatic | Block order and scale direction |

### 5.2 Essentiality battery

The WVS core items are quoted from the WVS-7 master questionnaire with their question numbers, so that benchmark comparisons are exact and deviations are visible. Online, the interviewer-coded "it is against democracy" option is shown explicitly as a response alternative; this is a deviation from the interviewer-administered format and is recorded as one.

The extended items are project-authored, mapped to the V-Dem five-principle scheme (electoral, liberal, participatory, deliberative, egalitarian) plus the anti-democratic cluster and three Tunisia-specific items. Every item carries a construct tag and a provenance tag in the instrument file. Nothing enters the battery without both.

Response scale: 0 to 10, where 0 is the explicit "against democracy" option, 1 is "not at all an essential characteristic" and 10 is "definitely an essential characteristic", with a separate skip option on every item. The scale direction experiment flips the visible anchor labels without changing the stored coding.

### 5.3 MaxDiff prioritization

Fifteen items drawn from the essentiality pool (eight WVS core: free elections, civil rights, gender equality, tax and subsidy, religious law, army takeover, obedience, strong leader; and seven extended: independent courts, equality before the law, press freedom, protest, local power, basic needs, anti-corruption) are presented in eight choice sets of four. For each set the respondent selects the most essential and the least essential item. The design is near-balanced: each item appears two or three times across sets, and position and pair frequencies are verified and checked into the study folder. The design is generated once, frozen with the instrument, and never regenerated between respondents.

Analysis uses individual-level utility scores (hierarchical Bayes or mixed logit, decided in the pre-registration and not switched after seeing results), compared with mean essentiality ratings by item and by respondent.

### 5.4 Present-in-Tunisia block

Twelve democratic-positive components (the components with no anti-democratic content) are re-asked as "In Tunisia today, how much is this a reality?" on the same 0 to 10 scale. The difference between the two ratings is the gap. The block excludes the anti-democratic items deliberately: asking how much military rule is present does not produce a deficit measure, it produces a different question, and it is not asked.

### 5.5 Support and regime items

Adapted from WVS and Arab Barometer, with question numbers recorded: democracy as preferable, strong leader, government type unimportant if it delivers economically, government type unimportant if it delivers order, satisfaction with how democracy works, and a 0 to 10 rating of how democratic Tunisia is today. These are the dependent variables for RQ5 and the comparison items for RQ7.

### 5.6 Safety and mode probes

Three items: comfort answering (1 to 5), who could see the screen (alone, family, friends, other, prefer not to say), and the mode question, "If this survey had been conducted face-to-face in your home, would your answers have been the same, more cautious, or more open?" The last item is the direct calibration against Arab Barometer's face-to-face estimates.

### 5.7 Open text

One optional item, maximum 500 characters: "In one sentence, what does democracy mean to you?" Responses are accepted in Tunisian Arabic, Modern Standard Arabic, French or English. The coding scheme is derived from the first 100 responses by two independent coders, frozen, and applied to the remainder. Raw text is used for coding and then purged on the schedule in the protections document; quotations are published only with explicit permission and after de-identification.

### 5.8 Demographics

Governorate (all 24 plus "outside Tunisia" plus prefer not to say), age band matched to the census publication, sex, education level, employment status, subjective financial situation, political interest, religiosity, language of completion, and a question on whether the respondent lives inside or outside Tunisia. No name, no email, no phone number, no exact date of birth, no address, no income figure.

---

## 6. Translation protocol

The instrument is fielded in Modern Standard Arabic, French and English. Tunisian Arabic (derja) is accepted in the open-text item but is not a written instrument locale in v1: it has no single standard orthography, and the probability surveys this study benchmarks against field in Modern Standard Arabic. Written derja is a decision for a later study, not this one.

Translation procedure, applied per locale:

1. Two independent translators per target language, working from the frozen English source and the construct definitions, not from each other.
2. Reconciliation meeting to produce a single draft; disagreements recorded.
3. Back-translation by a third translator who has not seen the source.
4. Resolution of divergences against the source.
5. Cognitive interviews with 12 to 15 respondents across education levels and regions, covering comprehension, item intent, and scale handling. Findings are logged per item; items that fail comprehension are rewritten and the process repeats for those items.
6. Freeze with the instrument hash. The translation report is published with the instrument.

No machine translation is used at any step, including for internal drafts. A machine translation may be used as a comprehension check by a native reviewer after the human translation is complete, and is recorded if it is.

---

## 7. Data capture and participant protections

Detail is in `participant-protections.md`. The design decisions that matter for the analysis:

- **Fields stored per response:** study id, instrument version hash, locale, channel code, consent version, start and submission timestamps, item-level values, experiment arm, completion flags, and a random receipt identifier. Nothing else.
- **Not stored:** IP address, user agent, device fingerprint, geolocation, email, any social account, any name. Rate limiting uses a rotating salted hash, following the community layer's existing practice.
- **Bot and duplicate defence:** a CAPTCHA challenge (Cloudflare Turnstile is the presumptive choice, to avoid Google reCAPTCHA; final choice pending Phase 1 review), edge rate limiting, a hidden honeypot field, a minimum completion time set from the pretest, and post-hoc duplicate-pattern detection. The defence measures and their limits are stated in the consent module, not hidden.
- **Withdrawal:** the submission receipt is a random identifier shown once and held only by the respondent. Anyone can submit the receipt on the withdrawal page to delete their response during the fielding window. This makes the row pseudonymous rather than strictly anonymous, and the consent says so. After the fielding window closes and analysis begins, deletion is no longer possible because the dataset has been frozen; this is also stated before participation.
- **Retention:** raw response data is held only for the fielding window and analysis, then replaced by the released anonymized microdata. Open-text raw text is purged after coding. The retention schedule is published on the study page.
- **Storage location:** responses are stored in the project's Cloudflare D1 instance. Whether the location satisfies Tunisian data-protection requirements is a Phase 0 legal-review question; if counsel requires storage inside Tunisia, the capture path must be redesigned before fielding, not after.
- **No third-party analytics on the survey route.** No tracking pixels, no advertising scripts, no session recording.

---

## 8. Quality control and exclusions

Exclusion rules are fixed before fielding and applied mechanically. Every exclusion is counted and published, by rule and by channel.

| Rule | Definition | Handling |
|---|---|---|
| Age | Self-reported under 18 | Not stored |
| Consent | Consent not given after the module | Not stored |
| CAPTCHA | Turnstile failure after two attempts | Rejected at the edge |
| Honeypot | Hidden field completed | Excluded |
| Speed | Total completion below 40% of the pretest median (threshold confirmed at pretest) | Excluded from primary analysis, reported separately |
| Incomplete | Fewer than 80% of required items answered | Excluded from primary analysis; completion reported |
| Straight-lining | Same value on all essentiality items with zero variance | Excluded from primary analysis |
| Duplicates | Near-identical response vectors above a pre-specified similarity threshold | Flagged; the duplicate set is analysed separately, primary results reported with and without |

The thresholds above are placeholders except for the principle. The exact numbers are set from the pretest, recorded in the pre-registration, and not moved after fielding begins.

A fraud audit is published with the release: counts by channel, exclusion counts by rule, duplicate incidence, completion-time distribution, and the share of responses arriving in bursts. The audit reports aggregates only and never identifies a respondent.

---

## 9. Weighting and benchmarking

Raking (iterative proportional fitting) to the INS 2024 census on sex by age band by governorate, if the published cross-tabulation supports it; otherwise sequential raking on the three margins with the limitation stated. Education is added only if census margins for adults 18+ are available and match the instrument categories. Weights are capped at 5 and the share of capped cases is reported. Design effect and effective sample size are reported for weighted estimates.

Every weighted estimate is published with its unweighted counterpart. The write-up states plainly that weighting adjusts composition on observed variables and cannot correct selection on unobserved ones, which in an open study about political attitudes may be exactly the variables that matter.

Benchmark comparisons use only items with near-identical wording. Differences are decomposed in the discussion into mode, sample composition and period; no attempt is made to attribute the difference to one alone.

---

## 10. Analysis plan

Analysis families are pre-specified. Within each family, p-values are corrected using Benjamini-Hochberg at 5%; exploratory estimates are reported with intervals and labelled exploratory everywhere they appear.

1. **Descriptives.** Item distributions, percent choosing 9 or 10, percent choosing "against democracy", percent skipping, by locale, channel, and experiment arm. The "against democracy" and skip categories are reported as outcomes in their own right, not treated only as missing.
2. **Structure.** Exploratory factor analysis followed by confirmatory factor analysis if a stable solution emerges. Primary treatment of the 0 to 10 scale is continuous; an ordinal robustness check is reported for the confirmatory model. Family scores are computed from the final solution.
3. **Classes.** Latent profile analysis on family scores, with the model range, selection criteria (BIC, entropy, minimum class size 5%, substantive interpretability) pre-registered. A MaxDiff-based mixture model is run in parallel. Class solutions are compared, not merged.
4. **Prioritization.** MaxDiff utilities per item and per respondent; rank correlation with mean essentiality; the components that move most.
5. **Gap.** Paired essentiality-minus-presence differences per item, with FDR correction, weighted and unweighted, plus a difference-in-gaps comparison between residents and diaspora.
6. **Support models.** Ordinal logistic regressions of each support item on family scores, conceptual complexity (the count of items rated 9 or 10, and a profile-entropy measure), and demographics, with average marginal effects reported. The main confirmatory test is H5.
7. **Measurement.** Experiment-arm differences in item means, with pre-specified interactions by education and political interest.
8. **Open text.** Category frequencies, co-occurrence with battery classes, and the agreement statistic between the two coders.
9. **Robustness.** Primary results repeated unweighted, excluding `organic` channel responses, excluding the fastest decile, and excluding respondents who reported low comfort. Divergence between these and the primary results is reported in the same table, not in a footnote.

Software: analysis scripts are versioned in the study folder with a pinned environment. Published aggregate tables are verified from the released microdata by a repository check, so a reader can reproduce the numbers that appear on the results page without trusting the analysis environment.

---

## 11. Deliverables

1. This protocol, published before fielding, with the pre-registration identifier.
2. The instrument v1.0 with content hash and the translation report, deposited with a DOI.
3. Anonymized microdata plus codebook under CC BY 4.0, deposited with a DOI.
4. Analysis code, published and runnable from the deposited microdata.
5. The results pages on the site, generated from committed aggregates, with tables for every chart.
6. A preprint, then a journal submission. Target venues: a comparative politics or public opinion journal for the substantive paper; a methods outlet for the online-versus-probability benchmark if it stands alone.
7. New records in `data/questions.yaml` for the puzzles the findings create, each linked to the study.
8. A press note that contains the population statement verbatim.

Negative and null results are published with the same care as positive ones. If the factor structure fails to replicate, that is a finding about the instrument and is reported first. If the MaxDiff design performs badly with the realized n, that is a finding about the method and is reported with the utilities. If participation is too low for the pre-registered models, the study reports descriptives and states which models were not run and why.

---

## 12. Ethics and governance

- **Review:** an internal ethics panel plus at least one external advisor, named on the study page. A data-protection review against Tunisian law (Organic Law 2004-63 and the INPDP authority) is completed before fielding; legal review is pending.
- **Consent:** informed, at the start, in the language the respondent selects, with the protections document linked and the data-use and withdrawal facts stated before any item.
- **No incentive:** no payment, no prize, no lottery, no donation triggered by completion. This removes a category of coercion and selection effects, and it will slow recruitment; both are accepted.
- **Funding:** disclosed per study before fielding. No funding from a political party, campaign, or foreign government, and no funder sees responses before publication or holds veto over findings.
- **Conflicts:** named team members disclose current and recent political affiliations, employment and funding. Disclosures are published.
- **Stopping rule:** the study is paused if the fraud audit shows manipulation above the pre-registered tolerance, if a legal risk to participants emerges, or if the instrument is found to be misunderstood in a way that invalidates an item. Pausing and restarting are both reported.
- **Corrections:** errors follow the site's existing corrections path, with the same visibility as a graph correction.

---

## 13. Risks and limitations (written before fielding)

1. **Self-selection.** The sample is not representative and cannot be made so by weighting. All results carry the population statement.
2. **Manipulation.** The study is open, and Tunisia has documented coordinated inauthentic activity. A determined actor can inflate a channel. Mitigations are detection, transparency and sensitivity analysis, not prevention; the protocol says so instead of implying the door is locked.
3. **Mode.** Online self-administration differs from face-to-face in ways that affect political answers, especially under a regime that prosecutes speech. The mode probe measures the respondents' own expectation; it does not eliminate the difference.
4. **Ceiling effects.** Rating tasks inflate importance. The MaxDiff block is the correction, and the divergence between the two is itself reported.
5. **Language and literacy.** An online written instrument excludes people who cannot or do not read comfortably in the three locales, and the sample skews accordingly. The benchmark quantifies part of the skew; the rest is named as a limitation.
6. **Sensitive items.** Anti-democratic and religious items may attract underreporting. The pattern of "prefer not to say" and the comfort item are reported as evidence about the size of the problem.
7. **Storage jurisdiction.** Pending legal review. If the current storage path cannot satisfy counsel, fielding is postponed rather than run and repented.
8. **Novelty.** Every substantive finding here has a prior in WVS, Arab Barometer or the published literature. The contribution is the combination (prioritization, gap, open data) and the Tunisian case, not a first measurement.
9. **Time.** The survey runs in one window. No trend claims are made from a single wave; trends require a repeat study, which the platform is designed to make cheap.

---

## 14. Timeline and gates

| Phase | Work | Duration | Gate |
|---|---|---|---|
| 0 | Protocol, instrument v0, translation, cognitive interviews, ethics and legal review, pre-registration | 4 to 6 weeks | Nothing proceeds to build until review sign-off |
| 1 | Portal implementation, instrument v1.0 freeze, pretest with internal and recruited testers, bot-defence configuration | 4 to 6 weeks | v1.0 hash and pretest report published before fielding |
| 2 | Fielding, 8 weeks, weekly monitoring of counts, channels and exclusion flags | 8 weeks | No interim results published |
| 3 | Close, freeze dataset, analysis, release microdata and results pages | 4 to 6 weeks | Aggregate numbers verified from the released microdata |
| 4 | Preprint, paper submission, outreach | 6 to 12 weeks | Population statement present on every surface |

Total: roughly 6 to 8 months from start of Phase 0 to release, with the ethical and legal gates able to stop the process at Phase 0.

---

## 15. References and verification notes

- Chapman, H. S., Hanson, M. C., Dzutsati, V., DeBell, P. (2024). Under the Veil of Democracy: What Do People Mean When They Say They Support Democracy? *Perspectives on Politics* 22(1), 97-115. DOI 10.1017/S1537592722004157. Awarded the 2025 Heinz I. Eulau Award.
- World Values Survey, Wave 7 master questionnaire (2017-2021), essential characteristics of democracy battery Q241-Q249 and Q250. Exact wording for the Tunisian localization to be pulled from the WVS Tunisia country questionnaire and cited in the instrument file.
- Lindberg, S. I., Coppedge, M., Gerring, J., Teorell, J. (2014). V-Dem: A New Way to Measure Democracy. *Journal of Democracy* 25(3). Five-principle scheme: electoral, liberal, participatory, deliberative, egalitarian.
- Arab Barometer Wave IX, Tunisia Public Opinion Factsheet 2025 (published July 2026). n=1,023, face-to-face, 30 October to 30 November 2025, margin of error ±3 points. Figures used in section 1 to be re-checked against the factsheet at pre-registration.
- Afrobarometer, Tunisia round with 2024 fieldwork. Round number and item wording to verify before use as a benchmark.
- Institut National de la Statistique (Tunisia), Population and Housing Census 2024, demographic overview (published 17 May 2025). Total population 11,972,169; 49.3% male, 50.7% female. Governorate and age tables used for weighting margins; education margins to be confirmed.
- Chu, J. A., Williamson, S., Yeung, E. S. F. Working paper on public views of elections and civil liberties as components of democracy. Used as adjacent work for the prioritization task; cited in the paper if the MaxDiff design draws on it.
- Tunisian data-protection framework: Organic Law No. 2004-63 on the protection of personal data; Instance Nationale de Protection des Données Personnelles (INPDP). Legal review pending; no legal advice is asserted here.
- DeepTunisia project documents: `research/study/protocol.md` (house pattern for pre-registered study design); `output/deeptunisia-release-paper-v0.1.1.md` §10.1; `README.md`.

---

*Version 0.1, 2026-09-14. This protocol is a draft. No participant has been contacted, no data has been collected, and no result described here exists yet.*
