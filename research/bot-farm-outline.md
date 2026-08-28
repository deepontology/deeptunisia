# Bot Farms & Fake Social Media Accounts in Tunisia (2016–2026) — Research Outline for /media

**Worktree:** `/home/adala/Projects/deep-tunisia-bot-farm` — branch `research/bot-farm-media`
**Mission:** Deep dive into bot farms / fake accounts in Tunisia past 10 years. Quantify how many fake accounts existed, who reported what numbers, methodologies, disputes.
**Evidence ladder:** Tier 1 gazette/decree → Tier 2 institutional/registry/platform transparency → Tier 3 established journalism/encyclopedia → Tier 4 single outlet → Tier 5 lead. Every claim carries `basis` documented|reported|inferred|unsubstantiated + source. C/D require `attributed_to`. Disagreements recorded in `disputes`. Never invent numbers/dates (`?`/`~`).
**Status:** Research/outbox work — candidates propose, humans dispose (P4). Canonical data read-only; proposals in `data/contrib/bot-farm-2026-08-28.yaml`.
**Date:** 2026-08-28
**Researcher:** DeepTunisia research agent (subagent)

---

## 1. Comparative table — every public estimate found (2016–2026)

| year / period | estimate (assets) | claim_maker | methodology | source url | basis | tier | notes |
|---|---|---|---|---|---|---|---|
| 2019-05-16 (global network incl. Tunisia) | **265 assets total:** 65 FB accounts, 161 Pages, 23 Groups, 12 events, 4 IG accounts; ~2.8M Page followers, ~5.5k Group joins, ~920 IG followers; ~$812k ad spend (Dec 2012–Apr 2019) | **Facebook / Nathaniel Gleicher, Head of Cybersecurity Policy** (platform CIB Report) | Internal investigation into Coordinated Inauthentic Behavior: graph analysis for account clusters that misrepresent identity + coordinated posting + concealment of beneficiary. Flagged by automated systems + human review. Ban of Archimedes Group & subsidiaries. | https://about.fb.com/news/2019/05/removing-coordinated-inauthentic-behavior-from-israel/ | **documented** | 2 | **Tunisia-specific count not reported** — Tunisia was 1 of 6 African focus countries (Nigeria, Senegal, Togo, Angola, Niger, Tunisia) plus LatAm/SE Asia activity. Do not apportion the 265. Ad spend currencies: BRL, ILS, USD. |
| 2019 Jan–Mar pages subset | **11 Tunisia-related Pages**, ~500k followers; 359 posts >1M interactions; 36 videos ~8M views | **Inkyfada** (citing DFRLab dataset from same Facebook removal) | OSINT review of content posted by the removed Tunisia subset. Publication dates, follower counts, interaction sums, video view sums. | https://inkyfada.com/fr/2019/06/03/tunisie-facebook-israel/ (via https://globalvoices.org/2019/10/21/how-misinformation-and-disinformation-disrupted-tunisias-2019-elections/ ) | **reported** | 3 | Reported, not independently verified vs Facebook internal data. Time window: Pages created 2019-01-17 to 2019-03-12. Pages criticised many politicians but never attacked Nabil Karoui; 5 shared Nessma TV / Khalil Tounes content. |
| 2019-05-15 to 2019-07-15 (election monitoring window) | **38.5% of political messages** in study sample from **unofficial Pages with no declared affiliation** (self-categorised entertainment/satirical) — termed "page network" by authors | **ATIDE + Democracy Reporting International (DRI)** | Sampled Facebook political messages in campaign period; coded Page self-declared category vs content; flagged clusters sharing similar content within time windows as possible coordination. | https://democracy-reporting.org/wp-content/uploads/2019/09/20190911_Tunisia_Social_Media_Monitoring_Report_One_ENG_FINAL.pdf | **reported** | 2 | Institutional research. Not a count of fake accounts, but a prevalence measure of unaffiliated amplifiers. Methodology transparent; raw sample size not re-stated here — cite report. |
| 2020-06-05 ("Operation Carthage") | **993 assets:** 446 Pages, 182 FB accounts, 96 Groups, **60 events**, 209 IG accounts; **~3.8M Page followers**, ~131,900 Group members, ~171,500 IG followers. Francophone websites linked, some >5 yrs old | **Facebook** (May 2020 CIB Report, Detailed PDF) + **DFRLab / Atlantic Council** (exclusive investigation) | Facebook: internal CIB investigation triggered by DFRLab referral (Sep 2019). Signals: fake accounts posing as locals in targeted countries, liking own content, driving to off-platform sites, managing Groups/Pages as independent news entities, name/admin changes over time. DFRLab: open-source review (Sep 2019–Jun 2020) of >500 Pages/Groups/accounts, WHOIS, SecurityTrails subdomains, Twitter history, cross-country site graph. | Facebook announcement: https://about.fb.com/news/2020/06/may-cib-report/ — Detailed PDF: https://about.fb.com/wp-content/uploads/2020/06/May-2020-Detailed-CIB-Report.pdf — DFRLab: https://www.atlanticcouncil.org/wp-content/uploads/2020/06/operation-carthage-002.pdf and https://medium.com/dfrlab/dfrlab-uncovers-tunisia-based-political-influence-operation-on-facebook-8c4d16b90744 | **documented** | 2 | **Highest-trust, most granular Tunisia-origin count in decade.** Attributed to Tunisia-based PR firm **UReputation** (Lotfi Bel Hadj / Moëz Bhar-linked). Targeted 10 African countries (Chad, Comoros, Congo-Brazzaville, Côte d'Ivoire, Gambia, Guinea, Mali, Niger, Senegal, Tunisia). In Tunisia, supported Nabil Karoui (Qalb Tounes) in 2019 presidential election; elsewhere Gnassingbé (Togo Feb 2020), Bédié (CIV Oct 2020), Assoumani (Comoros). Coverage: 446 is Pages only, not accounts — do not conflate. |
| 2020-05-29 to 2020-05-30 (deactivation incident) | **Up to 60 accounts de-activated** (journalists/bloggers/artists: Haythem El Mekki, Sarah Ben Hamadi, Bendir Man etc.) + "a few dozen" Tunis-based music/art pages (e.g. Radyoon since 2012) | **ARTICLE 19** (reporting affected users + Facebook statements) vs **Facebook** | User reports of sudden deactivation without warning; Facebook first told Guardian "technical error, small number restored" then in May CIB Report stated it had deliberately removed 446/182/96/209/60-events UReputation assets. Article19 documents confusion: not clear whether the 60 artist accounts overlapped with the 993 UReputation assets or were false positives. | https://www.article19.org/resources/tunisia-confusion-over-deactivated-facebook-accounts/ — Guardian noted therein — Facebook reports above — AccessNow: https://www.accessnow.org/transparency-required-is-facebooks-effort-to-clean-up-operation-carthage-damaging-free-expression-in-tunisia | **reported** (with **dispute**) | 3/4 | **Dispute retained.** ARTICLE 19 users: "our pages are not UReputation." Facebook: no public reconciliation of the 60 vs 993. One music platform (Radyoon) publicly denied any link. ~20 accounts reappeared <24h. Classification: C with attributed_to ARTICLE 19 + affected users. |
| 2020-08 to 2020-10 (post-Carthage reuse example) | **Case study:** "Fake News Checking" page (launched 2019-08-29, ex-@360_tn), Maghreb-Info.com, Revue de l'Afrique / Afrika News cluster; kaissaied.com WHOIS near Lotfi Bel Hadj's Digital Big Brother address | **DFRLab (Operation Carthage report § pp.5–17)** | WHOIS lookup, SecurityTrails subdomain enumeration (dev.ureputation.net etc.), Twitter advanced search on deleted tweets to recover prior handle @360_tn, site staff page/ suspended account audit, address string matching (Avenue Roseleo vs Carrer del Rosselló). | Same DFRLab PDFs above (Operation Carthage) — Nawaat summary: https://nawaat.org/2020/06/16/operation-carthage-nabil-karoui-and-lobbyist-lotfi-bel-hadj-busted-by-facebook | **reported** | 2/3 | Shows methodology by which a small number of fake accounts can re-use "fact-checking" persona to launder partisan content. Not a bot count, but a mechanism finding. `kaissaied.com` WHOIS detail is single-source OSINT — mark confidence C. |
| 2021-07-25 to 2021-07-28 (Saied power grab, hashtag hijacking) | **12,000 tweets from 6,800 unique accounts** on hashtag "Tunisians revolt against the brotherhood" (≈1.76 tweets/account); majority self-reported location Saudi Arabia/UAE; **top 10 most influential accounts all Gulf-based** (monther72, faljubairi, s_hm2030, emarati_shield etc.); **>200 retweets in 5 minutes** for @7__e7 / Fairuz fake persona (_sock-puppets, " Filipino 14yo girl", Smurf avatar, 14-yr-old account, Emma Roberts_ cases) — speed cited as automation indicator | **Marc Owen Jones** (analysis published by **Al Jazeera**) | Twitter data collection on the hashtag; self-reported location field aggregation; social-network graph (Gephi-style) showing disconnected constellation of sock-puppet cluster vs Gulf influencer core; influencer centrality ranking; retweet velocity (tweets/time). Fake-account judgement: disconnected graph component + unrelated comic video + hacked-account reuse pattern. | https://www.aljazeera.com/news/2021/7/28/tunisia-crisis-prompts-surge-in-foreign-social-media-manipulation | **reported** | 3 | **Attribution required (C).** Single researcher (Welham/Leber-style network analysis). Finds **foreign amplification**, not domestic Tunisian bot farm. No estimate of total bots in Tunisia in this period. Suspension of @7__e7 account occurred after thread went viral — corroborates enforcement but not scale. Basis C, attributed_to Marc Owen Jones via Al Jazeera. |
| 2021–2026 (Saied "digital army" claim family) | **? — no published account count** | Circulating in commentary: Arab Center DC (2023-07-21), AccessNow, POMED expert Q&A "Saied's Digital Army" | Qualitative: description of Saied supporters' "heavy digital presence" on Facebook, doxxing, cyber-harassment after televised targeting; Decree Law 54 (2022-09-13) criminalising "rumours/fake news" used to monitor/arrest critics (UNODC-donated forensic equipment). No enumeration of bots/fakes. | https://arabcenterdc.org/resource/disinformation-as-a-tool-of-regime-survival-in-tunisia/ — https://mideastdc.org/publication/expert-qa-tunisian-president-kais-saieds-digital-army — https://www.accessnow.org/press-release/decree-law-54-tunisia/ | **unsubstantiated** for any numeric scale | 3/5 | **Documented negative:** no regulator, platform or peer-reviewed study publishes a Saied-era domestic bot-farm size 2021–2026. The claim exists (heavy presence / digital army) but the number does not. Keep as D with attributed_to (commentary authors). For the media piece this is a gap to state explicitly. |
| 2016–2018 baseline | **? — no Tunisia-specific fake-account enumeration found in platform transparency archives** | **absence** | Search of Meta Q1-Q4 Adversarial Threat Reports 2018–2026, Twitter Transparency country report https://transparency.x.com/en/reports/countries/tn , X 2025 Transparency Report (July–Dec 2024 window) — no Tunisia CIB entry outside May 2019 (Archimedes, Tunisia as one target) & May 2020 (UReputation, origin Tunisia) | https://transparency.meta.com/metasecurity/threat-reporting — https://transparency.x.com/en/reports/countries/tn — https://transparency.x.com/en/reports/global-reports/2025-transparency-report | **documented negative** | 2 | Important to record absence so the timeline does not imply continuous measurement. X country report for Tunisia contains no bot takedown figure. |

