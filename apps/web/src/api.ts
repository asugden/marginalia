// Thin client for the Worker API. The chat turn endpoint streams SSE; everything
// else is plain JSON.

import type { AgentDefinition } from "@marginalia/backbone";

/**
 * Build a fully-qualified URL for an API path. When the frontend is served
 * from the same origin as the Worker (single hostname behind Access),
 * VITE_API_BASE is empty and paths stay relative. When Pages is on
 * *.pages.dev and the Worker is on *.workers.dev, VITE_API_BASE points at
 * the Worker origin so cross-origin requests can ride CORS + Access.
 */
const API_BASE = (import.meta.env.VITE_API_BASE ?? "").replace(/\/$/, "");
const apiUrl = (path: string) => `${API_BASE}${path}`;

/** v0.5 §3 — click-through URL for a citation pill. URL sources open
 *  externally; PDF/markdown/text sources open via the auth-checked R2
 *  proxy. Null when the source has neither (e.g. deleted). */
export function citationOpenUrl(
  c: MessageSource,
  courseId: string | null,
): string | null {
  if (c.sourceUrl) return c.sourceUrl;
  // v1.0 §7.1 — sourceId-backed citations need the course id to build the
  // R2 proxy URL. The page that knows the conversation (and thus the
  // course) calls this; before that's known the link is suppressed
  // gracefully — the pill still renders, it just isn't clickable yet.
  if (c.sourceId && courseId) {
    return apiUrl(
      `/api/sources/${c.sourceId}/file?courseId=${encodeURIComponent(courseId)}`,
    );
  }
  return null;
}
/**
 * fetch() options that must accompany every cross-origin call so the browser
 * sends the Access cookie. `same-origin` is the default; bumping to `include`
 * is required when API_BASE points at a different hostname.
 */
const fetchInit: RequestInit = API_BASE ? { credentials: "include" } : {};

export interface BackboneState {
  currentTopicIndex: number;
  turnsOnTopic: number;
  totalTurns: number;
  finished: boolean;
}

/** v0.5 §3 — one citation pill on an assistant message. */
export interface MessageSource {
  ordinal: number;
  /** Null if the underlying source has since been deleted from its collection. */
  sourceId: string | null;
  filename: string;
  kind: string;
  sourceUrl: string | null;
  r2Key: string | null;
}

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  /** Citations the model leaned on (assistant turns from RAG-grounded agents only). */
  sources?: MessageSource[];
}

/**
 * Summary row returned by GET /api/agents — the top-level "what students pick"
 * list. (Not to be confused with VoiceSummary, which is a persona profile.)
 */
export interface AgentSummary {
  id: string;
  title: string;
  hasBackbone: boolean;
  hasCollection: boolean;
  voice: AgentDefinition["voice"];
  updatedAt: number;
  /** Most recent conversation this user has against this agent (§13). */
  lastConversationId: string | null;
  lastUpdatedAt: number | null;
  lastCompletedAt: number | null;
}

export interface AgentDetail {
  id: string;
  courseId: string;
  title: string;
  definition: AgentDefinition;
  updatedAt: number;
}

export interface VoiceSummary {
  id: string;
  name: string;
  description: string;
  /** v0.7 §1: present on owned + shared voices (not library). */
  updatedAt?: number;
}

/** v0.7 §1 — three buckets now: library + voices the user owns + voices
 *  explicitly shared with the user. Shared entries carry ownerUserId so
 *  the picker can label them "Shared by Alice". */
export interface SharedVoiceSummary extends VoiceSummary {
  ownerUserId: string | null;
}
export interface VoiceListing {
  library: VoiceSummary[];
  owned: VoiceSummary[];
  shared: SharedVoiceSummary[];
}

/** Full voice payload returned by GET /api/voices/:id. Discriminator
 *  distinguishes library (read-only, fork via Customize) from custom
 *  (editable iff isOwner). */
