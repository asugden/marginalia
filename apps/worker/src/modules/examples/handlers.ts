// Request handlers for the examples module.
//
// Two mechanisms live in this file and they are deliberately not connected.
// Read the module README before changing anything here; the short version:
//
//   POST /usage        anonymous. Establishes course membership from the
//                      session and then throws the identity away. Nothing
//                      written by this handler can be traced to a person.
//   POST /completions   identified, but only ever reached by a student
//                      pressing a button that says "Mark complete".
//
// There is no handler that reads both, and adding one would defeat the point
// of the split.

import type { Env } from "../../env.js";
import type { Identity } from "../../auth.js";
import * as repo from "./repo.js";
import {
  rowToCourseExample,
  type CompletionRosterEntryDTO,
  type CourseExampleDTO,
  type UsageBucketDTO,
  type UsageTotalDTO,
} from "./types.js";

/**
 * Small-cohort floor.
 *
 * Any non-zero bucket total below this is reported as "fewer than
 * MIN_COHORT" instead of an exact number. The reason is specific to the scale
 * this runs at: in a seminar of a dozen students, "1 open at 23:00 the night
 * before it was due" plus a moment's thought about who works late is an
 * identification, even though the table stores no identity at all. The floor
 * makes the aggregate genuinely aggregate rather than nominally so.
 *
 * Five is the usual convention for small-cell suppression in reporting on
 * human subjects. A true zero is never suppressed — "nobody opened this" is a
 * fact about the assignment, not about any student.
 */
export const MIN_COHORT = 5;

/** How far back the instructor usage view reaches. A term's worth of days is
 *  plenty, and bounding the query keeps the response small on a busy course. */
const USAGE_WINDOW_DAYS = 180;

const MAX_SLUG_CHARS = 64;
const MAX_NOTE_CHARS = 280;
/** Ceiling on a curation list. Generous — the registry is the real bound. */
const MAX_CURATED_EXAMPLES = 100;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });

const errorResponse = (message: string, status: number) =>
  json({ error: message }, status);

function requireUser(identity: Identity): string | Response {
  if (!identity.userId) return errorResponse("Sign in required", 401);
  return identity.userId;
}

async function getEnrollmentRole(
  env: Env,
  userId: string,
  courseId: string,
): Promise<string | null> {
  const row = await env.DB
    .prepare(`SELECT role FROM enrollments WHERE course_id = ? AND user_id = ?`)
    .bind(courseId, userId)
    .first<{ role: string }>();
  return row?.role ?? null;
}

/** Any enrolled role. Used by the student surfaces. */
async function requireMember(
  env: Env,
  identity: Identity,
  courseId: string,
): Promise<string | Response> {
  const userId = requireUser(identity);
  if (userId instanceof Response) return userId;
  const role = await getEnrollmentRole(env, userId, courseId);
  if (!role) return errorResponse("Not enrolled in this course", 403);
  return userId;
}

async function requireInstructor(
  env: Env,
  identity: Identity,
  courseId: string,
): Promise<string | Response> {
  const userId = requireUser(identity);
  if (userId instanceof Response) return userId;
  const role = await getEnrollmentRole(env, userId, courseId);
  if (role !== "instructor") return errorResponse("Instructor only", 403);
  return userId;
}

/** Slugs are front-end route segments; keep them to a conservative charset so
 *  a curation payload can't smuggle anything odd into a URL or a query. */
function isValidSlug(s: unknown): s is string {
  return (
    typeof s === "string" &&
    s.length > 0 &&
    s.length <= MAX_SLUG_CHARS &&
    /^[a-z0-9][a-z0-9-]*$/.test(s)
  );
}

// ── (a) anonymous aggregate usage ──────────────────────────────────────────

interface UsageBeaconBody {
  courseId?: string;
  slug?: string;
  engaged?: boolean;
}

