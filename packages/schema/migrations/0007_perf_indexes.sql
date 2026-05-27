-- v0.7 follow-up: indexes for the slow paths the audit flagged.
--
-- audit_log: the /admin User detail view shows a user's full history —
-- "things they did" (filtered by actor_id, already indexed) *plus*
-- "things done to them" (filtered by target_kind='user' AND
-- target_id=<userId>). The target side was scanning until now.
CREATE INDEX idx_audit_log_target
  ON audit_log(target_kind, target_id, created_at DESC);

-- conversations: listLastConversationsByAgent picks the most recent
-- conversation per (user_id, course_id, agent_id). The composite below
-- lets SQLite drive that grouping straight off the index without a
-- sort or table scan. Complements the existing (user_id, course_id)
-- and (user_id, updated_at DESC) indexes — neither covers the agent
-- dimension, which is what the home-page hot path filters on.
CREATE INDEX idx_conversations_user_course_agent_updated
  ON conversations(user_id, course_id, agent_id, updated_at DESC);