export type VoiceFull =
  | {
      kind: "library";
      voice: {
        id: string;
        name: string;
        description: string;
        systemPromptFragment: string;
      };
    }
  | {
      kind: "custom";
      voice: {
        id: string;
        name: string;
        description: string;
        systemPromptFragment: string;
        ownerUserId: string | null;
        isOwner: boolean;
        updatedAt: number;
      };
    };

export interface VoiceShareEntry {
  userId: string;
  email: string;
  displayName: string | null;
  createdAt: number;
}

export interface CollectionSummary {
  id: string;
  name: string;
  description: string | null;
  updatedAt: number;
  sourceCount: number;
}

export type CollectionSourceStatus = "pending" | "indexed" | "failed";
export type CollectionSourceKind = "pdf" | "markdown" | "text" | "url";

export interface CollectionSourceSummary {
  id: string;
  filename: string;
  byteSize: number;
  kind: CollectionSourceKind;
  /** Original URL when kind='url'. */
  sourceUrl: string | null;
  /** Set when kind='url' was last fetched. */
  fetchedAt: number | null;
  contentType: string | null;
  chunks: number;
  status: CollectionSourceStatus;
  error: string | null;
  createdAt: number;
  updatedAt: number;
}

export interface CollectionDetail {
  collection: { id: string; name: string; description: string | null };
  sources: CollectionSourceSummary[];
}

export interface ConversationView {
  conversationId: string;
  /** v1.0 §7.1 — the course this conversation belongs to. Used by the
   *  chat page to build citation URLs without depending on any
   *  hardcoded course constant. */
  courseId: string;
  agent: { id: string; title: string } | null;
  /** v1.0 — student-facing clarity line, resolved server-side from the
   *  agent snapshot (instructor's note or a shape-derived default). */
  clarityNote: string;
  state: BackboneState | null;
  currentTopic: { title: string; index: number } | null;
  /** Set when the backbone reached its exit condition. Composer is hidden when set. */
  completedAt: number | null;
  messages: ChatMessage[];
}

/**
 * Row in the conversation sidebar / history. Backbone rows have a
 * server-derived title like "Close reading — topic 2/4"; free-chat rows have
 * an LLM-generated title (empty string until generated, displayed as "Untitled").
 */
export interface ConversationSummary {
  id: string;
  title: string;
  agentName: string;
  topicProgress: { index: number; total: number } | null;
  completedAt: number | null;
  updatedAt: number;
  hasBackbone: boolean;
}

/** Events emitted while streaming a turn. */
export type TurnEvent =
  | {
      // Fired ONLY by the combined "create + first turn" path (POST
      // /api/conversations) before any delta. Carries the freshly-created
      // conversation id so the client can swap /new/:agentId → /c/:id.
      type: "started";
      conversationId: string;
      agent: { id: string; title: string };
      state: BackboneState | null;
      currentTopic: { title: string; index: number } | null;
    }
  | { type: "delta"; text: string }
  | {
      // v0.5 §3 — citations on the assistant message, emitted before `done`
      // so the client has the pill data when it transforms raw `[^src_*]`
      // tokens into pills. Omitted entirely when no source was cited.
      type: "sources";
      items: MessageSource[];
    }
  | {
      type: "done";
      state: BackboneState | null;
      transition: string;
      currentTopic: { title: string; index: number } | null;
      /** Authoritative server stamp when the conversation just completed; null otherwise. */
      completedAt: number | null;
      completionMessage: string | null;
      /** Current row title at done-time. Stale by design (free-chat title generation
       *  is a fire-and-forget waitUntil) — null here means "not generated yet,
       *  worth refetching the list shortly." (v0.5 §5) */
      conversationTitle: string | null;
    }
  | { type: "error"; message: string };

