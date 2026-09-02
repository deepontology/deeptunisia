# Sensitivity analysis

Generated 2026-09-02T21:50:20.763Z — commit 8e2caf7b767fe75edeb06076fcbdef8cf8145f77. Baseline: all-time ranking (t=2026-01-01), 444 people, basisFloor=reported, all layers enabled.

## Finding (C11 sparsity)

Influence scores only **5 people** (>0). Of 19 influence-family edges, the published influence index thresholds leave 5 scored holders (kais-saied, khaled-yahyaoui, kamel-eltaief, mohamed-habib-dhif, wassila-bourguiba).
Discount perturbations (±0.25 on documented 1.0 / reported 0.55 / inferred 0.2) therefore barely move the influence order: worst Spearman **0.997** (overlap 97.5%, 0 top-10 swaps except one). Near-zero deltas on influence are the sparsity finding — the column is data-sparse today, and W6 board-seat/ownership fills are what would make the question substantive.
The composite inherits the same near-invariance to discount (worst **0.999**) and to temporal perturbations (worst **0.993** under window/slack), but **real deltas live in the weight dimension**: excluding survival drops the composite to Spearman 0.772 (47.5% overlap), authority to 0.782 (82.5%), while excluding influence barely registers (0.995, 100% overlap) and brokerage barely moves (0.969). Halving/doubling a single weight (1→0.5, 1→2) moves survival to 0.951/0.906 and authority to 0.954/0.930, versus influence 0.999/0.995. Window halving/doubling and slack ±50% barely move anything in allTime mode (all Spearman ≥0.997; only survival slack -50% at 0.997), as expected — snapshot mode shows the same pattern (paper §5.4 modelling assumptions, 8-year window and ~slack).

## Shipped constants

- discount: documented 1, reported 0.55, inferred 0.2, unsubstantiated 0
- window: 8y (halved →4, doubled →16)
- slack: year 365d / month 92d (±50% → 183/46 and 548/138)
- composite weights: authority=1, proximity=1, survival=1, brokerage=1, reach=1, influence=1 (equal-weighted default; reader-adjustable)

## Per-index deltas under discount/temporal + composite weight sensitivity (worst Spearman per key)

| Index / composite | worst Spearman (discount/temporal) | worst perturbation | interpretation |
|---|---:|---|---|
| authority | 1 | slack year 365→548 month 92→138 (+50%) | index itself robust (temporal 1); its weight drives composite — excluded 0.782, halved 0.954, doubled 0.930 |
| proximity | 1 | slack year 365→548 month 92→138 (+50%) | robust in this graph — temporal 1; weight excluded ≥0.94 (brokerage 0.969, reach 0.942) |
| survival | 0.997 | slack year 365→183 month 92→46 (-50%) | index itself robust (temporal 0.997); its weight drives composite — excluded 0.772, halved 0.951, doubled 0.906 |
| brokerage | 1 | slack year 365→548 month 92→138 (+50%) | robust in this graph — temporal 1; weight excluded ≥0.94 (brokerage 0.969, reach 0.942) |
| reach | 1 | slack year 365→548 month 92→138 (+50%) | robust in this graph — temporal 1; weight excluded ≥0.94 (brokerage 0.969, reach 0.942) |
| influence | 0.997 | inferred-0.25 | data-sparse — 5 scored, near-zero move is sparsity; weight 0.995 if excluded |
| composite | 0.993 | slack year 365→183 month 92→46 (-50%) | discount/temporal worst 0.993 (slack year 365→183 month 92→46 (-50%)); weight worst 0.772 (weight survival 1→0 (excluded)) — real deltas are weight-driven |

| Composite weight-only worst | Spearman | perturbation |
|---|---:|---|
| composite (weight family) | 0.772 | weight survival 1→0 (excluded) |

## Discount family (influence + composite only — other indices pure, cannot move)

| perturbation | key | Spearman | overlap% | swaps top10 | entered | left |
|---|---|---:|---:|---:|---|---|
| shipped | influence | 1 | 100 | 0 | — | — |
| documented-0.25 | influence | 1 | 100 | 0 | — | — |
| documented+0.25 | influence | 1 | 100 | 0 | — | — |
| reported-0.25 | influence | 1 | 100 | 0 | — | — |
| reported+0.25 | influence | 1 | 100 | 0 | — | — |
| inferred-0.25 | influence | 0.997 | 97.5 | 0 | ibrahim-chaibi | wassila-bourguiba |
| inferred+0.25 | influence | 1 | 100 | 1 | — | — |
| shipped | composite | 1 | 100 | 0 | — | — |
| documented-0.25 | composite | 1 | 100 | 0 | — | — |
| documented+0.25 | composite | 1 | 100 | 0 | — | — |
| reported-0.25 | composite | 0.999 | 100 | 1 | — | — |
| reported+0.25 | composite | 1 | 100 | 0 | — | — |
| inferred-0.25 | composite | 1 | 100 | 0 | — | — |
| inferred+0.25 | composite | 1 | 100 | 0 | — | — |

