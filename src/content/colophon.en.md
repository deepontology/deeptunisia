---
translated_by: human
---

{#intro}

DeepTunisia was built by one person, with a swarm of AI assistants.

That sentence needs a paragraph, because it is easy to read wrong.

## One person, many models {#what}

The codebase, the build pipeline, the validators, the map and network views, the research scaffolding — all of it was written in collaboration between one human and many models, working in parallel through OpenCode. At any given week that meant tens of concurrent assistants, across several frontier model families, drafting, checking, and revising the same files.

That is why this project exists at this scale. A single person does not ship a knowledge graph, a temporal renderer, a trilingual instrument and an evidence-graded build without that leverage. It would have been impossible otherwise.

And it is still one person who decides. The swarm does not run on its own, it does not watch the news, and it does not publish.

## The paper: the epistemology is the compiler {#paper}

The idea is written down in the [research paper](/deeptunisia-paper-v0_1-release.pdf) linked from the landing page — *The Epistemology Is the Compiler*.

Its thesis is simple: asking editors to remember an evidence policy is not enforcement. So this project compiles the policy instead.

Every claim in the dataset carries its evidence with it — source, provenance, what kind of claim it is (`documented` | `reported` | `inferred` | `unsubstantiated`), and where needed who is making it and what would falsify it. The build refuses anything that arrives without that envelope:

- an inference without the reasoning and the falsifier
- a low-confidence claim without naming who makes it
- a claim without a source
- an impossible date
- an influence claim that does not anchor to anything documented

That is not a guideline. The build fails. A candidate that lacks these is rejected at the gate and never merges. The paper calls this property *"the dataset cannot be quietly wrong"* — not that it cannot be factually wrong, but that it cannot silently violate its own declared contract.

The paper is the frozen, citable form. The live form is the graph itself and the pages that describe it — [/methodology](/methodology) for how a claim is filed, [/about](/about) for how much has actually been verified.

## What the swarm did not do {#not}

No claim enters the graph because a model wrote it.

[Investigate](/investigate) answers by traversing the graph and citing records. It does not generate prose. The news-feed matcher links a headline to a person by deterministic string matching, never a language model.

Three places models *do* touch the artefact, and each is labelled where it happens:

- **Translation drafts.** Content marked `translated_by: machine` or `model-reviewed` was produced by a model, with a second model pass for `model-reviewed`. No person who reads the language has seen it. Only `human` means a person did. The counts per tier are published on [/about](/about) and never summed.
- **Research candidates.** Files in `data/contrib/` may be drafted with LLM assistance. They are proposals, not data, until a human checks the cited source and the claim, and merges them through the same gate every other edit passes.
- **Scaffolding and code.** The surrounding application was co-authored the same way. The code is MIT; the cited sources the graph points to remain under their own terms.

## Human review can be AI-assisted — still human {#review}

A human who reviews a record may use AI assistance to do it — to compare a decree against the claim, to surface a date contradiction, to summarize a source, to draft a falsifier.

The assistance does not change the rule: the human remains responsible for the judgement. The graph records that a human checked it, when, and how (`method`, `date`) — without publishing a personal name on the public record. Fuller attribution lives in version control, so the check remains auditable without exposing contributors. The model's output never enters the graph on its own; it re-enters only as a candidate through the same gate every other edit passes, where the build checks it again.

## Why we do not overclaim {#why}

Two numbers explain the restraint:

- Only a small fraction of records have had independent human review. The exact figure is on [/about](/about); it is deliberately unflattering, and broken out by risk — `unsubstantiated` and `inferred` claims sit near zero.
- Most dataset prose is not yet human-translated. Long-form analytical text is deliberately not machine-translated, because fluency must never read as verification.

The project's stated architecture is *machines propose, humans verify*. The second half is the load-bearing one. Almost nothing has been through a second pair of eyes yet, and publishing that number is the only way the first half means anything.

## How to tell {#how}

- Any content page tells you its `translated_by` tier in its frontmatter.
- Any record tells you its `basis`, its sources, and — for `inferred` — the falsifier.
- Any change tells you its diff. [/corrections](/corrections) is generated from version control, not curated.

If you re-use the graph, keep the `basis` attached to the claim. Presenting an inferred span as a date, or an `unsubstantiated` claim as a finding, misrepresents the source — no matter what tool helped draft the paragraph around it.
