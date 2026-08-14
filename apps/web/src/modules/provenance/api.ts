// Typed fetch wrappers for /api/provenance/*.
// Mirrors apps/worker/src/modules/provenance/handlers.ts.

const API_BASE = (import.meta.env.VITE_API_BASE ?? "").replace(/\/$/, "");
const apiUrl = (path: string) => `${API_BASE}${path}`;
const fetchInit: RequestInit = API_BASE ? { credentials: "include" } : {};

export interface DocumentSummary {
  id: string;
  title: string;
  wordCount: number;
  charCount: number;
  updatedAt: number;
}

export interface DocumentDTO {
  id: string;
  courseId: string;
  ownerUserId: string;
  title: string;
  bodyJson: unknown;
  wordCount: number;
  charCount: number;
  createdAt: number;
  updatedAt: number;
}

async function readError(res: Response): Promise<string> {
  try {
    const body = (await res.json()) as { error?: string };
    if (body.error) return body.error;
  } catch {
    /* fall through */
  }
  return `${res.status} ${res.statusText}`;
}

export async function listDocuments(
  courseId: string,
  signal?: AbortSignal,
): Promise<DocumentSummary[]> {
  const res = await fetch(
    apiUrl(`/api/provenance/documents?courseId=${encodeURIComponent(courseId)}`),
    { ...fetchInit, signal },
  );
  if (!res.ok) throw new Error(await readError(res));
  const body = (await res.json()) as { documents: DocumentSummary[] };
  return body.documents;
}

export async function createDocument(
  courseId: string,
  title?: string,
): Promise<DocumentDTO> {
  const res = await fetch(apiUrl(`/api/provenance/documents`), {
    ...fetchInit,
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ courseId, title }),
  });
  if (!res.ok) throw new Error(await readError(res));
  const body = (await res.json()) as { document: DocumentDTO };
  return body.document;
}

export async function getDocument(
  courseId: string,
  id: string,
  signal?: AbortSignal,
): Promise<DocumentDTO> {
  const res = await fetch(
    apiUrl(
      `/api/provenance/documents/${encodeURIComponent(id)}?courseId=${encodeURIComponent(courseId)}`,
    ),
    { ...fetchInit, signal },
  );
  if (!res.ok) throw new Error(await readError(res));
  const body = (await res.json()) as { document: DocumentDTO };
  return body.document;
}

export async function updateDocument(
  id: string,
  patch: {
    courseId: string;
    title?: string;
    bodyJson?: unknown;
    wordCount?: number;
    charCount?: number;
  },
): Promise<DocumentDTO> {
  const res = await fetch(apiUrl(`/api/provenance/documents/${encodeURIComponent(id)}`), {
    ...fetchInit,
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(patch),
  });
  if (!res.ok) throw new Error(await readError(res));
  const body = (await res.json()) as { document: DocumentDTO };
  return body.document;
}

export type ProvenanceEventKind =
  | "insert"
  | "delete"
  | "paste"
  | "llm_insert"
  | "replace"
  | "move";
export type ProvenanceOrigin = "human" | "llm" | "pasted" | "edited";

/** One run of identical origins (compact transport for a range). */
export interface OriginRunDTO {
  origin: ProvenanceOrigin;
  length: number;
}

export interface OutboundEvent {
  clientSeq: number;
  kind: ProvenanceEventKind;
  offset: number;
  length: number;
  text?: string;
  origin?: ProvenanceOrigin;
  sourceMessageId?: string;
  timingBlob?: string;
  /** Origins carried by a deleted range (delete). */
  removedOrigins?: OriginRunDTO[];
  /** Origins to restore for text moved within the document (move). */
  restoredOrigins?: OriginRunDTO[];
}

export async function postEvents(
  documentId: string,
  courseId: string,
  events: OutboundEvent[],
): Promise<{ inserted: number; maxClientSeq: number }> {
  const res = await fetch(
    apiUrl(`/api/provenance/documents/${encodeURIComponent(documentId)}/events`),
    {
      ...fetchInit,
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ courseId, events }),
    },
  );
  if (!res.ok) throw new Error(await readError(res));
  return (await res.json()) as { inserted: number; maxClientSeq: number };
}