## Temporal family (window/slack) — per-index + composite

| perturbation | key | Spearman | overlap% | swaps |
|---|---|---:|---:|---:|
| window 8→4 (halved) | authority | 1 | 100 | 0 |
| window 8→16 (doubled) | authority | 1 | 100 | 0 |
| slack year 365→183 month 92→46 (-50%) | authority | 1 | 100 | 0 |
| slack year 365→548 month 92→138 (+50%) | authority | 1 | 100 | 0 |
| window 8→4 (halved) | proximity | 1 | 100 | 0 |
| window 8→16 (doubled) | proximity | 1 | 100 | 0 |
| slack year 365→183 month 92→46 (-50%) | proximity | 1 | 100 | 0 |
| slack year 365→548 month 92→138 (+50%) | proximity | 1 | 100 | 0 |
| window 8→4 (halved) | survival | 1 | 100 | 0 |
| window 8→16 (doubled) | survival | 1 | 100 | 0 |
| slack year 365→183 month 92→46 (-50%) | survival | 0.997 | 97.5 | 0 |
| slack year 365→548 month 92→138 (+50%) | survival | 1 | 100 | 0 |
| window 8→4 (halved) | brokerage | 1 | 100 | 0 |
| window 8→16 (doubled) | brokerage | 1 | 100 | 0 |
| slack year 365→183 month 92→46 (-50%) | brokerage | 1 | 100 | 0 |
| slack year 365→548 month 92→138 (+50%) | brokerage | 1 | 100 | 0 |
| window 8→4 (halved) | reach | 1 | 100 | 0 |
| window 8→16 (doubled) | reach | 1 | 100 | 0 |
| slack year 365→183 month 92→46 (-50%) | reach | 1 | 100 | 0 |
| slack year 365→548 month 92→138 (+50%) | reach | 1 | 100 | 0 |
| window 8→4 (halved) | influence | 1 | 100 | 0 |
| window 8→16 (doubled) | influence | 1 | 100 | 0 |
| slack year 365→183 month 92→46 (-50%) | influence | 1 | 100 | 0 |
| slack year 365→548 month 92→138 (+50%) | influence | 1 | 100 | 0 |
| window 8→4 (halved) | composite | 1 | 100 | 0 |
| window 8→16 (doubled) | composite | 1 | 100 | 0 |
| slack year 365→183 month 92→46 (-50%) | composite | 0.993 | 100 | 0 |
| slack year 365→548 month 92→138 (+50%) | composite | 0.996 | 100 | 0 |

## Composite weight family (reader-weighted composite — each index halved/doubled/excluded)

