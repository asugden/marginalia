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
  mode          TEXT NOT NULL DEFAULT 'submit',  -- submit | practice
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
  baseline_json  TEXT,              -- { [cellId]: starter source }; NULL for scratch
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
  novel_text     TEXT,              -- assistant rows: reply minus lines already in the notebook
  created_at     INTEGER NOT NULL
);

CREATE TABLE code_events (
  id                TEXT PRIMARY KEY,
  notebook_id       TEXT NOT NULL REFERENCES code_notebooks(id) ON DELETE CASCADE,
  course_id         TEXT NOT NULL,
  cell_id           TEXT NOT NULL,
  kind              TEXT NOT NULL,  -- insert | delete | paste | llm_insert | move
  offset            INTEGER NOT NULL,
  length            INTEGER NOT NULL,
  text              TEXT,
  origin            TEXT,
  restored_origins  TEXT,
  client_seq        INTEGER NOT NULL,
  created_at        INTEGER NOT NULL
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
  render_json    TEXT,              -- origin render, frozen at submission
  created_at     INTEGER NOT NULL
);
