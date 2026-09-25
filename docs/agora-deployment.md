# Agora — Deployment and Mode Contract

**Updated:** 2026-09-25 (v0.1.3 plan, milestone M1)
**Status:** Production runs `off`. The code is staged; the client is not public.

## The mode contract

The operating mode is enforced by the server. A constant in the interface can
hide the tab; it cannot stop `POST /api/whoami` from minting an identity against
a live database. So the interface reports the mode and the handler enforces it.

| Mode | Public reads | Public writes and identity creation | Production |
|---|---|---|---|
| `off` | None | None | **yes — the default** |
| `read-only` | The public `GET` routes only | None | no |
| `beta` | Yes | Yes (signed API) | no |

`off` returns the same `404` for every `/api/*` route, with `cache-control:
no-store`, before any D1 query, signature check, nonce write, or moderation
action. A path that does not exist and a path that does are indistinguishable
from outside.

An absent or unrecognised value resolves to `off`. There is deliberately no
ambient default anywhere: `community/mode.ts` is the only resolver, and it is
called by the Worker and by the local server.

The posting budget, the ten-minute hold and petitions remain **specified but
unwired**, in every mode and every locale. `beta` enables the signed API, not
those.

## Two settings, and they must agree

| Setting | Where | Role |
|---|---|---|
| `COMMUNITY_MODE` | `wrangler.toml` `[vars]`, or the local environment | **Authoritative.** The server's enforced state. |
| `VITE_COMMUNITY_MODE` | Build environment | **Display only.** Whether the interface renders the live client or the closed banner. |

The client cannot open anything: a build compiled with `beta` pointed at a
server running `off` gets the uniform `404` on every request. What that
mismatch *does* do is show a reader a working-looking interface that answers
nothing, or hide working software behind a banner. `scripts/verify-deploy.cjs`
fails the deployment when the two disagree.

```bash
npm start
```

sets both halves of the dev loop to `beta` (overridable with `COMMUNITY_MODE`
or `VITE_COMMUNITY_MODE`), so development and production differ by configuration
rather than by a code edit.

## Deployment steps

### 1. Build the static atlas

```bash
npm run build
```

Produces `build/` with the prerendered routes. Give the build
`VITE_COMMUNITY_MODE` only if the deployment is not running `off`; an unset
value renders the closed state.

### 2. Set secrets (one-time)

```bash
# Rate-limit pepper (random string, never committed)
wrangler secret put RATE_PEPPER

# Moderator public keys (comma-separated Ed25519 public keys)
wrangler secret put MODERATORS
```

### 3. Initialise the D1 database

```bash
wrangler d1 execute deeptunisia-db --file=community/schema.sql
```

The rows stay when the mode closes. Containment is a read path, not a deletion:
nothing in this checklist removes public data.

### 4. Set the mode

`wrangler.toml` ships:

```toml
[vars]
COMMUNITY_MODE = "off"
```

Raise it only with a deliberate edit to that file, which puts the change under
review like any other. There is no staging environment: one existed and its D1
binding pointed at the production database, so a staging deploy would have
written production data under a name that said otherwise. It returns when a
distinct database exists.

### 5. Deploy and verify

```bash
wrangler deploy
node scripts/verify-deploy.cjs https://deeptunisia.org off
```

The second argument is the mode being claimed. Verification never proceeds
against the mode someone hoped for: if the deployment runs `off` and the command
asks for `beta`, the checks fail.

- [ ] Every probed `/api/*` route returns the uniform `404` (in `off`)
- [ ] The refusals are byte-identical and not cacheable
- [ ] `/agora` renders the closed banner, and the live client does not render
- [ ] Identity minting, thread creation, mentions and moderation are unreachable
- [ ] `npm run data`, `npm run test`, `npm run check` are green

## Architecture notes

- **Static assets survive Worker failure.** The atlas is files; only `/api/*`
  invokes code.
- **Free tier.** Reading the map costs nothing; only Agora activity counts.
- **No secrets in code.** `RATE_PEPPER` and `MODERATORS` are set via
  `wrangler secret put`.
- **Observability at 1%.** Worker logs sample at 1% — enough for debugging, not
  enough for surveillance.
- **`ENTITY_IDS` is absent on the Worker.** Until a graph-backed asset binding
  is verified, beta thread targets are format-validated rather than checked
  against the production graph. That limitation is documented, not hidden, and
  it only matters when the mode is `beta`.

## Rollback

To close the Agora:

```bash
# wrangler.toml
[vars]
COMMUNITY_MODE = "off"
wrangler deploy
```

No rebuild is required to close: the mode is runtime configuration. Existing
threads and posts are preserved in D1. The interface follows on the next build;
until then a stale `beta` client renders a live interface whose requests are all
refused, which `verify-deploy.cjs` will not pass.

## Human gates (operator decision required)

Before raising the mode, the operator should confirm:

1. **Moderation protocol:** Who holds the MODERATORS keys? What's the response
   time for reports?
2. **Legal posture:** `docs/legal-brief.md` records the operator's position. Is
   it still current? `docs/agora-launch-decision.md` still governs whether the
   section opens at all.
3. **Backup:** Is the D1 database included in any backup strategy?
