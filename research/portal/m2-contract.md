# M2 implementation contract (slice 2)

**Status:** frozen 2026-09-14, for the build now in progress. Workshop document.
**Scope:** runtime instrument contract, submission API, storage, and the route/i18n surface. This narrows the route list in `README.md` §8 for the first slice: methodology, data, results and paper render as sections on the study page until they have content worth a route.

---

## 1. Why a shared contract module

The build script validates instruments with Zod. The deployed API must validate submissions against the same runtime semantics without bundling Zod or importing from `scripts/`. So the runtime shape, the compiler and the submission validator live in one dependency-free module, `community/research-contract.ts`, imported by both sides. The hash function moves there too, so build and API cannot drift.

## 2. Runtime shapes (`community/research-contract.ts`)

```ts
export interface RuntimeItem {
  id: string; module: string; tier: 'core' | 'extended' | 'optional';
  response: string; required: boolean;
  displayed: boolean;                       // response !== 'auto'
  text: { en: string | null; fr: string | null; ar: string | null };
  options?: string[]; maxChars?: number; showIf?: string;
}
export interface RuntimeText { en: string | null; fr: string | null; ar: string | null }
export interface RuntimeMaxDiff {
  id: string; instruction: RuntimeText; pool: string[];
  itemsPerSet: number; sets: number; designStatus: string;
}
export interface RuntimeGap {
  id: string; instruction: RuntimeText; items: string[]; response: string;
}
export interface RuntimeInstrument {
  id: string; study: string; version: string; hash: string;
  sourceLocale: 'en' | 'fr' | 'ar'; locales: Array<'en' | 'fr' | 'ar'>;
  estimatedMinutes: number; completionTargetMinutesMax: number;
  modules: Array<{ id: string; label: string; items: string[]; block?: string }>;
  items: RuntimeItem[];
  maxdiff: RuntimeMaxDiff | null;
  gap: RuntimeGap | null;
  experiments: Array<{ id: string; factor: string; arms: string[]; allocation: string; analysis: string }>;
}
export interface StudiesRegistry {
  meta: { generated: string; count: number; schemaVersion: number };
  studies: unknown[];                        // StudySchema output
  instruments: Record<string, RuntimeInstrument>;  // key: `${id}@${version}`
}
```

Functions:

- `computeInstrumentHash(doc)` returns the sha256 hex of the canonical projection: instrument id, version, sourceLocale, locales, and per item `id, response, required, text_en, text_fr, text_ar`, plus the maxdiff and gap blocks and experiments. Exclude `translation`, `notes`, `status`, `content_hash`. Same input, same hash; a changed item text changes the hash. (Move the implementation from `scripts/research-schema.ts`, which re-exports it for existing imports.)
- `compileInstrument(doc)` returns a `RuntimeInstrument` from a parsed instrument document, with `hash` filled by `computeInstrumentHash`. Structural input only, no Zod.
- `validateSubmission(instrument, payload)` returns `{ ok: true; answers: Record<string, unknown> } | { ok: false; code: string; error: string }`.

### validateSubmission rules

Payload: `{ instrumentHash, locale, channel, consentVersion, startedAt, completionMs, answers, maxdiff?, turnstileToken? }`.

Required and type-checked: hash equals `instrument.hash`; locale is declared; channel matches `/^[a-z0-9_-]{1,32}$/`; consent version non-empty; timestamps and completion are finite numbers. `answers` keys must be ids of displayed items; unknown keys are rejected. Every `response: 'consent'` item must be present and `true`. For every other answer, `null` means skip and is always allowed; otherwise:

| response | accepted value |
|---|---|
| `scale_essential`, `scale_present`, `scale_0_10` | integer 0 to 10 |
| `agree_4` | integer 1 to 4 |
| `single_choice` | one of `options` |
| `multi_choice` | array of members of `options` |
| `text_short` | string, length at most `maxChars` (default 500) |
| `auto` | never accepted from the client |

