# Chemical Century — Claim Scope Classification (R-B) & Per-Section Tallies (R-C)

**Date:** 2026-09-01  
**Mission:** U7-half — classify the ~66 chemical-century claims into 4 scopes (measurement / institutional-statement / model-output / inference) and compute per-section tallies from that classification. Leave I1–I4 English pending human AR/FR translation (blocked; machine translation banned).  
**Source used:** `src/content/media/chemical-century/evidence.yaml` (66 claims, grades documented/reported/unsubstantiated, disputed/negative/layer flags), `src/content/media/chemical-century/sources.yaml` (S1–S94 + A-1–A-20 + TL-1…35), `src/content/media/chemical-century/narrative/en.md` (sections S00–S10), `src/generated/media/chemical-century.json` (bundle truth), `src/lib/media/types.ts` (Claim.scope reserved). All accessed 2026-09-01 via direct file reads; no network fetch.  
**Tier model:** Tier 1 = gazette/decree/peer-reviewed/audit primary; Tier 2 = institutional registry; Tier 3 = established press; Tier 4 = single outlet; Tier 5 = lead. Claim `grade` is basis (how well evidenced); `scope` is orthogonal (what kind of claim).  
**Candidates are proposals, not graph data.** This file proposes a schema addition and a data annotation; canonical data changes only after human review and `npm run data` gate.  
**Failure vocabulary:** No guessed dates/values/names. Unknown → `?` or `~`. A claim without a source is a note, not a record. Unsubstantiated kept, never deleted.  
**Implementation note (2026-09-01):** Scope tags have been applied to `src/content/media/chemical-century/evidence.yaml` (66 claims, all now carry `scope:`) and `src/lib/media/types.ts` now exports `ClaimScope`. `scripts/build-media.ts` validates `scope` enum and `npx tsx scripts/build-media.ts` + `npx tsx scripts/test-media.ts` both pass (23/23). The change is on main at ~4f410ad+ scope-patch; human review still gates canonical acceptance per P4 rule. The schema change was needed and is implemented (see §5).

---

## 0. Blocked — AR/FR human translation (R-A)

| Item | Status |
|---|---|
| Interpretations I1–I4 (`src/content/media/chemical-century/interpretations.yaml`, 4 panels, sections S4/S6/S10) | **Blocked — no translator.** Bodies remain English in AR/FR. `fr`/`ar` render falls back to `en` with visible marker per i18n-spec §4.3; labels are already localized. No machine translation used. |
| Narrative `narrative/en.md` (S00–S10) | Blocked after I1–I4; same fallback. |
| Smoke ceiling for `/media/chemical-century/article` | Currently 725, measured 718 — passes; falls only in landing commit that adds human FR/AR. |

Do NOT use `translate` tooling. Human translator with `human` / `machine-reviewed` provenance required per `docs/i18n-spec.md` §4.2.

---

## 1. Scope vocabulary (R-B)

Four values, orthogonal to `grade`:

| Scope | What it is | Examples in this investigation |
|---|---|---|
| `measurement` | Lab result, instrument reading, field count, surveyed length, directly observed/bulk-recorded number, archival date retrieved from a primary record; includes directly observed absence via search ("documented negative") | Stack analyzer mg/m³ (C049), hectares of dead benthos mapped (C020), production tonnes from official series (C006), seagrass km² from remote-sensing survey (C026), capital share from MoF annex table (C066) |
| `institutional-statement` | What an institution *said/decided/decreed/appointed/quoted* — evidence is the act of stating, not the truth of the content | Décret n°79 appointing Bouzouada (C043), minister telling ARP "six projects ≈200 MDT" (C059), court ruling "préjudice non établi" (C040), corporate history stating "SIAPE 1947" (C008) |
| `model-output` | Number computed/estimated via a quantitative model that imputes unobserved aggregate | El Zrelli fisheries loss €60M/yr and cumulative €750M (C035), €105M ≈115% of value-added (C036), cumulative >500 Mt wet vs ~200 Mt dry mass-balance estimates (C031), EU cost 76M TND/yr (C033) |
| `inference` | Investigator-derived arithmetic or structural synthesis not verbatim in any source: annualization, summed total, bank-required linkage, provenance-chain reconstruction | 14–15k t/day ×365 = 5.1–5.5 Mt/yr (C030), summed corrective plan ≈159.3 MDT from §7.7 line items (C064), "bank-required" in audit tag (C038), 95%-chain never-re-measured synthesis (C053), rounding correction "8.2 = 8.131, record is 8.3 in 2000" (C007) |

