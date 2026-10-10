# Long-horizon plan: from working survey to research institution

**Status:** working document, 2026-09-15.
**Companions:** `execution-plan.md` (the near-term M0 to M7 checklist), `README.md` (platform design), `backend.md` (how data is handled today).

This is the long view: what it takes to go from one survey that runs on a laptop to a program that publishes studies repeatedly. It is written as four horizons, each with a goal, the work, an exit test, and the dependencies that gate it. The near-term checklist in `execution-plan.md` remains the operational plan inside horizon 1.

A boundary stated once, because everything below depends on it: we build freely without waiting for legal or translation work, but real participants are a different gate. No public respondent answers a question until the checks in horizon 1's exit test are met. The dev fielding mode exists so the product can be built and demonstrated now.

---

## Horizon 1: the survey works end to end (now to study 001 fielded)

**Goal:** a respondent can open the study, answer every part of the instrument, submit, receive a receipt, and withdraw; the team can export, aggregate and reproduce the published numbers.

**Work**

1. **Runner completion.** MaxDiff design generated (8 balanced sets of 4 from the 15-item pool), compiled into the runtime instrument, rendered as its own step. Server-side assignment of block order and scale direction at instrument fetch, HMAC-signed and verified at submit. Save-and-resume by local token. Receipt screen and error states polished.
2. **Ingestion and release pipeline.** `studies-export` (rows to CSV), pre-registered exclusions, aggregation into `results.yaml`, the results renderer with the population statement and n asserted on every block, and the verifier that recomputes published tables from the released CSV.
3. **Pretest.** 30 to 60 testers in three locales; completion time, drop-off per item, comprehension flags; the optional-item drop rule applied before freeze.
4. **Review package.** Legal and data-protection review sent and answered; external ethics review; the five roles named. This is the gate, not the work.
5. **Translations.** Contracting, reconciliation, back-translation, 12 to 15 cognitive interviews per locale; instrument v1.0 frozen with a hash.
6. **Pre-register and field.** File the pre-registration pack with the frozen hash, then field for eight weeks with weekly monitoring.

**Exit test:** a published study page with a DOI'd microdata file, a reproducible analysis, a preprint, and every number carrying its population statement. Plus: the platform gates green from a clean clone.

**Depends on:** the human gate (review, translations, roles). Engineering can finish before them, and should.

## Horizon 2: the program publishes (study 001 paper to study 002)

**Goal:** one published study becomes a repeatable program, not a one-off.

**Work**

1. **Publication.** Preprint, journal submission, a methods note on the open online sample benchmarked against probability samples if it stands alone.
2. **Public research surface.** The study page gains its full archive: protocol, instrument, translation report, data, results, paper. The `/research` page becomes a registry of open and closed studies with statuses that mean what they say.
3. **Study 002.** First real reuse test: institutional trust or media trust. A manifest, a protocol, an instrument, a pre-registration. No new routes, no new storage, no new export code. Any need for code is a platform defect to fix, not a per-study patch.
4. **Repeat wave planning.** Decide the Study 001 wave-2 schedule (2027 or 2028) and freeze the trend-series items now, so a second measurement is a version bump.
5. **Findings to agenda.** Every result that opens a question becomes a `data/questions.yaml` record linked to the study, so the graph's research agenda is fed by data rather than by hunch.

**Exit test:** a second study fielded on the same platform with no code changes, and the first study's items re-fielded as a wave with a documented comparison.

## Horizon 3: the institution (studies per year, external standing)

**Goal:** research capacity that outlives any single study.

**Work**

1. **Standing review.** A named methods reviewer and ethics adviser with a written process, not per-study improvisation. Review times published.
2. **Translation pipeline.** A standing shortlist of translators, a brief template, and a translation report format proven twice, so a new instrument does not restart the search.
3. **Funding policy.** Disclosed funding per study, a refusal list (parties, campaigns, foreign governments), and a statement that no funder sees data before publication.
4. **Sampling ambition.** Partnerships with a Tunisian polling firm or university for a probability-based wave of the same instrument, which is the only way to move from "respondents" to "Tunisians" language honestly. The open online wave stays as the fast, cheap arm.
5. **Community of practice.** Outreach to Tunisian academics and journalists; a citation format; a data-use log.

**Exit test:** at least two studies per year, at least one with an external academic co-author, and a published probability-sample comparison.

## Horizon 4: infrastructure that scales (when volume justifies it)

**Goal:** the platform stops being operated by hand.

**Work**

1. **Automated lifecycle.** Scheduled retention purges, automatic D1 backups, alerting on submission anomalies, a close-window job that freezes the dataset.
2. **Staging.** A second Worker and D1 pair for pre-release rehearsal; the current single-environment setup is fine for one team and not for a fielding study.
3. **Cost and capacity model.** Published limits, what a 5,000-response study costs, where the free tier ends.
4. **Public results API and citation surface.** Machine-readable results per study, DOI-per-study, a changelog that a reader can subscribe to.
5. **Instrument toolbox.** Reusable item families across studies, versioned, so a question asked in 2026 can be asked again in 2030 with the same wording and a documented provenance.

**Exit test:** a study can be run by someone who is not the original maintainer, following the runbook, with no direct access to the codebase.

---

## Sequencing and what unblocks what

| Workstream | Blocks |
|---|---|
| MaxDiff + arms + runner | Pretest, then fielding |
| Export + results renderer | Release; needed before close, not before launch |
| Legal and ethics | Fielding only (not building, not demoing) |
| Translations | Freeze, pretest, fielding |
| Pretest | Freeze |
| Pre-registration filing | Fielding |
| Review roles named | Fielding |
| Release + paper | Study 002 start, credibility of the program |

Engineering can run ahead of every human gate. The one thing that must not happen is fielding before them, because a bad first study is worse than a slow one.

## Risks and how the plan absorbs them

- **The first study is thin.** Pre-registered minima mean a thin sample produces describable results and says which models were not run, rather than a fake finding. The pipeline still completes.
- **Translation takes longer than building.** The brief is written and the instrument is structured for handoff; translators can start as soon as the English source is frozen, which is a one-day decision once the protocol is reviewed.
- **One person runs everything.** The runbook and the no-bespoke-code rule are the mitigations; horizon 3's standing review and horizon 4's exit test exist to remove the single-operator dependency.
- **Manipulation.** Pre-registered exclusions, a published fraud audit and sensitivity analyses. The plan does not promise the door is locked; it promises the attempt is visible.
- **Credibility risk.** Every result carries the population statement and the method; every negative finding is published. The institution's asset is the record of doing that repeatedly.

## Success measured honestly

Not sign-ups, not page views. The measures are: studies published with open data; published tables that reproduce from the released files; negative results published; external reuse of the instruments and datasets; a probability-sample comparison; and the time from "study ready" to "study fielded" falling as the platform matures.

---

*Working document, 2026-09-15. Horizon 1 is the current execution plan; horizons 2 to 4 are commitments of direction, not schedules.*
