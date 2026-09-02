# Participant protections — inter-annotator study

**Status:** research ethics, drafted as clinical framing — never as a "risk premium."  
**Companion:** `protocol.md` (design) + `rubric-v2.md` (the task as administered).  
**Applies to:** the later study execution only (ready to run, not run — no raters recruited pre-award).

This document states, before any rater is contacted, the protections every participant is offered. The language is deliberately clinical and procedural — what participation entails, what data is handled how, how withdrawal works — consistent with a research study in the social sciences. It never characterises participation as carrying a danger premium or a risk surcharge; the study's topic (political power in Tunisia) is not treated as a hazard to be priced, but as a research domain whose participants are afforded standard protections.

---

## 1. Nature of the study

- **What it is:** a measurement of *consistency* — do independent, qualified readers apply the same evidence-grading rubric to the same records and arrive at the same grades? The raters' grades are *about* records, not *by* the project.
- **What it is not:** an investigation of the raters; an evaluation of political views; a publication of who said what about whom. The raters are the measurement instrument, not the subject.
- **What is being tested:** the *rubric*, not the people. Low agreement is a finding about the rubric's underspecification (see protocol §2), not about rater performance.

---

## 2. Eligibility and recruitment

- Raters are invited, not crowdsourced, because the required skill set is scarce (Arabic + French fluency, Tunisian institutional literacy, rubric application — protocol §4).
- Invitation describes the task, the time estimate (20–30 hours across 2–3 weeks, self-paced), the compensation, and this protections document. No one is obliged to accept, and non-participation has no consequence.
- Eligibility is verified by a short screening (source excerpt comprehension in Arabic and French; 5-record practice set). Screening results are not published.

---

## 3. Pseudonymous participation

- On acceptance, each rater is assigned a **pseudonym** (`Rater A`, `Rater B`, `Rater C`) by the coordinator. The mapping from pseudonym to real identity is held **only** by the coordinator, stored encrypted, and is not shared with other raters, with the project's editors, or with readers of the published study.
- **Published outputs use pseudonyms only.** The anonymised grading dataset is `rater × record × grade` with pseudonyms (protocol §8.2, item 2). No individual judgments are published with a real name, affiliation, or identifying detail.
- Coordination messages (e.g. practice feedback) are routed through the coordinator, not directly between raters, so raters do not learn each other's identities.
- Raters may elect to be named in an acknowledgements line; the default is pseudonymous and no one is asked to justify their preference.

---

## 4. Voluntariness and withdrawal

- Participation is voluntary. A rater may **withdraw at any point**, for any reason, without explanation — before the study starts, between Round 1 and Round 2, or during grading.
- On withdrawal:

  - Grades already submitted up to the withdrawal point are **retained** in the analysis *unless* the rater requests deletion — in which case they are deleted in full, and the analysis is recomputed over the remaining raters (the report notes the withdrawal and the recomputation).
  - No penalty, no forfeiture of compensation already earned pro rata (see §7).
  - The rater's pseudonym and contact record are deleted on request.
- There is no recruitment target that must be met by compulsion; if a rater withdraws, the study proceeds with the remaining raters or, if below two, is paused until a replacement is recruited (replacement grades independently; no retroactive reconciliation).

---

## 5. No publication of individual judgments

- The study **never publishes** a table of the form "Rater A graded record X as Y (and was wrong)". The published κ/α are **aggregate** measures; the disagreement taxonomy (§6 of protocol) is coded in the abstract ("3 disagreements were rubric-ambiguity on `inferred` vs `reported`"), not as named blame.
- Per-record anonymised grades (`Rater A: B/reported, Rater B: C/inferred, …`) are published only as the aggregate dataset that κ/α are computed from, under pseudonyms, with no link to real identities. This is the minimum disclosure that makes the statistic recomputable.
- Raters are not ranked, scored, or compared as performers. The language of the report is about the *rubric* ("the rubric under-specifies X"), never about a rater ("Rater B was lenient").
- Individual grading sheets (CSVs with real-name headers, if any) are **not** published and are deleted after the anonymised dataset is published and verified.

---

## 6. Risk and sensitivity briefing

The records being graded concern political, military, security and economic power in Tunisia (1956–2026). Some records name living public figures (heads of state, ministers, party leaders) and state institutions. Raters are briefed, before grading:

