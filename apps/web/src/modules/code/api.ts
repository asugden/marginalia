// Typed fetch wrappers for /api/code/*.
// Mirrors apps/worker/src/modules/code/types.ts and handlers.ts.

const API_BASE = (import.meta.env.VITE_API_BASE ?? "").replace(/\/$/, "");
const apiUrl = (path: string) => `${API_BASE}${path}`;
const fetchInit: RequestInit = API_BASE ? { credentials: "include" } : {};

import type { Origin, OriginRun, PasteRecord, ProvenanceAudit } from "@marginalia/provenance";
export type { Origin, OriginRun };

// ── notebook shape ──────────────────────────────────────────────────────

export type CellType = "code" | "markdown";
export type AssignmentMode = "submit" | "practice";
/** The chat's voice: a built-in library voice, or one of the instructor's. */
export type CodeVoiceRef = { kind: "library"; id: string } | { kind: "custom-ref"; voiceId: string };

export type CellOutput =
  | { type: "stream"; name: "stdout" | "stderr"; text: string }
  | { type: "result"; text: string }
  | { type: "image"; mime: "image/png"; data: string }
  | {
      type: "table";
      columns: string[];
      index: string[];
      rows: string[][];
      shape: [number, number];
    }
  | { type: "error"; ename: string; evalue: string; traceback: string };

export interface Cell {
  id: string;
  type: CellType;
  source: string;
  outputs?: CellOutput[];
  /** The editor's live origin guess; see the worker's types.ts. */
  origins?: OriginRun[];
}

export interface NotebookContent {
  cells: Cell[];
}

// ── DTOs ────────────────────────────────────────────────────────────────

export interface CodeAssignmentDTO {
  id: string;
  courseId: string;
  title: string;
  instructions: string;
  aiEnabled: boolean;
  aiPrompt?: string | null;
  /** Instructor-only. Null = the default library voice. */
  voice?: CodeVoiceRef | null;
  dueAt: number | null;
  mode: AssignmentMode;
  archivedAt: number | null;
  createdAt: number;
  updatedAt: number;
  starter?: NotebookContent;
}

export interface NotebookSummaryDTO {
  id: string;
  title: string;
  assignmentId: string | null;
  updatedAt: number;
}

export interface NotebookDTO extends NotebookSummaryDTO {
  courseId: string;
  content: NotebookContent;
  createdAt: number;
  aiEnabled: boolean;
  assignment: {
    title: string;
    instructions: string;
    dueAt: number | null;
    mode: AssignmentMode;
  } | null;
  /** Whether edits are recorded (a submit-mode assignment). */
  tracking: boolean;
  /** Highest event client_seq the server holds; the next batch starts above it. */
  eventSeq: number;
}

export interface CellRender {
  runs: OriginRun[];
  pastes: PasteRecord[];
  audit: ProvenanceAudit;
}

export interface SubmissionRender {
  v: 1;
  cells: Record<string, CellRender>;
  totals: Record<Origin, number>;
}

export interface CodeMessageDTO {
  id: string;
  role: "user" | "assistant";
  content: string;
  createdAt: number;
}

export interface SubmissionSummaryDTO {
  id: string;
  assignmentId: string;
  submittedAt: number;
  late: boolean;
}

export interface SubmissionDTO extends SubmissionSummaryDTO {
  assignmentTitle: string | null;
  title: string;
  content: NotebookContent;
  student: { userId: string; email: string; displayName: string | null };
  messages: CodeMessageDTO[];
  /** Instructor-only; null for students and for unrecorded copies. */
  render: SubmissionRender | null;
}

export interface RosterStudentDTO {
  userId: string;
  email: string;
  displayName: string | null;
  latest: SubmissionSummaryDTO | null;
  submissionCount: number;
}

// ── errors ──────────────────────────────────────────────────────────────

/** Carries the HTTP status and the server's stable code, so callers branch
 *  on those rather than on message text. */
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

async function apiError(res: Response): Promise<ApiError> {
  try {
    const body = (await res.json()) as { error?: string; code?: string };
    if (body.error) return new ApiError(body.error, res.status, body.code);
  } catch {
    /* fall through */
  }
  return new ApiError(`${res.status} ${res.statusText}`, res.status);
}

export function isAuthError(e: unknown): boolean {
  return e instanceof ApiError && e.status === 401;
}

let redirecting = false;
export function redirectToLogin(): void {
  if (redirecting) return;
  redirecting = true;
  const here = window.location.pathname + window.location.search;
  window.location.href = `/auth/login?return_to=${encodeURIComponent(here)}`;
}

