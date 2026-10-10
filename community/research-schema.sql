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
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_responses_study ON research_responses (study_id, submitted_at DESC);
