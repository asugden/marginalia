-- 0013 — provenance module slice 6: shareable submissions.
--
-- A student mints an unguessable token; an instructor opens the public
-- link and sees the document with every word colored by origin, plus an
-- optional drill-down into the chat conversations.
--
-- The frozen snapshot is a *provenance render* computed server-side from
-- the authoritative edit_events log at mint time, stored as JSON here.
-- This keeps the instructor view independent of how (or whether)
-- provenance is shown to the student while writing — we may later hide
-- marking from students so the editor doesn't feel like surveillance,
-- without touching submissions. `snapshot_event_seq` records the
-- client_seq cutoff the render was computed at, for future scrub.

CREATE TABLE provenance_submissions (
  token               TEXT PRIMARY KEY,        -- unguessable, in the share URL
  document_id         TEXT NOT NULL REFERENCES provenance_documents(id) ON DELETE CASCADE,
  course_id           TEXT NOT NULL REFERENCES courses(id),
  user_id             TEXT NOT NULL REFERENCES users(id),
  title_snapshot      TEXT NOT NULL,
  -- Frozen provenance render: JSON { text, runs:[{origin,length}] }.
  -- origin is human | llm | pasted | edited (edited reserved for slice 7).
  render_json         TEXT NOT NULL,
  snapshot_event_seq  INTEGER NOT NULL DEFAULT 0,
  created_at          INTEGER NOT NULL,
  revoked_at          INTEGER
);

CREATE INDEX idx_provenance_submissions_document
  ON provenance_submissions(document_id, created_at DESC);