async function call<T>(path: string, init?: RequestInit & { json?: unknown }): Promise<T> {
  const { json, ...rest } = init ?? {};
  const res = await fetch(apiUrl(path), {
    ...fetchInit,
    ...rest,
    ...(json !== undefined
      ? { body: JSON.stringify(json), headers: { "content-type": "application/json" } }
      : {}),
  });
  if (!res.ok) throw await apiError(res);
  return (await res.json()) as T;
}

const q = (courseId: string, extra = "") =>
  `?courseId=${encodeURIComponent(courseId)}${extra}`;
const seg = encodeURIComponent;

// ── assignments ─────────────────────────────────────────────────────────

export async function listAssignments(
  courseId: string,
  opts: { includeArchived?: boolean; signal?: AbortSignal } = {},
): Promise<CodeAssignmentDTO[]> {
  const r = await call<{ assignments: CodeAssignmentDTO[] }>(
    `/api/code/assignments${q(courseId, opts.includeArchived ? "&includeArchived=1" : "")}`,
    { signal: opts.signal },
  );
  return r.assignments;
}

export async function getAssignment(courseId: string, id: string): Promise<CodeAssignmentDTO> {
  const r = await call<{ assignment: CodeAssignmentDTO }>(`/api/code/assignments/${seg(id)}${q(courseId)}`);
  return r.assignment;
}

export interface AssignmentInput {
  title?: string;
  instructions?: string;
  starter?: NotebookContent;
  aiEnabled?: boolean;
  aiPrompt?: string | null;
  voice?: CodeVoiceRef | null;
  dueAt?: number | null;
  archived?: boolean;
  mode?: AssignmentMode;
}

export async function createAssignment(
  courseId: string,
  input: AssignmentInput,
): Promise<CodeAssignmentDTO> {
  const r = await call<{ assignment: CodeAssignmentDTO }>(`/api/code/assignments`, {
    method: "POST",
    json: { courseId, ...input },
  });
  return r.assignment;
}

export async function updateAssignment(
  courseId: string,
  id: string,
  input: AssignmentInput,
): Promise<CodeAssignmentDTO> {
  const r = await call<{ assignment: CodeAssignmentDTO }>(`/api/code/assignments/${seg(id)}`, {
    method: "PATCH",
    json: { courseId, ...input },
  });
  return r.assignment;
}

export async function deleteAssignment(courseId: string, id: string): Promise<void> {
  await call(`/api/code/assignments/${seg(id)}${q(courseId)}`, { method: "DELETE" });
}

export async function getRoster(
  courseId: string,
  id: string,
): Promise<{ assignment: CodeAssignmentDTO; students: RosterStudentDTO[] }> {
  return call(`/api/code/assignments/${seg(id)}/roster${q(courseId)}`);
}

// ── notebooks ───────────────────────────────────────────────────────────

export async function listNotebooks(courseId: string, signal?: AbortSignal): Promise<NotebookSummaryDTO[]> {
  const r = await call<{ notebooks: NotebookSummaryDTO[] }>(`/api/code/notebooks${q(courseId)}`, { signal });
  return r.notebooks;
}

/** Create a scratch notebook, or open (creating on first open) the caller's
 *  notebook for an assignment. */
export async function openNotebook(
  courseId: string,
  params: { assignmentId?: string; title?: string },
): Promise<NotebookDTO> {
  const r = await call<{ notebook: NotebookDTO }>(`/api/code/notebooks`, {
    method: "POST",
    json: { courseId, ...params },
  });
  return r.notebook;
}

export async function getNotebook(courseId: string, id: string): Promise<NotebookDTO> {
  const r = await call<{ notebook: NotebookDTO }>(`/api/code/notebooks/${seg(id)}${q(courseId)}`);
  return r.notebook;
}

export async function saveNotebook(
  courseId: string,
  id: string,
  patch: { title?: string; content?: NotebookContent },
): Promise<{ updatedAt: number }> {
  return call(`/api/code/notebooks/${seg(id)}`, {
    method: "PATCH",
    json: { courseId, ...patch },
    keepalive: false,
  });
}

export async function deleteNotebook(courseId: string, id: string): Promise<void> {
  await call(`/api/code/notebooks/${seg(id)}${q(courseId)}`, { method: "DELETE" });
}

// ── chat ───────────────────────────────────────────────────────────────

