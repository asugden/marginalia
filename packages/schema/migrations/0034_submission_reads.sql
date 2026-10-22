-- 0034 — Which submissions course staff have opened.
--
-- A row is written the first time a staff member opens a submission (each
-- later open moves read_at forward). Read state is shared across the course's
-- staff: a submission counts as read once anyone on staff has opened it, and
-- the rows say who and when. The submitting student never writes a row, even
-- if they hold a staff role elsewhere.
--
-- One table for every kind of submission, keyed by the kind and the
-- submission's own id (a code submission id, or a writing snapshot's token).
-- Nothing references this table, and deleting a submission leaves its read
-- rows harmlessly orphaned.

CREATE TABLE submission_reads (
  course_id     TEXT NOT NULL,
  kind          TEXT NOT NULL CHECK (kind IN ('writing', 'code')),
  submission_id TEXT NOT NULL,
  user_id       TEXT NOT NULL,
  read_at       INTEGER NOT NULL,
  PRIMARY KEY (kind, submission_id, user_id)
);

CREATE INDEX idx_submission_reads_course ON submission_reads (course_id, kind);
