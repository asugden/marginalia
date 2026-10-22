-- 0030 — The sample student: previewing a course as a real student.
--
-- "Act as student" (0016) kept the instructor's own identity and asked every
-- surface to behave as if the caller were a student. Several didn't — any
-- code that read the enrollment role straight from D1 saw an instructor — and
-- whatever an instructor did while previewing never appeared in their own
-- instructor views, since those list enrolled students.
--
-- Now previewing swaps identity instead:
--
--   * Each course gets one sample student — a real users row, is_sample = 1,
--     sample_course_id naming its course, enrolled as `student`. Created
--     lazily the first time someone previews the course. Its email is on the
--     reserved `.invalid` domain, so no sign-in can ever claim it.
--
--   * sessions.acting_as_user_id — while set, the worker authenticates the
--     request AS that sample student. Every endpoint answers as a student, so
--     no screen can see instructor credentials. The session still belongs to
--     the real user (sessions.user_id); clearing the column ends the preview.
--
-- The sample student's work shows in instructor views with a "Sample" badge
-- and is left out of counts, exports, and the anonymous usage counters.

ALTER TABLE users ADD COLUMN is_sample INTEGER NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN sample_course_id TEXT REFERENCES courses(id);

CREATE UNIQUE INDEX idx_users_sample_course
  ON users(sample_course_id) WHERE sample_course_id IS NOT NULL;

ALTER TABLE sessions ADD COLUMN acting_as_user_id TEXT REFERENCES users(id);
