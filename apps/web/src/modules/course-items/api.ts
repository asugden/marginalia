// Typed fetch wrappers for /api/course-items/*.
// Mirrors apps/worker/src/modules/course-items/handlers.ts.

const API_BASE = (import.meta.env.VITE_API_BASE ?? "").replace(/\/$/, "");
const apiUrl = (path: string) => `${API_BASE}${path}`;
const fetchInit: RequestInit = API_BASE ? { credentials: "include" } : {};

export type ItemKind = "writing" | "agent" | "example" | "reading" | "code";

/**
 * Per-kind completion. A discriminated union with a DIFFERENT FIELD NAME per
 * arm, deliberately — there is no shared boolean to read, so rendering one
 * forces the caller to name which kind it came from.
 *
 * The four facts are not equivalent evidence: a backbone exit is server-
 * derived, a submission is an artifact, and "mark complete" is the student's
 * own claim. Collapsing them into one flag would present a self-report as
 * something verified. Do not add a `complete: boolean` helper here; it would
 * become the field every call site reads and the distinction would be lost.
 */
export type ItemCompletionDTO =
  | { kind: "writing"; submitted: boolean }
  | { kind: "agent"; finished: boolean }
  | { kind: "example"; markedDone: boolean }
  | { kind: "reading"; markedDone: boolean }
  | { kind: "code"; submitted: boolean };

/** Payload detail, shaped per kind by the worker. Narrow at the use site. */
export interface AgentPayload {
  agentId: string;
  title: string;
  guided: boolean;
  grounded: boolean;
}

export interface WritingPayload {
  assignmentId: string;
  title: string;
  instructions: string;
  archivedAt: number | null;
  checkpoints: Array<{ id: string; name: string; dueAt: number | null }>;
}

export interface ExamplePayload {
  slug: string;
  note: string | null;
}

export interface CourseItemDTO {
  id: string;
  kind: ItemKind;
  payloadRef: string;
  title: string;
  ord: number;
  /** Both null = a recommended supplement: available, never due, never late. */
  assignedAt: number | null;
  dueAt: number | null;
  note: string | null;
  archivedAt: number | null;
  /** The payload no longer resolves (deleted agent, dropped example slug).
   *  Surfaced rather than hidden so an instructor can clean it up. */
  dangling: boolean;
  payload: Record<string, unknown> | null;
  /** Present on the list endpoint; always the CALLER'S OWN state. */
  completion?: ItemCompletionDTO;
}

export class ApiError extends Error {
  constructor(message: string, readonly status: number, readonly code?: string) {
    super(message);
    this.name = "ApiError";
  }
}

async function apiError(res: Response): Promise<ApiError> {
  try {
    const body = (await res.json()) as { error?: string; code?: string };
    if (body.error) return new ApiError(body.error, res.status, body.code);
  } catch {
    /* fall through */
  }
  return new ApiError(`${res.status} ${res.statusText}`, res.status);
}

/**
 * The combined list. Completion is always the caller's own — an instructor
 * calling this sees their own state, not the class's. Class-wide state lives
 * on the per-module rosters.
 */
export async function listCourseItems(
  courseId: string,
  opts: { includeArchived?: boolean } = {},
  signal?: AbortSignal,
): Promise<CourseItemDTO[]> {
  const q = new URLSearchParams({ courseId });
  if (opts.includeArchived) q.set("includeArchived", "1");
  const res = await fetch(apiUrl(`/api/course-items?${q}`), {
    ...fetchInit,
    signal,
  });
  if (!res.ok) throw await apiError(res);
  const body = (await res.json()) as { items: CourseItemDTO[] };
  return body.items;
}

/** Assign an existing payload. The payload must already exist — this
 *  schedules content, it does not author it. */
