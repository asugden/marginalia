-- 0011 — provenance module slice 3: chat panel.
--
-- Three new tables. Separate from the existing agents/voices/conversations
-- tables because (a) the provenance chat is a much simpler shape
-- (name + system prompt, no backbone, no collection, no per-author voice
-- composition) and (b) modules.md forbids cross-module imports.
--
--   provenance_agents         — instructor-authored course defaults + student-private
--   provenance_conversations  — many per document; agent + name + prompt snapshotted at create
--   provenance_messages       — message log, race-safe seq numbering

CREATE TABLE provenance_agents (
  id              TEXT PRIMARY KEY,
  course_id       TEXT NOT NULL REFERENCES courses(id),
  -- NULL = course-default (visible to every enrolled student),
  -- non-null = student-private (visible only to the owner).
  owner_user_id   TEXT REFERENCES users(id),
  name            TEXT NOT NULL,
  system_prompt   TEXT NOT NULL,
  created_at      INTEGER NOT NULL,
  updated_at      INTEGER NOT NULL
);
CREATE INDEX idx_provenance_agents_course_owner
  ON provenance_agents(course_id, owner_user_id, updated_at DESC);

CREATE TABLE provenance_conversations (
  id                      TEXT PRIMARY KEY,
  document_id             TEXT NOT NULL REFERENCES provenance_documents(id) ON DELETE CASCADE,
  course_id               TEXT NOT NULL REFERENCES courses(id),
  user_id                 TEXT NOT NULL REFERENCES users(id),
  -- FK is advisory: deleting an agent should not destroy the conversation
  -- record (it's the student's history). On agent delete we null the id and
  -- the snapshot fields keep the chat intelligible.
  agent_id                TEXT,
  agent_name_snapshot     TEXT NOT NULL,
  agent_prompt_snapshot   TEXT NOT NULL,
  -- Display title; lazy-generated like the tutoring side (slice 3 leaves
  -- it as the first user message excerpt, no LLM call).
  title                   TEXT,
  created_at              INTEGER NOT NULL,
  updated_at              INTEGER NOT NULL
);
CREATE INDEX idx_provenance_conversations_doc
  ON provenance_conversations(document_id, updated_at DESC);

CREATE TABLE provenance_messages (
  id                  TEXT PRIMARY KEY,
  conversation_id     TEXT NOT NULL REFERENCES provenance_conversations(id) ON DELETE CASCADE,
  role                TEXT NOT NULL,             -- user | assistant
  content             TEXT NOT NULL,
  seq                 INTEGER NOT NULL,
  created_at          INTEGER NOT NULL,
  UNIQUE (conversation_id, seq)
);
CREATE INDEX idx_provenance_messages_conv
  ON provenance_messages(conversation_id, seq);
