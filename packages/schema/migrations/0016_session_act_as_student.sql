-- "Act as student" — a session-scoped role downgrade so an instructor can run
-- the agents they authored exactly as a student would, in their own course,
-- without a second account. This closes the authoring→testing loop: configure
-- an agent, preview it as a learner, then step back out.
--
-- Why on the session (not the user or enrollment): the downgrade must be
-- ephemeral and reversible with a single click, must not touch the
-- instructor's real `instructor` enrollment, and must auto-clear on logout /
-- expiry. A boolean on the session row is the smallest thing that satisfies
-- all three.
--
-- Adding a NOT NULL column with a DEFAULT is a safe single-statement ALTER in
-- SQLite (unlike relaxing nullability), so no table rebuild is needed here.
-- Existing sessions default to 0 = full instructor powers.

ALTER TABLE sessions ADD COLUMN acting_as_student INTEGER NOT NULL DEFAULT 0;
