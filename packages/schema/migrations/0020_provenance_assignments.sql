-- 0020 — provenance: writing assignments with checkpoints.
--
-- Until now a submission was a bare act: a student pressed Share, a snapshot
-- was frozen, and the instructor's Submissions page listed whatever happened to
-- exist. Nothing named what the writing was *for*, and — the bigger gap — the
-- page could only show what had been submitted. A student who submitted nothing
-- was invisible, which is precisely the student an instructor is looking for.
--
-- The unit of work is an ASSIGNMENT with N CHECKPOINTS. "Draft due Monday,
-- final due Wednesday" is one assignment with two checkpoints, not two
-- assignments: the student keeps one document across both, and the interesting
-- reading is how that one document changed between them. Modeling it as two
-- separate assignments would split that history in half.
--
-- Lateness is NOT stored. It is computed at read time as
-- `submitted_at > due_at`, and a checkpoint with `due_at IS NULL` is never
-- late. Storing a late flag would freeze a judgment that a changed due date
-- ought to update — an instructor who extends a deadline expects the roster to
-- stop saying LATE, not to carry a stale verdict forward. A late submission is
-- always accepted; the flag is a bare fact (a timestamp against a deadline),
-- never a score or a concern rating.
--
-- Attachment is OPTIONAL on both sides. `provenance_submissions` gains two
-- nullable columns; existing rows keep NULL and keep working exactly as before,
-- and a student can still submit a document that belongs to no assignment. That
-- nullability is the entire backward-compatibility story — there is no backfill
-- to run and no default assignment to invent.

CREATE TABLE provenance_assignments (
  id            TEXT PRIMARY KEY,
  course_id     TEXT NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  title         TEXT NOT NULL,
  -- Shown to the student when they pick this assignment in the submit modal.
  instructions  TEXT NOT NULL DEFAULT '',
  created_at    INTEGER NOT NULL,
  updated_at    INTEGER NOT NULL,
  -- Set instead of deleting, so submissions already attached keep their
  -- context. An archived assignment disappears from the student's picker but
  -- still names the work on the instructor's roster.
  archived_at   INTEGER
);

CREATE INDEX idx_provenance_assignments_course
  ON provenance_assignments(course_id, created_at DESC);

CREATE TABLE provenance_assignment_checkpoints (
  id             TEXT PRIMARY KEY,
  assignment_id  TEXT NOT NULL REFERENCES provenance_assignments(id) ON DELETE CASCADE,
  -- Display order within the assignment, instructor-controlled. Not a due-date
  -- sort: an instructor may add "Peer review" between two dated checkpoints, or
  -- leave a checkpoint undated entirely.
  ord            INTEGER NOT NULL,
  name           TEXT NOT NULL,
  -- NULL = no deadline, so this checkpoint can never be late.
  due_at         INTEGER
);

CREATE INDEX idx_provenance_checkpoints_assignment
  ON provenance_assignment_checkpoints(assignment_id, ord);

-- Both nullable: a submission may be attached to an assignment checkpoint, or
-- to nothing at all. No FK constraint is declared — the columns are written by
-- a handler that has already verified both rows live in the submission's own
-- course, and leaving them plain keeps an archived-then-deleted assignment from
-- cascading away a student's frozen snapshot.
ALTER TABLE provenance_submissions ADD COLUMN assignment_id TEXT;
ALTER TABLE provenance_submissions ADD COLUMN checkpoint_id TEXT;

-- Drives the roster read: every submission for one checkpoint, newest first,
-- so "latest submission per student" is a scan of the head of each group.
CREATE INDEX idx_provenance_submissions_checkpoint
  ON provenance_submissions(checkpoint_id, user_id, created_at DESC);
