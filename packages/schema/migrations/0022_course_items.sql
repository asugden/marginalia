-- 0022 — course_items: one wrapper for everything a course assigns.
--
-- Three concepts had been tangled together in the instructor's nav: things you
-- *assign*, what *comes back*, and the *materials* you build assignments from.
-- This migration names the first of those, and nothing else.
--
-- The concept is not new; it had just never been named. `0001_init.sql`
-- describes `agents` as "the top-level thing a student picks from a list. What
-- v0.2 called an *assignment*." A later rename to "agents" described the
-- implementation rather than the role, and 0020/0021 then grew a second and
-- third assignable thing beside it — writing and examples — each with its own
-- title, its own display order, and its own pair of optional dates. Three
-- independent implementations converging on the same four fields is the
-- argument for a wrapper; readings and discussions would have been the fourth
-- and fifth copy.
--
-- ---------------------------------------------------------------------------
-- What the wrapper owns, and what it very deliberately does not
-- ---------------------------------------------------------------------------
--
-- OWNS: scheduling (`assigned_at` / `due_at`), identity (`title`), ordering
-- (`ord`), and whether the item is still live (`archived_at`). These are
-- exactly the fields that were being reinvented per type, and they are
-- type-independent — a due date means the same thing whatever is due.
--
-- DOES NOT OWN: content, or what "done" means. Each module keeps both.
-- Writing keeps its assignments and checkpoints; examples keep their curation
-- row and completions; agents keep their definition and their conversations.
-- The wrapper points *at* those rows through `payload_ref` and never copies,
-- moves, or supersedes them.
--
-- **Nothing moves.** No table is dropped, renamed, or altered by this
-- migration. That is a correctness requirement, not tidiness: `agents`,
-- `course_examples`, and the provenance tables are all live, and the examples
-- privacy split in particular is enforced by physical table structure (see
-- below). A refactor that relocated rows would have put that structure at
-- risk for no benefit.
--
-- ---------------------------------------------------------------------------
-- Completion is NOT one concept, and this table stores none of it
-- ---------------------------------------------------------------------------
--
-- There is deliberately no `completed` column, no completion table, and no
-- per-student row anywhere in this migration. Each kind already answers "did
-- this student do it?" its own way, and the four answers are not the same kind
-- of claim:
--
--   writing   a submission exists            — an artifact the student minted
--   agent     conversations.completed_at     — server-derived, from a backbone
--                                              reaching its exit
--   example   example_completions row        — the student's own self-report
--   reading   (self-report, when built)      — the student's own self-report
--
-- A backbone exit is *evidence*; a checkbox is a *claim*. Flattening the two
-- into a single boolean would quietly present a student's self-report as
-- something verified — the same class of error the provenance module's
-- no-false-positives rule exists to prevent. So the wrapper holds "is this
-- complete?" as a QUESTION that each type answers in its own tables, and the
-- read path surfaces a distinct verb per kind (writing *submitted*, agent
-- *finished*, example/reading *marked done*) rather than a shared checkmark.
--
-- For agents specifically: **any** completed conversation counts. A student
-- may hold several conversations with one agent, and re-opening a finished
-- tutor to review must not un-finish it. `completed_at` is written with
-- COALESCE so credit, once earned, is never overwritten by continuing to talk.
--
-- ---------------------------------------------------------------------------
-- The privacy invariant this migration must not break
-- ---------------------------------------------------------------------------
--
-- `example_usage_daily` (0021) is anonymous *by structure*: it has no user
-- column, so no query can re-identify. That guarantee survives here only
-- because it is untouched and because `course_items` is not a per-student
-- table. A wrapper row is course data — one row per assigned thing, not one
-- row per student — so joining `course_items` to `example_usage_daily` yields
-- at most "this course assigned this slug, and the course opened it N times",
-- which is what the aggregate already said on its own.
--
-- The invariant to preserve on every future change: **no row that carries a
-- user id may become joinable to `example_usage_daily`.** Concretely, do not
-- add a `user_id` to this table, and do not add a per-student completion table
-- keyed by `course_items.id` for `kind='example'` — either would create the
-- join path the 0021 split exists to make impossible. Example completion has
-- a home already (`example_completions`), keyed by slug, and it must stay
-- there.
--
-- ---------------------------------------------------------------------------
-- Sections
-- ---------------------------------------------------------------------------
--
-- A course "section" is coming, and when it lands `course_items` gains one
-- nullable `section_id` and slots in — because scheduling and grouping will
-- then live in one table instead of three. The column is deliberately LEFT
-- OUT here rather than added unused: an unused nullable column invites a
-- partial implementation. `ord` is kept section-shaped (dense within a course,
-- instructor-controlled, no meaning attached to the absolute value) so adding
-- the column later is a migration and not a redesign.