**Read across:** Only two moments in 2016–2026 have Tier-2 quantified Tunisia-linked fake-account takedowns: **May 2019** (Archimedes global 265, Tunisia share ?) and **May 2020** (UReputation origin Tunisia 993). The 2019 Inkyfada subset (11 pages) and the 2019 ATIDE/DRI prevalence (38.5%) are complementary lenses, not additive. The 2020 deactivation of ~60 accounts is a documented false-positive/contested edge case. The 2021 hashtag study is foreign amplification, not a domestic farm. 2021–2026 domestic scale remains **unquantified in high-trust sources** — a finding, not an omission.

---

## 2. Evidence ladder — what each tier can and cannot give

- **Tier 1 (gazette/decree):** No bot-farm decree found. Closest is **Decree Law 54 of 2022** on "rumours/fake news" — its text exists in JORT but does not enumerate accounts. ISIE's 2019 reports (https://www.isie.tn/en/isie/election-and-referendum-reports/) discuss sponsored-page monitoring under Electoral Law Art. 143 and the joint ISIE/HAICA 49-article regulation, but publish no bot count. Preserve as documented negative.
- **Tier 2 (institutional/platform/academic):** The anchor sources — **Facebook/Meta May 2019 & May 2020 CIB Reports + detailed PDFs** and **DFRLab Operation Carthage (Atlantic Council)**. Methodology is explicit (graph clustering, fake-account detection, WHOIS/SecurityTrails, Twitter archive search). Numbers are internally consistent across Facebook & DFRLab (446/182/96/60/209). **ATIDE/DRI** report is Tier 2 research. **UNODC equipment donation** for cybercrime forensics is Tier 2 but not a bot count.
- **Tier 3 (established journalism/investigative outlets):** **Inkyfada** (Tunisia investigative), **Al Jazeera / Marc Owen Jones**, **Nawaat**, **Global Voices** — credible, bylined, corroborated. Single-researcher network analysis (Jones) is grade C by design: it attributes, shows its method, and invites replication — not a platform ground truth.
- **Tier 4 (regional/single outlet, advocacy):** **ARTICLE 19** (human-rights org reporting user claims), **Arab Center DC**, **AccessNow** commentary on Saied's digital army. Useful for context and for surfacing the gap, but not numeric ground truth.
- **Tier 5 (leads):** Social-media posts claiming "Saied controls 10k bots" etc. — no source — keep as D, never plot.

