# DeepTunisia Research: portal and program design

**Status:** design, 2026-09-14. Workshop document. No route, no schema, no API and no public surface exists yet.
**Scope:** how studies are run, stored, released and reused. Study 001 is the first instance (`study-001/protocol.md`).
**Related:** `output/deeptunisia-release-paper-v0.1.1.md` §10.1 (the house pattern for a pre-registered study); `research/study/protocol.md` (the inter-annotator study instrument).

---

## 1. What this is

A reusable platform for open studies of Tunisian public opinion and attitudes, built in-house, hosted on DeepTunisia. The knowledge graph remains the product; this is a second, separate product line that collects observations from people and publishes them under the same evidence discipline as everything else.

The platform exists so that Study 001 is a configuration, not a codebase. A new study adds a protocol, an instrument and a registry entry. It does not add routes, storage or export code.

The platform does **not**:

- feed survey responses into the graph or into any graph statistic;
- produce claims about Tunisia or Tunisians. It produces findings about respondents;
- reuse Agora identities, threads or database tables;
- run third-party analytics, advertising or session recording on any study route;
- claim representativeness for a sample that has no probability of selection.

## 2. Non-negotiables

These mirror the project's existing rules and are enforced in the platform, not left to discipline.

- **R1. Two data classes, never merged.** Survey responses are observations. Graph claims are claims about the world. A study may cite its dataset as a source; it may never render a percentage as a fact about a population.
- **R2. The population qualifier travels with the number.** Every aggregate renders with the population statement (protocol §4.3) attached in the same block. A number without its qualifier is a build failure, not a style preference.
- **R3. Pre-registration before fielding.** A study cannot move to `fielding` without a pre-registration entry, a frozen instrument hash, an ethics review reference and a consent version.
- **R4. Instrument versions are immutable.** Once a version is referenced by a fielding study, its content hash is frozen. Any edit produces a new version; the old one stays readable forever.
- **R5. Human translation only.** Instrument text in Arabic and French is authored by humans with reconciliation and back-translation (protocol §6). No machine output enters an instrument file.
- **R6. No identifiers.** No IP address, user agent, device fingerprint, geolocation, email, name or social account is stored with a response. Rate limiting uses a rotating salted hash, as in `community/ratelimit.ts`.
- **R7. Exclusions are public.** Every exclusion rule and its count is published. Nothing is dropped silently.
- **R8. Negative results are published.** A failed factor structure, a MaxDiff design that underperforms, an underpowered sample: all reported with the same care as a clean result.

## 3. The Study object

A study manifest is the unit of the program. Proposed schema for `data/studies/studies.yaml` (validator sketch in §10):

```yaml
- id: dt-research-001
  slug: democracy
  title_en: "What Does Democracy Mean to Tunisians?"
  title_fr: null            # human translation
  title_ar: null            # human translation
  status: design            # proposed | design | ethics-review | frozen | fielding | closed | analyzed | published | archived
  design_type: cross-sectional-online
  population: open-online-18-plus
  population_statement: null  # required once status >= fielding
  locales: [en, fr, ar]
  ethics_review: null         # reference once reviewed
  data_protection_review: null
  preregistration: null       # url or repository path, required at fielding
  instrument_versions:
    - id: dt001-democracy
      version: 0.1.0-draft
      hash: null
  fielding_window: null       # {start, end}
  target_n: 1500
  realized_n: null
  weighting: raking-ins-2024
  data_license: CC-BY-4.0
  funding: null
  pi: null
  outputs: []                 # dataset DOI, paper DOI, results page, questions
  created: 2026-09-14
  updated: 2026-09-14
```

Lifecycle gates:

| Transition | Requires |
|---|---|
| `design` → `ethics-review` | Protocol and instrument draft complete; protections document written |
| `ethics-review` → `frozen` | Ethics sign-off; translation report; pretest report; instrument hash; data-protection review |
| `frozen` → `fielding` | Pre-registration published with the hash; population statement written; study page drafted |
| `fielding` → `closed` | Fielding window ended; dataset exported and frozen; exclusion counts computed |
| `closed` → `analyzed` | Analysis complete; aggregate file written; released microdata verified |
| `analyzed` → `published` | Population statement on every surface; DOIs minted; results pages live |
| any → `archived` | Retraction or supersession, with a reason and a link to the successor |

## 4. The Instrument object

An instrument is an immutable, versioned item bank (`study-001/instrument-v0.yaml` is the draft form). Required fields per item: `id`, `module`, `tier` (core, extended, optional), `construct`, `provenance`, `text_en`, `text_fr`, `text_ar`, `response`, `required`. A machine-readable `content_hash` covers the item text, response types and block designs; the hash travels with every stored response.

