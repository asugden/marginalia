// Request handlers for the course-items module.
//
// The combined list is the interesting part of this file. It answers "what has
// this course assigned, and — for the caller's own view — what have I done?"
// by fanning out to each module's tables and merging the results in memory,
// never by joining `course_items` to them in SQL.
//
// Two rules govern everything here, and both are inherited rather than local:
//
//  1. COMPLETION IS NOT ONE CONCEPT. Each kind reports its own verb through a
//     discriminated union (see types.ts). There is no shared boolean, and
//     adding one would present a student's self-report as verified evidence.
//  2. NO VERDICTS. This surface reports facts — submitted / finished / marked
//     done, and dates against deadlines. It carries no score, no risk column,
//     no "concern" flag, and no aggregate that reads as one. The provenance
//     module's no-false-positives rule applies here in full.

import type { Env } from "../../env.js";
import type { Identity } from "../../auth.js";
import * as repo from "./repo.js";
import {
  isItemKind,
  rowToCourseItem,
  type CourseItemDTO,
  type CourseItemRow,
  type ItemCompletionDTO,
  type ItemKind,
} from "./types.js";

const MAX_TITLE_CHARS = 200;
const MAX_NOTE_CHARS = 280;
/** Ceiling on one course's item list. Generous; a guard, not a design limit. */
const MAX_ITEMS_PER_COURSE = 500;

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

/** Any enrolled role — the student-facing list. */
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

function cleanTitle(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t ? t.slice(0, MAX_TITLE_CHARS) : null;
}

/** Optional epoch-ms date. `null` clears it; a non-number is rejected by the
 *  caller rather than silently coerced, so a bad payload can't wipe a date. */
function parseDate(v: unknown): number | null | undefined {
  if (v === undefined) return undefined;
  if (v === null) return null;
  return typeof v === "number" && Number.isFinite(v) ? v : undefined;
}

// ── payload + completion resolution ────────────────────────────────────────

/**
 * Resolve every item's payload in one pass.
 *
 * Three bulk reads (agents, writing + its checkpoints, curated examples)
 * rather than one query per row, so a course with fifty items costs a fixed
 * handful of queries. Each map is keyed by the payload's own key — an id for
 * agents and writing, a slug for examples, which is why this is a map per kind
 * rather than one shared lookup.
 *
 * An item whose payload is missing resolves to `null` and surfaces as
 * `dangling`. It is reported rather than hidden: an instructor who deleted an
 * agent should see the stale schedule row and be able to remove it, instead of
 * the item silently disappearing with no explanation.
 */
async function resolvePayloads(
  env: Env,
  courseId: string,
  rows: CourseItemRow[],
): Promise<Map<string, Record<string, unknown>>> {
  const kinds = new Set(rows.map((r) => r.kind));
  const out = new Map<string, Record<string, unknown>>();

  const [agents, writing, checkpoints, examples, code] = await Promise.all([
    kinds.has("agent") ? repo.listAgentPayloads(env.DB, courseId) : [],
    kinds.has("writing") ? repo.listWritingPayloads(env.DB, courseId) : [],
    kinds.has("writing") ? repo.listWritingCheckpoints(env.DB, courseId) : [],
    kinds.has("example") ? repo.listExamplePayloads(env.DB, courseId) : [],
    kinds.has("code") ? repo.listCodePayloads(env.DB, courseId) : [],
  ]);

  for (const a of agents) {
    // `definition` is the AgentDefinition JSON. Only the two properties the
    // list renders are lifted out of it — whether the agent is guided (has a
    // backbone outline) and whether it cites sources. The blob itself is not
    // forwarded: the list is a schedule, not an agent editor.
    let guided = false;
    let grounded = false;
    try {
      const def = JSON.parse(a.definition) as Record<string, unknown>;
      guided = def.backbone != null;
      grounded = def.collectionId != null || def.collection != null;
    } catch {
      // A malformed definition is the agent editor's problem, not the
      // schedule's. Render the row with its flags off rather than failing the
      // whole list.
    }
    out.set(`agent:${a.id}`, { agentId: a.id, title: a.title, guided, grounded });
  }

  const cpsByAssignment = new Map<
    string,
    Array<{ id: string; name: string; dueAt: number | null }>
  >();
  for (const c of checkpoints) {
    const list = cpsByAssignment.get(c.assignment_id) ?? [];
    list.push({ id: c.id, name: c.name, dueAt: c.due_at });
    cpsByAssignment.set(c.assignment_id, list);
  }
  for (const w of writing) {
    out.set(`writing:${w.id}`, {
      assignmentId: w.id,
      title: w.title,
      instructions: w.instructions,
      archivedAt: w.archived_at,
      checkpoints: cpsByAssignment.get(w.id) ?? [],
    });
  }

  for (const e of examples) {
    out.set(`example:${e.slug}`, { slug: e.slug, note: e.note });
  }

  for (const c of code) {
    out.set(`code:${c.id}`, {
      assignmentId: c.id,
      title: c.title,
      aiEnabled: c.ai_enabled === 1,
      archivedAt: c.archived_at,
    });
  }

  return out;
}