export async function createCourseItem(params: {
  courseId: string;
  kind: ItemKind;
  payloadRef: string;
  title?: string;
  assignedAt?: number | null;
  dueAt?: number | null;
  note?: string | null;
}): Promise<CourseItemDTO> {
  const res = await fetch(apiUrl(`/api/course-items`), {
    ...fetchInit,
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(params),
  });
  if (!res.ok) throw await apiError(res);
  const body = (await res.json()) as { item: CourseItemDTO };
  return body.item;
}

/** Edit scheduling. `kind` and `payloadRef` are deliberately not patchable. */
export async function updateCourseItem(
  id: string,
  params: {
    courseId: string;
    title?: string;
    assignedAt?: number | null;
    dueAt?: number | null;
    note?: string | null;
    archived?: boolean;
  },
): Promise<CourseItemDTO> {
  const res = await fetch(apiUrl(`/api/course-items/${encodeURIComponent(id)}`), {
    ...fetchInit,
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(params),
  });
  if (!res.ok) throw await apiError(res);
  const body = (await res.json()) as { item: CourseItemDTO };
  return body.item;
}

/** Unassign. Removes the schedule row only — the payload and every piece of
 *  student work against it survive. */
export async function deleteCourseItem(
  courseId: string,
  id: string,
): Promise<void> {
  const res = await fetch(
    apiUrl(
      `/api/course-items/${encodeURIComponent(id)}?courseId=${encodeURIComponent(courseId)}`,
    ),
    { ...fetchInit, method: "DELETE" },
  );
  if (!res.ok) throw await apiError(res);
}

export async function reorderCourseItems(
  courseId: string,
  ids: string[],
): Promise<CourseItemDTO[]> {
  const res = await fetch(apiUrl(`/api/course-items/reorder`), {
    ...fetchInit,
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ courseId, ids }),
  });
  if (!res.ok) throw await apiError(res);
  const body = (await res.json()) as { items: CourseItemDTO[] };
  return body.items;
}

// ── shared presentation helpers ────────────────────────────────────────────

/**
 * The student-facing type label. `[Agent]` is deliberate and decided: in an AI
 * course the real term is part of the content, so students learning that the
 * thing they talk to is an agent is pedagogically useful rather than jargon
 * leakage. Do not rename it to "Tutor" or "Chat".
 */
export function kindLabel(kind: ItemKind): string {
  switch (kind) {
    case "writing":
      return "Writing";
    case "agent":
      return "Agent";
    case "example":
      return "Example";
    case "reading":
      return "Reading";
    case "code":
      return "Code";
  }
}

/**
 * The completion verb for one item, or null when there is nothing to say.
 *
 * Each kind gets its OWN verb — submitted / finished / marked done — so an
 * instructor or student can tell evidence from self-report at a glance, with
 * no legend and no doubt cast on anyone. This function is the single place
 * that mapping lives; render its output verbatim rather than re-deriving a
 * checkmark from the boolean inside.
 */
export function completionLabel(c: ItemCompletionDTO | undefined): string | null {
  if (!c) return null;
  switch (c.kind) {
    case "writing":
      return c.submitted ? "submitted" : null;
    case "agent":
      return c.finished ? "finished" : null;
    case "example":
    case "reading":
      return c.markedDone ? "marked done" : null;
    case "code":
      return c.submitted ? "submitted" : null;
  }
}

/**
 * Where an instructor goes to open this item's payload. Lives here rather than
 * in one page so the Assign list and the dashboard can't drift apart on where
 * a kind's editor is. Null when the kind has no instructor detail view.
 */
export function instructorHref(
  courseId: string,
  item: CourseItemDTO,
): string | null {
  const base = `/course/${courseId}/instructor`;
  switch (item.kind) {
    case "writing":
      return `${base}/assignments/${item.payloadRef}`;
    case "agent":
      return `${base}/agents/${item.payloadRef}`;
    case "example":
      return `${base}/assign/examples`;
    case "code":
      return `${base}/code/${item.payloadRef}`;
    default:
      return null;
  }
}

/** Is this item a recommended supplement — offered, but never due? */
export function isSupplement(item: CourseItemDTO): boolean {
  return item.assignedAt === null && item.dueAt === null;
}
