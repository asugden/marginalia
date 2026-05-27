-- v0.5 §7 — capture agent display title on the conversation row at insert
-- time so conversations against a later-deleted agent still display the
-- author's chosen name (rather than reading as "(deleted agent)" forever).
--
-- conversations.agent_id is nullable and the FK has no CASCADE, so the
-- DELETE flow simply nulls out agent_id on orphan rows and removes the
-- agent. The list/get conversation paths COALESCE on agent_title_snapshot
-- when the agent row is gone.
--
-- Why a column and not "parse it out of definition_snapshot at read time":
-- the list path already reads every row; one extra TEXT column is cheaper
-- than JSON.parse per row, and keeps definition_snapshot as the source of
-- truth for runtime definition (untouched by display tweaks).

ALTER TABLE conversations ADD COLUMN agent_title_snapshot TEXT;

-- Backfill existing rows from their current agent title so any pre-v0.5
-- conversation reads correctly after this migration. Rows whose agent
-- already vanished (shouldn't exist on day-one of v0.5, but defensive)
-- remain NULL and will fall back to the generic label.
UPDATE conversations
   SET agent_title_snapshot = (
     SELECT title FROM agents WHERE agents.id = conversations.agent_id
   )
 WHERE agent_id IS NOT NULL
   AND agent_title_snapshot IS NULL;
