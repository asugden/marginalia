-- v0.5 §3 — citations a RAG-grounded assistant message actually leaned on.
--
-- The worker scans the streamed reply for [^src_<uuid>] tokens, intersects
-- with the chunks retrieved for that turn, and inserts one row per
-- *cited* source in citation order. The history-load path joins this table
-- so pills survive a page reload.
--
-- Snapshot the display fields (filename, kind, source_url, r2_key) on
-- insert: a source removed from its collection between when the student
-- got the answer and when they re-open the conversation should still show
-- the citation pill with its original label. Storage cost is one short
-- row per cited source per turn — trivial at classroom scale.

CREATE TABLE message_sources (
  message_id    TEXT NOT NULL REFERENCES messages(id),
  -- Nullable: the original collection_sources row may be deleted later.
  -- Joins to live data for hover/preview features layer on top; the
  -- snapshot columns below are the source of truth for display.
  source_id     TEXT REFERENCES collection_sources(id),
  -- 1-based citation order within the message (first-cited = 1).
  ordinal       INTEGER NOT NULL,
  -- Display snapshots (see top-of-file comment).
  filename      TEXT NOT NULL,
  kind          TEXT NOT NULL,
  source_url    TEXT,
  r2_key        TEXT,
  created_at    INTEGER NOT NULL,
  PRIMARY KEY (message_id, ordinal)
);

CREATE INDEX idx_message_sources_message ON message_sources(message_id);