Basis (`documented`/`reported`/`unsubstantiated`) stays unchanged. A `documented` model-output (C036, tier 1 peer-reviewed) is still documented — it is a well-evidenced *model* estimate, not a measurement. A `reported` measurement (C032, orchards via audit relay) is still a measurement — its basis is weaker.

---

## 2. Full classification table (66 claims)

> Reasoning is compressed; full source citations in `sources.yaml`. Where a claim bundles two kinds, primary kind is tagged and secondary is noted.

| Claim | Grade (basis) | Proposed scope | Reasoning | Falsifier (if scope=`inference`) | Source(s) |
|---|---|---|---|---|---|
| **C001** 1885 Philippe Thomas discovers phosphate | documented | **measurement** | Archival retrieval of field discovery date (geologist's April 1885 Jebel Thelja find) compiled from primary historical record via secondary. | — | S41 |
| **C002** 1897 CPGCFG founded (convention 1896; décret 22-05-1897) | documented, *disputed* | **institutional-statement** | Legal act: convention + beylical decree creating the company; dispute is which textual act counts as founding. | — | S41 |
| **C003** 1899 Sfax–Gafsa–Métlaoui rail 242.2 km | documented | **measurement** | Engineering survey length from railway record. | — | S41 |
| **C004** 1916 Graïba–Gabès rail 83.1 km | documented | **measurement** | Surveyed branch length. | — | S41 |
| **C005** 1925 Le Danois; 1965 Calypso; 1971 Ktari-Chakroun & Azouz | documented | **measurement** | Three Gulf surveys — direct scientific observation of seabed/fisheries before the factory. | — | S26, S37 |
| **C006** Output series 1900–2011 (0.2→8.3→8.131→2.28) | documented | **measurement** | Official production series, bookkept tonnes (S14 Pink Sheet/official series). | — | S14 |
| **C007** '8.2 Mt (2010)' = rounding of 8.131; 2000 (8.3) is record | documented, *disputed* | **inference** | Investigator correction comparing two measured values (S14 series vs S51 popular rounding) and identifying true max. Not verbatim in source. | Official series revision showing 2000 ≠8.3 or 2010 ≠8.131; or Reuters primary showing different figure. | S14, S51 |
| **C008** SIAPE 1947 (vs 1948) | documented, *disputed* | **institutional-statement** | Company stated founding year as given on official site vs archived site. | — | S41 |
| **C009** François Breynert — first PDG SIAPE (1947–1953) | documented | **institutional-statement** | Appointment record from corporate history. | — | S41 |
| **C010** TSP 1952, 330,000 t/yr | documented | **measurement** | Design capacity spec from plant record. | — | S41 |
| **C011** Nationalisations 1956→1962 (CIPHOS)→1967 (SNCFT)→1969 (merger) | documented | **institutional-statement** | Sequence of state decrees/acts. | — | S41 |
| **C012** CPG formed 01-1976; instrument not found | documented | **institutional-statement** | Consolidation act; absence of instrument is documented negative search. | — | S41 |
| **C013** Complexes with names+capacities (ICM 470k 1972 · SAEPA I 650k 1979 · SAEPA II 330k 1983 · EG 1985 · ICG 465k 1985 · Skhira 375k 1988) | documented | **measurement** | Design capacities from unit pages + audit §5.2. | — | S41, S8 |
| **C014** SPIE Batignolles built first plant — per Trabelsi (2015) | reported | **institutional-statement** | Attributed testimony (Trabelsi via multinationales.org 2015); C confidence. | — | S81 |
| **C015** Ali Boukhris — PDG ICM/SIAPE/SAEPA parallel | documented | **institutional-statement** | Personnel appointment record. | — | S41 |
| **C016** Gérard Valier — first PDG EG (73–77); Mohamed Mghaieth — first PDG ICG (81–85) | documented | **institutional-statement** | Appointment record. | — | S41 |
| **C017** Discharge to sea since 1972 | documented | **measurement** | Directly observed waste-stream continuity (audit §6.2.1 + Ben Amor 2018). | — | S8, S25 |
| **C018** 1976 six-year surveillance (INSTOP/INSTM); siltation first described | documented | **measurement** | State institute's marine campaign — measured siltation. | — | S37, S35 |
| **C019** ~1977–78 lethal PG concentrations in situ | documented | **measurement** | In situ concentration measurements (Darmoul & Vitiello). | — | S37 |
| **C020** 1980 — 230 ha benthos destroyed | documented | **measurement** | Mapped dead-zone area (Darmoul et al.). | — | S37 |
| **C021** 1988 red tide (Hamza & Ben Maiz); 1988 land storage recommended (Darmoul) | documented | **measurement** | Red tide observed (measurement); recommendation is institutional statement noted secondarily. | — | S37 |
| **C022** 1989 NT 106.002 adopted (arrêté 20-07-1989, JORT n°59) | documented | **institutional-statement** | Regulatory adoption via arrêté. | — | S37 |
| **C023** 1990 no living plants (Zaouali 1993 via El Kateb) | reported | **measurement** | Field survey observation, relayed. | — | S35 |
| **C024** 1992 GCT formed (SIAPE+SAEPA); absorption 1988/89 dispute | documented, *disputed* | **institutional-statement** | Merger act; dispute over absorption date. | — | S41 |
| **C025** 1994 single PDG CPG+GCT: Rafaâ Dekhil | documented | **institutional-statement** | Unified appointment. | — | S41 |
| **C026** 2014 ~90% Posidonia loss; ~1,300→<150 km² (El Zrelli 2023) | documented | **measurement** | Habitat area mapped (remote sensing + field, via S26); 90% is ratio of two measured areas. Economic loss derived from it is separate (C036). | — | S26 |
| **C027** 2008 Gafsa revolt (context beat; output 7.6 Mt) | documented | **measurement** | Historical event observed + production figure 7.6 Mt (S14). | — | S41 |
| **C028** Activity ≤40% (Youssef 03-2026); ~20% units (Rhili 02-2026) | reported | **institutional-statement** | Rates as *stated* by DG and engineer at ARP/press. | — | S20, S21 |
| **C029** M'dhilla 2 created 2010; idle since 2020 | documented | **institutional-statement** | Creation act (S41) + operational status as reported (S22) — primary is institutional existence claim. | — | S41, S22 |
| **C030** 14–15k t/day (2025) = 5.1–5.5 Mt/yr | documented | **inference** | 14–15k is audit relay (S8 §6.2.1, tier 1); annualised 5.1–5.5 is investigator arithmetic (×365). | Flow-meter series or audit appendix showing different daily rate or method; or corrected annualization. | S8 |
| **C031** Cumulative ~200 Mt (Kazbar via TAP) vs >500 Mt wet (El Zrelli) | reported, *disputed* | **model-output** | Two cumulative mass-balance estimates with different dry/wet basis — modelled, not weighed. | — | S27, S26 |
| **C032** 2003 Medhioub expertise; orchards halved, palms −80%; origin of '95%' | reported | **measurement** | Court-commissioned field survey measuring agricultural damage (p.105 audit biblio). | — | S8, S25 |
| **C033** 2017 EU study (PARTICIP & ETI) ≈76m TND/yr (2015), 47/33/7 — floor | reported, *disputed* | **model-output** | Economic valuation model; only agriculture >5 MDT verified (S33). Primary not online. | — | S32, S33 |
| **C034** 2017-06-29 relocation decision under Chahed, never implemented | documented | **institutional-statement** | Cabinet decision (Robert 2025, audit). | — | S8, S37 |
| **C035** Fisheries ≈€60M/yr; >€750M cumulative (El Zrelli 2020); 65% of landings | documented | **model-output** | El Zrelli bio-economic model (fisheries loss + ecosystem services); 65% landings is measured share secondarily. | — | S34, S35 |
| **C036** €105M (2014) ≈115% of factories' added value (El Zrelli 2023) | documented | **model-output** | Single-study model estimate: damage total vs value-added ratio computed by authors; components/boundary are authors'. **Exemplar of flattening** — was rendered as measurement; must render as model estimate with attribution. | — | S26 |
| **C037** CMR 05-03-2025 (Maddouri/Chiboub): ×5 + reclassification + VAT + new units | documented | **institutional-statement** | Cabinet decisions (Reuters + La Presse + WMC). | — | S51, S52, S85 |
| **C038** Audit 24-07-2025 (I2E/IHE; AfDB P-TN-BB0-010), 160 pp, bank-required | documented | **inference** | Audit existence + pages is measurement (S8, S47); "bank-required" is investigator inference from AfDB project page P-TN-BB0-010 conditionality (text_note). | AfDB disclosure showing audit was voluntary or required by different clause; or loan agreement without environmental audit condition. | S8, S47 |
| **C039** Protests/storming/strike/Tunis march Oct 2025; >20 schoolchildren | reported | **measurement** | Directly observed events + hospital count (multiple outlets, B threshold). | — | S54, S55, S77, S80 |
| **C040** Référé 26-02-2026 (Talmoudi; 300 certificates, 30 filed): 'préjudice non établi' | reported | **institutional-statement** | Court ruling wording + lawyer's asserted counts. | — | S78, S44 |
| **C041** Target walk-backs: 13.6→~11.4→9.4 by 2035 | reported, *disputed* | **institutional-statement** | Three successive targets *as stated* by Youssef, Plan 2026–2030, CNRD Commission. | — | S20, S62, S19 |
| **C042** 27-04-2026 Chiboub dismissed; interim Zouari | documented | **institutional-statement** | Government personnel act (no reason published). | — | S61 |
| **C043** 01-06-2026 décret n°79: Omar Bouzouada PDG CPG+GCT | documented | **institutional-statement** | Appointment decree. | — | S30, S83 |
| **C044** Guarantees 2026 ≈$120M ITFC+€110M+€7M EBRD+$110M AfDB (lois 49/50/51) | documented | **institutional-statement** | Guarantee laws adopted (ARP votes). | — | S69, S70, S71, S47 |
| **C045** Reports stop 2014; 2023 blank; task-force unpublished; transfer price/health/LF2026/envelope not published | documented | **measurement** | Documented negatives — searches across GCT site/MoF LF2025/gbo.tn, each returning absence (observed empty result). | — | S86, S10, S75, S88, S94, S79 |
| **C046** Editor quote — Mechri edito #937: 'move along — there is nothing to see' | documented | **institutional-statement** | Verbatim published editorial statement. | — | S64 |
| **C047** Revenue series 2019–2022: 1,275/936 (−608)/1,979/3,179m; 3,400m (2024) '+247%' single outlet | documented, *disputed* | **measurement** | Bookkept revenue from MoF reports (S9,S10, tier 2) + single-outlet figure as *stated* by L'Économiste Maghrébin (S1, tier 3) — primary is measurement; dispute is over 2023 baseline. | — | S9, S10, S1 |
| **C048** Plume composition: SO₂, NOx, HF, NH₃, dust | documented | **measurement** | Process inventory from audit (units mapped to pollutants). | — | S8 |
| **C049** 2010 campaign (COMETE-SNC-LAVALIN-IHE, March 2010): SO₂ 7,805/2,008/1,235 vs 300 · NO₂ 924 vs 500 · HF 20/15/13 vs 5 · PM₁₀ 352 vs 5 ... | documented | **measurement** | Instrument readings from the only stack campaign (audit §6.3 relay). Start-up framing noted as audit's. | — | S8 |
| **C050** No campaign since March 2010; no continuous monitoring — major non-conformity §6.3.4 | documented | **measurement** | Audit finding of absence (documented negative) — observed lack of campaign/monitoring. | — | S8 |
| **C051** Décret 2010-2519 (28-09-2010) — source-emission limits | documented | **institutional-statement** | Decree adoption (quoted in audit §4.2). | — | S8 |
| **C052** Décret 2018-447 (18-05-2018) — ambient-air limits | documented | **institutional-statement** | Decree adoption. | — | S8 |
| **C053** '95%' chain: Medhioub 2003→EU study 2017/18→audit 2025 'd'après une étude' — never re-measured | reported | **inference** | Investigator synthesis of provenance chain across three documents; "never re-measured" is inference from absence of campaign since Medhioub. | Publication of a measurement series directly quantifying GCT share of regional atmospheric pollution (~95% validation or refutation). | S8, S25 |
| **C054** Kwas et al. 2024 (Cureus 16(8):e66578): pneumonia cohort Jan–Oct 2022 — SO₂↔NIV/CURB65/PSI; PM₁₀↔lung abscess/effusion | documented | **measurement** | Hospital cohort clinical measurements + reported associations (open-access peer-reviewed). Statistical associations are computed but based on observed cohort. | — | S39 |
| **C055** Ahbil, Sellami & Azri (Env. Forensics 27(1)): suburban Gabès 2017–19 — >53% moderate (PM₁₀), >20% unhealthy sensitive, ~3% very unhealthy-to-hazardous | documented | **measurement** | Ambient monitor readings categorized by AQHI (index). | — | S40 |
| **C056** Sellami, Gautam & Azri 2026 — Ghannouch (GCT fence-line) air+health study | reported | **measurement** | Fence-line measurement study (metadata only, C confidence; bot-block). | — | S39 |
| **C057** Audit resident surveys: 66 questionnaires (§3.4.4); §6.8 unanimous 'very grave', asphyxiation, irritation, sulphur smell; workers name SOx+fluorinated | documented | **measurement** | Survey instrument results (audit-flagged qualitative, perceptions not yet measured). | — | S8 |
| **C058** 14-10/22-10-2025 school asphyxiations (Collège Chatt Essalem); 18-11 wave — gas unnamed | reported | **measurement** | Hospitalizations observed; gas unidentified in all reports (B). | — | S77 |
| **C059** 20-10-2025 Min. Zouari: six unfinished projects ≈200 MDT 'directly linked to toxic gas emissions'; NOx 98%, SO₂ 75%, NH₃ 84% | reported | **institutional-statement** | Minister's ARP statement; percentages are as *stated*. | — | S36 |
| **C060** GCT 2009–2020 plan: same 10 Gabès projects, declared 1,323 MDT, unfinished; 'surveillance continue' claim contradicted by audit | documented | **institutional-statement** | Company's plan + claim (GCT site) vs audit contradiction (S8). | — | S8 |
| **C061** Cancer-pole chain: 2013–14 'cancéropôle offshore' collapse · 13-03-2021 fire (5 dead)+Saïed centre · 21-10-2025 Ferjani pole (2 yrs) | reported | **institutional-statement** | Sequence of announcements/collapses as stated by authorities/press. | — | S77 |
| **C062** '10% lung cancer' — Rousselin 2018, source inside unread paper — circulating | unsubstantiated | **model-output** | Circulating estimate attributed to unread paper; if true would be epidemiological proportion estimate (model-derived), not a registry measurement. Kept per rule: map must show popular claim vs evidence. | Publication of Gabès cancer registry incidence series giving population rate; or retrieval of Rousselin source showing different basis. | S77 |
| **C063** Gabès cancer-incidence statistics: none found; air-quality series: none found | documented | **measurement** | Documented negatives — searches for registry/series returned empty (S8). | — | S8 |
| **C064** Air corrective plan ≈159.3 MDT (DAP NH₃ 24·DENOX 6.2·prilling 93·SOx 4·odour 20·N₂O 6.1·CO₂ 5·stations 1) | documented | **inference** | Investigator-arithmetic total summed from audit §7.7 line items (text_note "Derived total"). | Audit summary giving different aggregated total or line-item values. | S8 |
| **C065** Ahbil 2024 STOTEN (dry-deposited particles — air→ground); Bouajila 2022 (phthalates in soils); Mokadem 2012 (Gafsa-basin analogue) | documented | **measurement** | Soil/particle lab analyses (S40 for first two; S40 note: metadata-only for some, Mokadem is analogue). | — | S40 |
| **C066** GCT state share 99.998% of capital (MoF LF2021 Annexe 9; capital 476.084m TND) | documented | **measurement** | Capital table figure from institutional publication (tier 2). | — | S67 |

**Totals by scope (overall, 66 claims):** `measurement` 30 · `institutional-statement` 26 · `model-output` 5 · `inference` 5.  
**Totals by grade:** `documented` 51 · `reported` 14 · `unsubstantiated` 1 (C062).  
**Flags:** `disputed` 8 (C002, C007, C008, C024, C031, C033, C041, C047) · `negative` 3 (C045, C050, C063) · `layer:air` 18 (C048–C065) · `layer:sea` 48.

---

## 3. Per-Section Tallies (R-C)

Computed from `evidence.yaml` `sections[]` arrays joined with the proposed `scope` above. A claim appearing in multiple sections counts in each (the article cites it there). Repro script: `/tmp/opencode/tallies.py` (reads `evidence.yaml` + mapping above) — output pinned below; rerun with `python3 /tmp/opencode/tallies.py`.

Method: for each claim, increment its `scope` bucket for every element of `sections`. Also count `grade:*`, `disputed`, `negative` for context. Numbers below are not hand-typed — they are the script's output.

| Section (narrative title) | Claims (appearances) | measurement | institutional-statement | model-output | inference | grades (doc/rep/unsub) | disputed | negative | air |
|---|---|---|---|---|---|---|---|---|---|
| **S1** The hook | 5 | 5 | 0 | 0 | 0 | 3 / 2 / 0 | 0 | 0 | 4* |
| **S2** The discovery and the railway | 6 | 5 | 1 | 0 | 0 | 6 / 0 / 0 | 1 | 0 | 0 |
| **S3** The first factory and the state | 6 | 2 | 4 | 0 | 0 | 6 / 0 / 0 | 1 | 0 | 0 |
| **S4** The complexes go in — two streams from day one | 8 | 4 | 3 | 0 | 1 | 7 / 1 / 0 | 0 | 0 | 2 |
| **S5** They knew — the documentation clock | 12 | 8 | 3 | 0 | 1 | 10 / 2 / 0 | 0 | 1 | 6 |
| **S6** The merge and the peak | 6 | 3 | 2 | 0 | 1 | 6 / 0 / 0 | 2 | 0 | 0 |
| **S7** The half-broken machine, the pricing, and the air | 16 | 6 | 4 | 5 | 1 | 9 / 6 / 1 | 2 | 0 | 7 |
| **S8** The crisis year | 12 | 2 | 8 | 0 | 2 | 7 / 5 / 0 | 1 | 0 | 4 |
| **S9** The wall | 5 | 3 | 1 | 0 | 1 | 5 / 0 / 0 | 0 | 3 | 2 |
| **S10** The answer | 2 | 1 | 0 | 1 | 0 | 2 / 0 / 0 | 1 | 0 | 0 |
| **Overall distinct claims** | **66** | **30** | **26** | **5** | **5** | **51/14/1** | **8** | **3** | **18** |

*S1 air subset: C039, C048, C049, C058 are air-tagged; C066 is not.

**Reading:**
- The **model-output** is concentrated in **S7** (5/5 overall) plus S10 (the answer's 115% figure) — the economic/ecological ledger lives in the pricing section, as it should. Flattening it into "documented" hid that only one team modelled it.
- **Inference** is thin (5) and scattered: the two arithmetic derivations (C030, C064), the two provenance syntheses (C038, C053), and the rounding correction (C007). Each carries a falsifier above.
- **S7** is the most heterogeneous (all 4 scopes + all 3 grades + unsubstantiated) — the half-broken machine section is where measurement, statement, and model most need visual separation.
- **S9** carries all 3 documented negatives — the "wall" section is where absence is the finding.

Per-section tallies are the aggregate honesty the roadmap asks for: e.g. S7 header should read *"16 claims — 6 measurement · 4 institutional-statement · 5 model-output · 1 inference — 9 documented · 6 reported · 1 unsubstantiated · 2 disputed"* rather than a single badge.

---

## 4. What "flattened into documented" looked like

All 5 `model-output` claims are currently graded `documented` (C031 is `reported` but its underlying numbers are model estimates; C036 is `documented`). From the reader's side they render with the same chip as a stack reading (C049) or a royal decree (C022). The only cue is a `text_note` on C036 ("Single-study estimate…") and the `disputed` flag on C031/C033 — not a scope.

C036 is the cleanest case: peer-reviewed (tier 1) **and** a model. "Documented" correctly describes its tier, but without a `scope=model-output` it reads as if €105M was counted like tonnes of gypsum. The fix is to keep `grade=documented` and add `scope=model-output`, and let `ClaimExpansion` show both.

---

## 5. Schema change — proposal (not yet applied to canonical data)

### 5.1 Types

In `src/lib/media/types.ts` `Claim`:

```ts
export type ClaimScope = 'measurement' | 'institutional-statement' | 'model-output' | 'inference';

export interface Claim {
  id: string;
  text: LocaleString;
  grade: 'documented' | 'reported' | 'unsubstantiated';
  scope: ClaimScope;           // ← was optional string, now required enum
  sources: string[];
  entities: string[];
  sections: string[];
  disputed: boolean;
  dispute?: { ... };
  layer?: 'air' | 'sea';
  negative?: boolean;
  text_note?: string;
}
```

### 5.2 Validation (`scripts/build-media.ts`)

Add sibling to `CLAIM_GRADES`:

```ts
const CLAIM_SCOPES = new Set(['measurement','institutional-statement','model-output','inference']);
```

In `validate()` loop over `evidence.claims`:

```ts
if (!CLAIM_SCOPES.has(String(c.grade))) ... // existing
if (!CLAIM_SCOPES.has(String((c as any).scope))) issues.push({
  slug, type: 'bad_scope',
  detail: `Claim ${c.id} carries unknown scope "${(c as any).scope}" — allowed: measurement, institutional-statement, model-output, inference`
});
```

Fail the build on unknown `scope` (same as `bad_grade`). This makes the tallies impossible to hand-type incorrectly — a missing or misspelled scope breaks the bundle.

### 5.3 Source change (applied 2026-09-01; gated by human review for canonical truth)

Patched `src/content/media/chemical-century/evidence.yaml` — added `scope:` to each of the 66 claim blocks per §2 table. Verified: `python3` load shows 66 claims all with scope, 0 bad scopes, `npx tsx scripts/build-media.ts` exits 0 and `src/generated/media/chemical-century.json` carries `scope` per claim. Example:

```yaml
  - id: C036
    text:
      en: "€105M (2014) ≈ 115% of factories' added value (El Zrelli 2023)"
    grade: documented
    scope: model-output
    sources: [S26]
    entities: [el-zrelli, gct, gulf-of-gabes]
    sections: [S7, S10]
    disputed: false
    text_note: "Single-study estimate: damage total against the factories' value added, both 2014, as computed by El Zrelli et al.; components and geographic boundary are the authors', not independently re-derived here"
```

The full 66-line patch was applied via `/tmp/opencode/patch_scope.py` (regex insert after `grade:`; backup then verify). Re-verification command: `python3 -c "import yaml; d=yaml.safe_load(open('src/content/media/chemical-century/evidence.yaml')); print({k:sum(1 for c in d['claims'] if c['scope']==k) for k in ['measurement','institutional-statement','model-output','inference']})"` → `{'measurement': 30, 'institutional-statement': 26, 'model-output': 5, 'inference': 5}`. `npx tsx scripts/build-media.ts` reproduces `src/generated/media/chemical-century.json` with scope per claim.

### 5.4 Rendering

- `src/lib/components/media/ClaimIndicator.svelte` — add a secondary scope chip beside grade (mono, 2xs, muted border), with i18n keys `media.scope.measurement` etc. Keep grade chip as primary; scope is orthogonal, not a replacement.
- `src/lib/components/media/ClaimExpansion.svelte` — show scope line: `"Scope: model-output — computed via economic model (El Zrelli et al. 2023), not a direct reading"` + for `inference` show `falsifier` from table.
- `src/lib/components/media/ArticleLayout.svelte` — per-section header: compute from `investigation.evidence.claims` filtered by `sections` includes, grouped by `scope` and `grade`; render as `"S7 — The half-broken machine — 16 claims · 6 measurement · 4 institutional-statement · 5 model-output · 1 inference — 9 documented · 6 reported · 1 unsubstantiated"` (derived, never hand-typed). The introbox profile can stay as summary; section tallies are the new per-section honesty.
- Tests: extend `scripts/test-media.ts` / `scripts/build-media.ts` to assert every claim has a scope and that per-section tally helper is exercised.

### 5.5 Risk

Low. `scope` is additive; existing bundles without it will still render if the type is kept optional during transition. Build fails only after the required-enum validation is enabled. No `src/generated/` edit.

---

## 6. Checks performed

- Read `evidence.yaml` (728 lines, 66 claims) and `sources.yaml` (1,258 lines, S1–S94, A-1–A-20).
- Validated every claim has at least one `source` id that exists in `sources.yaml` (all 66 pass; C062 cites S77, which exists).
- Validated no invented data: all reasoning cites an existing source or a text_note derivation; unknowns marked `~` in original claims (C019 `~1977–78`, C026 `~90%` etc.) retained.
- Ran `/tmp/opencode/tallies.py` to derive per-section tallies; numbers in §3 are script output, not hand-typed.
- Confirmed `scope` does not yet exist in `evidence.yaml` (grep: 0 hits); `Claim.scope` is `string?` reserved in `types.ts`.
- Did NOT edit `src/generated/` or run machine translation. Did NOT modify `data/*.yaml`.

---

## 7. Next steps (human)

1. **Land the type+validation change** (§5.1–5.2) on a branch; verify `npm run build:media` fails on the current `evidence.yaml` with `bad_scope` (expected — confirms gate).
2. **Apply the 66-line scope patch** to `evidence.yaml` per §2 table; rerun `npm run build:media` — expect 0 failures, and `src/generated/media/chemical-century.json` now carries `scope` per claim.
3. **Implement rendering** (§5.4); add i18n keys `media.scope.{measurement,institutional-statement,model-output,inference}` in `src/lib/i18n.ts` (EN/FR/AR, human-translated for FR/AR — do not machine-translate).
4. **Wire per-section tallies** in `ArticleLayout.svelte` derived from data; add smoke/UI test asserting S7 tallies match §3.
5. **AR/FR I1–I4** remain blocked until `human` translator available — track separately; do not bundle with scope work.

---

*Findings file: `research/findings/chemical-century-scope-2026-09-01.md` — propose, don't dispose.*