async function jsonFetch<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(apiUrl(url), {
    ...fetchInit,
    ...init,
    headers: { "content-type": "application/json", ...init?.headers },
  });
  if (res.status === 401) {
    // No (or expired) session. Bounce through /auth/login so the user
    // signs back in with Google. return_to carries the current SPA URL
    // so the post-callback redirect lands them where they were. This
    // covers (a) the cold first-time-visitor case, (b) the post-logout
    // case, and (c) sessions that expired in the background.
    redirectToLogin();
    // Surface a "redirecting" error to unblock any awaiting caller; the
    // page is about to navigate away regardless, so callers that catch
    // this will only display the error for the brief window before
    // navigation.
    throw new Error("Redirecting to sign-in…");
  }
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error((body as { error?: string }).error ?? `HTTP ${res.status}`);
  }
  return res.json() as Promise<T>;
}

/**
 * Navigate to /auth/login carrying the current SPA path in `return_to`.
 * Guarded so a burst of parallel 401s (e.g. /api/me + /api/agents firing
 * together on a logged-out home load) doesn't trigger multiple redirects
 * or fight each other for window.location.
 */
let redirectingToLogin = false;
function redirectToLogin(): void {
  if (redirectingToLogin) return;
  redirectingToLogin = true;
  const here = window.location.pathname + window.location.search;
  // /auth/login lives outside the SPA, so a full navigation (not a router
  // push) is the right move.
  window.location.href = `/auth/login?return_to=${encodeURIComponent(here)}`;
}

// All read endpoints accept an optional AbortSignal — passed through to
// `fetch` via RequestInit. The signal field on jsonFetch's options is just
// `RequestInit.signal`, so callers don't need a custom wrapper.

// ── conversations ──────────────────────────────────────────────────────────

/**
 * Combined "create conversation + run first turn" (v0.4 §14). The server
 * creates the row and runs the first LLM turn in one round trip; we yield
 * the SSE events. The first event is `started` carrying the new
 * `conversationId`; the caller should replace its URL from /new/:agentId
 * to /c/:id at that point.
 *
 * Accepts an `AbortSignal` so the caller can cancel in-flight streams on
 * unmount / navigation. Without this the fetch continues consuming tokens
 * from Anthropic even after the user has left the page — every cancellation
 * matters because each one is real billed work.
 */
/** v1.0 §7.1 — `courseId` is optional. The worker infers it from the
 *  agent id and enforces enrollment on the inferred course. Compose
 *  mode (/new/:agentId) doesn't know the course up-front, so callers
 *  pass agentId alone; the picker / dashboard surfaces that do know the
 *  course are welcome to pass it for an extra round of validation. */
export async function* startConversation(
  agentId: string,
  content: string,
  signal?: AbortSignal,
): AsyncGenerator<TurnEvent> {
  const res = await fetch(apiUrl("/api/conversations"), {
    ...fetchInit,
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ agentId, content }),
    signal,
  });
  if (res.status === 401) {
    redirectToLogin();
    throw new Error("Redirecting to sign-in…");
  }
  if (!res.ok || !res.body) {
    const body = await res.json().catch(() => ({}));
    throw new Error((body as { error?: string }).error ?? `HTTP ${res.status}`);
  }
  yield* parseEventStream(res);
}

export function getConversation(id: string, signal?: AbortSignal) {
  return jsonFetch<ConversationView>(`/api/conversations/${id}`, { signal });
}

export function listConversations(signal?: AbortSignal) {
  return jsonFetch<{ conversations: ConversationSummary[] }>(
    "/api/conversations",
    { signal },
  );
}

/** Identity endpoint — returns the logged-in user's id + email. Used by
 *  /author/roster to gate self-affecting actions in the UI. */
/** v1.0 §1/§2 — one row of `/api/me`'s enrollments. */
export interface MeEnrollment {
  courseId: string;
  courseName: string;
  role: "student" | "instructor";
  joinedAt: number;
  /** v1.0 §6 — lazy-reveal flags for the dashboard tab strip. Flip true
   *  the first time the course uses the feature; never flip back. */
  showAttendance: boolean;
  showCollections: boolean;
}
export interface MeResponse {
  email: string;
  registered: boolean;
  userId: string | null;
  /** Every course the caller is enrolled in, joined-date desc. Empty when
   *  unauthenticated or not yet claimed. */
  enrollments: MeEnrollment[];
}
export function getMe(signal?: AbortSignal) {
  return jsonFetch<MeResponse>("/api/me", { signal });
}

