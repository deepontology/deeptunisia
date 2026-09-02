# Commit & Tag Signing — signed commits + automated DOI (Phase 2.2)

**Status:** Enforced — `commit.gpgsign true` + `tag.gpgsign true` (SSH ED25519), branch protection requires verified commits, release workflow verifies signed tags and deposits to Zenodo.

**Paper reference:** §9 availability section — "git authorship is attributable in the sense of a dated, named diff, but it is not cryptographically authenticated" — and data-availability promise of a DOI "before submission." Both are now mechanical: authorship is signed, the DOI is minted by a tag.

> Authorship "is a claim like any other" — so it is signed like any other. A dated, named diff without a signature asserts who edited the graph; a signed diff proves it.

---

## Why it matters

Without signing, a commit's `author` field is a claim any writer can forge. The build's determinism and the published exports do not depend on signing — `npm run data` reads files, not git history — but the *attribution* of each data edit does. For a project whose thesis is that unenforced claims must not pass as facts, authorship of the dataset is itself a claim that should be enforceable.

Signing turns "who wrote this" from a header into a verification:

- A commit proves which key holder authored it.
- A tag proves which key holder cut the release that Zenodo then archives as `v0.2` → `doi:10.5281/zenodo.…`.

The local build never needs the signature to run; the release pipeline does.

---

## What is signed, with what

| Object | Signed | Method | Key | File |
| --- | --- | --- | --- | --- |
| Every commit | yes | SSH ED25519 | `~/.ssh/id_ed25519.pub` (operator) | `commit.gpgsign true` |
| Every tag `v*` | yes — must be annotated (`-s`/`-a`) | SSH ED25519 | same key | `tag.gpgsign true` |
| Lightweight tags | rejected | — | — | release workflow fails on them |

```ini
# .gitconfig (already set on the canonical machine — same on any contributor clone)
[gpg]
  format = ssh
[gpg "ssh"]
  allowedSignersFile = ~/.config/git/allowed_signers
[commit]
  gpgsign = true
[tag]
  gpgSign = true
[user]
  signingkey = /home/adala/.ssh/id_ed25519.pub
```

`~/.config/git/allowed_signers` (single line, commit this key to the runner via
repo variable `SSH_ALLOWED_SIGNERS` if local verify is desired):

```
deepontology@users.noreply.github.com ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIDc+CtYOvnXLU0GEnw7i6M23AjyJ3SJSr/NNAM2yLaQP deepontology
```

Passphrase-less Ed25519 is deliberate here: the CI verifier only needs the
*public* half; the secret never leaves the operator's machine. No GPG web of
trust is involved.

---

## Current enforcement

1. **Branch protection on `main`** — "Require signed commits" is enabled
   (the "Protect main" ruleset, `pull_request` rule). `GITHUB_TOKEN` itself
   cannot bypass the rule; the only bypass is `RepositoryRole: admin` via
   `FEED_PAT` for the feed bot (which touches only `feed/feed.json`, never
   `data/` or the graph). A PR whose tip commit is unsigned cannot merge.