/**
 * Resolve the CALLER'S OWN completion for each item.
 *
 * Only ever called with the caller's own user id. There is no course-wide
 * completion matrix in this module: per-kind rosters already exist where they
 * belong (the writing roster, the examples completion roster), each under its
 * own module's rules, and rebuilding a combined one here would put four
 * different kinds of evidence in one grid where they would read as equivalent.
 *
 * Note which tables are consulted: conversations, provenance_submissions, and
 * example_completions. NOT example_usage_daily — that table is anonymous by
 * structure and pairing it with a user id here is precisely the join the
 * examples privacy split forbids.
 */
async function resolveCompletions(
  env: Env,
  courseId: string,
  userId: string,
  rows: CourseItemRow[],
): Promise<Map<string, ItemCompletionDTO>> {
  const kinds = new Set(rows.map((r) => r.kind));
  const out = new Map<string, ItemCompletionDTO>();

  const [finishedAgents, submittedWriting, doneExamples, submittedCode] = await Promise.all([
    kinds.has("agent")
      ? repo.listFinishedAgentIds(env.DB, courseId, userId)
      : new Set<string>(),
    kinds.has("writing")
      ? repo.listSubmittedAssignmentIds(env.DB, courseId, userId)
      : new Set<string>(),
    kinds.has("example") || kinds.has("reading")
      ? repo.listCompletedExampleSlugs(env.DB, courseId, userId)
      : new Set<string>(),
    kinds.has("code")
      ? repo.listSubmittedCodeAssignmentIds(env.DB, courseId, userId)
      : new Set<string>(),
  ]);

  for (const row of rows) {
    switch (row.kind) {
      case "agent":
        // Any completed conversation counts, and credit once earned is never
        // lost by continuing to talk. See repo.listFinishedAgentIds.
        out.set(row.id, {
          kind: "agent",
          finished: finishedAgents.has(row.payload_ref),
        });
        break;
      case "writing":
        out.set(row.id, {
          kind: "writing",
          submitted: submittedWriting.has(row.payload_ref),
        });
        break;
      case "example":
        out.set(row.id, {
          kind: "example",
          markedDone: doneExamples.has(row.payload_ref),
        });
        break;
      case "code":
        out.set(row.id, {
          kind: "code",
          submitted: submittedCode.has(row.payload_ref),
        });
        break;
      case "reading":
        // Readings are not built yet; there is no store for their self-report.
        // Reported as not-done rather than omitted, so the row still renders.
        out.set(row.id, { kind: "reading", markedDone: false });
        break;
      default:
        // An unrecognised kind gets no completion rather than a false `false`.
        // A forward-compatible client renders the row without a status.
        break;
    }
  }
  return out;
}

function assemble(
  rows: CourseItemRow[],
  payloads: Map<string, Record<string, unknown>>,
  completions: Map<string, ItemCompletionDTO> | null,
): CourseItemDTO[] {
  return rows.map((row) =>
    rowToCourseItem(row, {
      payload: payloads.get(`${row.kind}:${row.payload_ref}`) ?? null,
      ...(completions?.has(row.id)
        ? { completion: completions.get(row.id)! }
        : {}),
    }),
  );
}

// ── routes ─────────────────────────────────────────────────────────────────

/**
 * GET /api/course-items?courseId=[&includeArchived=1]
 *
 * The combined list — every kind, one ordering. Open to any enrolled role, and
 * the completion block is always the CALLER'S OWN: an instructor calling this
 * sees their own state, not the class's, which is what makes it safe to reuse
 * the same endpoint for both the student list and the instructor's schedule
 * view. Class-wide state lives on the per-module rosters.
 *
 * `includeArchived` is instructor-only: an archived item has been taken off
 * the students' list deliberately, so a student asking for it gets the live
 * list regardless.
 */
