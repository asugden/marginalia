// Typed fetch wrappers for /api/attendance/*.
// Mirrors apps/worker/src/modules/attendance/handlers.ts.

const API_BASE = (import.meta.env.VITE_API_BASE ?? "").replace(/\/$/, "");
const apiUrl = (path: string) => `${API_BASE}${path}`;
const fetchInit: RequestInit = API_BASE ? { credentials: "include" } : {};

export type CheckinFlag =
  | "outside_radius"
  | "no_geofence"
  | "no_location"
  | "duplicate_device"
  | "duplicate_cookie"
  | "late"
  | "auto_enrolled";

export interface SessionDTO {
  id: string;
  courseId: string;
  sessionDate: string;
  label: string;
  centerLat: number | null;
  centerLon: number | null;
  radiusM: number | null;
  openedAt: number;
  closedAt: number | null;
  checkInUrl: string;
}

export interface CheckinDTO {
  id: string;
  userId: string;
  email: string | null;
  displayName: string | null;
  lat: number | null;
  lon: number | null;
  distanceM: number | null;
  flags: CheckinFlag[];
  createdAt: number;
}

export interface CheckInfo {
  sessionId: string;
  courseTitle: string;
  sessionDate: string;
  label: string;
  open: boolean;
  periodMs: number;
}

export interface QrToken {
  token: string;
  nextRotationAt: number;
  periodMs: number;
}

/**
 * Error carrying the HTTP status, so callers can branch on the status code
 * rather than pattern-matching the message. The server's 401 body is
 * `{error: "Unauthorized"}`, so `readError` returns "Unauthorized" with no
 * "401" prefix — a caller testing the string for "401" silently never
 * matches, and a signed-out student sees a dead end instead of a sign-in
 * link.
 */
export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    /** Stable machine-readable code from the server, when it sends one. */
    readonly code?: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

async function readError(res: Response): Promise<{ message: string; code?: string }> {
  try {
    const body = (await res.json()) as { error?: string; code?: string };
    if (body.error) return { message: body.error, code: body.code };
  } catch {
    /* fall through */
  }
  return { message: `${res.status} ${res.statusText}` };
}

/** Build an ApiError from a non-ok response, preserving status and code. */
async function apiError(res: Response): Promise<ApiError> {
  const { message, code } = await readError(res);
  return new ApiError(message, res.status, code);
}

export async function listSessions(courseId: string, signal?: AbortSignal): Promise<SessionDTO[]> {
  const res = await fetch(
    apiUrl(`/api/attendance/sessions?courseId=${encodeURIComponent(courseId)}`),
    { ...fetchInit, signal },
  );
  if (!res.ok) throw await apiError(res);
  const body = (await res.json()) as { sessions: SessionDTO[] };
  return body.sessions;
}

export async function openSession(params: {
  courseId: string;
  label: string;
  centerLat: number | null;
  centerLon: number | null;
  radiusM: number | null;
}): Promise<SessionDTO> {
  const res = await fetch(apiUrl(`/api/attendance/sessions`), {
    ...fetchInit,
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(params),
  });
  if (!res.ok) throw await apiError(res);
  const body = (await res.json()) as { session: SessionDTO };
  return body.session;
}

export async function getSession(id: string, signal?: AbortSignal): Promise<{
  session: SessionDTO;
  checkins: CheckinDTO[];
}> {
  const res = await fetch(apiUrl(`/api/attendance/sessions/${id}`), {
    ...fetchInit,
    signal,
  });
  if (!res.ok) throw await apiError(res);
  return (await res.json()) as { session: SessionDTO; checkins: CheckinDTO[] };
}

export async function closeSession(id: string): Promise<void> {
  const res = await fetch(apiUrl(`/api/attendance/sessions/${id}/close`), {
    ...fetchInit,
    method: "POST",
  });
  if (!res.ok) throw await apiError(res);
}

export async function getQrToken(id: string, signal?: AbortSignal): Promise<QrToken> {
  const res = await fetch(apiUrl(`/api/attendance/sessions/${id}/qr-token`), {
    ...fetchInit,
    signal,
  });
  if (!res.ok) throw await apiError(res);
  return (await res.json()) as QrToken;
}

export function exportCsvUrl(id: string): string {
  return apiUrl(`/api/attendance/sessions/${id}/export.csv`);
}

export async function getCheckInfo(id: string, signal?: AbortSignal): Promise<CheckInfo> {
  const res = await fetch(apiUrl(`/api/attendance/check/${id}/info`), {
    ...fetchInit,
    signal,
  });
  if (!res.ok) throw await apiError(res);
  return (await res.json()) as CheckInfo;
}

export async function submitCheckin(id: string, params: {
  token: string;
  lat: number | null;
  lon: number | null;
  accuracyM: number | null;
  fingerprint: string;
}): Promise<{ ok: true; flags: CheckinFlag[]; alreadyCheckedIn?: boolean }> {
  const res = await fetch(apiUrl(`/api/attendance/check/${id}`), {
    ...fetchInit,
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(params),
  });
  if (!res.ok) throw await apiError(res);
  return (await res.json()) as { ok: true; flags: CheckinFlag[]; alreadyCheckedIn?: boolean };
}

/** Stable per-browser string used as input to the server-side fingerprint
 *  hash. Intentionally narrow — we want a few bits of distinguishability,
 *  not a tracking superpower. */
export function deviceFingerprintString(): string {
  const parts = [
    navigator.userAgent || "",
    `${screen.width}x${screen.height}x${screen.colorDepth}`,
    Intl.DateTimeFormat().resolvedOptions().timeZone || "",
    navigator.language || "",
    navigator.platform || "",
    String((navigator as Navigator & { deviceMemory?: number }).deviceMemory ?? ""),
  ];
  return parts.join("|");
}
