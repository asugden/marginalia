-- v0.7 §1 — voices become per-author, not per-course.
--
-- Until now the `voices` table was nominally course-scoped but the UI
-- never let an instructor pick a row from it (resolveVoice() threw on
-- unknown custom ids, and the agent editor only listed library voices).
-- v0.7 turns the voices table into the source of truth for a per-author
-- voice library that can be shared with other authors by email.
--
-- Schema changes:
--   1. voices.owner_user_id — every voice is owned by a single user.
--      Backfill: existing rows are attributed to the earliest-enrolled
--      instructor of their course. Single-instructor world today, so
--      this is unambiguous; the column itself is what the v0.7 UI reads.
--      course_id stays populated for one release as a safety net and is
--      dropped in v0.8.
--   2. voice_shares — opt-in, by-user share table. Owner can grant a
--      named user permission to *use* (not edit) a voice in their own
--      agents. See v0.7-plan.md §1.4 for the rule set.

ALTER TABLE voices ADD COLUMN owner_user_id TEXT REFERENCES users(id);

-- Backfill: attribute every existing voice row to the earliest-enrolled
-- instructor of its course. NULL when the course has no instructor (a
-- bad state that doesn't exist in practice today). The v0.7 worker
-- treats voices with NULL owner_user_id as orphaned and hides them
-- from every list; an admin can fix them by hand if any are found.
UPDATE voices SET owner_user_id = (
  SELECT user_id FROM enrollments
   WHERE course_id = voices.course_id
     AND role = 'instructor'
   ORDER BY created_at ASC
   LIMIT 1
) WHERE owner_user_id IS NULL;

CREATE INDEX idx_voices_owner ON voices(owner_user_id);

-- Per-user shares. An owner explicitly grants another user the right
-- to use (but not edit or delete) a specific voice in their own agents.
-- Both ends are required; revoking a share drops the row.
CREATE TABLE voice_shares (
  voice_id   TEXT NOT NULL REFERENCES voices(id),
  user_id    TEXT NOT NULL REFERENCES users(id),
  created_at INTEGER NOT NULL,
  PRIMARY KEY (voice_id, user_id)
);

CREATE INDEX idx_voice_shares_user ON voice_shares(user_id);