2. **Release workflow verifies the tag** — `.github/workflows/release.yml`
   (trigger `push: tags: v*`) checks *both*:
   - GitHub API `verification.verified == true` (the UI's green "Verified" badge),
     which is true when GitHub recognises the pusher's signing key; and
   - fallback `git tag -v` ("Good signature") when the public key is present
     via `SSH_ALLOWED_SIGNERS`.

   A lightweight tag or an unsigned annotated tag fails the job before any
   artifact is published.

3. **Local: `ship.sh` signs automatically** — `git commit` and `git tag -s` are
   already signed because `commit.gpgsign`/`tag.gpgsign` are `true`. No extra
   flag is needed; `git log --show-signature` shows `Good` on every commit
   and `git tag -v v0.1.2-C1` shows the SSH signature block.

---

## How to configure (new machine or new contributor)

### Use the existing key (operator)

```bash
git config --global gpg.format ssh
git config --global user.signingkey ~/.ssh/id_ed25519.pub
git config --global commit.gpgsign true
git config --global tag.gpgsign true
git config --global gpg.ssh.allowedSignersFile ~/.config/git/allowed_signers
mkdir -p ~/.config/git
echo 'deepontology@users.noreply.github.com ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIDc+CtYOvnXLU0GEnw7i6M23AjyJ3SJSr/NNAM2yLaQP deepontology' >> ~/.config/git/allowed_signers
```

Add the same public key to GitHub → Settings → SSH and GPG keys → New SSH key → **Signing Key** (not Authentication).

### Generate a fresh SSH signing key (new contributor)

```bash
ssh-keygen -t ed25519 -C "your@address" -f ~/.ssh/id_deeptunisia_sign
git config --global gpg.format ssh
git config --global user.signingkey ~/.ssh/id_deeptunisia_sign.pub
git config --global commit.gpgsign true
git config --global tag.gpgsign true
git config --global gpg.ssh.allowedSignersFile ~/.config/git/allowed_signers
cat ~/.ssh/id_deeptunisia_sign.pub
# → add to GitHub as Signing Key; also append:
echo 'you@address ssh-ed25519 AAAAC3... you@address' >> ~/.config/git/allowed_signers
```

Tell the operator your signing principal (your Git email) so the branch-protection
allowlist and `SSH_ALLOWED_SIGNERS` variable can be updated. GPG (`gpg --full-generate-key`,
`user.signingkey <keyid>`) works identically — replace `gpg.format ssh` with the
default `openpgp` — but SSH is shorter and avoids a keyring.

---

## How to verify

```bash
# Every commit should be "Good"
git log --show-signature -5

# Every release tag should be Good + Verified on GitHub
git tag -v v0.1.2-C1
gh api repos/deepontology/deeptunisia/git/tags/$(git rev-parse v0.1.2-C1) --jq .verification

# In the UI: commits show "Verified", tags show "Verified" (green)
```

If `git tag -v` says `error: no signature found`, the tag was not signed — delete and re-cut:

```bash
git tag -d v0.2 && git push origin :refs/tags/v0.2
git tag -s v0.2 -m "v0.2 — short human note" && git push origin v0.2
```

---

## The release pipeline — signed tag → DOI without manual steps

```
git tag -s v0.2 -m "v0.2 — one-line human changelog" && git push origin v0.2
      │
      ▼
.github/workflows/release.yml  on: push tags: v*
  1. checkout (fetch-depth: 0)
  2. npm ci → npm run data → npm run test → npm run check
     (validators are the gate — no hand-edited export is ever deposited)
  3. verify tag is signed (GitHub API + git tag -v)
  4. npx tsx scripts/deposit-zenodo.ts
      ├─ with ZENODO_TOKEN → create/publish deposition → DOI minted
      │      POST /api/deposit/depositions {metadata} → bucket PUTs → POST /publish
      │      → { doi, doi_url, conceptdoi, conceptrecid }
      └─ without token → dry-run: prints payload + file list, exits 0
  5. gh release create v0.2  dataset.json + *.csv + geo layers + LICENSE
  6. Summary step links DOI + GitHub Release
```

**Cutting a release** is one command (tag must be annotated + signed):

```bash
# ensure main is green locally first
npm run data && npm run test && npm run check

# annotated + signed tag (GitHub recognises SSH signatures when the pubkey is registered)
git tag -s v0.2 -m "v0.2 — signed releases + DOI"

# push the tag — the workflow does the rest
git push origin v0.2

# watch it
gh run watch  # or open Actions → Release tab
```

Tag form: `v` + semver (`v0.2`, `v0.1.1`, `v1.0.0`). No `latest` move needed — the
workflow sets `--latest` on the GitHub Release.

### Zenodo wiring (one-time, ~5 minutes)

1. Create a Zenodo token: https://zenodo.org → Log in → Account → Applications → Tokens → New token → scope `deposit:write` → copy.
2. In the repo: Settings → Secrets and variables → Actions → New repository **secret** → `ZENODO_TOKEN` → paste.
3. Optional: set repository **variable** `ZENODO_SANDBOX=1` to test against
   https://sandbox.zenodo.org before minting a real DOI (sandbox DOIs are not
   citable).
4. After the *first* published deposition, Zenodo returns `conceptrecid` and
   `conceptdoi`. Set repository variable `ZENODO_CONCEPTRECID` to that numeric
   id — subsequent tags then become new *versions* of the same concept DOI
   (one concept DOI, many version DOIs). Without it each tag mints an unrelated
   deposition (still citable, but without a shared concept).

