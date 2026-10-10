# Platform backend and data handling

**Status:** working document, 2026-09-15. Describes what exists in code today and what changes before real participants.
**Audience:** the maintainer, future contributors, and anyone who needs to know exactly where a response goes.
**Companions:** `m2-contract.md` (the frozen API contract), `study-001/protocol.md` §7 (capture and protections), `study-001/participant-protections.md`.

---

## 1. What runs where

Three runtimes, deliberately separated:

| Piece | What it is | Reads/writes graph data? | Reads/writes responses? |
|---|---|---|---|
| Static site | Prerendered SvelteKit output (files). Every page except `/api`. | Build time only | No |
| API | One Workers-style `fetch` handler, `/api/**`. Cloudflare Worker in production, Node http server locally. | No | Yes |
| Database | Cloudflare D1 in production, `node:sqlite` locally. Two logical stores: community and research. | No | Yes |
| Zenodo | Released microdata and the DOI. | No | Never raw rows |

The site never needs a server: the graph is compiled into JSON at build time and shipped as files. The API exists only for the two dynamic layers (Agora discussion, research submission). A dead API takes down discussion and submissions and leaves every reading surface untouched.

**Why two databases.** The community store holds forum posts under pseudonymous identities; the research store holds survey responses with no identities at all. They share no tables, no keys and no join. In production they are two D1 databases with two bindings (`DB`, `RESEARCH_DB`). Locally they are two files under `.community/` (`community.sqlite`, `research.sqlite`).

## 2. Local development

```bash
npm ci --ignore-scripts
npm run data                 # compiles the graph and data/studies/ into src/generated/
npm start                    # atlas on 5173 and API on 5200 (scripts/dev-all.ts)
```

Ports are configurable now: `PORT` sets the API port, `DT_API_PORT` tells Vite where to proxy `/api`. That matters in this repository because many worktrees run side by side; two of them were already holding 5200 and 5201 while this was written.

**Local databases.** The API creates `.community/community.sqlite` and `.community/research.sqlite` on first start, applies both schemas on every start, and generates a rate-limit pepper file next to them. All of `.community/` is gitignored. A database file is never committed.

**Dev fielding mode.** A local-only switch for building and testing the survey while the canonical registry still says `design`:

```bash
PORT=5311 RESEARCH_OPEN=1 RESEARCH_DEV_STUDY=democracy npx tsx community/server.ts
```

- `RESEARCH_OPEN=1` opens writes (without it, submit returns 403).
- `RESEARCH_DEV_STUDY=<slug or id>` makes that one study behave as `fielding` for reads of its own endpoint and for submit and withdraw. The list endpoint still reports the declared status, and the registry is never rewritten.
- The bot challenge is skipped for that study, because no Turnstile secret exists locally.
- The MaxDiff requirement is waived for that study, because the forced-choice design is not generated yet.
- The server prints a loud warning at startup. The Worker never reads this variable, so production cannot enter the mode even if someone sets it in the wrong place.
- Dev mode is not a fielding mode: it collects test submissions only, and the study page and protocol still describe the study as in design.

## 3. Data model

One table holds every response.

```sql
CREATE TABLE research_responses (
  receipt            TEXT PRIMARY KEY,   -- random UUID, the only handle on the row
  study_id           TEXT NOT NULL,      -- dt-research-001
  instrument_id      TEXT NOT NULL,      -- dt001-democracy
  instrument_version TEXT NOT NULL,      -- 0.1.0-draft
  instrument_hash    TEXT NOT NULL,      -- sha256 of what the respondent was shown
  locale             TEXT NOT NULL,      -- ar | fr | en
  channel            TEXT NOT NULL,      -- reddit | instagram | organic | ...
  consent_version    TEXT NOT NULL,      -- version + short hash
  started_at         INTEGER NOT NULL,   -- ms epoch
  submitted_at       INTEGER NOT NULL,   -- ms epoch
  completion_ms      INTEGER NOT NULL,
  block_order        TEXT,               -- signed experiment arm, server-assigned
  scale_direction    TEXT,               -- signed experiment arm, server-assigned
  answers            TEXT NOT NULL,      -- JSON object, item id -> value | null
  maxdiff            TEXT,               -- JSON array of { set, most, least } or null
  created_at         INTEGER NOT NULL
);
```

