-- 0021 — course-attached examples, plus two deliberately separate usage signals.
--
-- Examples (/examples/<slug>) are standalone, static, unauthenticated teaching
-- pages. They stay that way. This migration does NOT make them course-gated:
-- it lets an instructor *curate* a subset for a course, and it records two
-- narrow facts about how that subset gets used. An anonymous visitor to
-- /examples/<slug> still sees exactly the page they saw before.
--
-- The important decision here is that usage is split into two tables that can
-- never be joined into a per-student activity log. They answer two different
-- questions and are deliberately kept incapable of answering a third:
--
--   example_usage_daily   "did the class open this, and roughly when?"
--                         Anonymous. Counts only. No identity, ever.
--   example_completions   "did *this* student say they finished it?"
--                         Identified, but written only when the student
--                         presses a button that says so.
--
-- Nothing bridges them. There is no id, no hash, and no timestamp precise
-- enough in the aggregate table to line a count up against a completion row.
-- That is the design, not an oversight.

-- ---------------------------------------------------------------------------
-- Curation: which examples an instructor has attached to a course.
-- ---------------------------------------------------------------------------
--
-- `slug` references apps/web/src/examples/registry.ts and is intentionally not
-- a foreign key — examples are front-end code, not rows, and a deploy that
-- removes an example should leave a harmless dangling row rather than fail a
-- constraint. The read path skips slugs the registry no longer knows about.
--
-- Both dates are nullable and independent. An instructor who just wants to say
-- "these five are worth your time" should not have to invent a due date, and
-- an example can be assigned with no deadline or given a deadline without a
-- start. Timestamps are epoch milliseconds, matching every other table here.
CREATE TABLE course_examples (
  course_id   TEXT NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  slug        TEXT NOT NULL,
  ord         INTEGER NOT NULL DEFAULT 0,   -- instructor's display order
  assigned_at INTEGER,                      -- optional; NULL = no start date
  due_at      INTEGER,                      -- optional; NULL = no deadline
  note        TEXT,                         -- optional one-line instruction
  PRIMARY KEY (course_id, slug)
);

CREATE INDEX idx_course_examples_order ON course_examples(course_id, ord);

-- ---------------------------------------------------------------------------
-- (a) Anonymous aggregate usage.
-- ---------------------------------------------------------------------------
--
-- *** THIS TABLE HAS NO USER IDENTIFIER, AND MUST NEVER ACQUIRE ONE. ***
--
-- Not a user_id column that is left NULL. Not a hashed or salted user id. Not
-- a session id, a device cookie, an IP address, or a user-agent string. The
-- column is absent, because absence is the only guarantee that holds: a NULL
-- column can be backfilled by a later migration, a hash can be rainbow-tabled
-- against a roster of thirty known students in seconds, and a "temporary"
-- debugging id outlives whoever added it. The schema is the privacy promise.
-- If a future feature seems to need per-student open counts, that feature is
-- the thing to reconsider; do not add a column here.
--
-- Because rows carry no identity, they are written with an UPSERT that only
-- increments counters. A row is a tally, never an event, and there is no
-- insertion order to reconstruct.
--
-- Time resolution is deliberately coarse: a UTC day plus an hour bucket. Hour
-- granularity is enough to answer "are they doing this the night before the
-- deadline or during the week?", which is the pedagogically interesting
-- question. Finer buckets (minute, or a raw timestamp) would start to act as a
-- quasi-identifier — in a class of thirty, a single open at 03:14 is one
-- person — so the coarseness is a feature.
--
-- Two counters:
--   opens          the page was opened with this course's context attached.
--   engaged_opens  the visitor actually interacted with the example. Counted
--                  at most once per visit, and only on a real interaction
--                  signal, so a bounce or a mis-click doesn't read as use.
--                  Comparing the two is the point: 40 opens and 3 engaged
--                  means something different from 40 and 35.
--
-- The instructor read path additionally applies a small-cohort floor (see
-- MIN_COHORT in the worker module) so tiny counts are reported as a range
-- rather than an exact number.
CREATE TABLE example_usage_daily (
  course_id     TEXT NOT NULL,
  slug          TEXT NOT NULL,
  day           TEXT NOT NULL,                      -- 'YYYY-MM-DD', UTC
  hour_bucket   INTEGER NOT NULL,                   -- 0-23, UTC
  opens         INTEGER NOT NULL DEFAULT 0,
  engaged_opens INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (course_id, slug, day, hour_bucket)
);

-- The instructor view reads a course's recent window, newest day first.
CREATE INDEX idx_example_usage_course_day
  ON example_usage_daily(course_id, day DESC);

-- ---------------------------------------------------------------------------
-- (b) Opt-in, identified completion.
-- ---------------------------------------------------------------------------
--
-- One row per (course, example, student), written ONLY when the student
-- presses "Mark complete", and deletable by that same student when they change
-- their mind. It is the student's claim about their own work, which is why
-- they are allowed to retract it.
--
-- This table is intentionally almost empty. It carries the fact and when the
-- claim was made, and nothing else: no dwell time, no open count, no attempt
-- history, no per-student timeline. Instructor oversight of examples is binary
-- completion only — that is a standing project decision, and a column added
-- here would quietly overturn it. The roster view renders a checkmark or a
-- dash; anything richer needs the decision revisited first, not a migration.
CREATE TABLE example_completions (
  course_id    TEXT NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  slug         TEXT NOT NULL,
  user_id      TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  completed_at INTEGER NOT NULL,
  PRIMARY KEY (course_id, slug, user_id)
);

-- Roster read: every completion in a course, grouped per example.
CREATE INDEX idx_example_completions_course
  ON example_completions(course_id, slug);

-- Student read: "which of these have I already marked?" for one course.
CREATE INDEX idx_example_completions_user
  ON example_completions(course_id, user_id);
