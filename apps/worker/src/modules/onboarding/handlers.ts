// Handlers for /api/onboarding/*. Progress only — see README.md.

import type { Env } from "../../env.js";
import type { Identity } from "../../auth.js";
import { isStaff } from "../../permissions.js";
import * as repo from "./repo.js";
import type { OnboardingProgressDTO, OnboardingProgressRow, ProgressPatch } from "./types.js";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
const error = (message: string, status: number) => json({ error: message }, status);

/**
 * The person taking the tour. While they preview the course as its sample
 * student, `identity` describes the sample student — but the tour, which hops
 * between the two views, belongs to the real user. This is the one place
 * outside the preview chrome that reads `identity.preview`, and it only uses
 * it to decide whose progress row to touch.
 */
async function tourTaker(
  env: Env,
  identity: Identity,
  courseId: string,
): Promise<string | Response> {
  const userId = identity.preview?.realUserId ?? identity.userId;
  if (!userId) return error("Sign in required", 401);
  const row = await env.DB
    .prepare(`SELECT role FROM enrollments WHERE course_id = ? AND user_id = ?`)
    .bind(courseId, userId)
    .first<{ role: string }>();
  if (!row || !isStaff(row.role)) return error("Course staff only", 403);
  return userId;
}

function toDTO(row: OnboardingProgressRow): OnboardingProgressDTO {
  return {
    courseId: row.course_id,
    preset: safeObject(row.preset_json),
    context: safeObject(row.context_json),
    step: row.step,
    completedAt: row.completed_at,
    dismissedAt: row.dismissed_at,
  };
}

function safeObject(s: string): Record<string, unknown> {
  try {
    const v = JSON.parse(s) as unknown;
    return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === "object" && !Array.isArray(v);
}

/** GET /api/onboarding/progress?courseId= → { progress: DTO | null } */
export async function getProgressRoute(env: Env, identity: Identity, url: URL): Promise<Response> {
  const courseId = url.searchParams.get("courseId");
  if (!courseId) return error("courseId is required", 400);
  const userId = await tourTaker(env, identity, courseId);
  if (userId instanceof Response) return userId;
  const row = await repo.getProgress(env.DB, userId, courseId);
  return json({ progress: row ? toDTO(row) : null });
}

/** PUT /api/onboarding/progress { courseId, preset?, context?, step?, completed?, dismissed? } */
export async function putProgressRoute(req: Request, env: Env, identity: Identity): Promise<Response> {
  const body = (await req.json().catch(() => null)) as ({ courseId?: unknown } & Record<string, unknown>) | null;
  const courseId = typeof body?.courseId === "string" ? body.courseId : null;
  if (!courseId) return error("courseId is required", 400);
  const userId = await tourTaker(env, identity, courseId);
  if (userId instanceof Response) return userId;

  const patch: ProgressPatch = {};
  if (body!.preset !== undefined) {
    if (!isPlainObject(body!.preset)) return error("preset must be an object", 400);
    patch.preset = body!.preset;
  }
  if (body!.context !== undefined) {
    if (!isPlainObject(body!.context)) return error("context must be an object", 400);
    patch.context = body!.context;
  }
  if (body!.step !== undefined) {
    if (typeof body!.step !== "number" || !Number.isInteger(body!.step) || body!.step < 0) {
      return error("step must be a non-negative integer", 400);
    }
    patch.step = body!.step;
  }
  if (body!.completed !== undefined) {
    if (typeof body!.completed !== "boolean") return error("completed must be a boolean", 400);
    patch.completed = body!.completed;
  }
  if (body!.dismissed !== undefined) {
    if (typeof body!.dismissed !== "boolean") return error("dismissed must be a boolean", 400);
    patch.dismissed = body!.dismissed;
  }
  // Keep a runaway client from parking megabytes in a row nobody reads in bulk.
  if (JSON.stringify(patch).length > 16_000) return error("progress is too large", 413);

  await repo.saveProgress(env.DB, userId, courseId, patch);
  const row = await repo.getProgress(env.DB, userId, courseId);
  return json({ progress: row ? toDTO(row) : null });
}
