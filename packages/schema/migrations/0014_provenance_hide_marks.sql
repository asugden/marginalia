-- 0014 — per-course "hide provenance marks from students" toggle.
--
-- When on, students see the document WITHOUT origin coloring while they
-- write; recording continues unchanged. This addresses the surveillance
-- concern — a student isn't watched in colored real time — without
-- weakening the audit trail. Instructors always see coloring, and the
-- frozen submission render (slice 6) is computed server-side from the
-- event log, so it is unaffected by this display-only flag.
--
-- Default 0 (marks shown), matching the tool's existing behavior. Lives
-- on the existing course_settings row; reads LEFT JOIN + COALESCE like
-- the other flags so the missing-row case is just "off".

ALTER TABLE course_settings
  ADD COLUMN hide_provenance_marks INTEGER NOT NULL DEFAULT 0;