CREATE TABLE course_items (
  id          TEXT PRIMARY KEY,
  course_id   TEXT NOT NULL REFERENCES courses(id) ON DELETE CASCADE,

  -- Which module owns the payload. Not a CHECK constraint: a new kind should
  -- ship as a row plus a read-path case, not as a migration that rewrites a
  -- table under a live course. An unrecognised kind is skipped by the read
  -- path the same way an unknown example slug is, so a rollback leaves inert
  -- rows rather than a failing constraint.
  --   'writing' | 'agent' | 'example' | 'reading'
  kind        TEXT NOT NULL,

  -- The payload's own key, interpreted according to `kind`:
  --   writing  → provenance_assignments.id
  --   agent    → agents.id
  --   example  → course_examples.slug  (a slug, not a row id — examples are
  --              front-end code, so there is no id to point at)
  --   reading  → reserved; readings are not built yet
  --
  -- Intentionally NOT a foreign key. It cannot be one — it targets three
  -- different tables plus a slug that is not a row anywhere — and it should
  -- not be one: deleting an agent should leave a dangling wrapper row that the
  -- read path skips, exactly as 0021 chose for example slugs, rather than
  -- cascading away an instructor's schedule or failing the delete outright.
  payload_ref TEXT NOT NULL,

  -- The item's name as students see it in the list.
  --
  -- This duplicates the payload's own title rather than deriving from it, and
  -- that is the point: the list must render in one query without reaching into
  -- three modules' tables, and an instructor may legitimately want an agent
  -- called "Derivatives tutor" to appear on the schedule as "Week 3 warm-up".
  -- The backfill below seeds it from the payload, so the two agree until
  -- somebody deliberately changes one.
  title       TEXT NOT NULL,

  -- Instructor-controlled display order within the course. Position only; the
  -- absolute value carries no meaning, so a later section_id can partition on
  -- it without a data migration.
  ord         INTEGER NOT NULL DEFAULT 0,

  -- Both dates optional and independent, matching 0020 and 0021.
  --
  -- BOTH NULL is a meaningful, first-class state: a **recommended supplement**
  -- — "this is worth your time" — not an unscheduled draft. An instructor
  -- should never have to invent a deadline to put something in front of a
  -- class, and every existing agent becomes exactly this state below.
  --
  -- Lateness is not stored here, or anywhere. It is `submitted_at > due_at`,
  -- computed at read time, so moving a deadline is the whole of the remedy
  -- (see 0020). An item with `due_at IS NULL` can never be late.
  assigned_at INTEGER,
  due_at      INTEGER,

  -- Optional one-line instruction shown beside the row, as course_examples.note.
  note        TEXT,

  -- Set instead of deleting. An archived item leaves the students' list but
  -- keeps naming the work on an instructor's review surfaces. Archiving a
  -- wrapper deliberately does NOT archive its payload: an agent can outlive
  -- the week it was assigned in and be re-assigned next term, so the two have
  -- different lifetimes.
  archived_at INTEGER,

  created_at  INTEGER NOT NULL,
  updated_at  INTEGER NOT NULL
);

-- The list read: one course's live items in the instructor's order.
CREATE INDEX idx_course_items_course_ord
  ON course_items(course_id, ord ASC);

-- Resolve the other direction — "is this agent assigned, and when is it due?"
-- — which the agent and writing surfaces need without scanning the course.
CREATE INDEX idx_course_items_payload
  ON course_items(course_id, kind, payload_ref);

