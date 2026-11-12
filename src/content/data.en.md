---
translated_by: human
---

{#lede}

The website is a window; the knowledge graph is the actual project. It is published in full so the reasoning can be audited rather than believed. Free to use with attribution — if you build on it, cite DeepTunisia and the underlying sources.

The graph is released under [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) (attribution only — reuse freely, including commercially, keep the credit). The code that builds it is MIT. See `data/LICENSE` in the repository for what each covers.

## How to read a record {#read}

Two fields carry most of the epistemic weight. `basis` says what kind of claim this is: documented, reported, inferred or unsubstantiated. The interval carries four date fields rather than two, because historical personnel records are rarely precise and collapsing them would invent certainty. `raw` preserves exactly what was authored, so you can see the difference between a decree date and an estimate.

Here `status: "last-verified"` means the officeholder was confirmed in post on 1 October 2025 and may well have continued. It does not mean they left. That distinction is the difference between a dataset and a guess, and it is why the Chronicle draws that bar with a soft right edge.

## What the verification field says {#verification}

`verification` answers one question: has a person opened the source and confirmed that it says what the record says? The four values mean exactly this, everywhere in the schema, the exports and these pages:

Before 1.0, the build wrote `verified` on every record that said nothing, so the old files marked thousands of records verified that no person had opened. That is why the default is now `unflagged`; in a file written before 1.0, `verified` means only that the file was silent.

The `status: "last-verified"` shown above is a different field. It says when the officeholder was last confirmed in post, not that a person checked the record against a source.

## Caveats you should carry with the data {#caveats}

- **{needsPrimary} records await a primary source.** They are marked. Do not cite an inferred span as a date.
- **{contradictions} contradictions are unresolved.** Where sources disagree, the dataset records the disagreement instead of choosing. Check the `disputes` array before using a figure.
- **The pre-2011 police chronology is the weakest area.** The sequence of national police chiefs under Ben Ali rests largely on secondary sources.
- **The authority weights are editorial.** They are a judgement about formal authority, published on the [method page](/methodology) so you can substitute your own.
- **{checkedByPerson} records have been checked by a person, {passedByAgent} by an agent, and {unstated} carry a review note that does not say who read it, of {reviewable} reviewable; independent checks stand at zero.** Treat the rest as compiled but unaudited.

## Rebuilding it yourself {#rebuild}

The source of truth is YAML, not this JSON. The build validates every reference, rejects any claim without a source, rejects an inference without stated reasoning and a falsifier, rejects an unattributed low-confidence claim, and derives all succession chains from the position records so gaps surface instead of being smoothed over. If it builds, the referential integrity holds.
