-- 0017 — Course term + active window.
--
-- Until now a course was just id + org + name + created_at, so every course
-- listing was a flat, ever-growing, join-date-ordered list — no way to tell a
-- current course from a finished one, and no way to organise past courses by
-- when they were taught.
--
-- This adds a light temporal dimension so a course can be placed in a semester
-- and known to be current only while it's actually running:
--
--   * term_season — 'spring' | 'summer' | 'fall', or NULL for an unscheduled
--     course. The academic year is derived from (season, year) — see
--     packages/schema/src/term.ts. This is the human category used for labels
--     and grouping.
--   * term_year — the CALENDAR year the season falls in (2026 = Fall 2026,
--     Spring 2027, Summer 2027 are three distinct terms).
--   * start_date / end_date — the course's active window, as Unix ms at UTC
--     day boundaries (start = 00:00:00 of the first day, end = 23:59:59.999 of
--     the last day, inclusive). A course is "current" when now is within
--     [start_date, end_date]; a NULL bound is open-ended (no lower/upper
--     limit). This is the single source of truth for active vs past — there is
--     deliberately no manual archived flag. Storing UTC day boundaries keeps
--     the comparison at day granularity; semester windows are weeks long, so
--     timezone edge effects are negligible.
--
-- All columns are nullable with no default, so every existing course reads as
-- unscheduled and open-ended (always current until an end date is set) — no
-- backfill needed. Season is validated in the worker, not by a CHECK, because
-- SQLite's ALTER TABLE … ADD COLUMN can't attach a table CHECK after the fact.

ALTER TABLE courses ADD COLUMN term_season TEXT;
ALTER TABLE courses ADD COLUMN term_year   INTEGER;
ALTER TABLE courses ADD COLUMN start_date  INTEGER;
ALTER TABLE courses ADD COLUMN end_date    INTEGER;