**Implication for the piece:** Anchor the narrative on the two Tier-2 takedowns (2019, 2020). Use Tier-3 prevalence/context (38.5%, 11 pages, hashtag hijack) as illustration of mechanisms. Use Tier-4/D to show what is **claimed but unmeasured** for 2021–2026 and name the gap.

---

## 3. Disputes to keep (do not adjudicate silently)

1. **The 60 artist accounts (May 2020): false positive vs undeclared clients?**
   - Held by **affected artists/bloggers** via ARTICLE 19: "not UReputation, not fake."
   - Held by **Facebook** (Guardian "technical error" then CIB Report "deliberate"): "small number restored, UReputation removal was separate / deliberate."
   - No reconciliation published. Status: **open**. Rendering: show both, adopted neither.

2. **Archimedes Tunisia share:**
   - No dispute that Tunisia was targeted, but **how many of the 265 were Tunisia-focused** is unspecified in primary source. Popular re-tellings sometimes imply 265 = Tunisia. The primary says **Tunisia is 1 of 6 +** — keep as `?` for Tunisia slice. Status: **open / documented negative on partition**.

3. **2021 hashtag: bots vs "influencers + sock-puppets"?**
   - Jones distinguishes Gulf **influencers** (real, high centrality) from **sock-puppet/hacked accounts** (automated retweets) and a single **fake persona** (Fairuz). Lumping all 6,800 as "bots" misreads the finding. Status: **open clarity** — adopt Jones's typology, not a single "bot" label.

