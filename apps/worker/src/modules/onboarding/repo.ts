// D1 access for onboarding_progress. One row per (real user, course).

import type { OnboardingProgressRow, ProgressPatch } from "./types.js";

export async function getProgress(
  db: D1Database,
  userId: string,
  courseId: string,
): Promise<OnboardingProgressRow | null> {
  return db
    .prepare(`SELECT * FROM onboarding_progress WHERE user_id = ? AND course_id = ?`)
    .bind(userId, courseId)
    .first<OnboardingProgressRow>();
}

/** Upsert the fields present in `patch`; absent fields keep their value. */
export async function saveProgress(
  db: D1Database,
  userId: string,
  courseId: string,
  patch: ProgressPatch,
): Promise<void> {
  const now = Date.now();
  const existing = await getProgress(db, userId, courseId);
  const preset = patch.preset !== undefined ? JSON.stringify(patch.preset) : existing?.preset_json ?? "{}";
  const context =
    patch.context !== undefined ? JSON.stringify(patch.context) : existing?.context_json ?? "{}";
  const step = patch.step ?? existing?.step ?? 0;
  const completedAt =
    patch.completed === undefined ? existing?.completed_at ?? null : patch.completed ? now : null;
  const dismissedAt =
    patch.dismissed === undefined ? existing?.dismissed_at ?? null : patch.dismissed ? now : null;
  await db
    .prepare(
      `INSERT INTO onboarding_progress
         (user_id, course_id, preset_json, context_json, step, completed_at, dismissed_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(user_id, course_id) DO UPDATE SET
         preset_json = excluded.preset_json,
         context_json = excluded.context_json,
         step = excluded.step,
         completed_at = excluded.completed_at,
         dismissed_at = excluded.dismissed_at,
         updated_at = excluded.updated_at`,
    )
    .bind(userId, courseId, preset, context, step, completedAt, dismissedAt, now)
    .run();
}