/** Parse the Worker's `event:`/`data:`/blank-line SSE framing into TurnEvents.
 *
 *  Takes the full Response (not just body) because Response.body's declared
 *  generic in lib.dom doesn't type-check through an explicit parameter — only
 *  in the direct `res.body.pipeThrough(...)` form. Caller has already
 *  verified `res.ok && res.body`.
 */
async function* parseEventStream(res: Response): AsyncGenerator<TurnEvent> {
  const reader = res.body!.pipeThrough(new TextDecoderStream()).getReader();
  let buffer = "";

  function* drain(): Generator<TurnEvent> {
    let sep: number;
    while ((sep = buffer.indexOf("\n\n")) !== -1) {
      const frame = buffer.slice(0, sep);
      buffer = buffer.slice(sep + 2);
      const ev = parseFrame(frame);
      if (ev) yield ev;
    }
  }

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += value;
    yield* drain();
  }
  // The server may send the terminal `done`/`error` frame without a trailing
  // blank line (intentionally short, or interrupted mid-newline). Flush any
  // remaining complete-looking frame in the buffer or the client misses the
  // last event and shows stale state.
  if (buffer.trim()) {
    const ev = parseFrame(buffer);
    if (ev) yield ev;
    buffer = "";
  }
}

/** Parse one SSE frame (between blank-line separators) into a TurnEvent. */
function parseFrame(frame: string): TurnEvent | null {
  // SSE spec permits "event:foo" and "event: foo" (optional leading space
  // after the colon). Handle both.
  const lines = frame.split("\n");
  const eventLine = lines.find((l) => l.startsWith("event:"));
  const dataLine = lines.find((l) => l.startsWith("data:"));
  if (!eventLine || !dataLine) return null;
  const event = eventLine.slice("event:".length).trim();
  let data: unknown;
  try {
    data = JSON.parse(dataLine.slice("data:".length).trim());
  } catch {
    return null;
  }
  if (typeof data !== "object" || data === null) return null;
  // Order matters: spread `data` first so the SSE `event` tag is authoritative
  // and a stray `type` field inside the JSON payload can't clobber it.
  return { ...(data as object), type: event } as TurnEvent;
}

/**
 * Send a student turn and yield streamed events for turns 2..N of an existing
 * conversation. (Turn 1 goes through `startConversation()` — see §14.)
 *
 * Accepts an `AbortSignal`; aborting cancels the upstream fetch (which causes
 * the Worker's ReadableStream.cancel to fire, which aborts the Anthropic
 * stream). Must be honored on unmount or every navigation-away pays the rest
 * of the LLM bill.
 */
export async function* sendMessage(
  conversationId: string,
  content: string,
  signal?: AbortSignal,
): AsyncGenerator<TurnEvent> {
  const res = await fetch(apiUrl(`/api/conversations/${conversationId}/messages`), {
    ...fetchInit,
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ content }),
    signal,
  });
  if (res.status === 401) {
    redirectToLogin();
    throw new Error("Redirecting to sign-in…");
  }
  if (!res.ok || !res.body) {
    const body = await res.json().catch(() => ({}));
    throw new Error((body as { error?: string }).error ?? `HTTP ${res.status}`);
  }
  yield* parseEventStream(res);
}

// ── voices & agents ────────────────────────────────────────────────────────

// v0.7 §1 — voices are per-author, not per-course. The endpoint takes
// no courseId; the kept-for-compat signature ignores any argument so
// existing call sites (AuthorEditPage) don't need touching at the same
// time as this swap.
export function listVoices(_courseId?: string) {
  return jsonFetch<VoiceListing>(`/api/voices`);
}

export function getVoice(voiceId: string) {
  return jsonFetch<VoiceFull>(`/api/voices/${encodeURIComponent(voiceId)}`);
}

