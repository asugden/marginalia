-- 0031 — onboarding: where an instructor is in a course's guided tour.
--
-- The tour itself is composed in the web app from per-feature descriptors;
-- this table only remembers progress, so the tour survives a reload, follows
-- the instructor across devices, and can be re-run from the course.
--
-- Keyed by the REAL signed-in user even while they preview the course as its
-- sample student (the tour hops between the two views; the progress belongs
-- to the person taking it).
--
--   preset_json  — the choices made at setup: { stance, features[] }.
--   context_json — ids of what setup created for the tour to point at
--                  (e.g. the writing assignment, the guided agent).
--   step         — index of the current tour step.

CREATE TABLE onboarding_progress (
  user_id      TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  course_id    TEXT NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  preset_json  TEXT NOT NULL DEFAULT '{}',
  context_json TEXT NOT NULL DEFAULT '{}',
  step         INTEGER NOT NULL DEFAULT 0,
  completed_at INTEGER,
  dismissed_at INTEGER,
  updated_at   INTEGER NOT NULL,
  PRIMARY KEY (user_id, course_id)
);