/**
 * POST /api/examples/usage — the anonymous beacon.
 *
 * Why a signed-in session is required for an *anonymous* write: without one,
 * anybody on the internet could inflate a course's counters by POSTing a
 * courseId, and an instructor's "did my class use this?" number would be
 * worthless. The session is used for exactly one thing — confirming the caller
 * is enrolled in the course they claim — and is then discarded. Nothing
 * derived from it reaches the database: not the user id, not a hash of it, not
 * a session id. `bumpUsage` takes no identity parameter, so this isn't a
 * promise about the handler's discipline, it's a property of the call.
 *
 * Deliberately also not recorded: the client IP, the user-agent, and the
 * Referer. Cloudflare puts all three within reach of this handler; none is
 * read. In a class-sized cohort each of them is a near-identifier, and none is
 * needed to answer the question this table exists to answer.
 *
 * Returns 204 in every non-error case and does no work after the write, so the
 * page never waits on it. The client sends it fire-and-forget (`keepalive`).
 */
export async function usageBeaconRoute(
  req: Request,
  env: Env,
  identity: Identity,
): Promise<Response> {
  const body = (await req.json().catch(() => null)) as UsageBeaconBody | null;
  if (!body || typeof body.courseId !== "string" || !isValidSlug(body.slug)) {
    return errorResponse("courseId and slug are required", 400);
  }
  const courseId = body.courseId;
  const memberOrResp = await requireMember(env, identity, courseId);
  if (memberOrResp instanceof Response) return memberOrResp;
  // The membership check has served its entire purpose. From here on, the
  // caller is just "someone in this course" and nothing narrower.

  // UTC day + hour. UTC (rather than the course's local timezone) keeps the
  // bucket key stable no matter where a student travels, and the instructor
  // view labels the axis as UTC rather than silently implying local time.
  const now = new Date();
  await repo.bumpUsage(env.DB, {
    courseId,
    slug: body.slug,
    day: now.toISOString().slice(0, 10),
    hourBucket: now.getUTCHours(),
    engaged: body.engaged === true,
  });

  return new Response(null, { status: 204 });
}

/** Apply the small-cohort floor to one count. Zero passes through. */
function floorCount(n: number): number | null {
  if (n === 0) return 0;
  return n < MIN_COHORT ? null : n;
}

/**
 * GET /api/examples/usage?courseId= — instructor-only aggregate.
 *
 * Returns both the per-(slug, day, hour) buckets and per-slug totals. Totals
 * are computed from the raw rows and floored independently: a slug with four
 * scattered single-open buckets has a true total of four, which is still below
 * the floor and still suppressed. Flooring the buckets and then summing the
 * *floored* values would be wrong in the other direction (it would report
 * zero), so the raw sum is what gets tested against MIN_COHORT.
 */
export async function listUsageRoute(
  env: Env,
  identity: Identity,
  url: URL,
): Promise<Response> {
  const courseId = url.searchParams.get("courseId");
  if (!courseId) return errorResponse("courseId is required", 400);
  const instructorOrResp = await requireInstructor(env, identity, courseId);
  if (instructorOrResp instanceof Response) return instructorOrResp;

  const since = new Date(Date.now() - USAGE_WINDOW_DAYS * 86_400_000)
    .toISOString()
    .slice(0, 10);
  const rows = await repo.listUsage(env.DB, courseId, since);

  const buckets: UsageBucketDTO[] = rows.map((r) => {
    const opens = floorCount(r.opens);
    const engagedOpens = floorCount(r.engaged_opens);
    return {
      slug: r.slug,
      day: r.day,
      hourBucket: r.hour_bucket,
      opens,
      engagedOpens,
      suppressed: opens === null || engagedOpens === null,
    };
  });

  const rawTotals = new Map<string, { opens: number; engaged: number }>();
  for (const r of rows) {
    const t = rawTotals.get(r.slug) ?? { opens: 0, engaged: 0 };
    t.opens += r.opens;
    t.engaged += r.engaged_opens;
    rawTotals.set(r.slug, t);
  }
  const totals: UsageTotalDTO[] = [...rawTotals.entries()].map(([slug, t]) => {
    const opens = floorCount(t.opens);
    const engagedOpens = floorCount(t.engaged);
    return {
      slug,
      opens,
      engagedOpens,
      suppressed: opens === null || engagedOpens === null,
    };
  });
  totals.sort((a, b) => (b.opens ?? 0) - (a.opens ?? 0) || a.slug.localeCompare(b.slug));

  return json({ minCohort: MIN_COHORT, buckets, totals });
}