export function createVoice(params: {
  name: string;
  description: string;
  systemPromptFragment: string;
}) {
  return jsonFetch<{ id: string }>(`/api/voices`, {
    method: "POST",
    body: JSON.stringify(params),
  });
}

export function updateVoice(
  voiceId: string,
  params: { name: string; description: string; systemPromptFragment: string },
) {
  return jsonFetch<{ ok: true }>(
    `/api/voices/${encodeURIComponent(voiceId)}`,
    { method: "PUT", body: JSON.stringify(params) },
  );
}

export async function deleteVoice(voiceId: string): Promise<void> {
  const res = await fetch(
    apiUrl(`/api/voices/${encodeURIComponent(voiceId)}`),
    { ...fetchInit, method: "DELETE" },
  );
  if (res.status === 204) return;
  const body = await res.json().catch(() => ({}));
  // 409 carries a structured payload listing blocking agents; surface it
  // via the error message so the editor can show the list.
  if (res.status === 409 && Array.isArray((body as { blockingAgents?: unknown }).blockingAgents)) {
    const list = (body as { blockingAgents: Array<{ title: string }> }).blockingAgents
      .map((a) => `"${a.title}"`)
      .join(", ");
    throw new Error(
      `${(body as { error?: string }).error ?? "Still referenced"}: ${list}`,
    );
  }
  throw new Error((body as { error?: string }).error ?? `HTTP ${res.status}`);
}

export function duplicateVoice(voiceId: string) {
  return jsonFetch<{ id: string }>(
    `/api/voices/${encodeURIComponent(voiceId)}/duplicate`,
    { method: "POST" },
  );
}

export function previewVoice(params: {
  systemPromptFragment: string;
  promptKey?: string;
}) {
  return jsonFetch<{ promptKey: string; question: string; reply: string }>(
    `/api/voices/preview`,
    { method: "POST", body: JSON.stringify(params) },
  );
}

export function listVoiceShares(voiceId: string) {
  return jsonFetch<{ shares: VoiceShareEntry[] }>(
    `/api/voices/${encodeURIComponent(voiceId)}/shares`,
  );
}

export function createVoiceShare(voiceId: string, email: string) {
  return jsonFetch<{ userId: string; email: string }>(
    `/api/voices/${encodeURIComponent(voiceId)}/shares`,
    { method: "POST", body: JSON.stringify({ email }) },
  );
}

export async function deleteVoiceShare(voiceId: string, userId: string): Promise<void> {
  const res = await fetch(
    apiUrl(
      `/api/voices/${encodeURIComponent(voiceId)}/shares/${encodeURIComponent(userId)}`,
    ),
    { ...fetchInit, method: "DELETE" },
  );
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error((body as { error?: string }).error ?? `HTTP ${res.status}`);
  }
}

export function listAgents(courseId: string) {
  return jsonFetch<{ agents: AgentSummary[] }>(
    `/api/agents?courseId=${encodeURIComponent(courseId)}`,
  );
}

/** v1.0 §7.1 — fetch a single agent.
 *  - `getAgent(courseId, agentId)` when the course is known (faster, validates).
 *  - `getAgentById(agentId)` when the course isn't known (compose path).
 *  The worker enforces enrollment on the agent's course either way. */
export function getAgent(courseId: string, agentId: string) {
  return jsonFetch<AgentDetail>(
    `/api/agents/${agentId}?courseId=${encodeURIComponent(courseId)}`,
  );
}
export function getAgentById(agentId: string) {
  return jsonFetch<AgentDetail>(`/api/agents/${agentId}`);
}

export function createAgent(
  courseId: string,
  title: string,
  definition: AgentDefinition,
) {
  return jsonFetch<{ id: string }>("/api/agents", {
    method: "POST",
    body: JSON.stringify({ courseId, title, definition }),
  });
}

export function updateAgent(
  courseId: string,
  agentId: string,
  title: string,
  definition: AgentDefinition,
) {
  return jsonFetch<{ ok: true }>(`/api/agents/${agentId}`, {
    method: "PUT",
    body: JSON.stringify({ courseId, title, definition }),
  });
}

