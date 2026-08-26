---
translated_by: human
---

{#lede}

The website is a window; the knowledge graph is the actual project. It is published in full so the reasoning can be audited rather than believed. Free to use with attribution — if you build on it, cite DeepTunisia and the underlying sources.

The graph is released under [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) (attribution only — reuse freely, including commercially, keep the credit). The code that builds it is MIT. See `data/LICENSE` in the repository for what each covers.

## How to read a record {#read}

Two fields carry most of the epistemic weight. `basis` says what kind of claim this is: documented, reported, inferred or unsubstantiated. The interval carries four date fields rather than two, because historical personnel records are rarely precise and collapsing them would invent certainty. `raw` preserves exactly what was authored, so you can see the difference between a decree date and an estimate.

Here `status: "last-verified"` means the officeholder was confirmed in post on 1 October 2025 and may well have continued. It does not mean they left. That distinction is the difference between a dataset and a guess, and it is why the Chronicle draws that bar with a soft right edge.

## Caveats you should carry with the data {#caveats}

- **{needsPrimary} records await a primary source.** They are marked. Do not cite an inferred span as a date.
- **{contradictions} contradictions are unresolved.** Where sources disagree, the dataset records the disagreement instead of choosing. Check the `disputes` array before using a figure.
- **The pre-2011 police chronology is the weakest area.** The sequence of national police chiefs under Ben Ali rests largely on secondary sources.
- **The authority weights are editorial.** They are a judgement about formal authority, published on the [method page](/methodology) so you can substitute your own.
- **Only {reviewed} of {reviewable} records have been through independent human review.** Treat the rest as compiled but unaudited.

## Rebuilding it yourself {#rebuild}

The source of truth is YAML, not this JSON. The build validates every reference, rejects any claim without a source, rejects an inference without stated reasoning and a falsifier, rejects an unattributed low-confidence claim, and derives all succession chains from the position records so gaps surface instead of being smoothed over. If it builds, the referential integrity holds.
