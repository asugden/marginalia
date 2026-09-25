// D1 queries for the course-items module. Every query filters by course_id.
//
// ── The rule that governs this file ────────────────────────────────────────
//
// This module owns exactly ONE table: `course_items`. It reads other modules'
// tables only to resolve a payload title or a completion fact, and it does so
// with narrow, single-purpose queries — never by joining `course_items` to
// them in one statement.
//
// That is not stylistic. `example_usage_daily` (0021) is anonymous because it
// has no user column, and the guarantee holds only as long as nothing creates
// a path from an identified per-student row to it. No query in this file
// mentions `example_usage_daily` at all, and none ever should: this module has
// no legitimate use for aggregate usage, and a join written here would be the
// exact defect the 0021 split exists to prevent. Completion for an example is
// read from `example_completions` (identified, opt-in, binary) and nowhere
// else.

import type { CourseItemRow } from "./types.js";

const newItemId = () => `citem_${crypto.randomUUID()}`;

// ── wrapper CRUD ───────────────────────────────────────────────────────────

/**
 * One course's items in the instructor's order.
 *
 * Archived items are excluded by default: they have been explicitly taken out
 * of the students' list. The instructor surface passes `includeArchived` to
 * see them, matching how `listAssignments` in the provenance module behaves.
 */
export async function listItems(
  db: D1Database,
  courseId: string,
  opts: { includeArchived: boolean },
): Promise<CourseItemRow[]> {
  const { results } = await db
    .prepare(
      `SELECT * FROM course_items
        WHERE course_id = ?
          AND (? = 1 OR archived_at IS NULL)
        ORDER BY ord ASC, created_at ASC`,
    )
    .bind(courseId, opts.includeArchived ? 1 : 0)
    .all<CourseItemRow>();
  return results ?? [];
}

export async function getItem(
  db: D1Database,
  courseId: string,
  itemId: string,
): Promise<CourseItemRow | null> {
  return db
    .prepare(`SELECT * FROM course_items WHERE id = ? AND course_id = ?`)
    .bind(itemId, courseId)
    .first<CourseItemRow>();
}

/**
 * Is this payload already wrapped in this course?
 *
 * Used to keep the wrapper one-to-one with its payload — assigning the same
 * agent twice in one course would put two identical rows on the student's
 * list with no way to tell them apart. The 0022 backfill relies on the same
 * uniqueness, which its verification query checks.
 */
export async function findItemByPayload(
  db: D1Database,
  courseId: string,
  kind: string,
  payloadRef: string,
): Promise<CourseItemRow | null> {
  return db
    .prepare(
      `SELECT * FROM course_items
        WHERE course_id = ? AND kind = ? AND payload_ref = ?`,
    )
    .bind(courseId, kind, payloadRef)
    .first<CourseItemRow>();
}

/** Next free ordinal, so a new item lands at the end of the list. */
export async function nextOrd(
  db: D1Database,
  courseId: string,
): Promise<number> {
  const row = await db
    .prepare(
      `SELECT COALESCE(MAX(ord), -1) + 1 AS next FROM course_items WHERE course_id = ?`,
    )
    .bind(courseId)
    .first<{ next: number }>();
  return row?.next ?? 0;
}

export async function createItem(
  db: D1Database,
  params: {
    courseId: string;
    kind: string;
    payloadRef: string;
    title: string;
    ord: number;
    assignedAt: number | null;
    dueAt: number | null;
    note: string | null;
  },
): Promise<CourseItemRow> {
  const now = Date.now();
  const id = newItemId();
  await db
    .prepare(
      `INSERT INTO course_items
         (id, course_id, kind, payload_ref, title, ord,
          assigned_at, due_at, note, archived_at, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?)`,
    )
    .bind(
      id,
      params.courseId,
      params.kind,
      params.payloadRef,
      params.title,
      params.ord,
      params.assignedAt,
      params.dueAt,
      params.note,
      now,
      now,
    )
    .run();
  const row = await getItem(db, params.courseId, id);
  if (!row) throw new Error("createItem: row not found after insert");
  return row;
}

/**
 * Patch the scheduling fields. Only what the wrapper owns is writable here —
 * `kind` and `payload_ref` are not, because changing what a row points at
 * would silently redirect a scheduled item at a different piece of content
 * while students hold links to it. Delete and re-create instead.
 *
 * Each field is applied only when the caller supplied it, so clearing a date
 * (an explicit `null`) stays distinguishable from leaving it alone
 * (`undefined`). Both are legitimate edits and they mean different things.
 */
