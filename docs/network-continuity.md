# Network continuity

The H1 hypothesis asks whether a relatively stable group of security and economic
elites has controlled Tunisia through every regime change. The personnel reading of
that question is already contradicted: no individual is certainly in post at
1987-11-07, 2011-01-14 and 2021-07-25. But personnel discontinuity is not network
discontinuity. A chain of up to three recorded links can join a person in command at
one rupture to a person in command at the next even when nobody spans all three.

`scripts/network-continuity.ts` runs that second question against the built graph and
publishes `output/network-continuity.json` (also emitted at
`src/generated/network-continuity.json` for the interface). `scripts/test-network-continuity.ts`
gates it.

## Definitions

- **Cohorts.** Holders certainly active at each rupture date, over security-layer
  roles with authority at or above the published floor (40). Possibly-active-only
  holders are listed in a watch list and never counted in the cohort.
- **Edges.** Succession between consecutive holders of one command role when the gap
  is under the published succession threshold; recorded appointment relationships;
  `command` and `patronage` relationship subtypes; and institutional co-membership
  between two command-post tenures with a real overlap. Family ties, business ties,
  and co-membership anywhere outside the command network are excluded by construction.
- **Time order.** For consecutive edges, the earlier edge's end is not after the later
  edge's start. Unknown ends take the dataset cutoff.
- **Grade gate.** A primary path has every edge documented or reported with at least
  one tier-1/2 source, or a live exception in `data/source-exceptions.yaml`. Paths with
  no unsubstantiated edge but a weaker grade are published as secondary. Any
  unsubstantiated edge excludes the path from the count entirely.
- **Null controls.** The same query runs over degree-bucketed shuffled cohorts and over
  random date sets of the same sizes, seeded so the gate is deterministic.

## What the probe can and cannot show

A surviving primary path is evidence of a longitudinal bridge worth investigating; it
is not proof of coordinated continuity. Conversely, no path under these thresholds
does not prove that no network existed: the dataset holds what the sources support,
and missing middlemen break paths.

The null controls are part of the result, not a footnote. Where random cohorts produce
as many paths as the real cohorts, the metric cannot separate real continuity from a
small, densely connected elite, and no continuity claim is made at that threshold.
The interface publishes the real count beside the null distribution.

## Review

`output/network-continuity-review.csv` is the human triage surface: every surviving
path, its edges, grades and verdict are recorded there by a reviewer (supported,
refuted or unresolved), and refuted paths stay in the file. The probe ships before
that pass with its numbers labelled provisional.
