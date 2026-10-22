// The "not interested in generative AI" preference, at course scope.
//
// users.genai_opt_out is personal (migration 0029). It reaches a course only
// when EVERY instructor on that course has opted out: then the course's AI
// features are written off and stay locked until that stops being true.
// TAs and unenrolled admins don't count — they don't set course policy.
//
// "Off" covers agents, the writing chat on every writing assignment (and the
// course-level switch older documents follow), and the chat on every code
// assignment.
//
// Callers run reconcileCourseGenai() whenever unanimity could change: the
// preference is toggled, an instructor is added or removed, or someone's role
// changes. Everything that would turn an AI feature back on checks
// courseGenaiLocked() first.

const now = () => Date.now();

/** True when the course has at least one instructor and all of them have
 *  opted out of generative AI. */
export async function courseGenaiLocked(
  db: D1Database,
  courseId: string,
): Promise<boolean> {
  const row = await db
    .prepare(
      `SELECT COUNT(*) AS n, COALESCE(SUM(u.genai_opt_out), 0) AS opted
         FROM enrollments e
         JOIN users u ON u.id = e.user_id
        WHERE e.course_id = ? AND e.role = 'instructor'`,
    )
    .bind(courseId)
    .first<{ n: number; opted: number }>();
  return !!row && row.n > 0 && row.opted === row.n;
}

/**
 * If the course has become unanimous, write its AI features off: agents, the
 * writing chat, and the chat on every code assignment. Idempotent. Returns
 * whether the course is locked.
 */
export async function reconcileCourseGenai(
  db: D1Database,
  courseId: string,
): Promise<boolean> {
  if (!(await courseGenaiLocked(db, courseId))) return false;
  const ts = now();
  await db.batch([
    db
      .prepare(
        `INSERT INTO course_settings
           (course_id, agents_enabled, provenance_chat_enabled, updated_at)
         VALUES (?, 0, 0, ?)
         ON CONFLICT(course_id) DO UPDATE
           SET agents_enabled = 0,
               provenance_chat_enabled = 0,
               updated_at = excluded.updated_at`,
      )
      .bind(courseId, ts),
    db
      .prepare(
        `UPDATE code_assignments SET ai_enabled = 0, updated_at = ?
          WHERE course_id = ? AND ai_enabled = 1`,
      )
      .bind(ts, courseId),
    // Writing's chat is per assignment too (0033).
    db
      .prepare(
        `UPDATE provenance_assignments SET chat_enabled = 0, updated_at = ?
          WHERE course_id = ? AND chat_enabled = 1`,
      )
      .bind(ts, courseId),
  ]);
  return true;
}

/** Reconcile every course the user teaches — after they flip the preference. */
export async function reconcileCoursesTaughtBy(
  db: D1Database,
  userId: string,
): Promise<void> {
  const { results } = await db
    .prepare(
      `SELECT course_id FROM enrollments WHERE user_id = ? AND role = 'instructor'`,
    )
    .bind(userId)
    .all<{ course_id: string }>();
  for (const r of results ?? []) await reconcileCourseGenai(db, r.course_id);
}

/** Stable error code the SPA branches on when a request would turn AI on in a
 *  course whose instructors have all opted out. */
export const GENAI_LOCKED_CODE = "genai_opted_out";
export const GENAI_LOCKED_MESSAGE =
  "Every instructor on this course has opted out of generative AI, so AI features stay off.";