-- ---------------------------------------------------------------------------
-- Backfill: one wrapper row per existing agent
-- ---------------------------------------------------------------------------
--
-- This is the only genuinely risky step in the migration, so it is written to
-- be as close to a no-op as a backfill can be.
--
-- Students are live in production. Agents are the one assignable type that
-- predates the wrapper *and* is already deployed, so unlike writing and
-- examples — whose rows are created through the new surface from here on —
-- existing agents need wrapper rows or they would vanish from a list built on
-- `course_items`.
--
-- Every backfilled row gets `assigned_at` and `due_at` NULL, which is the
-- "recommended supplement" state above: always available, never late, never
-- overdue. That is precisely the behaviour agents have today, so **no current
-- behaviour changes**. An instructor who wants dates adds them afterwards.
--
-- The `agents` table is not altered, not read from destructively, and not
-- depended on by this row beyond the id it points at. Rolling this migration
-- back is `DROP TABLE course_items`; nothing else needs undoing.
--
-- `ord` is seeded from `updated_at DESC` via a correlated count, reproducing
-- the order the agents list already displays, so the first list a student sees
-- after deploy is in the order they saw before it. Ties (agents updated in the
-- same millisecond) break on id, keeping the numbering dense and deterministic
-- rather than leaving gaps or duplicates.
--
-- `WHERE NOT EXISTS` makes the insert idempotent: re-running it cannot mint a
-- second wrapper for an agent, which is what the first verification query
-- below checks.
INSERT INTO course_items
  (id, course_id, kind, payload_ref, title, ord,
   assigned_at, due_at, note, archived_at, created_at, updated_at)
SELECT
  'citem_' || a.id,          -- deterministic, so a re-run collides on the PK
                             -- rather than duplicating
  a.course_id,
  'agent',
  a.id,
  a.title,
  (SELECT COUNT(*)
     FROM agents b
    WHERE b.course_id = a.course_id
      AND (b.updated_at > a.updated_at
           OR (b.updated_at = a.updated_at AND b.id < a.id))),
  NULL,                      -- assigned_at: dateless, exactly as today
  NULL,                      -- due_at:      dateless, exactly as today
  NULL,
  NULL,                      -- archived_at: every existing agent stays live
  a.created_at,              -- preserve the agent's own history rather than
  a.updated_at               -- stamping the migration's run time
FROM agents a
WHERE NOT EXISTS (
  SELECT 1 FROM course_items ci
   WHERE ci.kind = 'agent' AND ci.payload_ref = a.id
);

-- ---------------------------------------------------------------------------
-- Verification queries — run these BEFORE and AFTER applying the migration
-- ---------------------------------------------------------------------------
--
-- They are comments, not statements, because a migration that fails halfway
-- leaves worse damage than one that applied and was then checked. Run them by
-- hand and compare.
--
-- (1) Every agent has EXACTLY ONE wrapper row — none missed, none duplicated,
--     and no wrapper pointing at an agent that does not exist. Expect ZERO
--     rows. Any row returned names the offending agent and its actual count.
--
--       SELECT a.id, a.course_id, a.title,
--              (SELECT COUNT(*) FROM course_items ci
--                WHERE ci.kind = 'agent' AND ci.payload_ref = a.id) AS wrappers
--         FROM agents a
--        WHERE wrappers <> 1
--       UNION ALL
--       SELECT ci.payload_ref, ci.course_id, ci.title, 0
--         FROM course_items ci
--        WHERE ci.kind = 'agent'
--          AND NOT EXISTS (SELECT 1 FROM agents a WHERE a.id = ci.payload_ref);
--
-- (2) No course gained or lost items. Per course, the number of agents must
--     equal the number of agent wrappers, and every wrapper must sit in the
--     same course as the agent it points at. Expect ZERO rows.
--
--       SELECT course_id, agents, wrappers FROM (
--         SELECT c.id AS course_id,
--                (SELECT COUNT(*) FROM agents a
--                  WHERE a.course_id = c.id) AS agents,
--                (SELECT COUNT(*) FROM course_items ci
--                  WHERE ci.course_id = c.id AND ci.kind = 'agent') AS wrappers
--           FROM courses c
--       ) WHERE agents <> wrappers
--       UNION ALL
--       SELECT ci.course_id, -1, -1
--         FROM course_items ci
--         JOIN agents a ON a.id = ci.payload_ref
--        WHERE ci.kind = 'agent' AND ci.course_id <> a.course_id;
