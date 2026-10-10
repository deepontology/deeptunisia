# Legal and data-protection brief: DT Research 001

**Prepared for:** [COUNSEL NAME], counsel and data-protection adviser.
**Prepared by:** [MAINTAINER], DeepTunisia.
**Date:** 2026-09-14.
**Status:** draft for review. This document is not legal advice; it asks for it.
**Decision requested:** a written opinion, a list of required changes, and a go or no-go on fielding.

---

## 1. The study in one page

DeepTunisia is an open-source, source-backed atlas of political power in Tunisia, published at deeptunisia.org. It is adding a research program that runs open online studies of Tunisian public opinion. Study 001 asks what people understand democracy to mean: how essential different components are, which they prioritize when forced to choose, how present those components are in Tunisia today, and their views on government.

Design in brief:

- 100% online, self-administered, open to anyone aged 18 or over, worldwide.
- No payment or incentive.
- Three languages: Modern Standard Arabic, French and English.
- No accounts, no logins, no email addresses, no names, no IP addresses stored with answers.
- A random receipt code lets a respondent delete their response while the study is open; after the dataset is frozen for analysis, deletion is no longer possible, and the consent says so.
- Responses are stored in a Cloudflare D1 database. Raw rows are never published. The public release is an anonymized, coarsened microdata file (CC BY 4.0) plus aggregate results.
- The answers are political opinions. The subject matter (courts, corruption, the army, government performance) is sensitive in the current Tunisian context.

Full design: `research/portal/study-001/protocol.md` (protocol), `instrument-v0.yaml` (questionnaire), `participant-protections.md` (participant protections), all on branch `t3code/research-portal-survey`.

## 2. What we ask of you

1. Assess the design in sections 3 to 8 against the law you consider applicable.
2. Answer the questions in section 9 in writing.
3. List every change required before fielding.
4. State a go or no-go. If no, state what would make it a go.

If the current capture path cannot be made compliant, we need to know now, because the fallback is a different storage path (a Tunisia-hosted capture service, or an offline submission channel) and it changes the build.

## 3. Data flow

1. A participant opens the survey page on the static site, picks a language, reads the consent information and confirms four consent statements.
2. On submission, the browser sends the answers to an API endpoint served by a Cloudflare Worker.
3. Before anything is written, the Worker runs: a bot challenge (Cloudflare Turnstile), a rate-limit check keyed by a salted hash of the connection address (the address itself is not stored, and the salt rotates), a honeypot check and a minimum completion time check.
4. Accepted answers are written to a Cloudflare D1 database used only by the research program. The forum database is separate.
5. During fielding and analysis, the operator exports rows to a working CSV on a local encrypted disk.
6. Exclusion rules and aggregation run offline, on the operator's machine.
7. The anonymized and coarsened microdata is deposited with Zenodo and offered for download; aggregate results are published on the site. The working CSV is purged after the release is verified.

No payment processor, no analytics provider, no advertising network and no survey platform is involved.

## 4. Data collected per response

| Field | Example | Notes |
|---|---|---|
| Study and instrument identifiers | `dt-research-001`, `dt001-democracy`, version and content hash | Identifies the questionnaire version |
| Language | `ar`, `fr`, `en` | |
| Recruitment channel code | `reddit`, `instagram`, `organic` | Channel-level, not person-level |
| Answers, including skips | 0 to 10 ratings, choices, one optional short text | Political opinions |
| Start and submission timestamps, completion time | | Used for quality control |
| Experiment arm | block order, scale direction | Randomization assignment |
| Receipt code | random UUID | The only handle on the row; held by the respondent |
| Consent version | version string | Evidence that consent was given |

Explicitly not stored: IP address, user agent, device or browser fingerprint, geolocation, email, phone number, name, address, social media account, precise date of birth, income figure.

Two qualifications we want you to consider:

- The connection address is necessarily seen by the server for the moment of the request and is used to derive a rotating salted hash for rate limiting. It is not written to any table. Cloudflare may process request metadata (including the address) in its own infrastructure under its terms; we cannot truthfully say no IP address is ever processed, only that we do not store one.
- The Turnstile challenge is a third-party script and processor.

## 5. Why the data is sensitive

- **Political opinions are a special category** under several regimes (for example Article 9 GDPR). We assume comparable sensitivity under Tunisian law and want your view.
- **Quasi-identifiers permit re-identification in the raw rows.** Governorate (24 values), age band, sex, education, language and completion time can together single out a person in a small governorate. We therefore do not claim the raw rows are anonymous. Our mitigations: no direct identifiers; raw rows never published; the public microdata coarsens region into groups, widens age bands and reduces education to three levels; channel and receipt codes are removed before release; crosstabs below a minimum cell size are suppressed; free text is purged after coding and published only as categories, with quotations only under separate explicit permission and after de-identification.
- **The political context.** Decree-Law 2022-54 criminalizes spreading "rumours" and "fake news", and the project has documented prosecutions of journalists and critics under it. A respondent answering questions about courts, corruption and the army could face consequences if identified. The study's entire protection is data minimisation, which is why we are asking before collecting anything.

