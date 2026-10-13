-- Research response storage (contract §5).
--
-- A separate schema and, on Cloudflare, a separate RESEARCH_DB binding: responses
-- are personal data about named individuals' opinions, and they must not sit in the
-- same database as the community layer. What is deliberately absent from the table
-- is the whole point: no IP address, no user agent, no fingerprint, no email, no
-- free-text identifier of any kind. The receipt is a random UUID handed to the
-- respondent; it is the only key that can ever delete a row, and it works only
-- while the study is fielding.
--
-- block_order and scale_direction record the platform-side experiment assignment
-- (contract §2 records them as `auto` items the client can never submit). They are
-- nullable until the assignment module exists.

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
  -- Validated MaxDiff choices, JSON array of { set, most, least }; null when the
  -- instrument has no block or the local dev waiver let the block be omitted.
  maxdiff TEXT,
  -- How this answer relates to an earlier one from the same person, as the
  -- respondent or their browser said so, and nothing else about it:
  --   null          a first answer;
  --   'replaced'    an update that carried the earlier receipt, whose row was
  --                 deleted in the same write, so the person counts once;
  --   'update'      an update without a usable receipt, the earlier row still
  --                 stored, so the person may count twice;
  --   'same-device' a different person, or the same one, answering on a browser
  --                 that had already answered this month.
  -- The live page publishes how many of each it holds and the index without the
  -- last two; nothing is excluded on this field (index-spec.md §6).
  revision TEXT CHECK (revision IS NULL OR revision IN ('replaced', 'update', 'same-device')),
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_responses_study ON research_responses (study_id, submitted_at DESC);

-- Spent proof-of-work salts (contract §4). One row per challenge that reached
-- verification, deleted again once expired, so the table holds only challenges
-- currently in play. It stores a random salt and its expiry and NOTHING else:
-- no address, no device, no receipt, no time of use — nothing that could attach
-- a solved puzzle to a person or to the response it backed.
CREATE TABLE IF NOT EXISTS research_pow_used (
  salt TEXT PRIMARY KEY,
  expires INTEGER NOT NULL
);

-- What arrived and what left, per study and calendar month (Tunisia time), as
-- three counters and nothing else. The rows themselves are deleted on withdrawal
-- and on replacement, so without these a reader of the daily ledger could not
-- tell a withdrawal from a row that quietly disappeared. The invariant the
-- ledger publishes and the verifier checks: rows stored for the month =
-- received - withdrawn - replaced.
CREATE TABLE IF NOT EXISTS research_tally (
  study_id TEXT NOT NULL,
  period TEXT NOT NULL,
  received INTEGER NOT NULL DEFAULT 0,
  withdrawn INTEGER NOT NULL DEFAULT 0,
  replaced INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (study_id, period)
);