export async function updateItem(
  db: D1Database,
  courseId: string,
  itemId: string,
  patch: {
    title?: string;
    ord?: number;
    assignedAt?: number | null;
    dueAt?: number | null;
    note?: string | null;
    archived?: boolean;
  },
): Promise<CourseItemRow | null> {
  const sets: string[] = [];
  const binds: unknown[] = [];
  if (patch.title !== undefined) {
    sets.push("title = ?");
    binds.push(patch.title);
  }
  if (patch.ord !== undefined) {
    sets.push("ord = ?");
    binds.push(patch.ord);
  }
  if (patch.assignedAt !== undefined) {
    sets.push("assigned_at = ?");
    binds.push(patch.assignedAt);
  }
  if (patch.dueAt !== undefined) {
    sets.push("due_at = ?");
    binds.push(patch.dueAt);
  }
  if (patch.note !== undefined) {
    sets.push("note = ?");
    binds.push(patch.note);
  }
  if (patch.archived !== undefined) {
    // Archiving stamps the moment; unarchiving clears it. The wrapper's
    // archive state is its own — it does NOT propagate to the payload, which
    // has a different lifetime (an agent outlives the week it was set in).
    sets.push("archived_at = ?");
    binds.push(patch.archived ? Date.now() : null);
  }
  if (sets.length === 0) return getItem(db, courseId, itemId);

  sets.push("updated_at = ?");
  binds.push(Date.now(), itemId, courseId);

  await db
    .prepare(
      `UPDATE course_items SET ${sets.join(", ")} WHERE id = ? AND course_id = ?`,
    )
    .bind(...binds)
    .run();
  return getItem(db, courseId, itemId);
}

/**
 * Remove a wrapper row.
 *
 * Deliberately does NOT touch the payload. Unassigning an agent means it is no
 * longer on the schedule, not that the agent is deleted — and student work
 * against it (conversations, submissions, completions) is untouched either
 * way. Same reasoning as 0021's "removing an example from the curated list
 * does not delete completions": curating is not retracting history.
 */
export async function deleteItem(
  db: D1Database,
  courseId: string,
  itemId: string,
): Promise<void> {
  await db
    .prepare(`DELETE FROM course_items WHERE id = ? AND course_id = ?`)
    .bind(itemId, courseId)
    .run();
}

/** Apply an explicit ordering in one batch, so the list never renders
 *  half-reordered. Ids not in the course are ignored by the WHERE clause. */
export async function reorderItems(
  db: D1Database,
  courseId: string,
  orderedIds: string[],
): Promise<void> {
  if (orderedIds.length === 0) return;
  const now = Date.now();
  const stmt = db.prepare(
    `UPDATE course_items SET ord = ?, updated_at = ? WHERE id = ? AND course_id = ?`,
  );
  await db.batch(orderedIds.map((id, i) => stmt.bind(i, now, id, courseId)));
}

// ── payload resolution ─────────────────────────────────────────────────────
//
// Each function below reads ONE other module's table and returns only what the
// list needs to render. They are separate queries rather than a joined view on
// purpose: a wrapper points at three different tables plus a slug that is not
// a row anywhere, so there is no single join that could express this, and
// writing one per kind keeps each module's access narrow and visible.

/** Agents in a course, for resolving `kind='agent'` payloads. */
export async function listAgentPayloads(
  db: D1Database,
  courseId: string,
): Promise<Array<{ id: string; title: string; definition: string }>> {
  const { results } = await db
    .prepare(`SELECT id, title, definition FROM agents WHERE course_id = ?`)
    .bind(courseId)
    .all<{ id: string; title: string; definition: string }>();
  return results ?? [];
}

/** Writing assignments in a course, for resolving `kind='writing'`. */
export async function listWritingPayloads(
  db: D1Database,
  courseId: string,
): Promise<
  Array<{ id: string; title: string; instructions: string; archived_at: number | null }>
> {
  const { results } = await db
    .prepare(
      `SELECT id, title, instructions, archived_at
         FROM provenance_assignments WHERE course_id = ?`,
    )
    .bind(courseId)
    .all<{
      id: string;
      title: string;
      instructions: string;
      archived_at: number | null;
    }>();
  return results ?? [];
}

/** Checkpoints for a course's writing assignments, so a row can show its
 *  dated moments without one query per item. */
export async function listWritingCheckpoints(
  db: D1Database,
  courseId: string,
): Promise<
  Array<{ id: string; assignment_id: string; ord: number; name: string; due_at: number | null }>
> {
  const { results } = await db
    .prepare(
      `SELECT c.id, c.assignment_id, c.ord, c.name, c.due_at
         FROM provenance_assignment_checkpoints c
         JOIN provenance_assignments a ON a.id = c.assignment_id
        WHERE a.course_id = ?
        ORDER BY c.assignment_id, c.ord ASC`,
    )
    .bind(courseId)
    .all<{
      id: string;
      assignment_id: string;
      ord: number;
      name: string;
      due_at: number | null;
    }>();
  return results ?? [];
}

/** Code assignments in a course, for resolving `kind='code'`. */
export async function listCodePayloads(
  db: D1Database,
  courseId: string,
): Promise<
  Array<{ id: string; title: string; ai_enabled: number; due_at: number | null; archived_at: number | null }>