## 6. Consent and withdrawal

Consent is collected at the start, in the chosen language, with four explicit confirmations: read the information; understand it is voluntary with no payment; understand the receipt and its limits; confirm being 18 or older. The consent version is stored with the response.

Withdrawal model: the respondent receives a random receipt code once. Entering it on a withdrawal page deletes the row, including free text, while the study is open. After the fielding window closes and the dataset is frozen, deletion is impossible because the anonymized dataset has been produced. The consent module states this limit before participation.

## 7. Retention

| Data | Retention |
|---|---|
| Raw response rows | Through fielding and analysis, then replaced by the released anonymized dataset |
| Receipt codes | Deleted with the row on withdrawal or when raw rows are replaced |
| Working export CSV | Purged after aggregation and verified release |
| Open-text raw answers | Purged after coding |
| Released microdata | Permanent, public, CC BY 4.0 |
| Consent records (version and timestamp only) | Retained with the dataset to demonstrate consent |

## 8. Publication

Published: aggregate counts and percentages, the exclusion counts, the fraud audit, the protocol, the instrument with its hash, the translation report, and the anonymized microdata with a codebook. Not published: individual rows, channel-level individual data, free text except coded categories, receipt codes.

## 9. Questions

1. **Applicability.** The operator is established in [JURISDICTION] and participants are expected mainly in Tunisia with a diaspora minority in the EU and elsewhere. Which data-protection regimes apply: Organic Law 2004-63 and INPDP practice, the GDPR, both, or another? Does it matter where the operator is established?
2. **Authorization.** Does this processing require prior authorization, notification, a declaration or an exemption with the INPDP? Is there a research provision we can rely on, and what does it require?
3. **Cross-border transfer.** Is processing in Cloudflare Workers and D1 permissible? Which D1 region should be configured? What contractual or transfer basis is needed, and is a Tunisia-based representative or a local hosting requirement triggered?
4. **Personal data.** On the design as described, is the raw row personal data in your view? Is the coarsened public microdata anonymous? We would rather be told we are under-claiming anonymity than over-claiming it.
5. **Consent.** Is explicit consent sufficient for political opinions under the applicable regime, and does the outline in Annex B meet the standard? What wording changes do you require?
6. **Minors.** Is an 18-and-over self-declaration adequate, and what wording do you recommend on the age gate?
7. **Withdrawal.** Does receipt-based deletion during the open window satisfy the withdrawal requirement? How should the post-freeze limit be handled and worded?
8. **Retention.** Is the schedule in section 7 compliant?
9. **Publication.** Is publishing aggregate criticism of state institutions and anonymized microdata legally exposed under Tunisian law (defamation, press law, Decree-Law 2022-54, or anything else)? What wording should accompany publication, and do you advise any pre-publication review?
10. **Processors.** What do we need in writing from Cloudflare and Turnstile? Any disclosure obligations to participants?
11. **Security and breach.** What minimum technical and organizational measures and breach-notification obligations apply to this design?
12. **Documentation.** Do we need a record of processing, a DPIA or equivalent, and a named data-protection contact?
13. **Participant risk.** Given Decree-Law 54, do you advise changes to the consent, the instrument or the recruitment channels to reduce risk to participants?
14. **Required changes.** List anything that must change in the fields collected, the storage path, the retention schedule, the consent wording, the age gate or the publication model before we can field.

## 10. What we will do with your answer

Every required change will be applied to the protocol, the instrument and the API before build completion, and the design will be re-tested. Fielding is gated on your written go. The plan is in `research/portal/execution-plan.md`, milestone M3.

---

## Annex A. Consent module outline

Before any item, in the selected language:

1. What the study is, who runs it, and the named principal investigator.
2. What participation involves and the expected time.
3. Voluntary, unpaid, and stopping before submission stores nothing.
4. Exactly what is stored and what is not (section 4 in plain language).
5. The receipt mechanism and the post-freeze limit.
6. What is published and how free text is handled.
7. That age, sex, education and location answers are used for weighting and subgroup analysis.
8. Contact for questions and complaints, and the external ethics adviser.
9. Four explicit confirmation checkboxes, recorded with the consent version.

## Annex B. Subprocessors and locations

| Service | Purpose | Data seen | Location |
|---|---|---|---|
| Cloudflare Workers | API execution | Request payload, transient connection address | Global network |
| Cloudflare D1 | Response storage | Response rows | Region to be configured (currently undecided) |
| Cloudflare Turnstile | Bot challenge | Challenge interaction, request metadata | Global network |
| Zenodo | Published microdata and DOI | Anonymous release files only | EU |

## Annex C. Contacts and roles

- Operator: [OPERATOR LEGAL NAME], established in [JURISDICTION].
- Principal investigator: [PI NAME].
- Data-protection contact: [CONTACT].
- Counsel: [COUNSEL NAME].
