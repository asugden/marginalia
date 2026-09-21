-- 0023 — course_items: backfill wrappers for writing assignments and curated
-- examples that already exist.
--
-- 0022 introduced course_items as the Assign list's one source and backfilled
-- a wrapper for every pre-existing agent. It did not backfill writing or
-- examples, on the reasoning that those rows would be created through the new
-- surface from then on — but nothing wrote a wrapper when an assignment was
-- created or an example curated, so a course that used either after 0022 has
-- payload rows with no wrapper and an Assign list that shows nothing. The
-- worker now keeps wrappers in step (modules/course-items/sync.ts); this is
-- the one-time catch-up for rows created before it did.
--
-- Additive and idempotent, like 0022: inserts only, only where no wrapper for
-- that payload exists, with deterministic ids so a re-run collides on the
-- primary key rather than duplicating. No table is altered. Rolling back is
-- deleting the rows this inserted (their ids start with 'citem_pasg_' and
-- 'citem_example_'); nothing else needs undoing.
--
-- Ordering: new wrappers are appended after a course's existing items, writing
-- first in creation order, then examples in their curated order. `ord` is
-- position only, so the absolute values carry no meaning.

-- ---------------------------------------------------------------------------
-- Writing assignments → one wrapper each
-- ---------------------------------------------------------------------------
--
-- Dateless: the assignment's checkpoints carry the deadlines, and the Assign
-- row shows them inline from the payload. Archive state is mirrored, since an
-- archived assignment is already out of the students' picker and the list
-- should say so. Timestamps are the assignment's own.
INSERT INTO course_items
  (id, course_id, kind, payload_ref, title, ord,
   assigned_at, due_at, note, archived_at, created_at, updated_at)
SELECT
  'citem_' || a.id,                          -- 'citem_pasg_<uuid>'
  a.course_id,
  'writing',
  a.id,
  a.title,
  (SELECT COALESCE(MAX(ci.ord), -1) + 1 FROM course_items ci
    WHERE ci.course_id = a.course_id)
  + (SELECT COUNT(*) FROM provenance_assignments b
      WHERE b.course_id = a.course_id
        AND (b.created_at < a.created_at
             OR (b.created_at = a.created_at AND b.id < a.id))),
  NULL,
  NULL,
  NULL,
  a.archived_at,
  a.created_at,
  a.updated_at
FROM provenance_assignments a
WHERE NOT EXISTS (
  SELECT 1 FROM course_items ci
   WHERE ci.course_id = a.course_id
     AND ci.kind = 'writing'
     AND ci.payload_ref = a.id
);

-- ---------------------------------------------------------------------------
-- Curated examples → one wrapper each
-- ---------------------------------------------------------------------------
--
-- Dates and note are copied from the curation row, which is where an
-- instructor edits them; the worker keeps the two in step on every save from
-- here on. The title is the slug — example titles live in front-end code the
-- database cannot see, and the Assign page resolves the display name from
-- its registry. course_examples has no timestamps of its own, so these rows
-- are stamped with the migration's run time.
INSERT INTO course_items
  (id, course_id, kind, payload_ref, title, ord,
   assigned_at, due_at, note, archived_at, created_at, updated_at)
SELECT
  'citem_example_' || e.course_id || ':' || e.slug,
  e.course_id,
  'example',
  e.slug,
  e.slug,
  (SELECT COALESCE(MAX(ci.ord), -1) + 1 FROM course_items ci
    WHERE ci.course_id = e.course_id)
  + (SELECT COUNT(*) FROM course_examples f
      WHERE f.course_id = e.course_id
        AND (f.ord < e.ord OR (f.ord = e.ord AND f.slug < e.slug))),
  e.assigned_at,
  e.due_at,
  e.note,
  NULL,
  CAST(strftime('%s', 'now') AS INTEGER) * 1000,
  CAST(strftime('%s', 'now') AS INTEGER) * 1000
FROM course_examples e
WHERE NOT EXISTS (
  SELECT 1 FROM course_items ci
   WHERE ci.course_id = e.course_id
     AND ci.kind = 'example'
     AND ci.payload_ref = e.slug
);

-- ---------------------------------------------------------------------------
-- Verification queries — run BEFORE and AFTER, by hand. Both expect ZERO rows.
-- ---------------------------------------------------------------------------
--
-- (1) Every writing assignment and every curated example has exactly one
--     wrapper in its own course, and no wrapper points at a payload that does
--     not exist.
--
--       SELECT 'writing', a.course_id, a.id,
--              (SELECT COUNT(*) FROM course_items ci
--                WHERE ci.course_id = a.course_id AND ci.kind = 'writing'
--                  AND ci.payload_ref = a.id) AS wrappers
--         FROM provenance_assignments a WHERE wrappers <> 1
--       UNION ALL
--       SELECT 'example', e.course_id, e.slug,
--              (SELECT COUNT(*) FROM course_items ci
--                WHERE ci.course_id = e.course_id AND ci.kind = 'example'
--                  AND ci.payload_ref = e.slug)
--         FROM course_examples e WHERE wrappers <> 1
--       UNION ALL
--       SELECT ci.kind, ci.course_id, ci.payload_ref, 0 FROM course_items ci
--        WHERE (ci.kind = 'writing' AND NOT EXISTS
--                 (SELECT 1 FROM provenance_assignments a
--                   WHERE a.id = ci.payload_ref AND a.course_id = ci.course_id))
--           OR (ci.kind = 'example' AND NOT EXISTS
--                 (SELECT 1 FROM course_examples e
--                   WHERE e.slug = ci.payload_ref AND e.course_id = ci.course_id));
--
-- (2) Nothing else changed: the agent wrappers 0022 created are still one per
--     agent (0022's own query (1) still returns nothing), and no student table
--     was touched — this migration reads provenance_assignments and
--     course_examples and writes course_items only.