> {
  const { results } = await db
    .prepare(
      `SELECT id, title, ai_enabled, due_at, archived_at
         FROM code_assignments WHERE course_id = ?`,
    )
    .bind(courseId)
    .all<{
      id: string;
      title: string;
      ai_enabled: number;
      due_at: number | null;
      archived_at: number | null;
    }>();
  return results ?? [];
}

/** Curated example slugs in a course, for resolving `kind='example'`.
 *  Note this reads `course_examples` (curation) only — never the usage
 *  aggregate. */
export async function listExamplePayloads(
  db: D1Database,
  courseId: string,
): Promise<Array<{ slug: string; note: string | null }>> {
  const { results } = await db
    .prepare(`SELECT slug, note FROM course_examples WHERE course_id = ?`)
    .bind(courseId)
    .all<{ slug: string; note: string | null }>();
  return results ?? [];
}

// ── completion, per kind ───────────────────────────────────────────────────
//
// Four separate reads, each scoped to one student and one course, returning
// the set of payload refs that count as done under that kind's own definition.
// They are not unioned into one query and not merged into one return type —
// the caller has to name the kind to use one, which is what stops the four
// facts from being flattened into a single boolean downstream.

/**
 * Agents this student has FINISHED — i.e. holds at least one conversation
 * whose backbone reached its exit.
 *
 * `completed_at IS NOT NULL` on ANY conversation counts. A student may hold
 * several conversations with one agent, and since completion ends the backbone
 * rather than the conversation, they can keep talking afterwards. Re-opening a
 * finished tutor to review must never un-finish it — hence EXISTS over the set
 * rather than a check on the latest row.
 */
export async function listFinishedAgentIds(
  db: D1Database,
  courseId: string,
  userId: string,
): Promise<Set<string>> {
  const { results } = await db
    .prepare(
      `SELECT DISTINCT agent_id FROM conversations
        WHERE course_id = ? AND user_id = ?
          AND agent_id IS NOT NULL
          AND completed_at IS NOT NULL`,
    )
    .bind(courseId, userId)
    .all<{ agent_id: string }>();
  return new Set((results ?? []).map((r) => r.agent_id));
}

/**
 * Writing assignments this student has SUBMITTED to — at least one live
 * (non-revoked) submission attached to the assignment.
 *
 * Deliberately coarse: this says an artifact exists, not that every checkpoint
 * is met. Per-checkpoint state is the assignment roster's job, which is the
 * surface built to show it — including the students who submitted nothing.
 *
 * `provenance_submissions` carries its own `course_id` and `user_id` (both
 * denormalized at mint time), so this reads the one table rather than joining
 * back through `provenance_documents` — and it stays correct even if the
 * underlying document is later deleted, since the submission is a frozen
 * snapshot with an independent lifetime.
 *
 * Revoked submissions are skipped: a student who withdrew a share has no live
 * artifact, matching how the roster treats them.
 */
export async function listSubmittedAssignmentIds(
  db: D1Database,
  courseId: string,
  userId: string,
): Promise<Set<string>> {
  const { results } = await db
    .prepare(
      `SELECT DISTINCT assignment_id
         FROM provenance_submissions
        WHERE course_id = ? AND user_id = ?
          AND assignment_id IS NOT NULL
          AND revoked_at IS NULL`,
    )
    .bind(courseId, userId)
    .all<{ assignment_id: string }>();
  return new Set((results ?? []).map((r) => r.assignment_id));
}

/** Code assignment ids this student has submitted a notebook to. */
export async function listSubmittedCodeAssignmentIds(
  db: D1Database,
  courseId: string,
  userId: string,
): Promise<Set<string>> {
  const { results } = await db
    .prepare(
      `SELECT DISTINCT assignment_id FROM code_submissions
        WHERE course_id = ? AND owner_user_id = ?`,
    )
    .bind(courseId, userId)
    .all<{ assignment_id: string }>();
  return new Set((results ?? []).map((r) => r.assignment_id));
}

/**
 * Example slugs this student has MARKED DONE.
 *
 * Reads `example_completions` — the identified, opt-in, student-asserted
 * table. It does NOT read `example_usage_daily`, and must not: that table is
 * anonymous by structure, and pairing its counts with this student's identity
 * here would manufacture exactly the per-student browsing log the examples
 * privacy split was built to make impossible.
 */
export async function listCompletedExampleSlugs(
  db: D1Database,
  courseId: string,
  userId: string,
): Promise<Set<string>> {
  const { results } = await db
    .prepare(
      `SELECT slug FROM example_completions WHERE course_id = ? AND user_id = ?`,
    )
    .bind(courseId, userId)
    .all<{ slug: string }>();
  return new Set((results ?? []).map((r) => r.slug));
}
