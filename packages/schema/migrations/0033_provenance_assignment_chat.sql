-- 0033 — Writing: the LLM chat and its voice are set per assignment.
--
-- Migration 0026 put both on the course (course_settings.
-- provenance_chat_enabled / provenance_locked_agent_id) because a document
-- then met an assignment only at submission time. Since 0032 a new document
-- belongs to an assignment from the start, so the chat can follow the
-- assignment — the same granularity as code (code_assignments.ai_enabled).
--
--   * chat_enabled    — whether the chat pane exists for this assignment's
--                       documents. New assignments default OFF, like code:
--                       the instructor opts each assignment in.
--   * locked_agent_id — NULL = students choose their chat agent; otherwise
--                       the one agent every student gets (a course-default
--                       provenance_agents id, or "builtin:<voice>").
--
-- Existing assignments are backfilled from their course's current settings,
-- so nothing a student sees today changes. Documents with no assignment
-- (written before 0032) keep following the course-level columns, which stay
-- in place for them; there is simply no longer a course-level control.

ALTER TABLE provenance_assignments
  ADD COLUMN chat_enabled INTEGER NOT NULL DEFAULT 0;
ALTER TABLE provenance_assignments
  ADD COLUMN locked_agent_id TEXT;

UPDATE provenance_assignments
   SET chat_enabled = COALESCE(
         (SELECT s.provenance_chat_enabled FROM course_settings s
           WHERE s.course_id = provenance_assignments.course_id),
         1),
       locked_agent_id =
         (SELECT s.provenance_locked_agent_id FROM course_settings s
           WHERE s.course_id = provenance_assignments.course_id);