/** v1.0 §4 — one row in the "Duplicate from another course" picker. */
export interface DuplicableAgentSummary {
  id: string;
  title: string;
  hasBackbone: boolean;
  hasCollection: boolean;
  updatedAt: number;
}
export interface DuplicableAgentsGroup {
  courseId: string;
  courseName: string;
  agents: DuplicableAgentSummary[];
}
export function listDuplicableAgents() {
  return jsonFetch<{ courses: DuplicableAgentsGroup[] }>(
    "/api/agents/duplicable",
  );
}

/** v1.0 §4 — copy an agent from any course the caller instructs into
 *  the target course. Returns the new agent's id and whether the source
 *  collection was stripped (target course didn't have it). */
export function duplicateAgentTo(sourceAgentId: string, targetCourseId: string) {
  return jsonFetch<{ id: string; droppedCollection: boolean }>(
    `/api/agents/${sourceAgentId}/duplicate-to`,
    {
      method: "POST",
      body: JSON.stringify({ targetCourseId }),
    },
  );
}

/**
 * v0.5 §7 — delete an agent. Server returns 204 (no body); past conversations
 * are orphaned (agent_id nulled) and any in-progress ones are marked complete
 * server-side so the student sees a normal completion banner.
 */
export async function deleteAgent(
  courseId: string,
  agentId: string,
): Promise<void> {
  const res = await fetch(
    apiUrl(
      `/api/agents/${agentId}?courseId=${encodeURIComponent(courseId)}`,
    ),
    { ...fetchInit, method: "DELETE" },
  );
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(
      (body as { error?: string }).error ?? `HTTP ${res.status}`,
    );
  }
}

// ── collections ────────────────────────────────────────────────────────────

export function listCollections(courseId: string) {
  return jsonFetch<{ collections: CollectionSummary[] }>(
    `/api/collections?courseId=${encodeURIComponent(courseId)}`,
  );
}

export function createCollection(
  courseId: string,
  name: string,
  description?: string,
) {
  return jsonFetch<CollectionSummary>("/api/collections", {
    method: "POST",
    body: JSON.stringify({ courseId, name, description }),
  });
}

export function getCollection(courseId: string, collectionId: string) {
  return jsonFetch<CollectionDetail>(
    `/api/collections/${collectionId}/sources?courseId=${encodeURIComponent(courseId)}`,
  );
}

/**
 * Upload one file source (.pdf / .md / .txt) into a collection. Returns after
 * indexing finishes (success or failure) — there is no separate "still chunking"
 * state to poll.
 */
export async function uploadCollectionSource(
  courseId: string,
  collectionId: string,
  file: File,
): Promise<{ id: string; status: CollectionSourceStatus; chunks?: number; error?: string }> {
  const form = new FormData();
  form.append("file", file);
  const res = await fetch(
    apiUrl(`/api/collections/${collectionId}/sources?courseId=${encodeURIComponent(courseId)}`),
    { ...fetchInit, method: "POST", body: form },
  );
  if (res.status === 401) {
    redirectToLogin();
    throw new Error("Redirecting to sign-in…");
  }
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error((body as { error?: string }).error ?? `HTTP ${res.status}`);
  }
  return res.json();
}

/**
 * Add a URL source: worker fetches the URL, snapshots to R2, and indexes the
 * extracted text. HTML pages run through Readability so nav/footer chrome
 * doesn't pollute the corpus. PDFs are *not* fetched from URLs — instructors
 * upload them directly. The plan calls this out as the cheaper, faster path
 * (an arXiv abstract page is text-rich HTML).
 */
export async function addCollectionUrlSource(
  courseId: string,
  collectionId: string,
  url: string,
): Promise<{ id: string; status: CollectionSourceStatus; chunks?: number; error?: string }> {
  return jsonFetch(
    `/api/collections/${collectionId}/sources/url?courseId=${encodeURIComponent(courseId)}`,
    { method: "POST", body: JSON.stringify({ url }) },
  );
}