export async function listMessages(courseId: string, notebookId: string): Promise<CodeMessageDTO[]> {
  const r = await call<{ messages: CodeMessageDTO[] }>(
    `/api/code/notebooks/${seg(notebookId)}/messages${q(courseId)}`,
  );
  return r.messages;
}

export interface ChatCallbacks {
  onDelta: (text: string) => void;
  /** `assistantMessageId` is absent for a preview turn, which stores nothing. */
  onDone?: (data: { assistantMessageId?: string }) => void;
  onError?: (message: string) => void;
  onAuthRequired?: () => void;
}

/** Stream one chat turn. Returns an abort function. */
export function streamChatTurn(
  courseId: string,
  notebookId: string,
  content: string,
  focusCellId: string | null,
  cb: ChatCallbacks,
): () => void {
  return streamSse(`/api/code/notebooks/${seg(notebookId)}/messages`, { courseId, content, focusCellId }, cb);
}

/** The instructor's chat preview on a starter notebook. Nothing is stored,
 *  so the caller passes the preview conversation so far. */
export function streamChatPreview(
  courseId: string,
  assignmentId: string,
  content: string,
  history: Array<{ role: "user" | "assistant"; content: string }>,
  focusCellId: string | null,
  cb: ChatCallbacks,
): () => void {
  return streamSse(
    `/api/code/assignments/${seg(assignmentId)}/chat-preview`,
    { courseId, content, history, focusCellId },
    cb,
  );
}

function streamSse(path: string, body: unknown, cb: ChatCallbacks): () => void {
  const ctrl = new AbortController();
  (async () => {
    try {
      const res = await fetch(apiUrl(path), {
        ...fetchInit,
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
        signal: ctrl.signal,
      });
      if (!res.ok || !res.body) {
        if (res.status === 401) {
          cb.onAuthRequired?.();
          return;
        }
        cb.onError?.((await apiError(res)).message);
        return;
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        let sep: number;
        while ((sep = buf.indexOf("\n\n")) >= 0) {
          dispatch(buf.slice(0, sep), cb);
          buf = buf.slice(sep + 2);
        }
      }
      if (buf) dispatch(buf, cb);
    } catch (e) {
      if (ctrl.signal.aborted || (e as Error).name === "AbortError") return;
      cb.onError?.(e instanceof Error ? e.message : "stream failed");
    }
  })();
  return () => ctrl.abort();
}

function dispatch(frame: string, cb: ChatCallbacks) {
  let event = "message";
  let data = "";
  for (const line of frame.split("\n")) {
    if (line.startsWith("event:")) event = line.slice(6).trim();
    else if (line.startsWith("data:")) data += line.slice(5).trim();
  }
  if (!data) return;
  let parsed: unknown;
  try {
    parsed = JSON.parse(data);
  } catch {
    return;
  }
  if (event === "delta") cb.onDelta((parsed as { text: string }).text);
  else if (event === "done") cb.onDone?.(parsed as { assistantMessageId?: string });
  else if (event === "error") cb.onError?.((parsed as { message: string }).message);
}

// ── submissions ─────────────────────────────────────────────────────────

export async function submitNotebook(courseId: string, notebookId: string): Promise<SubmissionSummaryDTO> {
  const r = await call<{ submission: SubmissionSummaryDTO }>(
    `/api/code/notebooks/${seg(notebookId)}/submissions`,
    { method: "POST", json: { courseId } },
  );
  return r.submission;
}

export async function listMySubmissions(courseId: string, notebookId: string): Promise<SubmissionSummaryDTO[]> {
  const r = await call<{ submissions: SubmissionSummaryDTO[] }>(
    `/api/code/notebooks/${seg(notebookId)}/submissions${q(courseId)}`,
  );
  return r.submissions;
}

export async function getSubmission(courseId: string, id: string): Promise<SubmissionDTO> {
  const r = await call<{ submission: SubmissionDTO }>(`/api/code/submissions/${seg(id)}${q(courseId)}`);
  return r.submission;
}

// ── edit events ─────────────────────────────────────────────────────────

export interface OutboundCodeEvent {
  cellId: string;
  kind: "insert" | "delete" | "paste" | "llm_insert" | "move";
  offset: number;
  length: number;
  text: string;
  origin: Origin | null;
  restoredOrigins?: OriginRun[];
  clientSeq: number;
}

export async function postEvents(
  courseId: string,
  notebookId: string,
  events: OutboundCodeEvent[],
): Promise<{ maxClientSeq: number }> {
  return call(`/api/code/notebooks/${seg(notebookId)}/events`, {
    method: "POST",
    json: { courseId, events },
  });
}
