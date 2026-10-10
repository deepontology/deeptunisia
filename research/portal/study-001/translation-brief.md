# Translation brief: DT Research 001 instrument

**Instrument version:** `dt001-democracy` 0.1.0-draft (`research/portal/study-001/instrument-v0.yaml`).
**Status:** draft brief, 2026-09-15. Written for translators and the translation coordinator.
**Locales:** Modern Standard Arabic (`ar`), French (`fr`). English (`en`) is the source.
**Companion documents:** `protocol.md` §6 (translation protocol), `instrument-v0.yaml` (the item bank), `participant-protections.md` (consent context).

This brief is what a translator receives together with the instrument file and the construct definitions. It states the rules once, then flags the items where the rules are not enough. Nothing here authorises changing an item's meaning: where the source is awkward, the translation is awkward in the same way, and the awkwardness is reported, not repaired.

---

## 1. The study in one paragraph

The questionnaire asks what democracy means to people in Tunisia. Respondents rate how essential each component of democracy is, choose priorities when everything cannot be equally important, rate how present each component is in Tunisia today, and answer a few questions about government and about themselves. It is not a quiz and not a campaign; the instrument records views, it does not test knowledge. Translations must let a reader with a primary education answer the same question a university professor answers, without either of them being pushed toward a particular answer.

## 2. What is translated, and what is not

Translated: every displayed item, every module instruction, every block instruction (MaxDiff, present-in-Tunisia), the consent module, the response-scale anchors, and the option labels listed in section 6.

Not translated, ever: item ids (`ess_core_elections`), response type names, channel codes (`reddit`, `instagram`, `organic`), file paths, and any text marked `platform` in the instrument (locale, experiment arm).

Tunisian Arabic (derja) is not a written questionnaire locale. It is accepted in the single open-text item, and no translation of that item's prompt should imply that only derja is welcome; the prompt must read naturally in MSA and French alike.

## 3. Roles and process

1. Two independent translators per locale, working from the English source and this brief, never from each other's draft.
2. A reconciliation session per locale produces a single draft; disagreements are recorded, not smoothed away.
3. A third translator back-translates the reconciled draft into English without seeing the source.
4. The coordinator and a project editor resolve divergences against the source and this brief.
5. Cognitive interviews: 12 to 15 respondents per locale, mixed education, region and gender. The interview script and log format are in section 9.
6. Items that fail comprehension are revised, retested on the failing subset only, and the revision is logged.
7. The frozen instrument carries the reconciled text and a content hash; the translation report is published with the instrument.

## 4. General rules

- **Fidelity before elegance.** Preserve the proposition, including its strength. Do not soften `the state makes people's incomes equal` into something about reducing inequality, and do not sharpen anything either.
- **One idea per sentence.** The source is written for spoken comprehension. Keep sentences short even where a longer one would be more elegant.
- **Plain register.** No academic vocabulary, no administrative jargon, no foreign-loanword where an ordinary word exists, in either locale.
- **Political neutrality.** Do not import a term that belongs to one camp's vocabulary unless the English uses it. `Free elections` stays `élections libres` and `انتخابات حرة`, not `élections démocratiques` or `انتخابات نزيهة`. If a phrase has a strong partisan charge in Tunisia, note it in the comments column rather than choosing a side.
- **Religious neutrality.** Items about religion and about the state's relation to religion are worded neutrally in English and must stay neutral in both target languages. Do not add or remove a religious reference.
- **Gendered language.** French should avoid constructions that make an item read as addressed to men only, without inventing terminology that changes the question. Arabic uses standard MSA forms; where the mainstream form is grammatically masculine, keep it, and note it if comprehension testing shows women readers hesitate.
- **Numerals.** Western digits (0 to 10) in all locales, matching the response scale and the data capture.
- **The scale, exactly.**
  - `scale_essential`: `0` = the component is against democracy; `1` = not at all an essential characteristic; `10` = definitely an essential characteristic. The `0` option is shown explicitly online (a deviation from interviewer administration) and its label is `research.participate.against` in the interface; the item-level anchor text is part of the instrument and must be translated.
  - `scale_present`: `0` = not at all present; `10` = fully present.
  - `agree_4`: `1` = strongly disagree; `4` = strongly agree.
- **Skip.** Every item carries a skip option, labelled by the interface dictionary, not by the instrument. Do not add "no opinion" to an item's text.
- **WVS anchors take the official translation first.** Items with provenance `wvs7:*` have an official Arabic and French wording produced for the World Values Survey. Use that wording as the starting point, then reconcile it with this brief. Any deviation from the official wording is listed in the translation report with a reason, because comparability with WVS depends on it. The same applies to items marked `arab-barometer` for the French and Arabic wording.
- **Option lists.** Translate every label in section 6. The codes stay as they are; the labels are what respondents read.
- **Comments are required, not optional.** Any item where the translation required a judgement call gets a comment: what was ambiguous, what was chosen, what a back-translation might flip. Silence is only acceptable for items with no judgement call.