// ─── roster (instructor-only) ──────────────────────────────────────────────

export type EnrollmentRole = "student" | "instructor";

export interface RosterEntry {
  userId: string;
  email: string;
  displayName: string | null;
  role: EnrollmentRole;
  joinedAt: number;
  lastSeenAt: number | null;
}

export function listRoster(courseId: string) {
  return jsonFetch<{ roster: RosterEntry[] }>(
    `/api/courses/${encodeURIComponent(courseId)}/roster`,
  );
}

export function addRosterEntry(
  courseId: string,
  email: string,
  role: EnrollmentRole,
) {
  return jsonFetch<{ userId: string; email: string; role: EnrollmentRole }>(
    `/api/courses/${encodeURIComponent(courseId)}/roster`,
    { method: "POST", body: JSON.stringify({ email, role }) },
  );
}

export function patchRosterEntry(
  courseId: string,
  userId: string,
  role: EnrollmentRole,
) {
  return jsonFetch<{ userId: string; role: EnrollmentRole }>(
    `/api/courses/${encodeURIComponent(courseId)}/roster/${userId}`,
    { method: "PATCH", body: JSON.stringify({ role }) },
  );
}

export function removeRosterEntry(courseId: string, userId: string) {
  return jsonFetch<{ userId: string; removed: true }>(
    `/api/courses/${encodeURIComponent(courseId)}/roster/${userId}`,
    { method: "DELETE" },
  );
}

// ─── join codes (v0.6 §4) ──────────────────────────────────────────────────

export interface JoinCode {
  code: string;
  emailDomain: string | null;
  expiresAt: number | null;
  maxUses: number | null;
  uses: number;
  createdAt: number;
  revokedAt: number | null;
}

export function listJoinCodes(courseId: string) {
  return jsonFetch<{ codes: JoinCode[] }>(
    `/api/courses/${encodeURIComponent(courseId)}/join-codes`,
  );
}

export function createJoinCode(
  courseId: string,
  params: {
    expiresAt?: number | null;
    maxUses?: number | null;
  },
) {
  return jsonFetch<JoinCode>(
    `/api/courses/${encodeURIComponent(courseId)}/join-codes`,
    { method: "POST", body: JSON.stringify(params) },
  );
}

export async function revokeJoinCode(
  courseId: string,
  code: string,
): Promise<{ code: string; revokedAt: number }> {
  const res = await fetch(
    apiUrl(
      `/api/courses/${encodeURIComponent(courseId)}/join-codes/${encodeURIComponent(code)}`,
    ),
    { ...fetchInit, method: "DELETE" },
  );
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(
      (body as { error?: string }).error ?? `HTTP ${res.status}`,
    );
  }
  return res.json();
}

/** Claim a join code as the signed-in user. Returns the course just joined.
 *  Idempotent on re-use by the same user. */
export function claimJoinCode(code: string) {
  return jsonFetch<{
    courseId: string;
    role: EnrollmentRole;
    alreadyEnrolled: boolean;
  }>(`/api/join/${encodeURIComponent(code)}`, { method: "POST" });
}

/** v1.0 §6 — reveal a lazy-reveal feature tab (attendance / collections)
 *  on the course dashboard without using it first. Instructor-only. */
export function revealCourseTab(
  courseId: string,
  feature: "attendance" | "collections",
) {
  return jsonFetch<{ ok: true }>(
    `/api/courses/${encodeURIComponent(courseId)}/reveal-tab`,
    { method: "POST", body: JSON.stringify({ feature }) },
  );
}

// ─── admin console (v0.6 §5) ───────────────────────────────────────────────