// ── (b) opt-in completion ──────────────────────────────────────────────────

interface CompletionBody {
  courseId?: string;
  slug?: string;
}

/** POST /api/examples/completions — the student's own claim. */
export async function markCompleteRoute(
  req: Request,
  env: Env,
  identity: Identity,
): Promise<Response> {
  const body = (await req.json().catch(() => null)) as CompletionBody | null;
  if (!body || typeof body.courseId !== "string" || !isValidSlug(body.slug)) {
    return errorResponse("courseId and slug are required", 400);
  }
  const userIdOrResp = await requireMember(env, identity, body.courseId);
  if (userIdOrResp instanceof Response) return userIdOrResp;
  await repo.markComplete(env.DB, {
    courseId: body.courseId,
    slug: body.slug,
    userId: userIdOrResp,
  });
  return json({ ok: true, completed: true });
}

/**
 * DELETE /api/examples/completions — the student retracts it.
 *
 * Always available. The row is the student's assertion about their own
 * learning, so the student is the one who gets to withdraw it; an instructor
 * who wants a claim to be final should be grading something, not reading this.
 */
export async function unmarkCompleteRoute(
  req: Request,
  env: Env,
  identity: Identity,
  url: URL,
): Promise<Response> {
  // Accept the pair from either the query string or a body, since DELETE with
  // a body is awkward in some clients.
  const body = (await req.json().catch(() => null)) as CompletionBody | null;
  const courseId = body?.courseId ?? url.searchParams.get("courseId") ?? undefined;
  const slug = body?.slug ?? url.searchParams.get("slug") ?? undefined;
  if (typeof courseId !== "string" || !isValidSlug(slug)) {
    return errorResponse("courseId and slug are required", 400);
  }
  const userIdOrResp = await requireMember(env, identity, courseId);
  if (userIdOrResp instanceof Response) return userIdOrResp;
  await repo.unmarkComplete(env.DB, { courseId, slug, userId: userIdOrResp });
  return json({ ok: true, completed: false });
}

/**
 * GET /api/examples/completions?courseId= — instructor roster.
 *
 * Binary only: for each enrolled student, the set of slugs they have marked.
 * The endpoint returns no timestamps, no open counts, and no ordering that
 * could stand in for one. Students who have marked nothing are still listed,
 * with an empty set, so the roster reads as a roster rather than as a list of
 * the diligent.
 */
export async function listCompletionsRoute(
  env: Env,
  identity: Identity,
  url: URL,
): Promise<Response> {
  const courseId = url.searchParams.get("courseId");
  if (!courseId) return errorResponse("courseId is required", 400);
  const instructorOrResp = await requireInstructor(env, identity, courseId);
  if (instructorOrResp instanceof Response) return instructorOrResp;

  const [students, completions] = await Promise.all([
    repo.listEnrolledStudents(env.DB, courseId),
    repo.listCourseCompletions(env.DB, courseId),
  ]);

  const bySlugs = new Map<string, string[]>();
  for (const c of completions) {
    const list = bySlugs.get(c.user_id) ?? [];
    list.push(c.slug);
    bySlugs.set(c.user_id, list);
  }

  const roster: CompletionRosterEntryDTO[] = students.map((s) => ({
    userId: s.user_id,
    email: s.email,
    displayName: s.display_name,
    completed: bySlugs.get(s.user_id) ?? [],
  }));

  return json({ roster });
}

// ── curation ───────────────────────────────────────────────────────────────