export async function listItemsRoute(
  env: Env,
  identity: Identity,
  url: URL,
): Promise<Response> {
  const courseId = url.searchParams.get("courseId");
  if (!courseId) return errorResponse("courseId is required", 400);
  const userIdOrResp = await requireMember(env, identity, courseId);
  if (userIdOrResp instanceof Response) return userIdOrResp;
  const userId = userIdOrResp;

  const wantsArchived = url.searchParams.get("includeArchived") === "1";
  const role = await getEnrollmentRole(env, userId, courseId);
  const includeArchived = wantsArchived && role === "instructor";

  const rows = await repo.listItems(env.DB, courseId, { includeArchived });
  const [payloads, completions] = await Promise.all([
    resolvePayloads(env, courseId, rows),
    resolveCompletions(env, courseId, userId, rows),
  ]);

  return json({ items: assemble(rows, payloads, completions) });
}

interface CreateItemBody {
  courseId?: unknown;
  kind?: unknown;
  payloadRef?: unknown;
  title?: unknown;
  assignedAt?: unknown;
  dueAt?: unknown;
  note?: unknown;
}

/**
 * POST /api/course-items — assign something.
 *
 * The payload must already exist; this endpoint schedules content, it does not
 * author it. Creating an agent or a writing assignment stays with the module
 * that owns it, which keeps each module's validation in one place.
 *
 * The payload is verified to live in the SAME course before the wrapper is
 * written — otherwise a caller could name an id from another course and put a
 * foreign agent on their schedule, which is the cross-course leak the
 * project-wide course_id rule exists to prevent. `payload_ref` carries no FK
 * (it targets three tables plus a slug), so this check is the only thing
 * standing in for one.
 */
export async function createItemRoute(
  req: Request,
  env: Env,
  identity: Identity,
): Promise<Response> {
  const body = (await req.json().catch(() => null)) as CreateItemBody | null;
  const courseId = typeof body?.courseId === "string" ? body.courseId : null;
  if (!courseId) return errorResponse("courseId is required", 400);
  const instructorOrResp = await requireInstructor(env, identity, courseId);
  if (instructorOrResp instanceof Response) return instructorOrResp;

  if (!isItemKind(body?.kind)) {
    return errorResponse("kind must be writing, agent, example, reading, or code", 400);
  }
  const kind: ItemKind = body.kind;
  if (kind === "reading") {
    // Readings have no payload store yet. Rejecting is better than accepting a
    // row that would render as dangling forever.
    return errorResponse("Readings are not available yet", 400);
  }
  const payloadRef =
    typeof body.payloadRef === "string" && body.payloadRef.trim()
      ? body.payloadRef.trim()
      : null;
  if (!payloadRef) return errorResponse("payloadRef is required", 400);

  const payloads = await resolvePayloads(env, courseId, [
    { kind, payload_ref: payloadRef } as CourseItemRow,
  ]);
  const payload = payloads.get(`${kind}:${payloadRef}`);
  if (!payload) {
    return errorResponse("No such item in this course", 404);
  }

  const existing = await repo.findItemByPayload(env.DB, courseId, kind, payloadRef);
  if (existing) {
    return errorResponse("That is already assigned in this course", 409);
  }

  const count = (await repo.listItems(env.DB, courseId, { includeArchived: true }))
    .length;
  if (count >= MAX_ITEMS_PER_COURSE) {
    return errorResponse(`At most ${MAX_ITEMS_PER_COURSE} items per course`, 400);
  }

  // Title defaults to the payload's own, so the common case needs no input and
  // the two agree until an instructor deliberately overrides it.
  const title =
    cleanTitle(body.title) ?? cleanTitle(payload.title) ?? payloadRef;
  const assignedAt = parseDate(body.assignedAt) ?? null;
  const dueAt = parseDate(body.dueAt) ?? null;
  const note =
    typeof body.note === "string" && body.note.trim()
      ? body.note.trim().slice(0, MAX_NOTE_CHARS)
      : null;

  const row = await repo.createItem(env.DB, {
    courseId,
    kind,
    payloadRef,
    title,
    ord: await repo.nextOrd(env.DB, courseId),
    assignedAt,
    dueAt,
    note,
  });

  return json({ item: rowToCourseItem(row, { payload }) }, 201);
}

