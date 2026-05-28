-- 0012 — per-course settings (v1.0 §5).
-- Minimal table for the per-course UI hints the v1.0 dashboard needs:
--   * show_attendance / show_collections — lazy-reveal flags for the tab
--     strip. Default 0; flipped implicitly the first time the feature is
--     used (or via a manual toggle in the dashboard footer).
--   * chip_color — picker-card accent so an instructor can tell their
--     courses apart at a glance. Does NOT change the in-course palette.
--
-- Rows are inserted lazily on first write. Reads `LEFT JOIN` with
-- `COALESCE` to handle the missing case, so this migration backfills
-- nothing.

CREATE TABLE course_settings (
  course_id        TEXT PRIMARY KEY REFERENCES courses(id) ON DELETE CASCADE,
  show_attendance  INTEGER NOT NULL DEFAULT 0,
  show_collections INTEGER NOT NULL DEFAULT 0,
  -- Hex like '#5b6cff'; NULL means "use the institution default".
  chip_color       TEXT,
  updated_at       INTEGER NOT NULL
);