Rules the schema enforces:

- Every item has a construct and a provenance (`wvs7:Q243`, `arab-barometer:...`, `adapted:...`, `project`, `platform`). Nothing untraceable.
- A fielding instrument has no `null` text on displayed items in any locale it declares. Platform-recorded items (`response: auto`) are never displayed and carry no text by design. Draft instruments may be null and are not fieldable.
- The MaxDiff design is generated once and frozen with the instrument; the constraints (item frequency, position balance, pair balance) are recorded and checked.
- `optional` items are droppable only by the pre-registered rule, and only before fielding starts.

## 5. Where things live

| Data | Location | Committed? |
|---|---|---|
| Program design, protocols, instrument drafts, translation reports, analysis scripts | `research/portal/` (workshop, force-added for review like `research/study/`) | No by default; force-added when published |
| Study registry, frozen instruments, aggregate results | `data/studies/` (canonical, build-validated) | Yes |
| Raw responses | Cloudflare D1, separate binding, separate database from Agora | Never in git |
| Export working files (response CSV before aggregation) | `research/portal/<study>/data/` | No; purged after release |
| Released microdata, codebook | Zenodo deposit plus `static/` download | Released artifact, not a source file |
| Analysis outputs | `research/portal/<study>/analysis/out/` | Force-added with the release |

The canonical location is a proposal to be settled in Phase 1. The alternative is a top-level tracked `studies/` directory mirroring `feed/`. The deciding requirement is the same either way: a `test-studies.ts` assertion that no study record is counted in any graph statistic, and that the graph build does not read the study store. `data/studies/` is recommended because published studies belong under the same CC BY 4.0 data license and the same validation pipeline, with the separation enforced by test rather than by directory convention.

## 6. Submission path

The submit API is a new module beside `community/`, sharing its constraints but none of its tables or identity machinery.

| Endpoint | Method | Purpose |
|---|---|---|
| `/api/studies/:slug/instrument` | GET | Current frozen instrument for the locale, with hash |
| `/api/studies/:slug/submit` | POST | Validated response; returns the receipt id |
| `/api/studies/:slug/withdraw` | POST | Receipt id deletes the row during the fielding window |
| `/api/studies/:slug/count` | GET | Approximate completed count, cached; never per-response |

Constraints:

- A `RESEARCH_OPEN` flag gates writes, separate from `AGORA_OPEN`. No public surface may describe a study as open while the flag is off.
- The server validates every submitted item id against the frozen instrument hash, so a response against a changed instrument is rejected.
- Turnstile (or the chosen CAPTCHA) and edge rate limiting run before a row is written; a honeypot field and a minimum completion time are checked at write time.
- Stored payload: the fields listed at the end of `instrument-v0.yaml`. Nothing else. No free-text field other than `open_definition`, length-capped and purged after coding.
- The receipt id is a random UUID returned once. It is the only handle on a response. The consent states that this makes the row pseudonymous, not strictly anonymous, and that deletion is impossible after the dataset is frozen.
- No read endpoint returns individual responses, ever, to anyone, through the API. Exports are an offline operator procedure against the database, producing the released artifacts.
- The database never stores the research code from the graph; the platform does not import `src/generated/`.

## 7. Export and release path

1. Close the fielding window; the write endpoint is disabled.
2. Export responses to a working CSV (operator step, audited).
3. Run the exclusion rules mechanically; record counts per rule and per channel.
4. Run the analysis scripts; write `data/studies/<study>/results.yaml` (aggregates, n, weighted and unweighted estimates, exclusion counts, fraud audit).
5. `npm run studies:build` validates `results.yaml` against the schema, checks that every aggregate carries its population qualifier and its realized n, and emits `src/generated/studies.json` plus static exports.
6. Deposit the anonymized microdata and codebook to Zenodo; record the DOI in the study manifest and on the data page.
7. Publish results pages from the committed aggregates. The build never reads D1.
8. A repository check recomputes the published aggregate tables from the released microdata and fails if they disagree.

## 8. Routes and interface

| Route | Rendering | Contents |
|---|---|---|
| `/research` | Static | Program statement, active and closed studies, charter link |
| `/research/[slug]` | Static | Purpose, what is asked, time estimate, protections, participate button, status |
| `/research/[slug]/participate` | Dynamic | Instrument, locale switch before start, progress, save-and-resume by local token, consent module, receipt on completion |
| `/research/[slug]/methodology` | Static | Protocol, instrument version and hash, translation report, sampling, weighting, exclusions, ethics |
| `/research/[slug]/results` | Static from aggregates | Findings, each number with the population statement; charts with table alternatives |
| `/research/[slug]/data` | Static plus deposit link | Microdata download, codebook, DOI, license |
| `/research/[slug]/paper` | Static | Preprint and paper links, citation block |
| `/research/[slug]/withdraw` | Dynamic | Receipt entry, deletion confirmation |