export async function deleteDocument(courseId: string, id: string): Promise<void> {
  const res = await fetch(
    apiUrl(
      `/api/provenance/documents/${encodeURIComponent(id)}?courseId=${encodeURIComponent(courseId)}`,
    ),
    { ...fetchInit, method: "DELETE" },
  );
  if (!res.ok) throw new Error(await readError(res));
}

// ─── Chat (slice 3) ─────────────────────────────────────────────────────

export interface AgentSummary {
  id: string;
  name: string;
  mine: boolean;
}

export interface AgentDTO {
  id: string;
  courseId: string;
  ownerUserId: string | null;
  name: string;
  systemPrompt: string;
  createdAt: number;
  updatedAt: number;
}

export interface ConversationDTO {
  id: string;
  documentId: string;
  agentId: string | null;
  agentName: string;
  title: string | null;
  createdAt: number;
  updatedAt: number;
}

export interface MessageDTO {
  id: string;
  role: "user" | "assistant";
  content: string;
  seq: number;
  createdAt: number;
}

export async function listAgents(courseId: string, signal?: AbortSignal): Promise<AgentSummary[]> {
  const res = await fetch(
    apiUrl(`/api/provenance/agents?courseId=${encodeURIComponent(courseId)}`),
    { ...fetchInit, signal },
  );
  if (!res.ok) throw new Error(await readError(res));
  const body = (await res.json()) as { agents: AgentSummary[] };
  return body.agents;
}

export async function getAgent(courseId: string, id: string, signal?: AbortSignal): Promise<AgentDTO> {
  const res = await fetch(
    apiUrl(
      `/api/provenance/agents/${encodeURIComponent(id)}?courseId=${encodeURIComponent(courseId)}`,
    ),
    { ...fetchInit, signal },
  );
  if (!res.ok) throw new Error(await readError(res));
  const body = (await res.json()) as { agent: AgentDTO };
  return body.agent;
}

export async function createAgent(params: {
  courseId: string;
  name: string;
  systemPrompt: string;
  courseDefault?: boolean;
}): Promise<AgentDTO> {
  const res = await fetch(apiUrl(`/api/provenance/agents`), {
    ...fetchInit,
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(params),
  });
  if (!res.ok) throw new Error(await readError(res));
  const body = (await res.json()) as { agent: AgentDTO };
  return body.agent;
}

export async function updateAgent(id: string, params: {
  courseId: string;
  name?: string;
  systemPrompt?: string;
}): Promise<AgentDTO> {
  const res = await fetch(apiUrl(`/api/provenance/agents/${encodeURIComponent(id)}`), {
    ...fetchInit,
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(params),
  });
  if (!res.ok) throw new Error(await readError(res));
  const body = (await res.json()) as { agent: AgentDTO };
  return body.agent;
}

export async function deleteAgent(courseId: string, id: string): Promise<void> {
  const res = await fetch(
    apiUrl(
      `/api/provenance/agents/${encodeURIComponent(id)}?courseId=${encodeURIComponent(courseId)}`,
    ),
    { ...fetchInit, method: "DELETE" },
  );
  if (!res.ok) throw new Error(await readError(res));
}

export async function listConversations(
  documentId: string,
  courseId: string,
  signal?: AbortSignal,
): Promise<ConversationDTO[]> {
  const res = await fetch(
    apiUrl(
      `/api/provenance/documents/${encodeURIComponent(documentId)}/conversations?courseId=${encodeURIComponent(courseId)}`,
    ),
    { ...fetchInit, signal },
  );
  if (!res.ok) throw new Error(await readError(res));
  const body = (await res.json()) as { conversations: ConversationDTO[] };
  return body.conversations;
}

