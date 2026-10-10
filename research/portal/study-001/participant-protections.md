# Participant protections: DT Research 001

**Status:** draft, 2026-09-14. Not reviewed by counsel. No participant has been contacted.
**Companion documents:** `protocol.md` (design); `instrument-v0.yaml` (the instrument); `../README.md` (platform).
**Applies to:** the online survey "What Does Democracy Mean to Tunisians?" only.

This document states, before anyone is invited, what participation involves, what is stored, what is not, and what cannot be promised. The language is deliberately plain. It does not describe participation as risky and it does not describe it as safe; it states the facts a person needs to decide.

---

## 1. What the study is

A public opinion study about what people understand democracy to mean. It asks respondents to rate how essential different things are to democracy, to choose between them when forced, to say how present they are in Tunisia today, and their views on government. It is not a vote, not a petition, not a campaign, and not affiliated with any party, government or movement.

## 2. Who can take part

Anyone aged 18 or over. There is no residence requirement: people inside Tunisia and in the diaspora can both take part. Location is asked as a question, not used as a gate. People who report being under 18 are not admitted and no data about them is stored.

The study is open: there is no invitation list and no quota. That also means the study cannot say it is representative, and it never will.

## 3. Voluntariness and no incentive

Participation is voluntary. There is no payment, no prize, no lottery and no donation tied to completion. A person may stop at any point before submitting, and nothing is stored until submission. Skipping individual items is allowed, including sensitive ones; the survey records a skip rather than forcing an answer.

## 4. What is stored

Stored with each submitted response:

- the study identifier and the exact instrument version and hash;
- the language used and the recruitment channel code (for example `reddit`, `instagram`, `organic`);
- the answers themselves, including skipped items;
- start and submission timestamps and the time taken;
- the experiment arms assigned (block order, scale direction);
- a random receipt code.

Never stored: IP address, user agent, device or browser fingerprint, precise location, email address, phone number, name, social media account, or any other identifier. There are no accounts, no logins and no cross-site trackers. Rate limiting uses a rotating salted hash of the connection address that cannot be reversed and is not stored with the response.

## 5. Anonymity, stated precisely

The response is pseudonymous, not strictly anonymous. The receipt code is the only handle on it, and the respondent holds it. The study team can see the response row but cannot connect it to a person, because nothing identifying is stored. Two limits are stated rather than hidden:

1. A person's network operator, employer or device could in principle see that they visited the survey site, though not what they answered. The study cannot protect against that. Using a private browsing window and a personal connection reduces it.
2. Free-text answers can contain identifying details the respondent writes themselves. The survey asks people not to include names or identifying details, and the free-text field is optional.

## 6. Withdrawal

The submission receipt is shown once at the end. Saving it allows the respondent to delete their response while the study is open, using the withdrawal page. After the fielding window closes and the dataset is frozen for analysis, deletion is no longer possible. The consent module states this before participation, not after.

Deleting a response deletes the row and everything in it, including free text.

## 7. What is published

Only aggregates are published: counts and percentages by item, by respondent group and by study. A minimum cell size (to be fixed before release, see portal README §14) is applied to every published crosstab, so no published table can isolate a small group of respondents.

Free-text answers are coded into categories first. Raw text is purged after coding. A verbatim quotation is published only with the respondent's explicit permission, collected separately, and only after removing identifying details. No individual response, coded or raw, is ever published with the receipt code or channel code attached.

## 8. Data handling

| Data | Stored where | Access | Retention |
|---|---|---|---|
| Response payload | Project database (Cloudflare D1), separate from the discussion layer | Study team only | Through the fielding window and analysis; then replaced by the released anonymized dataset |
| Receipt codes | Same row, random UUID | Nobody can map a receipt to a person; the respondent holds the receipt | Deleted with the row on withdrawal, or when the frozen dataset replaces raw rows |
| Export working CSV | Operator machine, encrypted at rest | Data steward only | Purged after aggregation and release |
| Released microdata | Zenodo deposit and the site's data page, CC BY 4.0 | Public | Permanent |
| Open-text raw answers | Same row | Study team only | Purged after coding |
| Consent records | Same row (version and timestamp only) | Study team only | Retained with the dataset to demonstrate consent |

No data is sent to third-party analytics, advertising or survey platforms. There is no Google reCAPTCHA on the survey. The bot check is a privacy-preserving challenge; the provider name and the fact of its use are stated on the consent screen.

Storage location and retention are subject to the pending data-protection review. If the review requires a different storage path, the capture design changes before fielding rather than after.

## 9. Bot and manipulation defence, disclosed

The study expects attempts to manipulate an open political survey and says so. The defences are: a CAPTCHA challenge, connection rate limiting, a hidden field that people do not see but automated submissions fill, a minimum completion time, and post-hoc detection of near-identical response patterns. A fraud audit is published with the results: counts by channel, exclusions by rule, duplicate incidence, completion-time distribution. The audit reports aggregates only.

These measures can wrongly flag a genuine fast respondent. The published exclusion rule and the sensitivity analysis with and without flagged responses exist so that a reader can see the size of the effect rather than trust the filter.

## 10. Risks

The subject matter is political. In the current Tunisian context, speech about politics, courts, corruption and the army can attract official attention (Decree-Law 2022-54 on "rumours" and "fake news" is the relevant instrument, and the project has documented arrests of journalists under it). The study's protection is data minimisation: there is no identifying record to seize, request or leak. The study cannot guarantee that no risk exists; it can state exactly what is stored and what is not, and let each person decide.

If a respondent finds an item distressing or sensitive, they can skip it. The survey ends with a short note and no obligation to explain.

## 11. Consent module (outline, to be finalized with counsel)

Before any item, in the selected language:

1. What the study is and who runs it, with the PI named.
2. What participation involves and how long it takes.
3. That participation is voluntary and unpaid, and that stopping before submission stores nothing.
4. What is stored and what is not (section 4 above, in plain language).
5. The withdrawal mechanism and its limit (section 6).
6. What is published and the free-text handling (section 7).
7. That location, age, sex, education and other demographic answers are used for weighting and subgroup analysis.
8. Contact for questions and complaints, and the external ethics advisor.
9. Explicit confirmation checkboxes, recorded with the consent version.

## 12. Oversight, contact and complaints

- **Principal investigator:** to be named on the study page before fielding.
- **External ethics advisor:** to be named before fielding.
- **Complaints:** a respondent who believes these protections were not honoured can contact the study address published on the study page. Complaints are logged and answered; the log is summarized in the release notes without identifying the complainant.
- A person who asked for deletion and believes it did not happen can say so through the same channel; deletion is verified against the operator's records.

## 13. Relation to Tunisian data-protection law

The project's posture is data minimisation: no direct identifiers, no location tracking, no third-party processors on the survey route, retention limited to the research purpose. The applicable framework review (Organic Law No. 2004-63 and the INPDP) is pending and is a gate on fielding, not a formality. This document is an internal protections text, not legal advice.

---

*Version 0.1, 2026-09-14. Draft. No participant has been contacted under this or any prior version.*