Interface rules: the survey is added to `src/lib/views.ts`, with `nav.research`, `guide.research.*` keys in all three locales, the README views table updated, and test-i18n parity green. Survey item text comes from the instrument file, not the dictionary; only chrome strings use i18n. `participate` and `withdraw` are the only dynamic routes; the rest prerender. Every chart has a table alternative. No dark patterns, no forced email, no cross-study tracking, no third-party requests on these routes.

The `/research` route is a document route like `/about`: no time dock, normal scrolling.

## 9. Relationship to the rest of the site

- **Graph:** untouched. A study record may appear on a question or hypothesis page as `origin: dt-research-001`, and a survey finding may become a new `questions.yaml` entry. No survey item becomes a graph claim.
- **Agora:** separate surface, separate database, separate identity model. Discussion of a study happens in Agora if it happens; participation never does. They do not share a database, a user id or a content register.
- **Feed:** unrelated; the feed's separation test is the precedent for `test-studies.ts`.
- **Corrections:** survey errors and instrument errata use the same corrections path as graph corrections.

## 10. Validator sketch (for Phase 1)

| ID | Rule |
|---|---|
| S1 | Study ids and slugs unique; status in the enum; transitions cannot skip a gate (enforced by required fields per status). |
| S2 | Every instrument item has construct and provenance; fielding instruments have no null locale text on displayed items. |
| S3 | A fielding study has preregistration, ethics reference, protections URL, population statement and frozen instrument hash. |
| S4 | Every aggregate has n, weighted and unweighted values, weighting method and the population statement key. |
| S5 | No file under `data/studies/` is read by the graph build, and no study record appears in `dataset.json` or any graph statistic. |
| S6 | Released microdata DOI is recorded before status `published`; results.yaml hash matches the deposited artifact. |
| S7 | Chrome strings for study routes exist in en, fr and ar (test-i18n). |
| S8 | No rendered results block contains a population claim without the qualifier (renderer-level assertion). |

## 11. Governance

The public charter is a Phase 0 artifact of its own. Its required contents:

- pre-registration before fielding; instrument hash published;
- negative and null results published;
- data CC BY 4.0, code MIT, raw responses never published;
- funding disclosed per study before fielding; no party, campaign or foreign-government funding; no funder veto;
- named roles: principal investigator, methods reviewer, ethics reviewer, data steward, with conflicts disclosed;
- participant complaint channel and an external advisor named on the study page;
- stopping rule and incident plan (protocol §12);
- corrections and retraction path shared with the graph.

Roles are named per study, not held implicitly by the project. A study without named roles is not fieldable.

## 12. Study 002 and beyond

Candidate studies, each reusing the platform: institutional trust, corruption perception, media trust, freedom of speech and self-censorship, political priorities, historical memory, and a repeat wave of Study 001 for trend measurement. A new study ships a manifest, a protocol, a protections document, an instrument and a pre-registration. No new routes. No new storage. No new export code.

The repeat wave deserves a note: the platform's value grows with a second measurement. Design Study 001's items so that a wave 2 in 2027 or 2028 is a version bump, not a redesign, and record in advance which estimates are the trend series.

## 13. Deliberately not built yet

- A standing panel or respondent accounts. Panels are an institutional burden and a privacy surface; build one only after two cross-sectional studies work.
- Live results during fielding. Interim numbers invite manipulation and misreading; counts are shown, findings are not.
- Per-study bespoke code. If a study needs a new interaction, it belongs in the instrument schema or it is out of scope.
- Public raw response browsing. Individual rows are never browsable, at any aggregation level below the release rules.
- Incentives, lotteries or prize draws.

## 14. Open decisions before Phase 1 code

1. Storage jurisdiction: whether Cloudflare D1 satisfies the data-protection review or an alternative capture path is required.
2. CAPTCHA choice: Turnstile is the presumptive option; confirm accessibility and privacy review.
3. Pre-registration platform: OSF, AsPredicted, or an in-repo preregistration document with a timestamp and hash.
4. Aggregation release thresholds: minimum cell size for published cross-tabs, and whether channel-level breakdowns are published.
5. Retention windows: raw responses and open-text purge schedule.
6. Roles: who holds PI, methods review, ethics review and data stewardship for Study 001.
7. Canonical location: `data/studies/` versus a top-level `studies/` directory.

---

*Design v0.1, 2026-09-14. Nothing described here is built. No participant has been contacted.*