| perturbation | Spearman | overlap% | swaps | entered | left |
|---|---:|---:|---:|---|---|
| weight authority 1→0 (excluded) | 0.782 | 82.5 | 2 | marouane-mabrouk;slim-riahi;ghazi-chaouachi;ahmed-nejib-chebbi;abdessattar-ben-moussa;najet-jaouadi;ridha-chalghoum | lotfi-ben-jeddou;mourad-saidane;ahmed-mestiri;hassine-gharbi;najla-bouden;habib-ben-yahia;mustapha-ben-jaafar |
| weight authority 1→0.5 (halved) | 0.954 | 90 | 1 | marouane-mabrouk;najet-jaouadi;ridha-chalghoum;ghazi-chaouachi | ahmed-mestiri;najla-bouden;habib-ben-yahia;mustapha-ben-jaafar |
| weight authority 1→2 (doubled) | 0.93 | 87.5 | 1 | tahar-ben-ammar;rachid-ammar;abdallah-kallel;chokri-riahi;mohamed-aziz-bouattour | leila-jaffel;faouzi-elloumi;abdelwahab-ben-ayed;farouk-bouasker;mustapha-ben-jaafar |
| weight proximity 1→0 (excluded) | 0.892 | 70 | 1 | mohamed-aziz-bouattour;mohamed-el-ghoul;rejeb-khaznadar;mustapha-khaznadar;marouane-mabrouk;adel-jehane;mohamed-hajem;mohamed-khamassi;wided-bouchamaoui;ridha-chalghoum;khelifa-harroum;moncef-kchaou | othman-jarandi;ali-seriati;brahim-bertagi;lotfi-ben-jeddou;leila-jaffel;faouzi-elloumi;mourad-saidane;abdelwahab-ben-ayed;farouk-bouasker;ahmed-mestiri;najla-bouden;habib-ben-yahia |
| weight proximity 1→0.5 (halved) | 0.97 | 95 | 1 | marouane-mabrouk;ridha-chalghoum | najla-bouden;habib-ben-yahia |
| weight proximity 1→2 (doubled) | 0.998 | 92.5 | 1 | yadh-ben-achour;ridha-belhaj;nadia-akacha | mohamed-habib-dhif;hassine-gharbi;mustapha-ben-jaafar |
| weight survival 1→0 (excluded) | 0.772 | 47.5 | 1 | tahar-ben-ammar;yadh-ben-achour;ridha-belhaj;hichem-mechichi;lotfi-brahem;habib-ammar;abdelhamid-escheikh;abdallah-kallel;khaled-nouri;kamel-feki;chedli-neffati;mohamed-jegham;rafiq-belhaj-kacem;mohamed-najem-gharsalli;hedi-majdoub;hichem-fourati;rachid-sfar;mehdi-jomaa;mohammed-mzali;nadia-akacha;hassen-belkhodja | khaled-yahyaoui;brahim-bouderbala;nouri-ben-taous;rached-ghannouchi;mohamed-salah-hamdi;othman-battikh;abdelkarim-zbidi;mohamed-habib-dhif;othman-jarandi;ali-seriati;brahim-bertagi;leila-jaffel;faouzi-elloumi;mourad-saidane;abdelwahab-ben-ayed;farouk-bouasker;ahmed-mestiri;hassine-gharbi;najla-bouden;habib-ben-yahia;mustapha-ben-jaafar |
| weight survival 1→0.5 (halved) | 0.951 | 85 | 1 | tahar-ben-ammar;yadh-ben-achour;abdallah-kallel;habib-ammar;ridha-belhaj;rachid-sfar | othman-jarandi;leila-jaffel;faouzi-elloumi;abdelwahab-ben-ayed;hassine-gharbi;mustapha-ben-jaafar |
| weight survival 1→2 (doubled) | 0.906 | 82.5 | 0 | marouane-mabrouk;abdelhamid-belati;ridha-chalghoum;ghazi-chaouachi;slim-riahi;abdessattar-ben-moussa;ahmed-nejib-chebbi | mohamed-ennaceur;lotfi-ben-jeddou;mourad-saidane;farouk-bouasker;ahmed-mestiri;najla-bouden;habib-ben-yahia |
| weight brokerage 1→0 (excluded) | 0.969 | 97.5 | 1 | chokri-riahi | mustapha-ben-jaafar |
| weight brokerage 1→0.5 (halved) | 0.993 | 100 | 0 | — | — |
| weight brokerage 1→2 (doubled) | 0.989 | 95 | 2 | marouane-mabrouk;tahar-ben-ammar | habib-ben-yahia;mustapha-ben-jaafar |
| weight reach 1→0 (excluded) | 0.942 | 95 | 1 | chokri-riahi;marouane-mabrouk | farouk-bouasker;habib-ben-yahia |
| weight reach 1→0.5 (halved) | 0.98 | 97.5 | 1 | chokri-riahi | habib-ben-yahia |
| weight reach 1→2 (doubled) | 0.97 | 95 | 2 | najet-jaouadi;ridha-chalghoum | najla-bouden;mustapha-ben-jaafar |
| weight influence 1→0 (excluded) | 0.995 | 100 | 1 | — | — |
| weight influence 1→0.5 (halved) | 0.999 | 100 | 1 | — | — |
| weight influence 1→2 (doubled) | 0.995 | 100 | 0 | — | — |

## How to read

- Spearman = rank correlation of the full top-40 (does the order move?). 1.0 = identical.
- Overlap% = share of the top-40 that stays in the top-40 (does the set move?).
- Swaps = adjacent rank swaps in the top-10 (does the podium move?).
- “Near-zero deltas on influence + real deltas elsewhere ARE the finding” — the table is published so the claim is checkable, not so it can be collapsed into “validated”.
