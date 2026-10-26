// Typed fetch wrappers for /api/questions/*.
// Mirrors apps/worker/src/modules/questions/handlers.ts.

const API_BASE = (import.meta.env.VITE_API_BASE ?? "").replace(/\/$/, "");
const apiUrl = (path: string) => `${API_BASE}${path}`;
const fetchInit: RequestInit = API_BASE ? { credentials: "include" } : {};

export type SessionStatus = "draft" | "open" | "closed";

/** One class meeting's worth of boards; the open/closed window. */
export interface SessionDTO {
  id: string;
  courseId: string;
  title: string;
  status: SessionStatus;
  createdAt: number;
  openedAt: number | null;
  closedAt: number | null;
  boardCount: number;
}

/** One presenter's board within a session. */
export interface BoardDTO {
  id: string;
  sessionId: string;
  title: string;
  position: number;
  questionCount: number;
}

/** A question. Anonymous by construction: the server sends no author, only
 *  whether it is the caller's own. */
export interface EntryDTO {
  id: string;
  body: string;
  createdAt: number;
  updatedAt: number;
  mine: boolean;
  hidden: boolean;
}

/** Carries the HTTP status and the server's machine-readable code, so callers
 *  branch on those rather than on the message. */
export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code?: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(apiUrl(path), {
    ...fetchInit,
    ...init,
    headers: init?.body ? { "content-type": "application/json" } : undefined,
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string; code?: string };
    throw new ApiError(body.error ?? `HTTP ${res.status}`, res.status, body.code);
  }
  return (await res.json()) as T;
}

const q = encodeURIComponent;
const send = (method: string, body?: unknown): RequestInit => ({
  method,
  body: body === undefined ? undefined : JSON.stringify(body),
});

// ── sessions ───────────────────────────────────────────────────────────────

export function listSessions(courseId: string, signal?: AbortSignal) {
  return call<{ sessions: SessionDTO[]; staff: boolean }>(
    `/api/questions/sessions?courseId=${q(courseId)}`,
    { signal },
  );
}

export function liveSession(courseId: string, signal?: AbortSignal) {
  return call<{ session: SessionDTO | null }>(`/api/questions/live?courseId=${q(courseId)}`, { signal });
}

export function getSession(sessionId: string, signal?: AbortSignal) {
  return call<{ session: SessionDTO; boards: BoardDTO[]; staff: boolean }>(
    `/api/questions/sessions/${q(sessionId)}`,
    { signal },
  );
}

export async function createSession(courseId: string, title: string): Promise<SessionDTO> {
  return (await call<{ session: SessionDTO }>(`/api/questions/sessions`, send("POST", { courseId, title })))
    .session;
}

export async function updateSession(
  sessionId: string,
  patch: { title?: string; status?: "open" | "closed" },
): Promise<SessionDTO> {
  return (await call<{ session: SessionDTO }>(`/api/questions/sessions/${q(sessionId)}`, send("PATCH", patch)))
    .session;
}

export async function deleteSession(sessionId: string): Promise<void> {
  await call(`/api/questions/sessions/${q(sessionId)}`, send("DELETE"));
}

// ── boards ─────────────────────────────────────────────────────────────────

export function getBoard(boardId: string, signal?: AbortSignal) {
  return call<{
    board: BoardDTO;
    session: SessionDTO;
    boards: BoardDTO[];
    entries: EntryDTO[];
    staff: boolean;
  }>(`/api/questions/boards/${q(boardId)}`, { signal });
}

export async function createBoard(sessionId: string, title: string): Promise<BoardDTO> {
  return (
    await call<{ board: BoardDTO }>(`/api/questions/sessions/${q(sessionId)}/boards`, send("POST", { title }))
  ).board;
}

export async function renameBoard(boardId: string, title: string): Promise<BoardDTO> {
  return (await call<{ board: BoardDTO }>(`/api/questions/boards/${q(boardId)}`, send("PATCH", { title })))
    .board;
}

export async function deleteBoard(boardId: string): Promise<void> {
  await call(`/api/questions/boards/${q(boardId)}`, send("DELETE"));
}

// ── questions ──────────────────────────────────────────────────────────────

export async function askQuestion(boardId: string, body: string): Promise<EntryDTO> {
  return (await call<{ entry: EntryDTO }>(`/api/questions/boards/${q(boardId)}/entries`, send("POST", { body })))
    .entry;
}

export async function updateQuestion(
  entryId: string,
  patch: { body?: string; hidden?: boolean },
): Promise<EntryDTO> {
  return (await call<{ entry: EntryDTO }>(`/api/questions/entries/${q(entryId)}`, send("PATCH", patch))).entry;
}

export async function deleteQuestion(entryId: string): Promise<void> {
  await call(`/api/questions/entries/${q(entryId)}`, send("DELETE"));
}