export async function createConversation(
  documentId: string,
  courseId: string,
  agentId: string,
): Promise<ConversationDTO> {
  const res = await fetch(
    apiUrl(`/api/provenance/documents/${encodeURIComponent(documentId)}/conversations`),
    {
      ...fetchInit,
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ courseId, agentId }),
    },
  );
  if (!res.ok) throw new Error(await readError(res));
  const body = (await res.json()) as { conversation: ConversationDTO };
  return body.conversation;
}

export async function updateConversation(
  courseId: string,
  id: string,
  title: string,
): Promise<ConversationDTO> {
  const res = await fetch(
    apiUrl(`/api/provenance/conversations/${encodeURIComponent(id)}`),
    {
      ...fetchInit,
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ courseId, title }),
    },
  );
  if (!res.ok) throw new Error(await readError(res));
  const body = (await res.json()) as { conversation: ConversationDTO };
  return body.conversation;
}

export async function deleteConversation(courseId: string, id: string): Promise<void> {
  const res = await fetch(
    apiUrl(
      `/api/provenance/conversations/${encodeURIComponent(id)}?courseId=${encodeURIComponent(courseId)}`,
    ),
    { ...fetchInit, method: "DELETE" },
  );
  if (!res.ok) throw new Error(await readError(res));
}

export async function listMessages(
  conversationId: string,
  courseId: string,
  signal?: AbortSignal,
): Promise<MessageDTO[]> {
  const res = await fetch(
    apiUrl(
      `/api/provenance/conversations/${encodeURIComponent(conversationId)}/messages?courseId=${encodeURIComponent(courseId)}`,
    ),
    { ...fetchInit, signal },
  );
  if (!res.ok) throw new Error(await readError(res));
  const body = (await res.json()) as { messages: MessageDTO[] };
  return body.messages;
}

export interface SendMessageCallbacks {
  onStarted?: (data: { conversationId: string; agent: string }) => void;
  onDelta: (text: string) => void;
  onDone?: (data: { assistantMessageId: string; title: string | null }) => void;
  onError?: (message: string) => void;
}

/**
 * Stream a chat turn. Returns an abort function the caller can invoke to
 * cut the connection (cleanly aborts the underlying fetch).
 *
 * Wire format: SSE with `event: <name>` + `data: <json>` frames matching
 * the existing /api/conversations/:id/messages stream so reuse is possible.
 *
 * `byoKey` (slice 5): when the student has supplied their own provider key
 * it rides along in the X-Provenance-LLM-Key header for this request only.
 * It lives in the browser (localStorage) and is never sent anywhere except
 * this proxied request; the worker uses it transiently and never stores it.
 */
export function streamChatTurn(
  conversationId: string,
  courseId: string,
  content: string,
  cb: SendMessageCallbacks,
  byoKey?: string | null,
): () => void {
  const ctrl = new AbortController();
  (async () => {
    try {
      const headers: Record<string, string> = { "content-type": "application/json" };
      if (byoKey) headers["x-provenance-llm-key"] = byoKey;
      const res = await fetch(
        apiUrl(`/api/provenance/conversations/${encodeURIComponent(conversationId)}/messages`),
        {
          ...fetchInit,
          method: "POST",
          headers,
          body: JSON.stringify({ courseId, content }),
          signal: ctrl.signal,
        },
      );
      if (!res.ok || !res.body) {
        cb.onError?.(await readError(res));
        return;
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        let sep: number;
        while ((sep = buf.indexOf("\n\n")) >= 0) {
          const frame = buf.slice(0, sep);
          buf = buf.slice(sep + 2);
          dispatch(frame, cb);
        }
      }
      if (buf.length > 0) dispatch(buf, cb);
    } catch (e) {
      // Abort path: AbortController.abort() rejects in-flight fetch and
      // reader.read() with either an AbortError DOMException OR a generic
      // DOMException whose message is "signal is aborted without reason"
      // (the latter when the abort had no explicit reason). Both are
      // benign — treat them as a clean cancel, not a stream failure.
      if (
        ctrl.signal.aborted ||
        (e as Error).name === "AbortError" ||
        /aborted/i.test((e as Error).message ?? "")
      ) {
        return;
      }
      cb.onError?.(e instanceof Error ? e.message : "stream failed");
    }
  })();
  return () => ctrl.abort();
}