- **What the records are:** source-backed claims already published on deeptunisia.org, graded by their evidence (confidence/basis), with sources and excerpts shown. The rater's task is to *grade the evidence*, not to assert new facts about the person.
- **What the records are not:** raters are not asked to produce new claims about any person, nor to publish any judgment under their own name.
- **Handling of sensitive names:** grading is an *analytic* act ("this record's sources support grade B/reported"), not a *declarative* one ("X is guilty of Y"). Raters' grades are about the record's *evidentiary standing*, and are stored and published only as anonymised grades (§5). This distinction is emphasised in training.
- **Data handling:** the blinded prompts contain only material already published or cited on the site; no non-public personal data is included. Raters work locally on CSVs; submission is via an encrypted channel (Signal/encrypted email) to the coordinator, not via a shared folder other raters can access.
- **Mitigations:**

  - Pseudonymity by default (§3).
  - Encrypted storage of any mapping and of submitted CSVs (at-rest encryption, coordinator's device).
  - No requirement to disclose location, affiliation, or nationality beyond what eligibility screening needs.
  - The coordinator is the sole holder of the identity mapping; editors of the main dataset do not receive it.
  - Raters may use a pseudonymous email for all study correspondence if they prefer.
- **No incentives framed as hazard pay.** Compensation is for time and expertise (research participation), at a rate benchmarked to professional research assistance in the relevant labour market — the clinical framing required by protocol §4. It is not described as a premium for risk, and no participant is asked to accept a risk premium.

If, during grading, a rater encounters a record they find personally sensitive or wish not to grade, they may mark it `unsure` or skip it (treated as missing for κ/α) and note the reason privately to the coordinator. No explanation to other raters is required.

---

## 7. Compensation

- Compensation is a **fixed fee for participation**, paid in two instalments (after Round 1, after Round 2), pro rata if withdrawal occurs between rounds.
- The fee is for *time and expertise* as a research participant — fluent bilingual reading, institutional knowledge, and consistent rubric application — not for producing a particular κ, not for grading faster, and not for reaching agreement. There is no bonus for high agreement and no penalty for low agreement.
- Method of payment is arranged privately with each rater (bank transfer, payment platform, or other mutually agreed channel). Payment records are kept only for accounting (see §8) and are not linked to pseudonymous grades in any publication.
- The **amount** is stated in the funding proposal's budget and is not disclosed per rater in the study report.

---

## 8. Data handling and retention

| Data | Stored where | Access | Retention |
|---|---|---|---|
| Pseudonym ↔ real identity mapping | Coordinator's encrypted store only | Coordinator only | Deleted after anonymised dataset is published and verified |
| Per-rater submitted CSVs (with real-name header, if any) | Encrypted at rest, coordinator device | Coordinator only | Deleted after pseudonymised extraction + verification |
| Anonymised grading dataset (`rater × record × grade`, pseudonyms) | Public repository (`research/study/grading-dataset.csv`) after publication | Public (anonymised) | Permanent, versioned |
| Kappa/alpha reports | `research/study/kappa-report.json` + markdown | Public | Permanent |
| Disagreement taxonomy coding | `research/study/disagreement-taxonomy.md` | Public (aggregate, not per-rater) | Permanent |
| Compensation / accounting records | Private ledger | Coordinator / funder only | Per funder's retention policy; not published with grades |

No grading data is sent to a third-party analytics service. The only copies are the coordinator's encrypted store and, after publication, the public anonymised dataset.

---

## 9. Consent

Before grading begins, each rater receives this document, `protocol.md`, and `rubric-v2.md`, and confirms in writing (email is sufficient) that they:

- have read all three;
- understand that participation is voluntary and withdrawal is without penalty (§4);
- understand that their grades will be published only in pseudonymised, aggregate form (§5);
- understand the sensitivity briefing and data-handling provisions (§6, §8);
- consent to participate.

Consent may be withdrawn in the same way as participation (written notice; §4).

---

## 10. Contact and oversight

- **Study coordinator:** the project's principal investigator (contact as listed in the funding proposal's cover page). All participant communication routes through the coordinator, not through the dataset editors.
- **Questions about protections:** may be raised with the coordinator at any time, pseudonymously if preferred, before or during the study.
- **Complaints:** a rater who believes protections have not been honoured may raise the concern with the coordinator, and — if unresolved — with the funder's research-integrity contact (named in the grant agreement, not in this document).

---

## 11. Relation to the data-protection regime

This study's data handling (pseudonymised grades, encrypted mapping, public anonymised dataset) is compatible with the project's general data-protection posture: the dataset itself already treats claims about living persons as graded, sourced, and retractable (corrections are first-class records). The study adds no new personal data about third parties to the graph — it grades existing records — and the only personal data it creates about raters is the pseudonym mapping (deleted after publication) and compensation records (accounting only).

A full Data Protection Impact Assessment is filed with the grant deliverables if the funder requires one; this document is the study's internal protections text, not a substitute for jurisdiction-specific legal advice.

---

*Version 1.0 — 2026-09-02. Companion to protocol v1.0; both versioned together. No raters contacted under this version pre-award.*