Column by column, the reasons that matter:

- **`receipt`** is a random UUID returned once. It enables withdrawal and nothing else. Holding it is the only way to delete a row; the study team cannot map it to a person because nothing else about the person is stored.
- **`instrument_hash`** binds every answer to the exact questionnaire the respondent saw. If the instrument text changes, the hash changes, and a response can never be interpreted against a different wording. The hash is computed over item text, response types, blocks and experiments, excluding translation notes and status.
- **`answers`** is a JSON object of `item id -> value`. Values are integers (scales, agreement), strings (single choice), arrays (multi choice), booleans (consent), or `null` for an explicit skip. Unknown item ids and out-of-range values are refused at the door; nothing is coerced silently.
- **`block_order` / `scale_direction`** are the embedded experiment arms, assigned server-side 50/50 when the instrument is fetched, returned with an HMAC-signed token, and verified at submit (`m2-contract.md` §10). They are null only when a local dev-override submission arrives without an assignment.
- **`maxdiff`** holds the forced-choice answers as a JSON array with one `{ set, most, least }` entry per generated set. The runner renders the eight sets, the API requires every set when the design is generated, and what it validates is what it stores.
- **No column can hold** an address, user agent, fingerprint, email, name, account or location. That is not a policy that could be forgotten; there is nowhere to put it. The connection address is seen transiently by the server for one purpose, and the rate limiter stores only `sha256(address | daily salt | secret)`, with the salt rotating daily.

The community store's `rate_buckets` table is shared for rate limiting across both layers, keyed by that salted hash. Losing the database still reveals no address.

## 4. Request lifecycle

**Fetch the study** (`GET /api/studies/:slug`) returns the study summary and the compiled instrument. The site's page shell renders from the build-time registry; the fetch tells it the live status, which is how dev fielding and (later) server-side arms reach the browser.

**Submit** (`POST /api/studies/:slug/submit`) passes an ordered ladder. Every step fails closed:

| # | Check | Failure |
|---|---|---|
| 1 | Body parses, capped at 20,000 bytes | 400 |
| 2 | Study exists in the compiled registry | 404 |
| 3 | Effective status is `fielding` (or dev override) | 409 |
| 4 | `RESEARCH_OPEN === '1'` | 403 |
| 5 | Research store is bound | 503 |
| 6 | Honeypot fields empty | 400 |
| 7 | Bot challenge (skipped only under dev override) | 403 / 503 |
| 8 | Rate limit: twenty submissions per address per hour | 429 |
| 9 | Full `validateSubmission`: hash match, declared locale, channel format, consent true, unknown ids refused, ranges and options checked, text length capped | 400 |
| 10 | Receipt generated, row inserted | 500 on storage error |

**Withdraw** (`POST /api/studies/:slug/withdraw`) deletes by receipt while the study is fielding. **Count** (`GET /api/studies/:slug/count`) returns the number of completed responses for the study, never individual rows. Reads of the instrument are unauthenticated and unlimited; throttling readers would mean identifying them.

## 5. From responses to published results

The build never reads the database. The path is deliberately offline:

1. Close the window; writes are disabled on the server.
2. Export rows to a working CSV on the operator's machine.
3. Apply the pre-registered exclusion rules mechanically and record counts per rule and per channel.
4. Run the analysis; write `data/studies/<study>/results.yaml` with aggregates, realized n, weighting and the population statement.
5. `npm run studies:build` validates the aggregates and emits the static pages; a verifier test recomputes the published tables from the released CSV.
6. Deposit the anonymized microdata and codebook to Zenodo, record the DOI.
7. Purge the working CSV and the raw rows; open text is purged after coding.

This is why `src/generated/studies.json` can be committed as build output while no response ever is.

## 6. Deployment topology

`wrangler.toml` today: one Worker (`community/worker.ts`), the static `build/` directory as assets, one D1 binding (`DB`) for the community store, a small observability sample rate.

To put research in production, four changes, each mechanical:

