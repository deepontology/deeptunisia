-- Community layer schema (SQLite / Cloudflare D1).
--
-- This database holds NO project data. The graph lives in data/*.yaml and is
-- compiled by `npm run data`; nothing here is ever read by that build, counted in
-- any published statistic, or rendered in the same visual register as a sourced
-- claim. The precedent is feed/, whose separation scripts/test-feed.ts asserts in
-- CI; scripts/test-community.ts does the same for this.
--
-- Note what is absent from every table: no IP address, no user agent, no device or
-- browser fingerprint, no last-seen timestamp. A last-seen column leaks a presence
-- pattern for free and buys nothing. Rate limiting uses community/ratelimit.ts,
-- which stores an expiring salted hash and never the address.
--
-- Posts are never deleted by a vote count, and there is no column that could express
-- that. Removal is a moderator action with a reason attached, and it is reversible.

PRAGMA foreign_keys = ON;

-- Pseudonymous identities. A leak of this table lets an attacker impersonate nobody:
-- the public key verifies signatures, it does not produce them.
CREATE TABLE IF NOT EXISTS identities (
  pubkey            TEXT PRIMARY KEY,
  created_at        INTEGER NOT NULL,
  trust_level       INTEGER NOT NULL DEFAULT 0,
  -- Optional, and a correlation risk the user is told about before setting it.
  -- It NEVER replaces the handle derived from the public key: that handle is the
  -- only thing about an identity which cannot be claimed by somebody else, and a
  -- name that could stand in its place makes impersonation a single field update.
  display_name      TEXT,
  -- What the person says they are — "journalist", "worked in the ministry until
  -- 2014". Self-declared, never checked, and rendered as a claim rather than as a
  -- credential. It exists because a source's standing changes how their account
  -- should be weighed, and the alternative is people asserting it in prose where it
  -- carries no marking at all.
  self_description  TEXT,
  posts_count       INTEGER NOT NULL DEFAULT 0,
  reports_upheld    INTEGER NOT NULL DEFAULT 0,
  reports_rejected  INTEGER NOT NULL DEFAULT 0,
  prs_accepted      INTEGER NOT NULL DEFAULT 0,
  banned_at         INTEGER,
  banned_reason     TEXT
);

-- Replay guard. A signature over a body can be replayed by anyone who saw it, so an
-- accepted nonce must never be accepted twice. Rows expire; this is not a log.
CREATE TABLE IF NOT EXISTS used_nonces (
  nonce       TEXT PRIMARY KEY,
  expires_at  INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_nonces_expiry ON used_nonces (expires_at);

-- Rate-limit buckets. Keyed by a rotating salted hash of the client address; the
-- address itself is never stored and the salt changes daily, so buckets cannot be
-- correlated across days.
CREATE TABLE IF NOT EXISTS rate_buckets (
  key         TEXT PRIMARY KEY,
  count       INTEGER NOT NULL,
  expires_at  INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_buckets_expiry ON rate_buckets (expires_at);

-- Threads hang off a graph object. target_id references data/*.yaml by id and is
-- deliberately NOT a foreign key: this database must never require the graph to be
-- present, and the graph must never require this database to exist.
CREATE TABLE IF NOT EXISTS threads (
  id           TEXT PRIMARY KEY,
  target_type  TEXT NOT NULL CHECK (target_type IN ('person','institution','role','position','relationship','event','source','open')),
  target_id    TEXT,
  title        TEXT NOT NULL,
  created_at   INTEGER NOT NULL,
  created_by   TEXT NOT NULL REFERENCES identities(pubkey),
  -- The name and self-description as they stood when this was written. See the note
  -- on posts.author_name: a later rename must not re-label what was already said.
  author_name  TEXT,
  author_note  TEXT,
  -- Section 18: what KIND of contribution this is. Not a truth claim.
  kind         TEXT NOT NULL DEFAULT 'discussion'
               CHECK (kind IN ('discussion','opinion','news','investigation','evidence','question','correction')),
  removed_at   INTEGER,
  removed_by   TEXT,
  removed_reason TEXT
);
CREATE INDEX IF NOT EXISTS idx_threads_target ON threads (target_type, target_id);
CREATE INDEX IF NOT EXISTS idx_threads_created ON threads (created_at DESC);

CREATE TABLE IF NOT EXISTS posts (
  id          TEXT PRIMARY KEY,
  thread_id   TEXT NOT NULL REFERENCES threads(id),
  parent_id   TEXT REFERENCES posts(id),
  body        TEXT NOT NULL,
  created_at  INTEGER NOT NULL,
  created_by  TEXT NOT NULL REFERENCES identities(pubkey),
  -- The author's chosen name and self-description AT THE TIME OF WRITING.
  --
  -- Denormalised on purpose. Reading them live means changing your description to
  -- "lawyer" silently re-labels every post you have ever written as a lawyer's, back
  -- to the first one — retroactively re-weighting arguments people have already read
  -- and replied to. That is the identity-layer version of letting an inference become
  -- a fact, and it is the same reason positions are intervals rather than a current
  -- job title. What someone claimed to be when they said it is part of what they said.
  author_name TEXT,
  author_note TEXT,
  upvotes     INTEGER NOT NULL DEFAULT 0,
  downvotes   INTEGER NOT NULL DEFAULT 0,
  -- Removal is an action by a person, with a reason, and it is reversible.
  -- There is deliberately no vote threshold that could set these.
  removed_at  INTEGER,
  removed_by  TEXT,
  removed_reason TEXT
);
CREATE INDEX IF NOT EXISTS idx_posts_thread ON posts (thread_id, created_at);
CREATE INDEX IF NOT EXISTS idx_posts_author ON posts (created_by);

-- One vote per identity per target, enforced by the primary key rather than by
-- application care.
CREATE TABLE IF NOT EXISTS votes (
  target_type TEXT NOT NULL CHECK (target_type IN ('thread','post')),
  target_id   TEXT NOT NULL,
  identity    TEXT NOT NULL REFERENCES identities(pubkey),
  value       INTEGER NOT NULL CHECK (value IN (-1, 1)),
  created_at  INTEGER NOT NULL,
  PRIMARY KEY (target_type, target_id, identity)
);

CREATE TABLE IF NOT EXISTS reports (
  id           TEXT PRIMARY KEY,
  target_type  TEXT NOT NULL CHECK (target_type IN ('thread','post')),
  target_id    TEXT NOT NULL,
  reporter     TEXT NOT NULL REFERENCES identities(pubkey),
  reason       TEXT NOT NULL CHECK (reason IN ('spam','harassment','hate','manipulation','misinformation','off-topic','duplicate','illegal','other')),
  details      TEXT,
  status       TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','upheld','rejected')),
  created_at   INTEGER NOT NULL,
  -- One report per identity per target: filing fourteen reports is one opinion.
  UNIQUE (target_type, target_id, reporter)
);
CREATE INDEX IF NOT EXISTS idx_reports_open ON reports (status, created_at);

-- Every moderator action, append-only. Built before there is anything to log,
-- because an audit log added afterwards leaves the first months unauditable.
CREATE TABLE IF NOT EXISTS moderation_actions (
  id           TEXT PRIMARY KEY,
  target_type  TEXT NOT NULL,
  target_id    TEXT NOT NULL,
  moderator    TEXT NOT NULL,
  action       TEXT NOT NULL CHECK (action IN ('remove','restore','ban','unban','uphold-report','reject-report','promote','demote')),
  reason       TEXT NOT NULL,
  created_at   INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_modactions_target ON moderation_actions (target_type, target_id);

-- Entity mentions, per section 5 of the spec. `confirmed` and `created_by` exist so
-- that a future suggester can be MEASURED against human decisions rather than
-- trusted; today every row is created by a human confirming a match.
CREATE TABLE IF NOT EXISTS post_entities (
  post_id      TEXT NOT NULL REFERENCES posts(id),
  entity_id    TEXT NOT NULL,
  entity_type  TEXT NOT NULL,
  start_offset INTEGER,
  end_offset   INTEGER,
  confirmed    INTEGER NOT NULL DEFAULT 0,
  created_by   TEXT NOT NULL,
  created_at   INTEGER NOT NULL,
  PRIMARY KEY (post_id, entity_id, start_offset)
);
CREATE INDEX IF NOT EXISTS idx_post_entities_entity ON post_entities (entity_id);

-- ---------------------------------------------------------------------------
-- Proposed changes (Phase 3)
-- ---------------------------------------------------------------------------
--
-- A proposal is a structured request to alter data/*.yaml. It is NOT a post, and
-- keeping the two apart is the whole distinction the project rests on: discussion
-- asks what people think, a proposal asks whether the record should be different,
-- and only the second one needs sources and review before anything moves.
--
-- Accepting a proposal here does not change the graph. It cannot: the graph is YAML
-- in git on the operator's machine, and this database is somewhere else. Acceptance
-- marks it ready, and the editorial tool applies it through the same emitter every
-- other graph edit goes through — so a public contribution and a moderator's own
-- edit are validated by identical code, and the CI gate is the same one.
--
-- Public by default while pending, per section 8 of the spec. Private identity,
-- public process: the submitter is a pseudonym, the proposal is not.

CREATE TABLE IF NOT EXISTS prs (
  id            TEXT PRIMARY KEY,
  created_by    TEXT NOT NULL REFERENCES identities(pubkey),
  -- Snapshot, for the same reason posts carry one: a reviewer reading this months
  -- later needs what the submitter claimed to be when they filed it, not what they
  -- call themselves today.
  --
  -- Deliberately NOT done for pr_reviews. A reviewer is an office, not a
  -- contribution: the useful question about a moderator decision is who holds that
  -- role now, so those names are read live.
  author_name   TEXT,
  author_note   TEXT,
  created_at    INTEGER NOT NULL,
  updated_at    INTEGER NOT NULL,
  -- What in the graph this is about.
  target_type   TEXT NOT NULL,
  target_id     TEXT,
  -- What kind of change. Mirrors the operations the emitter can actually perform,
  -- so a proposal cannot describe something the tool has no way to apply.
  operation     TEXT NOT NULL CHECK (operation IN ('set','add-field','append-to-list','add-block','append-record')),
  reason        TEXT NOT NULL,
  status        TEXT NOT NULL DEFAULT 'pending'
                CHECK (status IN ('pending','under-review','needs-evidence','accepted','rejected','superseded','withdrawn','applied')),
  -- Set when the operator has actually written it into the YAML and committed.
  applied_at    INTEGER,
  applied_sha   TEXT,
  -- The discussion this came out of, if it was converted rather than filed directly.
  from_thread   TEXT REFERENCES threads(id)
);
CREATE INDEX IF NOT EXISTS idx_prs_status ON prs (status, created_at);
CREATE INDEX IF NOT EXISTS idx_prs_target ON prs (target_type, target_id);

-- The change itself, field by field, with what is there now recorded alongside.
-- Storing the old value is what makes a proposal reviewable months later and what
-- lets the editorial tool detect that the record moved underneath it.
CREATE TABLE IF NOT EXISTS pr_changes (
  id         TEXT PRIMARY KEY,
  pr_id      TEXT NOT NULL REFERENCES prs(id),
  field      TEXT NOT NULL,
  old_value  TEXT,
  new_value  TEXT
);
CREATE INDEX IF NOT EXISTS idx_pr_changes_pr ON pr_changes (pr_id);

-- Evidence. A proposal with none can be filed, but it cannot be accepted:
-- rule 2 of AGENTS.md is that every claim carries a source, and a proposal that
-- would add an unsourced claim is a proposal to break the build.
CREATE TABLE IF NOT EXISTS pr_sources (
  pr_id       TEXT NOT NULL REFERENCES prs(id),
  -- An id if the source is already in the graph, otherwise a citation to be entered.
  source_id   TEXT,
  url         TEXT,
  title       TEXT,
  note        TEXT,
  created_at  INTEGER NOT NULL,
  PRIMARY KEY (pr_id, source_id, url)
);

CREATE TABLE IF NOT EXISTS pr_reviews (
  id          TEXT PRIMARY KEY,
  pr_id       TEXT NOT NULL REFERENCES prs(id),
  reviewer    TEXT NOT NULL,
  decision    TEXT NOT NULL CHECK (decision IN ('accept','reject','needs-evidence','under-review')),
  reason      TEXT NOT NULL,
  created_at  INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_pr_reviews_pr ON pr_reviews (pr_id, created_at);
