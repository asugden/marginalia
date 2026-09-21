-- Reference snapshot of the course-items module's table.
-- The authoritative migration lives in
-- packages/schema/migrations/0022_course_items.sql, which carries the full
-- reasoning plus the agent backfill and its verification queries.
--
-- The short version, repeated here because it governs every change to this
-- module:
--
--   * The wrapper owns scheduling, identity, and ordering. Each module keeps
--     its own content and defines what completion means.
--   * There is NO completion column here, and no user column. Completion is
--     four different facts (artifact / server-derived / self-report), read
--     from the modules that own them and reported with distinct verbs.
--   * This table must never gain a join path to example_usage_daily. It is
--     course data — one row per assigned thing, never one row per student.

CREATE TABLE course_items (
  id          TEXT PRIMARY KEY,
  course_id   TEXT NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  -- 'writing' | 'agent' | 'example' | 'reading'. No CHECK: a new kind ships as
  -- a row plus a read-path case, not a table rewrite under a live course.
  kind        TEXT NOT NULL,
  -- agents.id | provenance_assignments.id | course_examples.slug.
  -- Intentionally not a foreign key — see the migration.
  payload_ref TEXT NOT NULL,
  title       TEXT NOT NULL,
  ord         INTEGER NOT NULL DEFAULT 0,
  -- Both NULL = a recommended supplement: available, never due, never late.
  assigned_at INTEGER,
  due_at      INTEGER,
  note        TEXT,
  archived_at INTEGER,
  created_at  INTEGER NOT NULL,
  updated_at  INTEGER NOT NULL
);

CREATE INDEX idx_course_items_course_ord
  ON course_items(course_id, ord ASC);

CREATE INDEX idx_course_items_payload
  ON course_items(course_id, kind, payload_ref);
