-- Reference snapshot of the provenance module's tables.
-- The authoritative migration lives in packages/schema/migrations/.

CREATE TABLE provenance_documents (
  id              TEXT PRIMARY KEY,
  course_id       TEXT NOT NULL,
  owner_user_id   TEXT NOT NULL,
  title           TEXT NOT NULL,
  body_text       TEXT NOT NULL DEFAULT '',
  provenance_map  TEXT NOT NULL DEFAULT '{"runs":[]}',  -- JSON, run-length encoded
  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at      TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_provenance_documents_course_owner
  ON provenance_documents(course_id, owner_user_id);

CREATE TABLE edit_events (
  id                  TEXT PRIMARY KEY,
  document_id         TEXT NOT NULL REFERENCES provenance_documents(id) ON DELETE CASCADE,
  kind                TEXT NOT NULL,  -- insert|delete|replace|paste|llm_insert|format
  offset              INTEGER NOT NULL,
  length              INTEGER NOT NULL,
  text                TEXT,
  source_message_id   TEXT,
  timing_blob         TEXT,
  created_at          TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_edit_events_document
  ON edit_events(document_id, created_at);

CREATE TABLE provenance_agents (
  id              TEXT PRIMARY KEY,
  course_id       TEXT NOT NULL,
  owner_user_id   TEXT,  -- NULL = course-default (instructor authored)
  name            TEXT NOT NULL,
  system_prompt   TEXT NOT NULL,
  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at      TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_provenance_agents_course
  ON provenance_agents(course_id, owner_user_id);

CREATE TABLE provenance_conversations (
  id              TEXT PRIMARY KEY,
  document_id     TEXT NOT NULL REFERENCES provenance_documents(id) ON DELETE CASCADE,
  created_at      TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_provenance_conversations_doc
  ON provenance_conversations(document_id);

CREATE TABLE provenance_messages (
  id                  TEXT PRIMARY KEY,
  conversation_id     TEXT NOT NULL REFERENCES provenance_conversations(id) ON DELETE CASCADE,
  agent_id            TEXT NOT NULL,
  agent_prompt_hash   TEXT NOT NULL,
  role                TEXT NOT NULL,  -- user|assistant
  content             TEXT NOT NULL,
  created_at          TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_provenance_messages_conv
  ON provenance_messages(conversation_id, created_at);

CREATE TABLE provenance_submissions (
  token               TEXT PRIMARY KEY,
  document_id         TEXT NOT NULL REFERENCES provenance_documents(id) ON DELETE CASCADE,
  snapshot_event_id   TEXT NOT NULL,
  created_at          TEXT NOT NULL DEFAULT (datetime('now')),
  revoked_at          TEXT
);
CREATE INDEX idx_provenance_submissions_doc
  ON provenance_submissions(document_id);

CREATE TABLE provenance_assignments (
  id              TEXT PRIMARY KEY,
  course_id       TEXT NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  title           TEXT NOT NULL,
  instructions    TEXT NOT NULL DEFAULT '',
  created_at      INTEGER NOT NULL,
  updated_at      INTEGER NOT NULL,
  archived_at     INTEGER  -- set instead of deleting; keeps attached submissions readable
);
CREATE INDEX idx_provenance_assignments_course
  ON provenance_assignments(course_id, created_at DESC);

CREATE TABLE provenance_assignment_checkpoints (
  id              TEXT PRIMARY KEY,
  assignment_id   TEXT NOT NULL REFERENCES provenance_assignments(id) ON DELETE CASCADE,
  ord             INTEGER NOT NULL,  -- display order, instructor-controlled
  name            TEXT NOT NULL,
  due_at          INTEGER  -- NULL = no deadline, so never late
);
CREATE INDEX idx_provenance_checkpoints_assignment
  ON provenance_assignment_checkpoints(assignment_id, ord);

-- provenance_submissions additionally carries (both nullable — an unattached
-- submission is still valid, and lateness is computed at read time from
-- checkpoint.due_at rather than stored):
--   assignment_id  TEXT
--   checkpoint_id  TEXT
