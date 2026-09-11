# Kind-migration recommendations: 10 proposed relabels

Status: **research recommendations only, pending the maintainer's sign-off.** No
canonical file under `data/` was edited in this pass. These rows do not claim the
relabel has been applied; they say what the cited evidence supports and, where a
primary record exists, what to add so kind can stay `documented`.

Method: read each record in `data/positions.yaml`, `data/relationships.yaml`,
`data/events.yaml` and every cited source in `data/sources.yaml` in full.
`output/kind-migration-review.md` excerpts were treated as leads only.
For `source-it` rows the named record was located and read (or its PDF text
extracted) before being listed here.

Failure vocabulary used in this pass: **confirm** (reclassify to `reported`),
**source-it** (keep `documented`; add the named tier-1 record),
**reject** (kind already correct as `documented`), **defer** (cannot settle now).

| id | kind | recommendation | research confidence | one-line reason |
|---|---|---|---|---|
| p-audit-abdelkader-zgolli | positions | source-it | high | JORT n° 60/2011 contains decree 2011-1097 naming Zgolli; JORT n° 42/2014 contains decree 2014-1768 ending his functions. |
| p-cassation-hedi-guediri | positions | source-it | high | JORT n° 48/2017 contains decree 2017-81 naming Hedi Guediri; only the 2018 end date still rests on Wikipedia. |
| p-onat-abdessattar-ben-moussa | positions | confirm | medium | Bar elections are not published in JORT and no verifiable ONAT register was found; the cited list is encyclopaedic. |
| p-speaker-ghannouchi | positions | confirm | medium | Axios reports the 2021 freeze, not the 2019-11-13 election; no accessible ARP or gazette record of the speakership. |
| rel-beatrix-rhein-marzouki-family | relationships | confirm | high | Both cited sources are Wikipedia; no civil record is public, and the record's own note says none was located. |
| rel-kais-saied-rached-ghannouchi-political-conflict | relationships | confirm | high | Axios and Reuters report the underlying acts; "political conflict" is a characterization no document states. |
| rel-slim-ennaceur-mohamed-ennaceur-family | relationships | confirm | high | Two obituaries plus Wikipedia report the parentage and death; no public record establishes them. |
| arrests-feb-2023 | events | confirm | high | Reuters reports an arrest wave sourced to lawyers; no public prosecutor or Interior record is held or located. |
| mabrouk-appeal-2026 | events | confirm | medium | TAP (tier 4) reports the appeal outcome; no published judgment or court communiqué was located. |
| sentences-july-2025 | events | confirm | medium | Reuters (tier 3) reports the verdicts; the judgment itself is not public in the held evidence. |

---

## p-audit-abdelkader-zgolli — source-it

The only cited source is `wikipedia-audit-court-tunisie` (tier 4), which lists
the 2011-08-06 to 2014-03-17 tenure but holds no record. The primary records
exist in the JORT and are public:

- **Start**: Décret n° 2011-1097 du 6 août 2011, nominating Abdelkader Zgolli
  ("Zghoulli" in the French translation), conseiller à la cour des comptes, as
  premier président de la cour des comptes. JORT n° 60/2011, p. 6.
  https://lake.jort.tn/journal-officiel/fr/2011/060.pdf (Arabic:
  https://lake.jort.tn/journal-officiel/ar/2011/060.pdf)
- **End**: Décret n° 2014-1768 du 26 mai 2014, "Est mis fin aux fonctions de
  Monsieur Abdelkader Zgolli en qualité de premier président de la cour des
  comptes à compter du 17 mars 2014." JORT n° 42/2014, p. 1331. The same issue
  (décret n° 2014-1770) appoints Abdellatif Kharrat to the post effective the
  same date. https://lake.jort.tn/journal-officiel/fr/2014/042.pdf

Adding both as tier-1 sources would let this record keep `documented` and retire
its V25 exception (grade A, no tier-1/2 source).

## p-cassation-hedi-guediri — source-it

The cited source is `wikipedia-cour-cassation-tunisie` (tier 4). The canonical
record's own `reasoning` already points at the right instrument but does not
cite it: **Décret Présidentiel n° 2017-81 du 14 juin 2017, portant nomination du
premier président de la cour de cassation**, Article 1: "Monsieur Hedi Guediri,
magistrat de troisième grade, est nommé premier président de la cour de
cassation." JORT n° 48 of 16 June 2017, p. 2143.

- Text: https://9anoun.tn/fr/kb/jorts/jort-2017-048-5baca/decret-presidentiel-ndeg-2017-81-du-14-juin-2017-portant-nomination-du-premier-president-de-la-cour-de-cassation-4
- PDF: https://lake.jort.tn/journal-officiel/fr/2017/048.pdf

The start date (2017-06-14) is fully established by this decree. The **end date
2018-11-09 still rests on Wikipedia**; the successor's appointment or Guediri's
cessation decree was not located in this pass (JORT 2018 search did not surface
it). Cite 2017-81 first; treat the end date as a separate research gap.

