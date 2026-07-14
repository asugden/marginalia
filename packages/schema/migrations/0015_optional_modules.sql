-- 0015 — Sources and Provenance become optional, real on/off modules.
--
-- Before this, "Sources & Provenance" were presented as always-on in the
-- course-admin UI, while `show_collections` was actually a one-way lazy-reveal
-- flag (default 0, flipped on first use, never off). We now treat both as
-- genuine per-course toggles that DEFAULT ON:
--
--   * provenance_enabled — NEW. When 0, the writing tool disappears from the
--     student view (nav item + home panel + editor) and the instructor course
--     admin shows it off. Default 1 (on) so every existing course keeps it.
--   * show_collections — repurposed from a one-way reveal into a real toggle.
--     Backfilled to 1 for every existing course_settings row (every instructor
--     has sources in every course, so Sources should be visible by default).
--     The read path (listEnrollmentsForUserEnriched) also changes its COALESCE
--     default for show_collections from 0 → 1 so courses with NO settings row
--     are treated as "Sources on" too.
--
-- Reads stay LEFT JOIN + COALESCE; a missing row now means both modules on.

ALTER TABLE course_settings
  ADD COLUMN provenance_enabled INTEGER NOT NULL DEFAULT 1;

-- Every course that already has a settings row: turn Sources on (it was a
-- reveal flag before, so many rows sit at 0 despite the instructor having
-- sources). New rows default via the read-path COALESCE(...,1) change.
UPDATE course_settings SET show_collections = 1;