`maxdiff`, when the instrument has a block: if `designStatus === 'to-generate'`, reject with code `maxdiff-not-generated`; otherwise require one entry per set, `{ set, most, least }` with `most` and `least` in the pool and different from each other. Missing displayed items are skips, not errors.

## 3. Emitted registry (`src/generated/studies.json`)

```json
{ "meta": { "generated": "...", "count": 1, "schemaVersion": 1 },
  "studies": [ /* validated Study records */ ],
  "instruments": { "dt001-democracy@0.1.0-draft": { /* RuntimeInstrument */ } } }
```

`scripts/build-studies.ts` compiles every referenced instrument and validates any declared hash against the compiled hash. `npm run data` appends `tsx scripts/build-studies.ts` so the site build always has the registry.

## 4. API (`community/research-api.ts`)

`handleResearch(request, env, ctx)` with `ctx = { clientAddress, bucketStore, now }`. `community/api.ts` routes `/api/studies` (before its other branches) to it and passes the existing `bucketStore(env.DB)` and `clientAddress(request)`. Applies to all methods and locales.

| Endpoint | Success | Refusals |
|---|---|---|
| `GET /api/studies` | `200 { studies: [{id, slug, status, title_en}] }` | 503 if registry missing |
| `GET /api/studies/:slug` | `200 { study, instrument }` | 404 unknown |
| `GET /api/studies/:slug/instrument` | `200 { instrument }` | 404 unknown |
| `POST /api/studies/:slug/submit` | `200 { receipt }` | 400 invalid payload; 403 `RESEARCH_OPEN` off; 404 unknown study; 409 study not `fielding` or maxdiff not generated; 429 rate limit; 503 storage or bot challenge not configured |
| `POST /api/studies/:slug/withdraw` | `200 { deleted: boolean }` | 400 bad body; 409 study not fielding; 503 storage |
| `GET /api/studies/:slug/count` | `200 { count }` | 404 unknown; 503 storage |

Submit order: parse (cap 20,000 bytes) → study exists → status `fielding` → `RESEARCH_OPEN` on → research storage present → honeypot (`checkHoneypot` from `community/abuse.ts`) → bot challenge → rate limit (`consume(store, clientKey, 'response', now)` with `LIMITS.response = { max: 5, windowMs: 3_600_000 }` added in `community/ratelimit.ts`) → `validateSubmission` → uuid receipt → insert.

Bot challenge: `env.TURNSTILE_VERIFY?.(token, address)` when injected (tests); otherwise `fetch` the Turnstile `siteverify` endpoint when `TURNSTILE_SECRET` is set. With `RESEARCH_OPEN` on and neither configured, refuse with 503. Never log or store the address.

## 5. Storage (`community/research-schema.sql`)

```sql
CREATE TABLE IF NOT EXISTS research_responses (
  receipt TEXT PRIMARY KEY,
  study_id TEXT NOT NULL,
  instrument_id TEXT NOT NULL,
  instrument_version TEXT NOT NULL,
  instrument_hash TEXT NOT NULL,
  locale TEXT NOT NULL,
  channel TEXT NOT NULL,
  consent_version TEXT NOT NULL,
  started_at INTEGER NOT NULL,
  submitted_at INTEGER NOT NULL,
  completion_ms INTEGER NOT NULL,
  block_order TEXT,
  scale_direction TEXT,
  answers TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_responses_study ON research_responses (study_id, submitted_at DESC);
```

No IP, user agent, fingerprint or email column, ever. Local server: `.community/research.sqlite`, schema applied on every start. Cloudflare: a separate `RESEARCH_DB` binding; until the operator creates it, research endpoints that need storage return 503. Add a commented binding example to `wrangler.toml`; do not add a live binding with a placeholder id.

## 6. Environment

| Name | Where | Meaning |
|---|---|---|
| `RESEARCH_DB` | local server + Worker binding | Response storage. Absent → 503 on storage endpoints |
| `RESEARCH_OPEN` | local env, Worker var | `'1'` accepts writes. Absent or other → 403 |
| `STUDIES` | loaded from `src/generated/studies.json` | Compiled registry and instruments |
| `TURNSTILE_SECRET` | Worker secret | Bot challenge, when wired |
| `TURNSTILE_VERIFY` | tests only | Injected verifier `(token, address) => Promise<boolean>` |

