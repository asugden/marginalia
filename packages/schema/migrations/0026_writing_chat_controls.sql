-- 0026 — Writing: instructor control over the editor's LLM chat.
--
-- The code module already gives instructors the two decisions that matter
-- about an AI chat: whether students get one at all, and what voice it
-- speaks in. Writing had neither — the chat pane was always available and
-- students picked freely among course and personal agents. This brings
-- Writing to parity, at the granularity Writing actually has:
--
--   * provenance_chat_enabled — whether the LLM chat pane exists in the
--     writing editor at all. Default 1 (on), preserving current behaviour
--     for every existing course. Course-level, not per-assignment, because a
--     writing document is free-standing — it attaches to an assignment only
--     at submission time, so there is no assignment to hang the switch on
--     while the student writes.
--
--   * provenance_locked_agent_id — NULL means students choose their chat
--     agent (course defaults + their own personal agents; the behaviour to
--     date). Non-NULL names the ONE agent every student gets: a
--     provenance_agents row id, or a "builtin:<voice>" library id. While
--     locked, students can neither pick another agent nor create personal
--     ones; enforcement is server-side at conversation creation, not just
--     hidden in the UI.
--
-- Reads stay LEFT JOIN + COALESCE; a missing settings row means chat on,
-- students choose.

ALTER TABLE course_settings
  ADD COLUMN provenance_chat_enabled INTEGER NOT NULL DEFAULT 1;

ALTER TABLE course_settings
  ADD COLUMN provenance_locked_agent_id TEXT;
