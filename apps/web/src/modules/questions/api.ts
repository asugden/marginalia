// Typed fetch wrappers for /api/questions/*.
// Mirrors apps/worker/src/modules/questions/handlers.ts.

const API_BASE = (import.meta.env.VITE_API_BASE ?? "").replace(/\/$/, "");
const apiUrl = (path: string) => `${API_BASE}${path}`;
const fetchInit: RequestInit = API_BASE ? { credentials: "include" } : {};

export type BoardStatus = "draft" | "open" | "closed";

export interface BoardDTO {
  id: string;
  courseId: string;
  title: string;
  status: BoardStatus;
  createdAt: number;
  openedAt: number | null;
  closedAt: number | null;
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

export function listBoards(courseId: string, signal?: AbortSignal) {
  return call<{ boards: BoardDTO[]; staff: boolean }>(
    `/api/questions/boards?courseId=${q(courseId)}`,
    { signal },
  );
}

export function liveBoard(courseId: string, signal?: AbortSignal) {
  return call<{ board: BoardDTO | null }>(`/api/questions/live?courseId=${q(courseId)}`, { signal });
}

export function getBoard(boardId: string, signal?: AbortSignal) {
  return call<{ board: BoardDTO; entries: EntryDTO[]; staff: boolean }>(
    `/api/questions/boards/${q(boardId)}`,
    { signal },
  );
}

export async function createBoard(courseId: string, title: string): Promise<BoardDTO> {
  const r = await call<{ board: BoardDTO }>(`/api/questions/boards`, {
    method: "POST",
    body: JSON.stringify({ courseId, title }),
  });
  return r.board;
}

export async function updateBoard(
  boardId: string,
  patch: { title?: string; status?: "open" | "closed" },
): Promise<BoardDTO> {
  const r = await call<{ board: BoardDTO }>(`/api/questions/boards/${q(boardId)}`, {
    method: "PATCH",
    body: JSON.stringify(patch),
  });
  return r.board;
}

export async function deleteBoard(boardId: string): Promise<void> {
  await call(`/api/questions/boards/${q(boardId)}`, { method: "DELETE" });
}

export async function askQuestion(boardId: string, body: string): Promise<EntryDTO> {
  const r = await call<{ entry: EntryDTO }>(`/api/questions/boards/${q(boardId)}/entries`, {
    method: "POST",
    body: JSON.stringify({ body }),
  });
  return r.entry;
}

export async function updateQuestion(
  entryId: string,
  patch: { body?: string; hidden?: boolean },
): Promise<EntryDTO> {
  const r = await call<{ entry: EntryDTO }>(`/api/questions/entries/${q(entryId)}`, {
    method: "PATCH",
    body: JSON.stringify(patch),
  });
  return r.entry;
}

export async function deleteQuestion(entryId: string): Promise<void> {
  await call(`/api/questions/entries/${q(entryId)}`, { method: "DELETE" });
}
