-- Reference snapshot of the examples module's tables.
-- The authoritative migration lives in
-- packages/schema/migrations/0021_course_examples.sql, which carries the full
-- reasoning. The short version, repeated here because it governs every change
-- to this module: example_usage_daily has NO user identifier and must never
-- gain one, and example_completions holds a binary, student-asserted fact and
-- nothing else.

CREATE TABLE course_examples (
  course_id   TEXT NOT NULL,
  slug        TEXT NOT NULL,
  ord         INTEGER NOT NULL DEFAULT 0,
  assigned_at INTEGER,
  due_at      INTEGER,
  note        TEXT,
  PRIMARY KEY (course_id, slug)
);

-- No user_id. Not nulled, not hashed — absent. See the migration.
CREATE TABLE example_usage_daily (
  course_id     TEXT NOT NULL,
  slug          TEXT NOT NULL,
  day           TEXT NOT NULL,        -- 'YYYY-MM-DD', UTC
  hour_bucket   INTEGER NOT NULL,     -- 0-23, UTC
  opens         INTEGER NOT NULL DEFAULT 0,
  engaged_opens INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (course_id, slug, day, hour_bucket)
);

CREATE TABLE example_completions (
  course_id    TEXT NOT NULL,
  slug         TEXT NOT NULL,
  user_id      TEXT NOT NULL,
  completed_at INTEGER NOT NULL,
  PRIMARY KEY (course_id, slug, user_id)
);