4. **Saied digital army size:**
   - Commentary asserts existence; no enumeration provided by any Tier 1–2 source. Status: **open / unmeasured**. Do not plot a number.

---

## 4. What we can say about "how many" — honest sentence

> **In the 10-year window, two platform-confirmed, Tunisia-linked takedowns name a countable number of fake assets: 265 globally-including-Tunisia (May 2019, Archimedes, Tunisia share ?) and 993 originating in Tunisia (May 2020, UReputation/Operation Carthage — 182 Facebook accounts + 446 Pages + 96 Groups + 60 events + 209 Instagram). Complementary research puts 38.5% of early-campaign political messages on unaffiliated "entertainment" Pages (mid-2019) and, on one pro-Saied hashtag in July 2021, 12k tweets from 6.8k accounts with Gulf-centric amplification and >200 retweets/5 min for a fake persona. No high-trust source enumerates a Saied-era domestic bot farm 2021–2026.**

Every figure above retains its **claim maker, methodology, URL and basis** in the table. That sentence is the piece's spine — everything else is context.

---

## 5. Narrative outline for /media (proposed)

**Working title:** *The Tunisian Bot Farm That Wasn't One Farm — Counting Fakes from Carthage to Decree 54 (2016–2026)*
**Status:** `draft` — not `published` until human review passes build gate
**Overall confidence:** `B` (anchor events documented; several sub-estimates reported; 2021–2026 scale unsubstantiated)

