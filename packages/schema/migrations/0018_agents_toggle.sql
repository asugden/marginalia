-- 0018 — Agents becomes an optional, real on/off extension.
--
-- Agents were previously always-on (no toggle). We now treat Agents as a
-- genuine per-course extension that DEFAULTS ON, mirroring provenance_enabled
-- (migration 0015):
--
--   * agents_enabled — NEW. When 0, the Agents tab disappears from the
--     instructor nav + dashboard, and agents disappear from the student view
--     (nav item + home panel). Default 1 (on) so every existing course keeps
--     agents visible.
--
-- Library moved the other direction: it is no longer toggleable (always on).
-- The show_collections column is retained (harmless, reads on via COALESCE);
-- there is simply no longer a UI/API path to turn it off.
--
-- Reads stay LEFT JOIN + COALESCE; a missing row means agents on.

ALTER TABLE course_settings
  ADD COLUMN agents_enabled INTEGER NOT NULL DEFAULT 1;