interface PatchItemBody {
  courseId?: unknown;
  title?: unknown;
  assignedAt?: unknown;
  dueAt?: unknown;
  note?: unknown;
  archived?: unknown;
}

/**
 * PATCH /api/course-items/:id — edit scheduling.
 *
 * Only the fields the wrapper owns. `kind` and `payload_ref` are not
 * patchable: redirecting a scheduled row at different content would change
 * what a student is looking at under a link they already hold.
 */
export async function patchItemRoute(
  req: Request,
  env: Env,
  identity: Identity,
  url: URL,
  itemId: string,
): Promise<Response> {
  const body = (await req.json().catch(() => null)) as PatchItemBody | null;
  const courseId =
    (typeof body?.courseId === "string" ? body.courseId : null) ??
    url.searchParams.get("courseId");
  if (!courseId) return errorResponse("courseId is required", 400);
  const instructorOrResp = await requireInstructor(env, identity, courseId);
  if (instructorOrResp instanceof Response) return instructorOrResp;

  const existing = await repo.getItem(env.DB, courseId, itemId);
  if (!existing) return errorResponse("Not found", 404);

  const patch: Parameters<typeof repo.updateItem>[3] = {};
  if (body?.title !== undefined) {
    const t = cleanTitle(body.title);
    if (!t) return errorResponse("Title cannot be empty", 400);
    patch.title = t;
  }
  const assignedAt = parseDate(body?.assignedAt);
  if (assignedAt !== undefined) patch.assignedAt = assignedAt;
  const dueAt = parseDate(body?.dueAt);
  if (dueAt !== undefined) patch.dueAt = dueAt;
  if (body?.note !== undefined) {
    patch.note =
      typeof body.note === "string" && body.note.trim()
        ? body.note.trim().slice(0, MAX_NOTE_CHARS)
        : null;
  }
  if (typeof body?.archived === "boolean") patch.archived = body.archived;

  const row = await repo.updateItem(env.DB, courseId, itemId, patch);
  if (!row) return errorResponse("Not found", 404);
  const payloads = await resolvePayloads(env, courseId, [row]);
  return json({
    item: rowToCourseItem(row, {
      payload: payloads.get(`${row.kind}:${row.payload_ref}`) ?? null,
    }),
  });
}

/**
 * DELETE /api/course-items/:id — unassign.
 *
 * Removes the schedule row only. The agent, assignment, or curated example
 * survives, as does every piece of student work against it. Unassigning is not
 * deleting, and it is certainly not retracting a student's completed work.
 */
export async function deleteItemRoute(
  env: Env,
  identity: Identity,
  url: URL,
  itemId: string,
): Promise<Response> {
  const courseId = url.searchParams.get("courseId");
  if (!courseId) return errorResponse("courseId is required", 400);
  const instructorOrResp = await requireInstructor(env, identity, courseId);
  if (instructorOrResp instanceof Response) return instructorOrResp;
  const existing = await repo.getItem(env.DB, courseId, itemId);
  if (!existing) return errorResponse("Not found", 404);
  await repo.deleteItem(env.DB, courseId, itemId);
  return json({ ok: true });
}

interface ReorderBody {
  courseId?: unknown;
  ids?: unknown;
}

/** POST /api/course-items/reorder — apply an explicit order in one batch. */
export async function reorderItemsRoute(
  req: Request,
  env: Env,
  identity: Identity,
  url: URL,
): Promise<Response> {
  const body = (await req.json().catch(() => null)) as ReorderBody | null;
  const courseId =
    (typeof body?.courseId === "string" ? body.courseId : null) ??
    url.searchParams.get("courseId");
  if (!courseId) return errorResponse("courseId is required", 400);
  const instructorOrResp = await requireInstructor(env, identity, courseId);
  if (instructorOrResp instanceof Response) return instructorOrResp;
  if (!Array.isArray(body?.ids) || body.ids.some((i) => typeof i !== "string")) {
    return errorResponse("ids must be an array of item ids", 400);
  }
  if (body.ids.length > MAX_ITEMS_PER_COURSE) {
    return errorResponse("Too many ids", 400);
  }
  await repo.reorderItems(env.DB, courseId, body.ids as string[]);
  const rows = await repo.listItems(env.DB, courseId, { includeArchived: true });
  const payloads = await resolvePayloads(env, courseId, rows);
  return json({ items: assemble(rows, payloads, null) });
}
