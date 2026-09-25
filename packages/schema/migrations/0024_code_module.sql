-- 0024 — code: browser-run Python notebooks for a course.
--
-- Students write and run Python in cells, entirely in their own browser
-- (Pyodide, CPython compiled to WebAssembly). The server never executes
-- student code. What it stores is the notebook itself, the optional tutor
-- conversation beside it, and the snapshots a student submits.
--
-- The module is an OPTIONAL extension that defaults OFF. Most courses will
-- never use it, so it must not appear anywhere — student nav, instructor nav,
-- Assign menu — until an instructor turns it on in Settings. That is the
-- opposite default from Writing and Agents (both on), and matches Attendance.
--
-- Datasets are deliberately NOT stored here. A student's uploaded files live
-- in their own browser (IndexedDB) and are mounted into the Python runtime
-- there. They never reach D1, R2, or any log. That is the design, not a gap:
-- students bring their own data, and the least-surprising place for it to
-- stay is the machine they brought it from.

ALTER TABLE course_settings
  ADD COLUMN code_enabled INTEGER NOT NULL DEFAULT 0;

-- An instructor-authored coding assignment. The starter notebook is copied
-- into each student's own notebook the first time they open the assignment;
-- later edits to the starter do not rewrite notebooks already started.
CREATE TABLE code_assignments (
  id            TEXT PRIMARY KEY,
  course_id     TEXT NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  title         TEXT NOT NULL,
  instructions  TEXT NOT NULL DEFAULT '',
  -- JSON: { cells: [...] } in the same shape as code_notebooks.cells_json.
  starter_json  TEXT NOT NULL DEFAULT '{"cells":[]}',
  -- Whether students get the course's AI tutor beside this notebook. Off by
  -- default: the instructor opts each assignment in.
  ai_enabled    INTEGER NOT NULL DEFAULT 0,
  -- Optional instructor instructions for the tutor on this assignment. NULL
  -- means the module's built-in coding-tutor prompt.
  ai_prompt     TEXT,
  -- NULL = no deadline, so a submission is never late. Lateness is computed
  -- at read time (submitted_at > due_at) and never stored.
  due_at        INTEGER,
  -- 'submit'   — students hand the notebook in. Origins (typed / pasted /
  --              from the tutor / provided) are recorded while they work and
  --              shown to instructors on each submission.
  -- 'practice' — nothing to hand in, and nothing is recorded.
  mode          TEXT NOT NULL DEFAULT 'submit',
  created_at    INTEGER NOT NULL,
  updated_at    INTEGER NOT NULL,
  -- Set instead of deleting, so submitted notebooks keep their context.
  archived_at   INTEGER
);

CREATE INDEX idx_code_assignments_course
  ON code_assignments(course_id, created_at DESC);

-- A student's notebook. `assignment_id` is NULL for a free-standing scratch
-- notebook. At most one notebook per (student, assignment).
CREATE TABLE code_notebooks (
  id             TEXT PRIMARY KEY,
  course_id      TEXT NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  owner_user_id  TEXT NOT NULL,
  assignment_id  TEXT,
  title          TEXT NOT NULL,
  -- JSON: { cells: [{ id, type: "code"|"markdown", source, outputs? }] }.
  -- Outputs are stored so a reload, and a submission, shows what ran.
  cells_json     TEXT NOT NULL DEFAULT '{"cells":[]}',
  -- JSON { [cellId]: source } — the starter text each cell began with, frozen
  -- when the notebook was created. Replayed as origin 'provided' before the
  -- cell's events, so instructor-supplied code is never counted as typed.
  -- NULL for a scratch notebook.
  baseline_json  TEXT,
  created_at     INTEGER NOT NULL,
  updated_at     INTEGER NOT NULL
);

CREATE INDEX idx_code_notebooks_owner
  ON code_notebooks(course_id, owner_user_id, updated_at DESC);

CREATE UNIQUE INDEX idx_code_notebooks_assignment
  ON code_notebooks(course_id, owner_user_id, assignment_id)
  WHERE assignment_id IS NOT NULL;

-- The tutor conversation beside a notebook: one continuous thread per
-- notebook. The prompt hash is captured at send time so a later edit to the
-- assignment's tutor instructions never rewrites what was said.
CREATE TABLE code_messages (
  id             TEXT PRIMARY KEY,
  notebook_id    TEXT NOT NULL REFERENCES code_notebooks(id) ON DELETE CASCADE,
  course_id      TEXT NOT NULL,
  role           TEXT NOT NULL,  -- user | assistant
  content        TEXT NOT NULL,
  prompt_hash    TEXT NOT NULL,
  -- Assistant rows only: the reply minus any line already in the student's
  -- notebook when it was sent. This is what retype detection compares
  -- against, so a tutor quoting the student's own code back to them can never
  -- make that code read as AI-written.
  novel_text     TEXT,
  created_at     INTEGER NOT NULL
);

CREATE INDEX idx_code_messages_notebook
  ON code_messages(notebook_id, created_at);

-- Append-only edit log, one row per edit to one cell. The provenance module's
-- model exactly (see @marginalia/provenance): the client proposes origins as
-- a live guess, and the render an instructor sees is recomputed from this log
-- when a notebook is submitted. Only recorded for assignments in 'submit'
-- mode. Deleted text is kept (it makes replay lossless and feeds move
-- verification) but is never shown to an instructor.
CREATE TABLE code_events (
  id                TEXT PRIMARY KEY,
  notebook_id       TEXT NOT NULL REFERENCES code_notebooks(id) ON DELETE CASCADE,
  course_id         TEXT NOT NULL,
  cell_id           TEXT NOT NULL,
  kind              TEXT NOT NULL,  -- insert|delete|paste|llm_insert|move
  offset            INTEGER NOT NULL,
  length            INTEGER NOT NULL,
  text              TEXT,
  origin            TEXT,
  restored_origins  TEXT,           -- JSON runs, for a move
  client_seq        INTEGER NOT NULL,
  created_at        INTEGER NOT NULL
);

CREATE INDEX idx_code_events_notebook
  ON code_events(notebook_id, client_seq);

-- A frozen copy of a notebook, submitted against an assignment. Immutable
-- once written. The roster reads the latest one per student. The tutor
-- transcript is frozen alongside it, so deleting the live notebook (which
-- cascades its messages) cannot rewrite what an instructor was handed.
CREATE TABLE code_submissions (
  id             TEXT PRIMARY KEY,
  course_id      TEXT NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  assignment_id  TEXT NOT NULL,
  notebook_id    TEXT NOT NULL,
  owner_user_id  TEXT NOT NULL,
  title          TEXT NOT NULL,
  cells_json     TEXT NOT NULL,
  -- JSON array of { role, content, createdAt } at submission time.
  messages_json  TEXT NOT NULL DEFAULT '[]',
  -- JSON { v, cells: { [cellId]: { runs, pastes, audit } } }: the origin
  -- render, computed from code_events at submission time. NULL when nothing
  -- was recorded.
  render_json    TEXT,
  created_at     INTEGER NOT NULL
);

CREATE INDEX idx_code_submissions_assignment
  ON code_submissions(course_id, assignment_id, owner_user_id, created_at DESC);
