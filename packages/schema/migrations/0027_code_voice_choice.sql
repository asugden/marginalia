-- 0027 — Code: let an assignment's chat voice be the student's choice.
--
-- code_assignments.voice_json already lets the instructor assign ONE voice
-- to the chat beside an assignment. This adds the other policy: when
-- voice_choice is 1, each student picks their own voice from the shared
-- library (library voices only — an instructor's custom voices stay
-- private), with the assignment's own voice as the default. The instructor's
-- per-assignment guidance (ai_prompt) applies whichever voice speaks.
--
-- Default 0 — one assigned voice — which is exactly the behaviour to date.

ALTER TABLE code_assignments
  ADD COLUMN voice_choice INTEGER NOT NULL DEFAULT 0;