### Sections (map to `src/content/media/bot-farm/` structure)

- **S00 Lede — `S00`:** A music radio (Radyoon) goes dark on 29 May 2020 for "fake news" — but it has been broadcasting since 2012. How a real anti-fake campaign erased real Tunisians. Question the piece answers: can we count Tunisia's bots?
- **S01 Baseline (2016–2018): No number is a finding — `S01`:** What platform transparency reports do and do not show. Why the absence of a Tunisia count before 2019 is itself evidence of limited monitoring, not limited activity. Sources: Meta threat disruptions index, X transparency TN page.
- **S02 Archimedes — the first trace (2019) — `S02`:** 265 global assets, Tunisia as one target, $812k ad history since 2012, "stop à la désinformation" fake fact-check page. Inkyfada's 11-page subset; 38.5% unaffiliated amplifiers. Visual: timeline dot May 2019 + inset of page ages (Jan–Mar 2019).
- **S03 Carthage — the countable farm (Sep 2019–Jun 2020) — `S03`:** Deep dive into UReputation/Operation Carthage: 993 assets, 3.8M followers, francophone sites, fictitious journalists, Kaissaied.com WHOIS, Fake News Checking persona reuse. Map of 10 targeted African countries. Visual: network graph + country flag strip.
- **S04 The price — collateral (May 2020) — `S04`:** The 60 deactivations, Guardian "technical error" then Article19 confusion — when enforcement misses. Why false positives matter for press/arts freedom and for trust in future takedowns.
- **S05 Hijack — foreign amplification (Jul 2021) — `S05`:** The Al Jazeera/Jones hashtag study as a different animal: 12k tweets, 6.8k accounts, Gulf influencer core vs sock-puppet constellation, velocity analysis. Why this is not a domestic farm but a demonstration of a playbook Tunisia is subject to.
- **S06 Decree 54 & the "digital army" (2022–2026) — `S06`:** How the state now defines "fakes" — law, forensic equipment, monitoring, arrests for "rumours". The commentary that asserts a Saied digital army, and why we mark it **unsubstantiated at D** until someone counts it. Visual: empty chart labeled "no published enumeration 2021–2026."
- **S07 How to count (method) — `S07`:** The explainer: platform graph detection vs OSINT page analysis vs election monitoring sample vs hashtag network science. Strengths, blind spots, how to read the table. Re-state the honest sentence. Visual: the comparative table itself (year | estimate | claim_maker | methodology | basis).
- **S08 What remains open — `S08`:** Four disputes (see §3). Questions that would resolve them (ISIE/HAICA releasing audit files? Meta publishing Tunisia slice of 2019? Jones dataset archived? New fieldwork for 2024 election?). Falsifiable-by roadmap.

### Claims to encode (evidence.yaml) — summary

- C001–C003 Archimedes global count (265 split, Tunisia share ?)
- C004 Inkyfada 11 pages / 500k / 359 / 1M / 36 / 8M
- C005 ATIDE/DRI 38.5% unaffiliated (15 May–15 Jul 2019)
- C006–C015 Operation Carthage full 993 split + follower totals + UReputation attribution + 10-country targeting + campaign beneficiaries
- C016–C018 May 2020 collateral deactivation (up to 60, 20 restored, Radyoon etc. denial)
- C019–C022 Jul 2021 hashtag (12k/6.8k, Gulf influencer list, sock-puppet type, velocity)
- C023–C025 Decree 54 existence, UNODC donation, Saied digital army as unsubstantiated claim
- C026–C027 Negatives: no Tunisia SIA count 2016–2018; no domestic 2021–2026 enumeration

Suggested grades: C006–C015 **documented** (Tier 2), C001/C004/C005/C019 **reported**, C016/C018 raw count **reported** with dispute flag, C023 law text **documented**, C024–C026 **unsubstantiated** with attributed_to.

### Entities to encode (entities.yaml)

