-- Reference snapshot of the code module's tables.
-- The authoritative migration is packages/schema/migrations/0024_code_module.sql.

-- course_settings additionally carries:
--   code_enabled INTEGER NOT NULL DEFAULT 0   -- opt-in per course

CREATE TABLE code_assignments (
  id            TEXT PRIMARY KEY,
  course_id     TEXT NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  title         TEXT NOT NULL,
  instructions  TEXT NOT NULL DEFAULT '',
  starter_json  TEXT NOT NULL DEFAULT '{"cells":[]}',
  ai_enabled    INTEGER NOT NULL DEFAULT 0,
  ai_prompt     TEXT,
  due_at        INTEGER,
  created_at    INTEGER NOT NULL,
  updated_at    INTEGER NOT NULL,
  archived_at   INTEGER
);

CREATE TABLE code_notebooks (
  id             TEXT PRIMARY KEY,
  course_id      TEXT NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  owner_user_id  TEXT NOT NULL,
  assignment_id  TEXT,              -- NULL = scratch notebook
  title          TEXT NOT NULL,
  cells_json     TEXT NOT NULL DEFAULT '{"cells":[]}',
  created_at     INTEGER NOT NULL,
  updated_at     INTEGER NOT NULL
);
-- UNIQUE (course_id, owner_user_id, assignment_id) WHERE assignment_id IS NOT NULL

CREATE TABLE code_messages (
  id             TEXT PRIMARY KEY,
  notebook_id    TEXT NOT NULL REFERENCES code_notebooks(id) ON DELETE CASCADE,
  course_id      TEXT NOT NULL,
  role           TEXT NOT NULL,     -- user | assistant
  content        TEXT NOT NULL,
  prompt_hash    TEXT NOT NULL,
  created_at     INTEGER NOT NULL
);

CREATE TABLE code_submissions (
  id             TEXT PRIMARY KEY,
  course_id      TEXT NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  assignment_id  TEXT NOT NULL,
  notebook_id    TEXT NOT NULL,
  owner_user_id  TEXT NOT NULL,
  title          TEXT NOT NULL,
  cells_json     TEXT NOT NULL,
  messages_json  TEXT NOT NULL DEFAULT '[]',
  created_at     INTEGER NOT NULL
);
