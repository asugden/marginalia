-- Reference snapshot of the questions module tables. The source of truth is
-- packages/schema/migrations/0035_questions.sql.

CREATE TABLE question_sessions (
  id          TEXT PRIMARY KEY,
  course_id   TEXT NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  title       TEXT NOT NULL,
  -- draft: staff only. open: accepting questions. closed: read-only.
  status      TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'open', 'closed')),
  created_by  TEXT NOT NULL,
  created_at  INTEGER NOT NULL,
  -- The most recent opening and closing. Reopening moves opened_at forward,
  -- which is what makes a reopened session count as the newest live one.
  opened_at   INTEGER,
  closed_at   INTEGER
);

CREATE INDEX idx_question_sessions_course ON question_sessions (course_id, created_at);

-- One board per presenter (or team, or topic), in the order they were added.
CREATE TABLE question_boards (
  id          TEXT PRIMARY KEY,
  session_id  TEXT NOT NULL REFERENCES question_sessions(id) ON DELETE CASCADE,
  course_id   TEXT NOT NULL,
  title       TEXT NOT NULL,
  position    INTEGER NOT NULL,
  created_at  INTEGER NOT NULL
);

CREATE INDEX idx_question_boards_session ON question_boards (session_id, position);

CREATE TABLE question_entries (
  id          TEXT PRIMARY KEY,
  board_id    TEXT NOT NULL REFERENCES question_boards(id) ON DELETE CASCADE,
  course_id   TEXT NOT NULL,
  user_id     TEXT NOT NULL,
  body        TEXT NOT NULL,
  created_at  INTEGER NOT NULL,
  updated_at  INTEGER NOT NULL,
  -- Set when staff hide a question from the class. Staff still see it.
  hidden_at   INTEGER
);

CREATE INDEX idx_question_entries_board ON question_entries (board_id, created_at);