Test without minting a real DOI:

```bash
ZENODO_TOKEN=... npx tsx scripts/deposit-zenodo.ts --sandbox --dry-run
ZENODO_TOKEN=... npx tsx scripts/deposit-zenodo.ts --sandbox --version=v0.2-sandbox
```

Dry-run (no token or `--dry-run`) is exactly what CI does when the secret has
not yet been wired or on a fork: it lists the files, prints the metadata payload
and the `curl` equivalents, and exits 0 — so the GitHub Release is still cut
and the tag workflow stays green. Wiring the secret turns the same run into a
live mint without any workflow edit.

### Files deposited (same set archived on Zenodo and attached to the GitHub Release)

```
static/dataset.json          canonical bundle (6.4 MB) — always first
static/*.csv                 positions, relationships, sources, companies,
                             contracts, licences, declarations, education
static/geo.json, world-topo.json, sensitivity.json, changelog.json, tn-adm.geojson
LICENSE, data/LICENSE, README.md fragment (description is not hand-edited)
```

`feed/` is never deposited (I1 — the feed is not dataset data). Agora posts are
never deposited.

### CITATION and the paper

Once the first DOI is live, add it in two places:

- `CITATION.cff` (the machine-readable citation the DOI itself points at).
- The paper's data-availability statement (replace the placeholder DOI with
  `https://doi.org/10.5281/zenodo.…` for the version DOI and, separately,
  the concept DOI `https://doi.org/10.5281/zenodo.…` for "cite any version").

The paper already promises the DOI "before submission" — now cutting an
annotated signed tag is what fulfills it.

---

## What changes when enforced, and what does not

| Changes | Does not change |
| --- | --- |
| Every `data/*.yaml` edit comes from a signed commit you can verify (`git log --show-signature`) | The build still reads files, not history — it produces identical exports whether the commit is signed or not |
| Each release is a *signed* tag → DOI snapshot you can cite and pin (`v0.2` → `10.5281/zenodo.…`) | The graph and the CSVs are byte-identical whether the tag is signed or not |
| The corrections page can display verified authorship (future) | The Agora community layer is unaffected — it uses Ed25519 keypairs in the browser, not git keys |
| Branch protection blocks an unsigned tip from merging on `main` | A fork without the key still builds and tests — it just cannot cut a *Verified* release on the canonical repo |

---

## Troubleshooting

| Symptom | Cause | Fix |
| --- | --- | --- |
| `tag -v` says "no signature found" | Tag was lightweight or `-s` omitted | Re-cut: `git tag -d vX && git tag -s vX -m "…"` |
| GitHub badge is "Unverified" | Signing pubkey not added to GitHub → Signing Key, or email mismatch | Add key to GitHub as **Signing** key; `git config user.email` must match the key's principal |
| `commit --show-signature` says `bad signature` | `allowed_signers` missing or wrong | Re-add the line to `~/.config/git/allowed_signers`; ensure `gpg.ssh.allowedSignersFile` points at it |
| Release workflow fails at "Verify tag is signed" | Tag not signed / lightweight | Re-cut a signed annotated tag and push it again |
| Deposit step says `401/403` | `ZENODO_TOKEN` lacks `deposit:write` or is for wrong host (sandbox vs production) | Generate token with `deposit:write` on the host that `ZENODO_SANDBOX` points at |
| Deposit prints `metadata validation failed` | Zenodo rejected the payload (e.g. `publication_date` in future) | Check `static/dataset.json` `meta.generated` — it sets `publication_date`; rebuild with `npm run data` |

---

## Decision log

- **Signing method: SSH ED25519** — shorter setup than GPG, no keyserver, no
  passphrase-in-CI. GPG works with identical `commit.gpgsign/tag.gpgsign`
  semantics; pick one and stay with it.
- **DOI provider: Zenodo** — open, free, versioned DOIs with concept DOI,
  REST API, sandbox for testing. Equivalent alternatives (Figshare, Dataverse)
  keep the same one-tag → one-DOI contract.
- **Not in this sprint:** Datalog/SMT validator formalisation, external
  literature review — later milestones, not current.
