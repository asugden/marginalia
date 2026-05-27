-- 0008 — provenance module: documents table (slice 1).
-- Writing tool that tracks word-level origin (human / llm / pasted / edited).
-- This migration adds only the document table. Edit-event log, agents,
-- conversations, messages, and submissions land in later slices when
-- the corresponding features come online.
--
-- See apps/worker/src/modules/provenance/README.md for the full model.

CREATE TABLE provenance_documents (
  id              TEXT PRIMARY KEY,
  course_id       TEXT NOT NULL REFERENCES courses(id),
  owner_user_id   TEXT NOT NULL REFERENCES users(id),
  title           TEXT NOT NULL,
  -- Tiptap document JSON. Serialised on every save; the editor is the
  -- single source of truth for formatting. Plain-text projection is
  -- recomputed at read time when needed (word/char counts come from the
  -- client, but a server-side recompute is cheap if we ever need it).
  body_json       TEXT NOT NULL DEFAULT '{"type":"doc","content":[]}',
  -- Cached counts written by the client on save. Slice 1 displays these
  -- in lists without re-parsing body_json. Approx page count = ceil(words/250).
  word_count      INTEGER NOT NULL DEFAULT 0,
  char_count      INTEGER NOT NULL DEFAULT 0,
  created_at      INTEGER NOT NULL,
  updated_at      INTEGER NOT NULL
);

CREATE INDEX idx_provenance_documents_course_owner
  ON provenance_documents(course_id, owner_user_id, updated_at DESC);
