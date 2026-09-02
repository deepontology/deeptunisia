# Agora gaps — specified-not-wired

**Date:** 2026-09-02
**Status:** authoritative — schema, code and docs agree as of this date. No claim of production target validation that the Worker doesn't perform.

This file records two Agora gaps and the fixes that closed the drift they named, so a reviewer reading the paper, the code and the docs sees one story.

---

## 1. `threads.target_type` — missing the five v0.0.2 kinds — **fixed**

`community/api.ts:TARGET_TYPES` has listed the five v0.0.2 record kinds since they shipped:

`company`, `contract`, `licence`, `declaration`, `education`

`together with the eight v0.0.1 kinds and `open``. `community/schema.sql:67` listed only the eight, so a thread pinned to a company passed the API and died at the DB (`CHECK constraint failed`). The schema is the bug, not the API.

**Fix 2026-09-02:** `community/schema.sql` CHECK now lists all thirteen values — the eight v0.0.1 kinds plus the five v0.0.2 kinds. `community/server.ts:loadEntityIds()` was also extended to include `companies`, `contracts`, `licences`, `declarations`, `education` (and `regions`, `places`, `agreements`, `worldClaims` — future-proofing, since `ENTITY_IDS` is kind-agnostic: it stores every graph id, and a typed target is valid when its id exists somewhere).

Existing on-disk `.community/community.sqlite` files created before this date still carry the old CHECK; delete the file and let `community/server.ts` recreate it, or re-apply `community/schema.sql` to a fresh D1 database with `wrangler d1 execute deeptunisia-db --file=community/schema.sql`. The CI gate uses an in-memory DB built from the current `schema.sql`, so the fix is immediate there.

---

## 2. Thread tallies hardcoded 0 in reads — **fixed**

`GET /api/threads` returned `post_count` correctly (sub-select on `posts`) but hard-coded

```ts
upvotes: 0,
downvotes: 0,
```

so every thread scored zero, and `community/ranking.ts` ordered trending by SQLite row order. Thread votes were written to `votes` (with the correct `ON CONFLICT` and a per-thread post check) but never aggregated.

**Fix 2026-09-02:** `community/api.ts` now selects

```sql
(SELECT COUNT(*) FROM votes v WHERE v.target_type = 'thread' AND v.target_id = t.id AND v.value = 1) AS upvotes,
(SELECT COUNT(*) FROM votes v WHERE v.target_type = 'thread' AND v.target_id = t.id AND v.value = -1) AS downvotes
```

and returns `t.upvotes`/`t.downvotes`. Posts remain denormalised (`posts.upvotes/downvotes` updated on vote); threads are aggregated from `votes` at read time, so no new column and no migration. `ranking.ts` now receives real tallies; the brigade test already asserts a heavily-downvoted post stays visible — that property is unchanged.

---

## 3. `ENTITY_IDS` unwired in the Worker — **gap, documented here**

`community/api.ts:Env.ENTITY_IDS` is `Set<string> | undefined`. When present, a typed thread (`target_type !== 'open'`) is refused with 404 if `target_id` is not in the set (`spec §15.3 R4`). The local server wires it:

```ts
// community/server.ts
ENTITY_IDS: loadEntityIds() // from src/generated/dataset.json, all graph ids
```

The Worker deliberately does **not** (`community/worker.ts:48-50`):

```ts
// ENTITY_IDS is deliberately absent here until an asset binding is wired
// (spec §15.3 R4): typed thread targets are then accepted by format only,
// and the client's own index check remains the guard.
```

**So in production today a typed target is validated by format only.** The API still rejects an unknown `target_type` (400) and still requires a non-empty `target_id` when `target_type !== 'open'`, but it does not check that the id exists in the graph. The local (developer) server does, once `npm run data` has been run and `src/generated/dataset.json` exists — if the build has not run, `loadEntityIds()` returns `undefined` and the Worker behaviour is the fallback (format-only), which the client still guards.

No public surface may claim production validates a graph id — the gap is specified in `community/api.ts:Env` and in the Worker comment, and is recorded here as authoritative. Wiring `ENTITY_IDS` in the Worker (asset binding for `dataset.json` or a small id manifest) is deferred pending counsel review, not a current fix; until then docs, code and schema agree that production accepts typed targets by format and the build's own tests assert exactly that (`scripts/test-api.ts` R4 block: with `ENTITY_IDS` set, a bad id is 404; without it, format-only).

---

## 4. Petitions — **verdict, recorded here**

Two surfaces disagreed:

* `docs/authenticity.md` Depth 5: petitions at bare headcount are **not deliverable** in 2026 — the whole claim is the count, a count of unverified pseudonyms is a number an adversary can set, and the first credible accusation of inflation destroys the atlas with it. Design frames 1 (publish arguments, not counts) or 2 (named signatures are the strong ones); schema reserves room for a `nullifier` column for 2027 if Tunisia's biometric passport and ICAO PKD both land, but no petition table or endpoint is wired today.
* `output/deeptunisia-release-paper-v0.1.1.md` §5.9: describes petitions as present — *"whose petitions convert discussion into action — always under the same honesty rules as the graph itself"* — and the landing strings (`landing/_strings.en.json:inst.v5d` "Discuss, propose a change, report, petition — around the record, not away from it") echo it.

**Verdict 2026-09-02 — docs is authoritative.** Petitions are **specified-not-wired**, in the same bucket as the posting budget and hold (`docs/posting-limits.md` header, `community/budget.ts` imported by nothing). The paper's §5.9 describes design intent and honesty rules fixed *before* the feature ships, not shipped code; the landing string is aspirational and will be retuned when the feature gates are defined. No endpoint, no table, no count is wired; `docs/authenticity.md` Depth 5 governs. This is the same specified-not-wired posture already applied to the budget/hold — wording, not wiring, and wiring is deferred pending counsel review.

Until both of the authenticity note's 2027 conditions (Tunisia circulates a chip passport **and** joins the ICAO PKD) hold, any petition feature must not publish a bare count — framing 1 or 2 above, with `unverified pseudonymous signatures` labelled as such if a count is shown at all.

---

## 5. What "schema, code and docs agree" means after 2.4

* Schema (`community/schema.sql`) accepts exactly the target types the API advertises.
* Code (`community/api.ts` + `community/worker.ts` + `community/server.ts`) validates typed targets against the graph only where `ENTITY_IDS` is wired, and says so in the type and in comments — nothing in the read or write path implies a production check that the Worker does not perform.
* Docs (`docs/authenticity.md` + this file) rule petitions out for now and record that the paper's petition language is intent, not implementation.
* No public page claims the posting budget, hold, or petition count is enforced — `docs/posting-limits.md` header already says "Specified — not wired ... implementation parked behind counsel review; wiring is deferred pending counsel review."

The Agora remains `AGORA_OPEN = false` in the committed tree (see `docs/agora-launch-decision.md` gates). Opening it is explicitly not part of 2.4.