## 5. Item notes

### Consent and interface-critical text

| Item | What must survive |
|---|---|
| `consent_read` | "I have read the study information and the participant protections." Plain statement of fact, not a legal waiver. |
| `consent_voluntary` | Voluntary, unpaid, and the right to stop before submitting. Do not suggest that stopping has a penalty. |
| `consent_withdrawal` | The receipt code, deletion while the study is open, and the fact that deletion is impossible after the close. This wording is the participant's only notice of the limit; clarity here outranks elegance. |
| `consent_age` | "18 years old or older", unambiguous. |

### Essentiality items, WVS core

| Item | Construct | Hazard |
|---|---|---|
| `ess_core_elections` | electoral | "Free elections" means unconstrained choice, not "fair" or "clean" administration. Localise as the official WVS wording. |
| `ess_core_civil_rights` | liberal | "State oppression" must remain strong; do not soften to "government mistakes" or "injustice". |
| `ess_core_women` | liberal | Gender equality statement, direct. Do not add "within the limits of religion or law". |
| `ess_core_tax_rich` | redistributive | "Subsidize the poor" is a fiscal statement. Avoid charity language. |
| `ess_core_unemployment_aid` | redistributive | "State aid for unemployment" is a benefit, not charity. |
| `ess_core_incomes_equal` | redistributive | The strongest leveling statement in the battery. Translate it at full strength; it is a measure, not a policy proposal. |
| `ess_core_religious_law` | anti-democratic: religious | "Ultimate" authority over law. Do not make it about personal status or family law only; the item is about legal interpretation. |
| `ess_core_army_takeover` | anti-democratic: military | "When government is incompetent" is the trigger; keep both the takeover and the incompetence. |
| `ess_core_obey` | anti-democratic: authoritarian | "Rulers", not "governments" or "laws". The item is about obedience to persons in power. |
| `ess_core_strong_leader` | anti-democratic: strongman | "Does not have to bother with parliament and elections" carries the dismissive tone; keep it, do not neutralise to "independent of". |

### Essentiality items, extended

| Item | Construct | Note |
|---|---|---|
| `ess_ext_electoral_commission` | electoral | "Independent of the government", not "neutral commission" (different claim). |
| `ess_ext_electoral_choice` | electoral, optional tier | "Real choice" between parties and candidates. |
| `ess_ext_courts` | liberal | "Without pressure from the government" is narrower than "independent courts"; keep the pressure frame. |
| `ess_ext_equality_law` | liberal | "Including those in power" is the load-bearing clause. |
| `ess_ext_press` | liberal | "Without being punished" is concrete; keep it, avoid "without censorship". |
| `ess_ext_speech` | liberal | "Publicly, without fear" joins the public act and the fear. |
| `ess_ext_minorities` | liberal | "Ethnic and religious" both, not one. |
| `ess_ext_no_torture` | liberal | "In custody" scopes it; do not broaden to general violence. |
| `ess_ext_protest` | participatory | "Peacefully" qualifies the protest and must not be dropped. |
| `ess_ext_referendums` | participatory | "Major laws"; direct vote, not consultative. |
| `ess_ext_local_power` | participatory | "Real decision-making power" rules out advisory councils. |
| `ess_ext_civil_society` | participatory, optional tier | Formation and operation, not funding or licensing. |
| `ess_ext_consultation` | deliberative | "Public and experts", before decisions. |
| `ess_ext_informed_debate` | deliberative, optional tier | "Honest information" is part of the claim. |
| `ess_ext_basic_needs` | egalitarian | Access, guaranteed by the state, for everyone. |
| `ess_ext_no_poverty` | egalitarian, optional tier | "Extreme poverty" is the threshold; keep it. |
| `ess_ext_anti_corruption` | egalitarian | "Rank or connections"; use the ordinary local term for connections, not a slang term. |
| `ess_ext_regional_equality` | egalitarian | "Regions outside the capital" and "public investment"; not general development aid. |
| `tun_civil_state` | Tunisia module | "Neutral in religious matters" is the precise claim. Do not translate as secularism, laïcité or a religious state. |
| `tun_army_politics` | Tunisia module | "Stays out of politics". |
| `tun_transitional_justice` | Tunisia module | "Past governments" stays plural and unspecified; do not name a period. |

### Support and regime items

| Item | Note |
|---|---|
| `sup_democracy_preferable` | Use the published WVS or Arab Barometer wording where available; comparability is the point. |
| `sup_democracy_best` | "Democracies may have problems, but they are better..." The concession must remain. |
| `sup_strong_leader` | Same warning as `ess_core_strong_leader`; keep the anti-institutional tone. |
| `sup_govt_economy_unimportant` | "The type of government does not matter as long as..." is deliberately permissive; do not harden into "any government is acceptable". |
| `sup_govt_order_unimportant` | Same construction as the economy item; keep them parallel in both locales. |
| `sup_satisfaction_democracy` | Satisfaction with how democracy works, not with the government. |
| `sup_tunisia_democratic_rating` | A rating of the country, not of the respondent's support. |

