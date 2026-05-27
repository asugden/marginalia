-- 0010 — provenance module slice 2: append-only edit-event log.
--
-- One row per discrete edit operation captured by the client. The
-- document's body_json + provenance marks remain the fast-load
-- source of truth; this table is the audit trail that lets an
-- instructor scrub through snapshots (slice 6) and lets future
-- analysis re-derive provenance if a client bug ever corrupts it.
--
-- Slice 2 emits four event kinds:
--   insert        plain typing (origin = human)
--   delete        any deletion
--   paste         clipboard insert from outside the editor
--   llm_insert    cursor-aware insert from the chat panel (slice 4 wires this)
--
-- Future kinds: replace (slice 7), format (toolbar-only, may stay off the log).

CREATE TABLE provenance_events (
  id                  TEXT PRIMARY KEY,
  document_id         TEXT NOT NULL REFERENCES provenance_documents(id) ON DELETE CASCADE,
  course_id           TEXT NOT NULL REFERENCES courses(id),
  -- Caller is always the document owner (enforced server-side) but storing
  -- it explicitly keeps audit queries simple and survives ownership
  -- migrations if we ever support reassignment.
  user_id             TEXT NOT NULL REFERENCES users(id),
  kind                TEXT NOT NULL,            -- insert | delete | paste | llm_insert
  offset              INTEGER NOT NULL,         -- ProseMirror position at the start of the change
  length              INTEGER NOT NULL,         -- chars inserted (insert/paste/llm_insert) or removed (delete)
  text                TEXT,                     -- inserted text for insert/paste/llm_insert; deleted text for delete
  origin              TEXT,                     -- human | llm | pasted (NULL on delete)
  source_message_id   TEXT,                     -- chat message that fed an llm_insert (slice 4)
  -- Compact JSON capturing per-keystroke timing for the insert burst.
  -- Slice 2 records {gaps_ms:[...]} so we have it on hand; the classifier
  -- that turns it into "real composition vs copying" comes later.
  timing_blob         TEXT,
  -- Client-supplied logical sequence so out-of-order delivery on flaky
  -- networks doesn't scramble the audit trail. Per-document monotonic.
  client_seq          INTEGER NOT NULL,
  created_at          INTEGER NOT NULL
);

-- Replay reads: get this document's events in order. Append writes
-- piggyback the same index.
CREATE INDEX idx_provenance_events_document
  ON provenance_events(document_id, client_seq);

-- Last-seen-seq lookup to dedupe re-delivered batches. The client may
-- retry a batch on transient failure; the server uses
-- max(client_seq) per document to reject already-seen events.
CREATE INDEX idx_provenance_events_document_seq
  ON provenance_events(document_id, client_seq DESC);