/** GET /api/examples/course?courseId= — instructor's curated list. */
export async function getCourseExamplesRoute(
  env: Env,
  identity: Identity,
  url: URL,
): Promise<Response> {
  const courseId = url.searchParams.get("courseId");
  if (!courseId) return errorResponse("courseId is required", 400);
  const instructorOrResp = await requireInstructor(env, identity, courseId);
  if (instructorOrResp instanceof Response) return instructorOrResp;
  const rows = await repo.listCourseExamples(env.DB, courseId);
  const examples: CourseExampleDTO[] = rows.map(rowToCourseExample);
  return json({ examples });
}

interface PutCourseExamplesBody {
  courseId?: string;
  examples?: Array<{
    slug?: unknown;
    assignedAt?: unknown;
    dueAt?: unknown;
    note?: unknown;
  }>;
}

/**
 * PUT /api/examples/course?courseId= — replace the curated list.
 *
 * Order is taken from the array position rather than a client-supplied `ord`,
 * so the list the instructor sees and the list that gets stored cannot drift
 * apart. Slugs are not validated against the registry here: the registry is
 * front-end code the worker doesn't import, and an unknown slug is harmless
 * (the student view skips anything the registry doesn't recognise).
 */
export async function putCourseExamplesRoute(
  req: Request,
  env: Env,
  identity: Identity,
  url: URL,
): Promise<Response> {
  const body = (await req.json().catch(() => null)) as PutCourseExamplesBody | null;
  const courseId = body?.courseId ?? url.searchParams.get("courseId") ?? undefined;
  if (typeof courseId !== "string") {
    return errorResponse("courseId is required", 400);
  }
  const instructorOrResp = await requireInstructor(env, identity, courseId);
  if (instructorOrResp instanceof Response) return instructorOrResp;
  if (!Array.isArray(body?.examples)) {
    return errorResponse("examples must be an array", 400);
  }
  if (body.examples.length > MAX_CURATED_EXAMPLES) {
    return errorResponse(`At most ${MAX_CURATED_EXAMPLES} examples`, 400);
  }

  const seen = new Set<string>();
  const items = [];
  for (const [i, raw] of body.examples.entries()) {
    if (!isValidSlug(raw?.slug)) return errorResponse("Invalid slug", 400);
    if (seen.has(raw.slug)) return errorResponse(`Duplicate slug ${raw.slug}`, 400);
    seen.add(raw.slug);
    const note =
      typeof raw.note === "string" && raw.note.trim()
        ? raw.note.trim().slice(0, MAX_NOTE_CHARS)
        : null;
    items.push({
      slug: raw.slug,
      ord: i,
      assignedAt: typeof raw.assignedAt === "number" ? raw.assignedAt : null,
      dueAt: typeof raw.dueAt === "number" ? raw.dueAt : null,
      note,
    });
  }

  await repo.replaceCourseExamples(env.DB, courseId, items);
  const rows = await repo.listCourseExamples(env.DB, courseId);
  return json({ examples: rows.map(rowToCourseExample) });
}

/**
 * GET /api/examples/course/mine?courseId= — the student's view.
 *
 * The curated list plus the caller's OWN completions, and nothing about
 * anybody else. Open by any enrolled role, so an instructor can look at what
 * their students see without switching accounts.
 */
export async function getMyCourseExamplesRoute(
  env: Env,
  identity: Identity,
  url: URL,
): Promise<Response> {
  const courseId = url.searchParams.get("courseId");
  if (!courseId) return errorResponse("courseId is required", 400);
  const userIdOrResp = await requireMember(env, identity, courseId);
  if (userIdOrResp instanceof Response) return userIdOrResp;

  const [rows, mine] = await Promise.all([
    repo.listCourseExamples(env.DB, courseId),
    repo.listMyCompletions(env.DB, courseId, userIdOrResp),
  ]);

  return json({
    examples: rows.map(rowToCourseExample),
    completed: mine.map((c) => c.slug),
  });
}