export interface AdminCourse {
  id: string;
  name: string;
  createdAt: number;
  /** v1.0 §7.5 — number of enrollments in this course (any role). Lets
   *  the admin spot empty/stale courses. */
  enrollmentCount: number;
}
export interface AdminUser {
  userId: string;
  email: string;
  displayName: string | null;
  lastSeenAt: number | null;
  isAdmin: boolean;
  externalProvider: string | null;
  enrollmentCount: number;
  createdAt: number;
}
export interface AdminEntry {
  userId: string;
  email: string;
  displayName: string | null;
  lastSeenAt: number | null;
}
export interface AuditEntry {
  id: string;
  actorId: string;
  action: string;
  targetKind: string | null;
  targetId: string | null;
  payload: unknown;
  createdAt: number;
}

export function listAdminCourses() {
  return jsonFetch<{ courses: AdminCourse[] }>(`/api/admin/courses`);
}
export function createAdminCourse(name: string) {
  return jsonFetch<AdminCourse>(`/api/admin/courses`, {
    method: "POST",
    body: JSON.stringify({ name }),
  });
}
export async function deleteAdminCourse(courseId: string): Promise<void> {
  const res = await fetch(apiUrl(`/api/admin/courses/${encodeURIComponent(courseId)}`), {
    ...fetchInit,
    method: "DELETE",
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error((body as { error?: string }).error ?? `HTTP ${res.status}`);
  }
}
export function listAdmins() {
  return jsonFetch<{ admins: AdminEntry[] }>(`/api/admin/admins`);
}
export function promoteAdmin(email: string) {
  return jsonFetch<{ userId: string; email?: string; alreadyAdmin?: boolean }>(
    `/api/admin/admins`,
    { method: "POST", body: JSON.stringify({ email }) },
  );
}
export async function demoteAdmin(userId: string): Promise<void> {
  const res = await fetch(apiUrl(`/api/admin/admins/${encodeURIComponent(userId)}`), {
    ...fetchInit,
    method: "DELETE",
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error((body as { error?: string }).error ?? `HTTP ${res.status}`);
  }
}
export function listAdminUsers(limit = 100, offset = 0) {
  return jsonFetch<{ users: AdminUser[] }>(
    `/api/admin/users?limit=${limit}&offset=${offset}`,
  );
}

/** v0.7 §3.8 — per-user detail. The user themselves, every course they're
 *  enrolled in (with course name + role), and a recent audit-log slice
 *  where they appear as actor or target. Admin-only on the server. */
export interface UserDetail {
  user: {
    userId: string;
    email: string;
    displayName: string | null;
    lastSeenAt: number | null;
    createdAt: number;
    isAdmin: boolean;
    externalProvider: string | null;
  };
  enrollments: Array<{
    courseId: string;
    courseName: string;
    role: EnrollmentRole;
    joinedAt: number;
  }>;
  audit: AuditEntry[];
}
export function getAdminUser(userId: string) {
  return jsonFetch<UserDetail>(
    `/api/admin/users/${encodeURIComponent(userId)}`,
  );
}
export function listAuditLog(limit = 100) {
  return jsonFetch<{ entries: AuditEntry[] }>(
    `/api/admin/audit-log?limit=${limit}`,
  );
}

/** Re-fetch + re-index a URL source. Old vectors and snapshot are dropped. */
export async function refreshCollectionSource(
  courseId: string,
  collectionId: string,
  sourceId: string,
): Promise<{ id: string; status: CollectionSourceStatus; chunks?: number; fetchedAt?: number }> {
  return jsonFetch(
    `/api/collections/${collectionId}/sources/${sourceId}/refresh?courseId=${encodeURIComponent(courseId)}`,
    { method: "POST" },
  );
}

/** v0.7 §3.4 — remove a source from a collection. The D1 row, R2 blob, and
 *  Vectorize chunks all go; past citation rows survive with a NULL FK. */
export async function deleteCollectionSource(
  courseId: string,
  collectionId: string,
  sourceId: string,
): Promise<void> {
  const res = await fetch(
    apiUrl(
      `/api/collections/${collectionId}/sources/${sourceId}?courseId=${encodeURIComponent(courseId)}`,
    ),
    { ...fetchInit, method: "DELETE" },
  );
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error((body as { error?: string }).error ?? `HTTP ${res.status}`);
  }
}