- UReputation (Tunis PR firm), Lotfi Bel Hadj, Moëz Bhar, Nabil Karoui / Qalb Tounes, Archimedes Group, DFRLab / Atlantic Council, Facebook/Meta CIB team, ATIDE, Democracy Reporting International, ARTICLE 19, AccessNow, Marc Owen Jones, ISIE, HAICA
- Places: Tunisia (country entity null), Togo, Côte d'Ivoire, Senegal etc. only if narrative needs

### Sources to register (sources.yaml — tier in table)

- All 8 primary URLs in table + 4 corroborating (Nawaat, Global Voices, DFRLab Medium, ISIE reports list page, X TN transparency, Meta threat index)

### Temporal backbone (timeline.yaml)

- 2019-05-16 Archimedes takedown
- 2019-05-15–2019-07-15 ATIDE sample window
- 2019-08-29 Fake News Checking launch
- 2019-09-15 + 2019-10-13 presidential rounds (context)
- 2020-05-29–30 deactivation wave
- 2020-06-05 Operation Carthage DFRLab + Facebook announcement
- 2021-07-25 Saied power grab + 2021-07-28 Al Jazeera analysis
- 2022-07-25 referendum (Saied constitution)
- 2022-09-13 Decree Law 54

### Interpretations to keep small (interpretations.yaml — 3 max)

- I01: Why counting Pages + Accounts + Groups as one "bot number" misleads — the platform's own CIB definition separates them.
- I02: Foreign vs domestic — two different harms with different evidence standards; the 2021 hashtag does not prove a 2020 farm still runs.
- I03: The "no number found" for 2021–2026 is an overclaim risk — absence of enumeration is not evidence of absence of activity, but it is evidence of absence of measurement.

### Exclusions (exclusions.yaml)

- Narrow-casting to foreign influence import (every bot farm in Tunisia vs Tunisia as target/origin) — note boundary, do not claim domestic exclusivity.
- Election outcomes — do not causally claim that any counted fakes changed vote totals (needs separate study).
- AI-generated account speculation post-2023 — no Tunisia-specific measurement sourced.

---

## 6. Visuals & data exports

- `data/comparative_bot_estimates_2016_2026.csv` — exact table above (machine-readable, source_url column preserved)
- `data/network_schematic_carthage.svg` (placeholder — derived from DFRLab's own schematic; not redrawn from raw data without licence)
- Do **not** generate a synthetic "total bots over time" sparkline — that would imply additive counts where sources are non-additive (see §1 note on Archimedes vs Carthage).

---

## 7. Build & provenance notes

- Follow `/media` build spec: `src/content/media/bot-farm/` with `meta.yaml`, `evidence.yaml` (claims C001–C027), `sources.yaml`, `entities.yaml`, `timeline.yaml`, `interpretations.yaml`, `research.yaml`, `editorial.yaml`, `exclusions.yaml`, `components.yaml`, plus `narrative/en.md` with `[C…]`/`@…` refs and `> [I#]` interpretation blocks. Absolutes lint: long numeric paragraphs must carry `[C…]`.
- The `research.yaml` must list the three candidate outbox files consulted (this outline + the contrib file below). Do not claim `verified` until a human has opened each primary PDF.
- Every numbers paragraph in `narrative/en.md` must carry at least one `[C…]` — build fails otherwise.

---

## 8. Next steps / falsifiable_by roadmap

- Pull ISIE report PDFs for 2019 election cycle and search for any appendix quantifying sponsored Pages (falsifies "no ISIE number" negative if found).
- Ask Meta Transparency for a break-out: how many of the 2019 Archimedes 265 map to Tunisia — or mark `?` permanently.
- Archive the Jones/Al Jazeera dataset (Cytoscape/Gephi file) if author shares — upgrades C019–C022 from reported to documented if primary data is inspected.
- Check X (Twitter) Informa/Command archives for any Tunisia IO disclosure 2022–2024 — none found in this pass but window 2024 presidental election (6 Oct 2024) deserves a re-search closer to event.
- Search JORT for Decree Law 54 application decrees naming enforcement body — upgrades Decree discussion from reported to documented.

---

*Evidence ladder and basis vocabulary per project rules. Sources added to candidate file below so a human can drop them into `data/sources.yaml`.*