### Safety, open text, demographics

| Item | Note |
|---|---|
| `saf_comfort` | Comfort answering, not agreement with the questions. |
| `saf_screen` | "Who else could see your screen"; answer options in section 6. |
| `mod_face_to_face` | The hypothetical face-to-face survey must read as the same interview, so the comparison is meaningful. |
| `open_definition` | "In one sentence, what does democracy mean to you?" Open to derja, MSA, French, English; no prompt in the interface may discourage derja. |
| Demographics | Section 6 carries the option labels. Use official Tunisian terms for education levels and governorate names. |

## 6. Option labels to translate

Codes stay in English in the data; only the labels are translated. Deliver them as a two-column list (code, label) per locale.

- `demo_residence`: inside Tunisia, outside Tunisia, prefer not to say.
- `demo_governorate`: the 24 official governorate names plus prefer not to say. Use the INS spellings.
- `demo_abroad_region`: Europe, North America, Gulf, other Arab country, sub-Saharan Africa, other, prefer not to say.
- `demo_age_band`: 18-24, 25-34, 35-44, 45-54, 55-64, 65 and over, prefer not to say. Keep the bands as ranges, not vague words.
- `demo_sex`: male, female, other, prefer not to say. The census uses male and female; keep those two exact, and translate "other" without euphemism.
- `demo_education`: none, primary, preparatory, secondary, higher, prefer not to say. Use the Tunisian school-system terms.
- `demo_employment`: employed, self-employed, unemployed, student, retired, homemaker, other, prefer not to say.
- `demo_finance`: very good, good, bad, very bad, prefer not to say.
- `demo_political_interest`: very interested, somewhat interested, not very interested, not at all interested, prefer not to say. Keep the four-point gradation exact.
- `demo_religiosity`: very religious, somewhat religious, not religious, prefer not to say.
- `demo_prev_survey`: yes, no, prefer not to say.
- `saf_screen`: alone, family, friends, other, prefer not to say.
- `mod_face_to_face`: the same, more cautious, more open, prefer not to say.

## 7. Consent module

The four consent items are the text a participant agrees to before any data is collected. Translate them literally and completely. Do not compress, do not convert to bullet points, and do not add reassurances the English does not contain. A back-translation that is shorter than the source is a warning sign: check what was dropped. Jurisdiction-specific wording changes are made by counsel, not by translators.

## 8. Back-translation

The back-translator receives the reconciled target-language draft and this brief, but not the English source. They produce an English rendering and a list of any phrase they had to interpret. The coordinator compares the back-translation with the source and flags three categories:

1. **Meaning shift**: the proposition changed. Resolve in favour of the source.
2. **Strength shift**: the proposition survived but weaker or stronger. Resolve in favour of the source.
3. **Ambiguity preserved**: the source is ambiguous and the translation preserved it. Keep it, and note it for cognitive testing rather than deciding it.

## 9. Cognitive interviews

Twelve to fifteen respondents per locale. Recruit for mixed education (at least three with primary or no formal education), mixed region (capital, interior, and at least two elsewhere), mixed gender, and at least one person who took part in no survey before. The interview is done in the locale being tested.

For each item, probe four things: what the respondent thinks the question is asking, what answer they would give, why, and whether any word felt strange or unclear. Read the question aloud and let them read it silently too. Record verbatim comments per item and a comprehension verdict for each: clear, hesitantly understood, misunderstood, or refused. The report lists every item that was not "clear", with the comments verbatim and the revision made.

Also time the full instrument once per interviewer, in each locale, and report the median. The protocol's pretest target depends on this number.

## 10. Deliverables

Per locale, in a single file:

- the reconciled instrument text, in the instrument file's structure, with one row per item id;
- the option-label list from section 6;
- the back-translation and the divergence log from section 8;
- the cognitive-interview log from section 9, verbatim comments included;
- a short translator's note listing every judgement call and every phrase where the source felt ambiguous.

File format is agreed with the coordinator; a two-column CSV keyed by item id is enough, and any longer note goes in a comments column, never in the item text.

## 11. Version and freeze

This brief is pinned to instrument 0.1.0-draft. If the English source changes, the changed items are re-briefed and retranslated; the rest carries over. The frozen translation is the one reconciled, back-translated and cognitively tested, and the instrument's content hash is taken after the freeze, so no translation can move underneath a fielding response.

---

*Brief v0.1, 2026-09-15. Not yet sent to translators. The instrument is a draft; the English source freezes after protocol review.*
