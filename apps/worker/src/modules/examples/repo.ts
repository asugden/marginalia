// D1 queries for the examples module. Every query filters by course_id.
//
// The file is organised by the two-mechanism split so the boundary is visible
// in the source, not just in prose: the "anonymous aggregate" section takes no
// userId parameter at all, and the "identified completion" section is the only
// place a user id appears. Keep it that way — if a function here ever needs
// both, that is the signal that the feature being built is the wrong one.

import type {
  CourseExampleRow,
  ExampleCompletionRow,
  ExampleUsageRow,
} from "./types.js";

// ── curation ───────────────────────────────────────────────────────────────

export async function listCourseExamples(
  db: D1Database,
  courseId: string,
): Promise<CourseExampleRow[]> {
  const { results } = await db
    .prepare(
      `SELECT * FROM course_examples
        WHERE course_id = ?
        ORDER BY ord ASC, slug ASC`,
    )
    .bind(courseId)
    .all<CourseExampleRow>();
  return results ?? [];
}

/**
 * Replace a course's curated list wholesale.
 *
 * The instructor editor sends the whole list every save (it's at most a few
 * dozen rows), so a delete-then-insert is both simpler and more correct than
 * diffing: reordering, removing, and re-adding all fall out of it for free,
 * and there is no partial-update path to get wrong. Batched so D1 applies it
 * as one transaction — a half-written curation list would show students an
 * incoherent assignment.
 *
 * Deleting a row deliberately does NOT touch example_completions or
 * example_usage_daily. An instructor removing an example from the list is
 * curating, not retracting history; if they re-add it, students who already
 * finished it should still read as finished.
 */
export async function replaceCourseExamples(
  db: D1Database,
  courseId: string,
  items: Array<{
    slug: string;
    ord: number;
    assignedAt: number | null;
    dueAt: number | null;
    note: string | null;
  }>,
): Promise<void> {
  const statements = [
    db.prepare(`DELETE FROM course_examples WHERE course_id = ?`).bind(courseId),
  ];
  for (const item of items) {
    statements.push(
      db
        .prepare(
          `INSERT INTO course_examples
             (course_id, slug, ord, assigned_at, due_at, note)
           VALUES (?, ?, ?, ?, ?, ?)`,
        )
        .bind(
          courseId,
          item.slug,
          item.ord,
          item.assignedAt,
          item.dueAt,
          item.note,
        ),
    );
  }
  await db.batch(statements);
}

// ── (a) anonymous aggregate ────────────────────────────────────────────────
//
// Note what these functions do not accept: there is no userId parameter on the
// write path and no userId column to select on the read path. The caller
// cannot leak identity into this table even by mistake.

/**
 * Increment a usage tally. Pure UPSERT on a counter — the row is a running
 * total, never an event, so nothing here records *when within the hour* or
 * *by whom*.
 *
 * `engaged` adds to a second counter on the same row rather than writing a
 * separate row, so an engaged open is also counted as an open and the two
 * numbers stay directly comparable.
 */
export async function bumpUsage(
  db: D1Database,
  params: {
    courseId: string;
    slug: string;
    day: string;
    hourBucket: number;
    engaged: boolean;
  },
): Promise<void> {
  const engagedDelta = params.engaged ? 1 : 0;
  await db
    .prepare(
      `INSERT INTO example_usage_daily
         (course_id, slug, day, hour_bucket, opens, engaged_opens)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT (course_id, slug, day, hour_bucket) DO UPDATE SET
         opens = opens + excluded.opens,
         engaged_opens = engaged_opens + excluded.engaged_opens`,
    )
    // An engagement beacon reports engagement only; the open was already
    // counted when the page loaded, and counting it twice would make the
    // engaged/open ratio meaningless.
    .bind(
      params.courseId,
      params.slug,
      params.day,
      params.hourBucket,
      params.engaged ? 0 : 1,
      engagedDelta,
    )
    .run();
}

/** Usage buckets for a course since (and including) `sinceDay`, oldest first. */
export async function listUsage(
  db: D1Database,
  courseId: string,
  sinceDay: string,
): Promise<ExampleUsageRow[]> {
  const { results } = await db
    .prepare(
      `SELECT * FROM example_usage_daily
        WHERE course_id = ? AND day >= ?
        ORDER BY day ASC, hour_bucket ASC`,
    )
    .bind(courseId, sinceDay)
    .all<ExampleUsageRow>();
  return results ?? [];
}

// ── (b) identified, opt-in completion ──────────────────────────────────────

/** Record a student's own claim that they finished an example. Idempotent:
 *  pressing the button twice is not an error, and does not move the date. */
export async function markComplete(
  db: D1Database,
  params: { courseId: string; slug: string; userId: string },
): Promise<void> {
  await db
    .prepare(
      `INSERT INTO example_completions (course_id, slug, user_id, completed_at)
       VALUES (?, ?, ?, ?)
       ON CONFLICT (course_id, slug, user_id) DO NOTHING`,
    )
    .bind(params.courseId, params.slug, params.userId, Date.now())
    .run();
}

/** Retract the claim. The row is deleted outright rather than tombstoned —
 *  "the student un-marked this at 2am" is exactly the kind of fact this
 *  module has decided not to keep. */
export async function unmarkComplete(
  db: D1Database,
  params: { courseId: string; slug: string; userId: string },
): Promise<void> {
  await db
    .prepare(
      `DELETE FROM example_completions
        WHERE course_id = ? AND slug = ? AND user_id = ?`,
    )
    .bind(params.courseId, params.slug, params.userId)
    .run();
}

/** The caller's own completions in one course. */
export async function listMyCompletions(
  db: D1Database,
  courseId: string,
  userId: string,
): Promise<ExampleCompletionRow[]> {
  const { results } = await db
    .prepare(
      `SELECT * FROM example_completions
        WHERE course_id = ? AND user_id = ?`,
    )
    .bind(courseId, userId)
    .all<ExampleCompletionRow>();
  return results ?? [];
}

export interface CompletionWithUser {
  user_id: string;
  slug: string;
  email: string | null;
  display_name: string | null;
}

/**
 * Every completion in the course, joined to the user for display.
 *
 * `completed_at` is deliberately not selected. The roster shows a checkmark or
 * a dash, so the timestamp would only ever be used to build the per-student
 * timeline this module has ruled out — leaving it out of the query keeps the
 * temptation off the page.
 */
export async function listCourseCompletions(
  db: D1Database,
  courseId: string,
): Promise<CompletionWithUser[]> {
  const { results } = await db
    .prepare(
      `SELECT c.user_id, c.slug, u.email AS email, u.display_name AS display_name
         FROM example_completions c
         LEFT JOIN users u ON u.id = c.user_id
        WHERE c.course_id = ?`,
    )
    .bind(courseId)
    .all<CompletionWithUser>();
  return results ?? [];
}

/** Enrolled students in the course, so the roster can show a dash for people
 *  who have not marked anything — an absent row is meaningful and needs to be
 *  rendered, not just omitted. */
export async function listEnrolledStudents(
  db: D1Database,
  courseId: string,
): Promise<Array<{ user_id: string; email: string | null; display_name: string | null }>> {
  const { results } = await db
    .prepare(
      `SELECT e.user_id AS user_id, u.email AS email, u.display_name AS display_name
         FROM enrollments e
         LEFT JOIN users u ON u.id = e.user_id
        WHERE e.course_id = ? AND e.role = 'student'
        ORDER BY u.display_name ASC, u.email ASC`,
    )
    .bind(courseId)
    .all<{ user_id: string; email: string | null; display_name: string | null }>();
  return results ?? [];
}