Local default: `RESEARCH_OPEN` from `process.env`, default `'0'` (fail closed), with a startup line saying which state it is in.

## 7. Routes and keys (first slice)

Routes: `/research`, `/research/[slug]`, `/research/[slug]/participate`, `/research/[slug]/withdraw`. Add `/research` to `VIEWS` (`key: 'research'`), to the Graph bubble's `docs` list, and to `DOC_PAGES` plus the `/research` prefix check in `src/routes/+layout.svelte`. Nested activation: treat `/research` like `/world` in `activeIndex`/`isActive`.

Dictionary keys (English copy frozen; French and Arabic follow house translation tiers):

| Key | English |
|---|---|
| `nav.research` | Research |
| `guide.research.answer` | Open studies of Tunisian public opinion, with pre-registered methods and open data. |
| `guide.research.when` | When you want to take part in a study, or to read how one was designed, collected and released. |
| `research.eyebrow` | Research |
| `research.title` | DeepTunisia Research |
| `research.lede` | Open, pre-registered studies of Tunisian public opinion. Every instrument, method and result is published, and the limits of each sample are stated where the result appears. |
| `research.studies` | Studies |
| `research.none` | No study is open at the moment. |
| `research.study.about` | About this study |
| `research.study.method` | Method |
| `research.study.data` | Data |
| `research.study.results` | Results |
| `research.study.paper` | Paper |
| `research.study.participate` | Take part |
| `research.study.notOpen` | This study is not accepting responses. |
| `research.study.inDesign` | This study is in design. The protocol and instrument are published as drafts while they are reviewed. |
| `research.study.populationNote` | Participation is open and self-selected. Results describe the people who took part, not Tunisians as a population. |
| `research.study.protocol` | Protocol |
| `research.study.protections` | Participant protections |
| `research.study.instrument` | Instrument |
| `research.study.resultsSoon` | Results will be published here after the study closes. |
| `research.study.dataSoon` | Data will be published here under CC BY 4.0 after the study closes. |
| `research.status.proposed` | Proposed |
| `research.status.design` | In design |
| `research.status.ethics-review` | Under ethical review |
| `research.status.frozen` | Frozen |
| `research.status.fielding` | Open |
| `research.status.closed` | Closed |
| `research.status.analyzed` | Analyzed |
| `research.status.published` | Published |
| `research.status.archived` | Archived |
| `research.participate.eyebrow` | Take part |
| `research.participate.consent` | Before you begin |
| `research.participate.progress` | {n} of {total} |
| `research.participate.next` | Next |
| `research.participate.back` | Back |
| `research.participate.submit` | Submit |
| `research.participate.skip` | Prefer not to answer |
| `research.participate.against` | It is against democracy |
| `research.participate.required` | Please answer before continuing. |
| `research.participate.thanks` | Thank you. Your response has been recorded. |
| `research.participate.receipt` | Your receipt code |
| `research.participate.receiptNote` | Save this code. It is the only way to delete your response while the study is open, and we cannot recover it for you. |
| `research.participate.error` | Something went wrong and your answer was not saved. Please try again. |
| `research.withdraw.eyebrow` | Withdraw |
| `research.withdraw.title` | Delete your response |
| `research.withdraw.lede` | Enter the receipt code you were given. Deletion works while the study is open; after it closes the dataset is frozen and a response cannot be deleted. |
| `research.withdraw.code` | Receipt code |
| `research.withdraw.submit` | Delete my response |
| `research.withdraw.done` | Your response has been deleted. |
| `research.withdraw.notFound` | No response was found for that code. |
| `research.charter` | Research charter |

## 8. Ownership

