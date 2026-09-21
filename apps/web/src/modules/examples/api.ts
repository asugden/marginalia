// Typed fetch wrappers for /api/examples/*.
// Mirrors apps/worker/src/modules/examples/handlers.ts.

const API_BASE = (import.meta.env.VITE_API_BASE ?? "").replace(/\/$/, "");
const apiUrl = (path: string) => `${API_BASE}${path}`;
const fetchInit: RequestInit = API_BASE ? { credentials: "include" } : {};

export interface CourseExampleDTO {
  slug: string;
  ord: number;
  assignedAt: number | null;
  dueAt: number | null;
  note: string | null;
}

/**
 * One aggregate bucket. `opens` / `engagedOpens` are null exactly when the true
 * count is non-zero but below `minCohort` — see the module README's
 * small-cohort floor. Render those as "fewer than N", never as 0 and never as
 * a guess.
 */
export interface UsageBucketDTO {
  slug: string;
  day: string;
  hourBucket: number;
  opens: number | null;
  engagedOpens: number | null;
  suppressed: boolean;
}

export interface UsageTotalDTO {
  slug: string;
  opens: number | null;
  engagedOpens: number | null;
  suppressed: boolean;
}

export interface UsageResponse {
  minCohort: number;
  buckets: UsageBucketDTO[];
  totals: UsageTotalDTO[];
}

/** A roster entry is binary by construction: a set of slugs, nothing else.
 *  There is no timestamp or count field to add a column for. */
export interface CompletionRosterEntryDTO {
  userId: string;
  email: string | null;
  displayName: string | null;
  completed: string[];
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

// ── curation ───────────────────────────────────────────────────────────────

export async function getCourseExamples(
  courseId: string,
  signal?: AbortSignal,
): Promise<CourseExampleDTO[]> {
  const res = await fetch(
    apiUrl(`/api/examples/course?courseId=${encodeURIComponent(courseId)}`),
    { ...fetchInit, signal },
  );
  if (!res.ok) throw await apiError(res);
  const body = (await res.json()) as { examples: CourseExampleDTO[] };
  return body.examples;
}

/** Whole-list replace. Order is taken from array position; `ord` is ignored. */
export async function putCourseExamples(
  courseId: string,
  examples: Array<{
    slug: string;
    assignedAt: number | null;
    dueAt: number | null;
    note: string | null;
  }>,
): Promise<CourseExampleDTO[]> {
  const res = await fetch(apiUrl(`/api/examples/course`), {
    ...fetchInit,
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ courseId, examples }),
  });
  if (!res.ok) throw await apiError(res);
  const body = (await res.json()) as { examples: CourseExampleDTO[] };
  return body.examples;
}

export async function getMyCourseExamples(
  courseId: string,
  signal?: AbortSignal,
): Promise<{ examples: CourseExampleDTO[]; completed: string[] }> {
  const res = await fetch(
    apiUrl(`/api/examples/course/mine?courseId=${encodeURIComponent(courseId)}`),
    { ...fetchInit, signal },
  );
  if (!res.ok) throw await apiError(res);
  return (await res.json()) as { examples: CourseExampleDTO[]; completed: string[] };
}

// ── (a) anonymous usage ────────────────────────────────────────────────────

/**
 * Fire-and-forget usage beacon.
 *
 * `keepalive` so it survives the user navigating away mid-flight, and the
 * promise is swallowed: a failed beacon must never surface an error to a
 * student reading a teaching page. A signed-out or non-enrolled visitor gets a
 * 401/403 here, which is fine and expected — they see the example anyway.
 *
 * This records nothing about *who* sent it. The server checks course
 * membership and discards the identity; see the worker module README.
 */
export function sendUsageBeacon(
  courseId: string,
  slug: string,
  engaged: boolean,
): void {
  void fetch(apiUrl(`/api/examples/usage`), {
    ...fetchInit,
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ courseId, slug, engaged }),
    keepalive: true,
  }).catch(() => {
    /* deliberately silent — see above */
  });
}

export async function getUsage(
  courseId: string,
  signal?: AbortSignal,
): Promise<UsageResponse> {
  const res = await fetch(
    apiUrl(`/api/examples/usage?courseId=${encodeURIComponent(courseId)}`),
    { ...fetchInit, signal },
  );
  if (!res.ok) throw await apiError(res);
  return (await res.json()) as UsageResponse;
}

// ── (b) completions ────────────────────────────────────────────────────────

export async function markComplete(courseId: string, slug: string): Promise<void> {
  const res = await fetch(apiUrl(`/api/examples/completions`), {
    ...fetchInit,
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ courseId, slug }),
  });
  if (!res.ok) throw await apiError(res);
}

export async function unmarkComplete(courseId: string, slug: string): Promise<void> {
  const res = await fetch(
    apiUrl(
      `/api/examples/completions?courseId=${encodeURIComponent(courseId)}&slug=${encodeURIComponent(slug)}`,
    ),
    { ...fetchInit, method: "DELETE" },
  );
  if (!res.ok) throw await apiError(res);
}

export async function getCompletionRoster(
  courseId: string,
  signal?: AbortSignal,
): Promise<CompletionRosterEntryDTO[]> {
  const res = await fetch(
    apiUrl(`/api/examples/completions?courseId=${encodeURIComponent(courseId)}`),
    { ...fetchInit, signal },
  );
  if (!res.ok) throw await apiError(res);
  const body = (await res.json()) as { roster: CompletionRosterEntryDTO[] };
  return body.roster;
}