## p-onat-abdessattar-ben-moussa — confirm

`wikipedia-onat` (tier 4) is the only source. ONAT elections are internal; JORT
searches for "bâtonnier" return the 1989 statute and delegation texts, not
election results, and the order's website (onat.tn) was unreachable in this
pass. The Wikipedia list itself cites a former bâtonnier's personal site
(chawkitabib.info), also not tier 1/2. Nothing found establishes a 2004-2007
mandate; keep the claim reported.

## p-speaker-ghannouchi — confirm

`axios-saied-2021` (tier 3) reports the 25 July 2021 sack/freeze and describes
Ghannouchi as speaker; it does not state the 13 November 2019 election or the
record's start date. The ARP elects its speaker by internal vote; this is not a
JORT act. The ARP portal's archived 2019-2021 pages were not retrieved in a
verifiable state (Wayback was intermittently offline), so no tier-2 record can
be named with confidence. Keep reported; if the ARP's procès-verbal of
13 November 2019 is retrieved, that would be the document to add.

## rel-beatrix-rhein-marzouki-family — confirm

Cited are `wikipedia-premiere-dame-tunisie` and `wikipedia-marzouki-fr` (both
tier 5), and the latter's excerpt is about Marzouki's LTDH presidency, not the
marriage. The December 2011 date is encyclopaedic only; the record's own notes
say no civil-record source was located, and a marriage record is not publicly
disclosable. Reclassifying to `reported` also resolves the existing
`basis-override` exception for this id (implied kind was already `reported`).

## rel-kais-saied-rached-ghannouchi-political-conflict — confirm

`axios-saied-2021` and `reuters-conspiracy-2025` (tier 3) report the freeze,
immunity lift, prosecution and detention. The underlying acts are reported; the
relationship's label ("political-conflict") is itself an interpretation, which
no single document states. Keep reported. Its V25 exception stays live
regardless of kind until a primary source or a grade correction lands.

## rel-slim-ennaceur-mohamed-ennaceur-family — confirm

`leaders-slim-ennaceur-2013` and `realites-slim-ennaceur-2013` (tier 4) are
contemporaneous obituaries; `wikipedia-mohamed-ennaceur` (tier 5) is an
encyclopaedia entry. Parentage and the 21 July 2013 death are press-reported;
Tunisian civil records are not public. Keep reported. This also resolves the
existing `basis-override` exception (implied `reported`).

## arrests-feb-2023 — confirm

`reuters-eltaief-2023` (tier 3) reports the arrests from lawyers' accounts; the
event's actors (Kamel Eltaief, Khayam Turki) rest on that report. No public
prosecutor's statement or Interior Ministry record is held or was located;
Amnesty/Human Rights Watch material (tier 2 organisations) corroborates the
wave but is itself reporting, not the underlying record. Keep reported.

## mabrouk-appeal-2026 — confirm

`tap-mabrouk-appeal-2026` (tier 4) is a state-agency news report that the Tunis
appeal court upheld the 14-year sentence. No published judgment or court
communiqué was located; appeal decisions are not systematically online. Keep
reported. If the court's communiqué or the judgment is obtained, this could move
back to `documented` with that source.

## sentences-july-2025 — confirm

`reuters-sentences-2025` and `reuters-conspiracy-2025` (tier 3) report the
12-35 year sentences and the Guizani in-absentia detail. The verdict text is not
held and no institutional record was located. Keep reported; the V25 exception
stays live until a judgment or court record is cited.

---

## Exact records to add for the source-it rows

1. **p-audit-abdelkader-zgolli**
   - `jort-2011-1097-zgolli` — Décret n° 2011-1097 du 6 août 2011, portant
     nomination du premier président de la cour des comptes. JORT n° 60/2011,
     p. 6. Tier 1. https://lake.jort.tn/journal-officiel/fr/2011/060.pdf
   - `jort-2014-1768-zgolli` — Décret n° 2014-1768 du 26 mai 2014, portant
     cessation de fonctions du premier président de la cour des comptes
     (à compter du 17 mars 2014). JORT n° 42/2014, p. 1331. Tier 1.
     https://lake.jort.tn/journal-officiel/fr/2014/042.pdf
2. **p-cassation-hedi-guediri**
   - `jort-2017-81-guediri` — Décret Présidentiel n° 2017-81 du 14 juin 2017,
     portant nomination du premier président de la cour de cassation. JORT
     n° 48/2017, p. 2143. Tier 1.
     https://9anoun.tn/fr/kb/jorts/jort-2017-048-5baca/decret-presidentiel-ndeg-2017-81-du-14-juin-2017-portant-nomination-du-premier-president-de-la-cour-de-cassation-4
     (PDF: https://lake.jort.tn/journal-officiel/fr/2017/048.pdf)

For both, the 2018/2014 cessation/succession gaps noted above are follow-ups,
not blockers: the appointment records alone establish the holder-role claims'
start dates and justify keeping `documented` once cited.