function dispatch(frame: string, cb: SendMessageCallbacks) {
  let eventName = "message";
  let dataLine = "";
  for (const line of frame.split("\n")) {
    if (line.startsWith("event:")) eventName = line.slice(6).trim();
    else if (line.startsWith("data:")) dataLine += line.slice(5).trim();
  }
  if (!dataLine) return;
  let data: unknown;
  try { data = JSON.parse(dataLine); } catch { return; }
  switch (eventName) {
    case "started":
      cb.onStarted?.(data as { conversationId: string; agent: string });
      break;
    case "delta":
      cb.onDelta((data as { text: string }).text);
      break;
    case "done":
      cb.onDone?.(data as { assistantMessageId: string; title: string | null });
      break;
    case "error":
      cb.onError?.((data as { message: string }).message);
      break;
  }
}

// ─── Submissions (slice 6) ──────────────────────────────────────────────

export type RenderOrigin = "human" | "llm" | "pasted" | "edited";
export interface RenderRun { origin: RenderOrigin; length: number }
/** One clipboard import, with how much of it survives in the final text. */
export interface PasteRecordDTO {
  seq: number;
  at: number;
  sample: string;
  length: number;
  /** 0..1 — still present as literal text. */
  verbatim: number;
  /** 0..1 — survives reworded rather than literal. */
  nearMatch: number;
}

/** Descriptive facts about the event log. Never a verdict — see the README. */
export interface ProvenanceAuditDTO {
  sessions: number;
  spanMs: number;
  activeMs: number;
  longestGapMs: number;
  finalSessionShare: number;
  lengthDrift: number;
  fastBursts: number;
  orderingAnomalies: number;
  unverifiedMoves: number;
}

export interface ProvenanceRenderDTO {
  /** Render schema version. Absent on snapshots frozen before slice 8. */
  v?: number;
  text: string;
  runs: RenderRun[];
  pastes?: PasteRecordDTO[];
  audit?: ProvenanceAuditDTO;
}

export interface SubmissionSummary {
  token: string;
  createdAt: number;
  revokedAt: number | null;
  /** Whether the caller may revoke this link. Student-created links are
   *  permanent, so this is false for students (see the worker). */
  canRevoke: boolean;
}

export async function mintSubmission(
  documentId: string,
  courseId: string,
): Promise<{ token: string; createdAt: number }> {
  const res = await fetch(
    apiUrl(`/api/provenance/documents/${encodeURIComponent(documentId)}/submissions`),
    {
      ...fetchInit,
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ courseId }),
    },
  );
  if (!res.ok) throw new Error(await readError(res));
  return (await res.json()) as { token: string; createdAt: number };
}

export async function listSubmissions(
  documentId: string,
  courseId: string,
  signal?: AbortSignal,
): Promise<SubmissionSummary[]> {
  const res = await fetch(
    apiUrl(
      `/api/provenance/documents/${encodeURIComponent(documentId)}/submissions?courseId=${encodeURIComponent(courseId)}`,
    ),
    { ...fetchInit, signal },
  );
  if (!res.ok) throw new Error(await readError(res));
  const body = (await res.json()) as { submissions: SubmissionSummary[] };
  return body.submissions;
}

/** One submission checkpoint anywhere in the course, for the instructor list. */
export interface CourseSubmissionSummary {
  token: string;
  documentId: string;
  title: string;
  createdAt: number;
  revokedAt: number | null;
  studentEmail: string;
  studentName: string | null;
  origins: {
    total: number;
    human: number;
    llm: number;
    pasted: number;
    edited: number;
    /**
     * Number of clipboard imports. Shown on its own because students are asked
     * not to paste, so the count is a fact rather than an inference. Survival
     * percentages stay off this list — they need their source text beside them.
     */
    pasteCount: number;
  };
}

