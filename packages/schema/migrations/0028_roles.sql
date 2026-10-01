-- 0028 — Roles: the TA role returns, and course creation becomes a permission.
--
-- Two changes, one idea: who may do what is decided by a single permission
-- table in the worker (apps/worker/src/permissions.ts), and the schema carries
-- exactly the facts that table needs.
--
--   * enrollments.role gains 'ta'. Migration 0004 dropped `ta` because it had
--     no behaviour of its own. It now does: a TA manages students, sees their
--     submissions, and runs attendance, but authors nothing and adds no staff.
--
--   * users.can_create_courses — NEW. Course creation is a per-person
--     permission, not a course role: "an instructor who can't create courses"
--     is simply an instructor enrollment on a user without this flag. Admins
--     grant it; admins can always create courses regardless of the flag.
--
-- Backfill: everyone who is an instructor anywhere today could create courses
-- today, so they keep that ability.

ALTER TABLE users ADD COLUMN can_create_courses INTEGER NOT NULL DEFAULT 0;

UPDATE users SET can_create_courses = 1
  WHERE id IN (SELECT user_id FROM enrollments WHERE role = 'instructor');

-- SQLite cannot ALTER a CHECK constraint in place: the same swap-table dance
-- as 0004, inside the migration transaction.

CREATE TABLE enrollments_new (
  id          TEXT PRIMARY KEY,
  course_id   TEXT NOT NULL REFERENCES courses(id),
  user_id     TEXT NOT NULL REFERENCES users(id),
  role        TEXT NOT NULL CHECK (role IN ('student', 'ta', 'instructor')),
  created_at  INTEGER NOT NULL,
  UNIQUE (course_id, user_id)
);

INSERT INTO enrollments_new (id, course_id, user_id, role, created_at)
  SELECT id, course_id, user_id, role, created_at FROM enrollments;

DROP TABLE enrollments;
ALTER TABLE enrollments_new RENAME TO enrollments;

CREATE INDEX idx_enrollments_course ON enrollments(course_id);
CREATE INDEX idx_enrollments_user   ON enrollments(user_id);