1. Create the research D1 database and add the `RESEARCH_DB` binding (a commented example sits in `wrangler.toml`).
2. Apply `community/research-schema.sql` to it (`wrangler d1 execute`).
3. Set `RESEARCH_OPEN=1` for the fielding window and remove it at close.
4. The human-check switch is off by default; run on the first-party proof of work by leaving both Turnstile variables unset, and switch it on for an attack as described below.

**The human-check switch (Cloudflare Turnstile).** Off by default; the default is the first-party proof-of-work puzzle, with no request to any other company. The switch opens only when BOTH a secret and a public site key are set, and it is meant for the duration of an attack, off again afterwards.

To turn it **on**:

```bash
wrangler secret put TURNSTILE_SECRET
```

`TURNSTILE_SITEKEY` is public (not a secret), so it is a Worker var. Add it under `[vars]` in `wrangler.toml`, near the `TURNSTILE_SECRET` example already there, then deploy:

```toml
[vars]
TURNSTILE_SITEKEY = "<the public site key from the Cloudflare dashboard>"
```

```bash
wrangler deploy
```

To turn it **off**, remove both and redeploy:

```bash
wrangler secret delete TURNSTILE_SECRET
# and delete TURNSTILE_SITEKEY from [vars], then:
wrangler deploy
```

Off means removing both: leaving only the secret refuses everyone (the page can no longer render a widget), and leaving only the site key does nothing (verification never runs). While it is on, the survey runner loads the widget from `challenges.cloudflare.com` and shows a line saying so, and the Content-Security-Policy for the participate route alone is widened to that origin in `static/_headers`; every other route keeps the strict policy. The proof-of-work puzzle is required in both modes, and the twenty-per-hour address limit is unchanged either way.

`RESEARCH_DEV_STUDY` is never set in the Worker. `AGORA_OPEN` stays a separate switch for the discussion layer. The release command chain is `npm run build && wrangler deploy`, and the build order guarantees the Worker bundles the compiled registry before deployment.

## 7. Failure modes

| Failure | Behaviour |
|---|---|
| API down | Pages keep serving; submission unavailable and says so |
| Research store missing | 503 on writes; reads of instrument and count degrade to explicit errors, never silent success |
| Challenge missing while open | 503; the platform refuses rather than collecting unchallenged |
| Study not fielding | 409; this is what keeps an unapproved study inert even if deployed |
| Flag off | 403 |
| Flood | 429 per salted-hash bucket; nothing about the caller is stored |
| Instrument changed | hash mismatch, 400; the response cannot land against a different wording |

A dump of the research database yields rows of answers with no names, no addresses and no accounts. A dump of the community database yields pseudonymous forum data in the same state. The worst realistic leak is the set of opinions themselves, which is why the population statement, not the database, is the honesty mechanism.

## 8. Runbook

```bash
# Local stack with dev fielding
npm run data
PORT=5311 RESEARCH_OPEN=1 RESEARCH_DEV_STUDY=democracy npx tsx community/server.ts
DT_API_PORT=5311 npx vite dev --port 5173 --strictPort

# Smoke the API
curl -s localhost:5311/api/studies/democracy | head -c 200
curl -s localhost:5311/api/studies/democracy/count

# Export and aggregate (release step, after the window closes)
npm run studies:export -- --db .community/research.sqlite --study dt-research-001 --out research/portal/study-001/data/responses.csv
npm run studies:aggregate -- --in research/portal/study-001/data/responses.csv --study dt-research-001
npm run studies:build
```

Backups: export D1 snapshots while a window is open; never commit a database file, and never copy one into `static/`.

## 9. What changes before real participants

The build path is ready; the fielding path is not. Before anyone outside the team answers a question:

- The dev challenge waiver is gone; in production the first-party proof of work runs, with the Turnstile switch (secret and site key) available for an attack.
- Research D1 binding created; response storage no longer local.
- Minimum-completion threshold replaced with the pretest median (the provisional formula is enforced today; the dev waiver skips it).
- Retention and purge jobs scheduled rather than manual.
- Legal and data-protection review complete, and the participant protections text matches the code item for item.
- Human translations frozen; no null locale text in a fielding instrument.
- Pre-registration filed with the instrument hash.

Until then, dev fielding exists to build and test the instrument, and nothing it collects is study data.

---

*Working document, 2026-09-15. It describes this branch; it is not a deployment guide for the public site.*