/** Every submission checkpoint in the course, newest first. Instructor-only;
 *  the worker returns 403 for anyone else. */
export async function listCourseSubmissions(
  courseId: string,
  signal?: AbortSignal,
): Promise<CourseSubmissionSummary[]> {
  const res = await fetch(
    apiUrl(`/api/provenance/submissions?courseId=${encodeURIComponent(courseId)}`),
    { ...fetchInit, signal },
  );
  if (!res.ok) throw new Error(await readError(res));
  const body = (await res.json()) as { submissions: CourseSubmissionSummary[] };
  return body.submissions;
}

export async function revokeSubmission(token: string): Promise<void> {
  const res = await fetch(
    apiUrl(`/api/provenance/submissions/${encodeURIComponent(token)}`),
    { ...fetchInit, method: "DELETE" },
  );
  if (!res.ok) throw new Error(await readError(res));
}

// Share-token reads. Instructor-only despite the legacy "public" path segment —
// they send credentials and 401 when there's no session.
export interface PublicSubmissionDTO {
  title: string;
  createdAt: number;
  render: ProvenanceRenderDTO;
}

/** Sentinel thrown by getPublicSubmission on a 401, so the viewer can tell
 *  "you need to sign in" apart from "this link isn't available to you". */
export const SUBMISSION_SIGN_IN_REQUIRED = "sign-in-required";

export async function getPublicSubmission(
  token: string,
  signal?: AbortSignal,
): Promise<PublicSubmissionDTO> {
  // Sends credentials: these endpoints are instructor-gated now, despite the
  // legacy "public" path segment. Without the session cookie even an instructor
  // reads as anonymous on the cross-origin deploy.
  const res = await fetch(
    apiUrl(`/api/provenance/public/submissions/${encodeURIComponent(token)}`),
    { ...fetchInit, signal },
  );
  // 401 is distinguishable so the viewer can prompt sign-in instead of showing a
  // dead "unavailable" card to an instructor who simply has no session yet.
  if (res.status === 401) throw new Error(SUBMISSION_SIGN_IN_REQUIRED);
  if (!res.ok) throw new Error(await readError(res));
  return (await res.json()) as PublicSubmissionDTO;
}

export interface PublicConversationDTO {
  id: string;
  agentName: string;
  title: string | null;
  messages: { role: "user" | "assistant"; content: string }[];
}

export async function getPublicSubmissionConversations(
  token: string,
  signal?: AbortSignal,
): Promise<PublicConversationDTO[]> {
  const res = await fetch(
    apiUrl(`/api/provenance/public/submissions/${encodeURIComponent(token)}/conversations`),
    { ...fetchInit, signal },
  );
  if (!res.ok) throw new Error(await readError(res));
  const body = (await res.json()) as { conversations: PublicConversationDTO[] };
  return body.conversations;
}

// ── Course settings (hide-marks toggle) ─────────────────────────────────

/** Read the course's provenance display settings. Any enrolled user. */
export async function getProvenanceSettings(
  courseId: string,
  signal?: AbortSignal,
): Promise<{ hideProvenanceMarks: boolean }> {
  const res = await fetch(
    apiUrl(`/api/provenance/settings?courseId=${encodeURIComponent(courseId)}`),
    { ...fetchInit, signal },
  );
  if (!res.ok) throw new Error(await readError(res));
  return (await res.json()) as { hideProvenanceMarks: boolean };
}

/** Set the "hide marks from students" flag. Instructor only (403 otherwise). */
export async function setProvenanceHideMarks(
  courseId: string,
  hide: boolean,
): Promise<{ hideProvenanceMarks: boolean }> {
  const res = await fetch(apiUrl(`/api/provenance/settings`), {
    ...fetchInit,
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ courseId, hideProvenanceMarks: hide }),
  });
  if (!res.ok) throw new Error(await readError(res));
  return (await res.json()) as { hideProvenanceMarks: boolean };
}