- `community/research-contract.ts`, `community/research-api.ts`, `community/research-schema.sql`, `scripts/research-schema.ts`, `scripts/build-studies.ts`, `scripts/test-research-contract.ts`, `scripts/test-research-api.ts`, `community/api.ts`, `community/server.ts`, `community/worker.ts`, `community/ratelimit.ts`, `wrangler.toml`, `package.json`: server slice.
- `src/lib/i18n.ts`, `src/lib/views.ts`, `src/lib/shell/nav.svelte.ts`, `README.md` views table, `src/routes/+layout.svelte`, `src/content/guide.*.md` if needed: i18n and chrome.
- `src/routes/research/**`, `src/lib/research.ts`: routes, by the maintainer.

## 9. Recorded decisions (2026-09-14, first implementation)

Settled during the build where §4 was silent. All fail closed.

1. **Failed challenge is 403**, distinct from 503 (challenge configured but the token is missing or invalid, versus no challenge configured at all).
2. **`block_order` and `scale_direction` are stored null.** The arms are platform-recorded items a client can never submit, and no assignment module exists yet. Before fielding, the submit endpoint must assign both arms server-side (50/50) and write them; the client is never trusted to randomize. Open item in the execution plan.
3. **Withdraw on an unknown slug returns 404**, consistent with the other reads.
4. **A study with no compiled instrument returns 404** with a distinct message on `GET /api/studies/:slug` and `.../instrument`, rather than a silent empty object.
5. **The MaxDiff design is generated and compiled into the runtime instrument at the freeze step (M3).** The runner omits the block until then, and `validateSubmission` rejects any submission that claims one against a `to-generate` design.
6. **Experiment arms are assigned server-side at instrument fetch (design settled 2026-09-15, implementation at freeze).** `GET /api/studies/:slug/instrument` assigns block order and scale direction 50/50 and returns them with an HMAC-signed token bound to a server secret; submit returns the token, and the server verifies it before storing. Client-side randomization is not acceptable: the block order must be fixed before the respondent sees the first block, so an assignment made at submit time cannot control presentation. The runner reads its assignment from the fetch and orders the blocks accordingly. Until this lands, the runner renders the instrument's declared order and the stored arms stay null; the study cannot be fielding in that state.

## 10. Runner completion interfaces (settled 2026-09-15)

**MaxDiff generation.** Pool of 15, 8 sets of 4. Each item appears 2 or 3 times, no ordered pair repeats within a set list, and per item the position counts differ by at most 1. Generated with a fixed seed and frozen into the instrument: `maxdiff_priority.design.status: generated` and `design.sets: [{ id, items: [4 item ids] }]`. The runtime type becomes `{ id, instruction, pool, setCount, itemsPerSet, designStatus, sets: [{ id, items }] }` (the old numeric `sets` is renamed `setCount`). Sets are part of the instrument content hash. `validateSubmission` requires exactly one `{ set, most, least }` entry per set id, with `most` and `least` members of that set and different from each other; duplicate set ids are refused. A `to-generate` design keeps its current behaviour, including the dev waiver.

**Assignment.** `GET /api/studies/:slug` and `GET /api/studies/:slug/instrument` return `assignment: { blockOrder: 'core_first' | 'extended_first', scaleDirection: 'ascending' | 'descending', token }`, where `token` is hex HMAC-SHA256 over `${study.id}|${blockOrder}|${scaleDirection}` keyed by `ASSIGNMENT_SECRET ?? RATE_PEPPER`. Submit accepts `assignment`; the server verifies the token and both values and stores the arms. Absent assignment: 400 when the study is fielding in production, allowed under the dev override. Invalid token or values: 400 always.

**Minimum completion time.** Submit rejects 400 when `completionMs < instrument.estimatedMinutes * 0.4 * 60_000`, placed in the ladder after the rate limit and before full validation. The dev override waives it, because manual testing cannot spend five minutes per submission. The threshold is provisional until the pretest median replaces the formula.

**Submit payload, final shape.** `{ instrumentHash, locale, channel, consentVersion, startedAt, completionMs, answers, maxdiff?, assignment? }`.
