# Kind versus strength: the two axes of a claim

DeepTunisia records two different things about a claim, and this note is the
published rubric for both.

- **Kind** (`basis`) answers: what kind of claim is this? `documented`,
  `reported`, `inferred`, `unsubstantiated`.
- **Strength** (`confidence`, A to D) answers: how strong is the evidence behind
  it?

They are not the same axis. The build still derives a kind from the grade when no
kind is authored (`deriveBasis`), because that shorthand got the project this
far, but a kind can now be authored explicitly and the derived value is emitted
beside it as `basis_derived`. A newspaper that reports an appointment remains a
report however confident the editor is; an inference drawn from decrees remains
an inference however strong the decrees are.

## The four kinds, with real records

### documented

An official record, decree, gazette entry or primary document states this.

- `p-pres-essebsi` (Beji Caid Essebsi, president) cites `pm-gov-former`, a
  tier-1 government record of former heads of government.
- `p-pm-essebsi` (same holder, prime minister) cites the same tier-1 record,
  plus a tier-3 encyclopaedia entry for the cabinet. The record is the primary
  evidence; the encyclopaedia is a reading aid.

### reported

One or more credible publications report it; nobody holds the record.

- `p-pm-mzali` (Mohammed Mzali, prime minister) cites one tier-3 encyclopaedia
  entry. No gazette text is held, so the record states what is reported, not what
  a document establishes.
- `p-pm-sfar` (Rachid Sfar, prime minister) is the same shape: one tier-3 source
  alone.

### inferred

Nobody states this directly; it is reasoned from documented structure, and the
record must carry both the reasoning and what would falsify it. The build
refuses an inferred claim without either.

- `p-media-attessia-ouertani` (Naoufel Ouertani, owner of Attessia TV) reads an
  ownership claim out of Wikipedia's infobox that the contemporaneous press does
  not support: in September 2018 he joined the channel as a presenter, bringing
  his flagship show with him. The record keeps the inference, its reasoning and
  its falsifier, and does not wear `documented`.

### unsubstantiated

A claim that circulates without reliable evidence. It is kept, never deleted,
because pretending a widely believed claim does not exist is its own
distortion, and it is never rendered as though it were evidence.

- `rel-armed-forces-presidency-allegation` records a recurring allegation of
  military pressure on the presidency, attributed to public and social-media
  discourse, carried beside two tier-2 academic books that do not establish it.
- `rel-trabelsi-network-presidency-allegation` has the same shape.

## The other axes

Kind and strength are not the whole story. These are recorded separately when a
record uses them.

| Axis | Field | What it says |
|---|---|---|
| Source relationship | `source_relation` | `direct-record`, `direct-report`, `corroborated-report`, `single-report`, `inference-from-records`, `circulating-claim` |
| Independence | `independence` | Count of independent origin groups, never URLs. Two outlets republishing one wire are one origin. |
| Verification state | `verification` | `verified`, `needs-primary-source`, `disputed` |
| Date uncertainty | interval fields | Four fuzzy bounds plus a status; see the time module. |
| Review outcome | `review` | Who checked, when, how. An outcome enum is reserved until governance defines one; unknown fields fail rather than being stripped. |

## What the build enforces (V26)

- `documented` requires `direct-record`. A report relation contradicts holding
  the record itself.
- `reported` allows `direct-report`, `corroborated-report` or `single-report`.
  `inference-from-records` is an inference and fails.
- `inferred` requires `inference-from-records`.
- `unsubstantiated` requires `circulating-claim`.
- The two fields stand or fall together: `source_relation` without
  `independence` fails.
- `independence` is at least 1 and never exceeds the number of cited sources.
- The existing grade-A primary rule (V25) still fails any `confidence: A`
  record that cites no tier-1 or tier-2 source, unless an explicit, deadlined
  exception is live.

## Migration

`output/kind-migration.csv` is the record of the move. Forty claims now carry an
explicit kind, source relation and origin count: thirty whose derived kind
already matched their evidence, eight relabelled `reported` after review, and two
whose appointments were sourced to the JORT decrees and stay `documented` (their
grade-A exceptions retire). Every row names its reviewer and its reason, and
`test-data.ts` fails if a row and the graph disagree.

The assignment is conservative on purpose. Independence counts origin families
(official record, journalism, unclassified), and journalism counts once, because
several outlets may share one wire. The claim-level evidence pass separates them
later. A record is never reclassified wholesale; every row carries its reason.
