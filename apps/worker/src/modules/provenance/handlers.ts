// Request handlers for the provenance module.
// Slice 1: document CRUD only. Each handler does its own auth gating
// (signed-in + enrolled in the named course); the document is always
// scoped to (courseId, ownerUserId) so a student only ever sees their
// own documents.

import {
  AnthropicProvider,
  ProviderError,
  type LLMProvider,
  type Message as LLMMessage,
} from "@marginalia/providers";
import type { Env } from "../../env.js";
import type { Identity } from "../../auth.js";
import * as repo from "./repo.js";
import { buildRender, plainTextFromDoc } from "./render.js";
import {
  toAgentDTO,
  toAgentSummary,
  toConversationDTO,
  toDocumentDTO,
  toDocumentSummary,
  toMessageDTO,
  toOutboundEvent,
  type InboundEvent,
  type ProvenanceEventKind,
  type ProvenanceOrigin,
} from "./types.js";

const MAX_TITLE_CHARS = 200;
const MAX_BODY_BYTES = 1_000_000; // 1 MB of Tiptap JSON — generous for plain prose.
const MAX_EVENTS_PER_BATCH = 500;
const MAX_EVENT_TEXT_CHARS = 50_000; // a single paste / llm_insert hard cap

// ── Chat limits (slice 3) ───────────────────────────────────────────────
const MAX_AGENT_NAME = 120;
const MAX_AGENT_PROMPT = 12_000;
const MAX_USER_MESSAGE_CHARS = 8_000;
const MAX_CHAT_HISTORY_TURNS = 20;
const MAX_CHAT_HISTORY_CHARS = 32_000;
const VALID_KINDS: ReadonlySet<ProvenanceEventKind> = new Set([
  "insert",
  "delete",
  "paste",
  "llm_insert",
  "replace",
]);
const VALID_ORIGINS: ReadonlySet<ProvenanceOrigin> = new Set([
  "human",
  "llm",
  "pasted",
  "edited",
]);

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });

const error = (message: string, status: number) =>
  json({ error: message }, status);

function requireUser(identity: Identity): string | Response {
  if (!identity.userId) return error("Sign in required", 401);
  return identity.userId;
}

async function requireEnrollment(
  env: Env,
  userId: string,
  courseId: string,
): Promise<Response | null> {
  const enrollment = await env.DB
    .prepare(`SELECT 1 FROM enrollments WHERE course_id = ? AND user_id = ?`)
    .bind(courseId, userId)
    .first();
  if (!enrollment) return error("Not enrolled in this course", 403);
  return null;
}

/**
 * Load the caller's role in this course, or return a 403 Response if not
 * enrolled. Used by handlers that need to gate instructor-only actions.
 */
async function loadEnrollment(
  env: Env,
  userId: string,
  courseId: string,
): Promise<{ role: string } | Response> {
  const enrollment = await env.DB
    .prepare(`SELECT role FROM enrollments WHERE course_id = ? AND user_id = ?`)
    .bind(courseId, userId)
    .first<{ role: string }>();
  if (!enrollment) return error("Not enrolled in this course", 403);
  return enrollment;
}

export async function listDocumentsRoute(
  env: Env,
  identity: Identity,
  url: URL,
): Promise<Response> {
  const userId = requireUser(identity);
  if (userId instanceof Response) return userId;
  const courseId = url.searchParams.get("courseId");
  if (!courseId) return error("courseId is required", 400);
  const enrollmentError = await requireEnrollment(env, userId, courseId);
  if (enrollmentError) return enrollmentError;
  const rows = await repo.listDocuments(env.DB, courseId, userId);
  return json({ documents: rows.map(toDocumentSummary) });
}

export async function getDocumentRoute(
  env: Env,
  identity: Identity,
  url: URL,
  id: string,
): Promise<Response> {
  const userId = requireUser(identity);
  if (userId instanceof Response) return userId;
  const courseId = url.searchParams.get("courseId");
  if (!courseId) return error("courseId is required", 400);
  const enrollmentError = await requireEnrollment(env, userId, courseId);
  if (enrollmentError) return enrollmentError;
  const row = await repo.getDocument(env.DB, courseId, userId, id);
  if (!row) return error("Document not found", 404);
  return json({ document: toDocumentDTO(row) });
}

export async function createDocumentRoute(
  req: Request,
  env: Env,
  identity: Identity,
): Promise<Response> {
  const userId = requireUser(identity);
  if (userId instanceof Response) return userId;
  const body = (await req.json().catch(() => null)) as {
    courseId?: string;
    title?: string;
  } | null;
  if (!body?.courseId) return error("courseId required", 400);
  const title = (body.title ?? "Untitled").trim().slice(0, MAX_TITLE_CHARS) || "Untitled";
  const enrollmentError = await requireEnrollment(env, userId, body.courseId);
  if (enrollmentError) return enrollmentError;
  const row = await repo.createDocument(env.DB, {
    courseId: body.courseId,
    ownerUserId: userId,
    title,
  });
  return json({ document: toDocumentDTO(row) }, 201);
}

export async function updateDocumentRoute(
  req: Request,
  env: Env,
  identity: Identity,
  id: string,
): Promise<Response> {
  const userId = requireUser(identity);
  if (userId instanceof Response) return userId;
  const body = (await req.json().catch(() => null)) as {
    courseId?: string;
    title?: string;
    bodyJson?: unknown;
    wordCount?: number;
    charCount?: number;
  } | null;
  if (!body?.courseId) return error("courseId required", 400);
  const enrollmentError = await requireEnrollment(env, userId, body.courseId);
  if (enrollmentError) return enrollmentError;

  const patch: {
    title?: string;
    bodyJson?: string;
    wordCount?: number;
    charCount?: number;
  } = {};

  if (body.title !== undefined) {
    patch.title = body.title.trim().slice(0, MAX_TITLE_CHARS) || "Untitled";
  }
  if (body.bodyJson !== undefined) {
    const serialised = JSON.stringify(body.bodyJson);
    if (serialised.length > MAX_BODY_BYTES) {
      return error("Document body too large", 413);
    }
    patch.bodyJson = serialised;
  }
  if (typeof body.wordCount === "number" && body.wordCount >= 0) {
    patch.wordCount = Math.floor(body.wordCount);
  }
  if (typeof body.charCount === "number" && body.charCount >= 0) {
    patch.charCount = Math.floor(body.charCount);
  }

  const row = await repo.updateDocument(env.DB, body.courseId, userId, id, patch);
  if (!row) return error("Document not found", 404);
  return json({ document: toDocumentDTO(row) });
}

export async function appendEventsRoute(
  req: Request,
  env: Env,
  identity: Identity,
  documentId: string,
): Promise<Response> {
  const userId = requireUser(identity);
  if (userId instanceof Response) return userId;
  const body = (await req.json().catch(() => null)) as {
    courseId?: string;
    events?: unknown;
  } | null;
  if (!body?.courseId) return error("courseId required", 400);
  if (!Array.isArray(body.events)) return error("events array required", 400);
  if (body.events.length > MAX_EVENTS_PER_BATCH) {
    return error(`Batch exceeds ${MAX_EVENTS_PER_BATCH} events`, 413);
  }
  const enrollmentError = await requireEnrollment(env, userId, body.courseId);
  if (enrollmentError) return enrollmentError;
  const doc = await repo.getDocument(env.DB, body.courseId, userId, documentId);
  if (!doc) return error("Document not found", 404);

  const events: InboundEvent[] = [];
  let lastSeq = -Infinity;
  for (let i = 0; i < body.events.length; i++) {
    const raw = body.events[i] as Record<string, unknown> | null;
    if (!raw || typeof raw !== "object") {
      return error(`events[${i}]: invalid object`, 400);
    }
    const clientSeq = raw.clientSeq;
    if (typeof clientSeq !== "number" || !Number.isInteger(clientSeq) || clientSeq <= 0) {
      return error(`events[${i}]: clientSeq must be a positive integer`, 400);
    }
    if (clientSeq <= lastSeq) {
      return error(`events[${i}]: clientSeq must be strictly increasing`, 400);
    }
    lastSeq = clientSeq;
    const kind = raw.kind;
    if (typeof kind !== "string" || !VALID_KINDS.has(kind as ProvenanceEventKind)) {
      return error(`events[${i}]: invalid kind`, 400);
    }
    const offset = raw.offset;
    const length = raw.length;
    if (typeof offset !== "number" || !Number.isInteger(offset) || offset < 0) {
      return error(`events[${i}]: offset must be a non-negative integer`, 400);
    }
    if (typeof length !== "number" || !Number.isInteger(length) || length < 0) {
      return error(`events[${i}]: length must be a non-negative integer`, 400);
    }
    let text: string | undefined;
    if (raw.text !== undefined && raw.text !== null) {
      if (typeof raw.text !== "string") {
        return error(`events[${i}]: text must be a string`, 400);
      }
      if (raw.text.length > MAX_EVENT_TEXT_CHARS) {
        return error(`events[${i}]: text exceeds ${MAX_EVENT_TEXT_CHARS} chars`, 413);
      }
      text = raw.text;
    }
    let origin: ProvenanceOrigin | undefined;
    if (raw.origin !== undefined && raw.origin !== null) {
      if (typeof raw.origin !== "string" || !VALID_ORIGINS.has(raw.origin as ProvenanceOrigin)) {
        return error(`events[${i}]: invalid origin`, 400);
      }
      origin = raw.origin as ProvenanceOrigin;
    }
    let sourceMessageId: string | undefined;
    if (raw.sourceMessageId !== undefined && raw.sourceMessageId !== null) {
      if (typeof raw.sourceMessageId !== "string") {
        return error(`events[${i}]: sourceMessageId must be a string`, 400);
      }
      sourceMessageId = raw.sourceMessageId;
    }
    let timingBlob: string | undefined;
    if (raw.timingBlob !== undefined && raw.timingBlob !== null) {
      if (typeof raw.timingBlob !== "string") {
        return error(`events[${i}]: timingBlob must be a string`, 400);
      }
      if (raw.timingBlob.length > MAX_EVENT_TEXT_CHARS) {
        return error(`events[${i}]: timingBlob too large`, 413);
      }
      timingBlob = raw.timingBlob;
    }
    events.push({
      clientSeq,
      kind: kind as ProvenanceEventKind,
      offset,
      length,
      text,
      origin,
      sourceMessageId,
      timingBlob,
    });
  }

  const result = await repo.appendEvents(env.DB, {
    documentId,
    courseId: body.courseId,
    userId,
    events,
  });
  return json(result);
}

export async function listEventsRoute(
  env: Env,
  identity: Identity,
  url: URL,
  documentId: string,
): Promise<Response> {
  const userId = requireUser(identity);
  if (userId instanceof Response) return userId;
  const courseId = url.searchParams.get("courseId");
  if (!courseId) return error("courseId is required", 400);
  const enrollmentError = await requireEnrollment(env, userId, courseId);
  if (enrollmentError) return enrollmentError;
  // Owner-only read at slice 2. Instructor scrub-view is slice 6.
  const doc = await repo.getDocument(env.DB, courseId, userId, documentId);
  if (!doc) return error("Document not found", 404);

  const afterSeqRaw = url.searchParams.get("afterSeq");
  const limitRaw = url.searchParams.get("limit");
  const afterSeq = afterSeqRaw ? Number(afterSeqRaw) : undefined;
  const limit = limitRaw ? Number(limitRaw) : undefined;
  if (afterSeqRaw && (!Number.isFinite(afterSeq) || (afterSeq as number) < 0)) {
    return error("afterSeq must be a non-negative number", 400);
  }
  if (limitRaw && (!Number.isFinite(limit) || (limit as number) <= 0)) {
    return error("limit must be a positive number", 400);
  }

  const rows = await repo.listEvents(env.DB, {
    documentId,
    afterSeq,
    limit,
  });
  return json({ events: rows.map(toOutboundEvent) });
}

export async function deleteDocumentRoute(
  env: Env,
  identity: Identity,
  url: URL,
  id: string,
): Promise<Response> {
  const userId = requireUser(identity);
  if (userId instanceof Response) return userId;
  const courseId = url.searchParams.get("courseId");
  if (!courseId) return error("courseId is required", 400);
  const enrollmentError = await requireEnrollment(env, userId, courseId);
  if (enrollmentError) return enrollmentError;
  const ok = await repo.deleteDocument(env.DB, courseId, userId, id);
  if (!ok) return error("Document not found", 404);
  return json({ ok: true });
}

// ─── Course settings ────────────────────────────────────────────────────

/** GET /settings?courseId= — read provenance display settings for a course.
 *  Any enrolled user (the editor needs hideProvenanceMarks to decide
 *  whether to color the surface for a student). */
export async function getSettingsRoute(
  env: Env,
  identity: Identity,
  url: URL,
): Promise<Response> {
  const userId = requireUser(identity);
  if (userId instanceof Response) return userId;
  const courseId = url.searchParams.get("courseId");
  if (!courseId) return error("courseId is required", 400);
  const enrollmentError = await requireEnrollment(env, userId, courseId);
  if (enrollmentError) return enrollmentError;
  const row = await env.DB
    .prepare(
      `SELECT COALESCE(hide_provenance_marks, 0) AS hide_provenance_marks
       FROM course_settings WHERE course_id = ?`,
    )
    .bind(courseId)
    .first<{ hide_provenance_marks: number }>();
  return json({ hideProvenanceMarks: (row?.hide_provenance_marks ?? 0) === 1 });
}

/** PATCH /settings — instructor-only toggle of provenance display settings. */
export async function updateSettingsRoute(
  req: Request,
  env: Env,
  identity: Identity,
): Promise<Response> {
  const userId = requireUser(identity);
  if (userId instanceof Response) return userId;
  const body = (await req.json().catch(() => null)) as {
    courseId?: string;
    hideProvenanceMarks?: boolean;
  } | null;
  if (!body?.courseId) return error("courseId required", 400);
  if (typeof body.hideProvenanceMarks !== "boolean") {
    return error("hideProvenanceMarks (boolean) required", 400);
  }
  const enrollment = await loadEnrollment(env, userId, body.courseId);
  if (enrollment instanceof Response) return enrollment;
  if (enrollment.role !== "instructor") {
    return error("Only instructors can change this setting", 403);
  }
  await repo.setHideProvenanceMarks(env.DB, body.courseId, body.hideProvenanceMarks);
  return json({ hideProvenanceMarks: body.hideProvenanceMarks });
}

// ─── Agents ─────────────────────────────────────────────────────────────

export async function listAgentsRoute(
  env: Env,
  identity: Identity,
  url: URL,
): Promise<Response> {
  const userId = requireUser(identity);
  if (userId instanceof Response) return userId;
  const courseId = url.searchParams.get("courseId");
  if (!courseId) return error("courseId is required", 400);
  const enrollmentError = await requireEnrollment(env, userId, courseId);
  if (enrollmentError) return enrollmentError;
  const rows = await repo.listAgentsForUser(env.DB, courseId, userId);
  return json({ agents: rows.map((r) => toAgentSummary(r, userId)) });
}

export async function getAgentRoute(
  env: Env,
  identity: Identity,
  url: URL,
  agentId: string,
): Promise<Response> {
  const userId = requireUser(identity);
  if (userId instanceof Response) return userId;
  const courseId = url.searchParams.get("courseId");
  if (!courseId) return error("courseId is required", 400);
  const enrollmentError = await requireEnrollment(env, userId, courseId);
  if (enrollmentError) return enrollmentError;
  const row = await repo.getAgent(env.DB, courseId, agentId);
  if (!row) return error("Agent not found", 404);
  // A student can only see course defaults + their own agents.
  if (row.owner_user_id !== null && row.owner_user_id !== userId) {
    return error("Agent not found", 404);
  }
  return json({ agent: toAgentDTO(row) });
}

export async function createAgentRoute(
  req: Request,
  env: Env,
  identity: Identity,
): Promise<Response> {
  const userId = requireUser(identity);
  if (userId instanceof Response) return userId;
  const body = (await req.json().catch(() => null)) as {
    courseId?: string;
    name?: string;
    systemPrompt?: string;
    /** Set true to create a course-default agent (instructor only). */
    courseDefault?: boolean;
  } | null;
  if (!body?.courseId || !body.name || !body.systemPrompt) {
    return error("courseId, name, systemPrompt required", 400);
  }
  const name = body.name.trim().slice(0, MAX_AGENT_NAME);
  const systemPrompt = body.systemPrompt.trim();
  if (!name) return error("name cannot be empty", 400);
  if (!systemPrompt) return error("systemPrompt cannot be empty", 400);
  if (systemPrompt.length > MAX_AGENT_PROMPT) {
    return error(`systemPrompt exceeds ${MAX_AGENT_PROMPT} chars`, 413);
  }
  const enrollment = await loadEnrollment(env, userId, body.courseId);
  if (enrollment instanceof Response) return enrollment;
  const wantsDefault = body.courseDefault === true;
  if (wantsDefault && enrollment.role !== "instructor") {
    return error("Only instructors can create course-default agents", 403);
  }
  const row = await repo.createAgent(env.DB, {
    courseId: body.courseId,
    ownerUserId: wantsDefault ? null : userId,
    name,
    systemPrompt,
  });
  return json({ agent: toAgentDTO(row) }, 201);
}

export async function updateAgentRoute(
  req: Request,
  env: Env,
  identity: Identity,
  agentId: string,
): Promise<Response> {
  const userId = requireUser(identity);
  if (userId instanceof Response) return userId;
  const body = (await req.json().catch(() => null)) as {
    courseId?: string;
    name?: string;
    systemPrompt?: string;
  } | null;
  if (!body?.courseId) return error("courseId required", 400);
  const enrollment = await loadEnrollment(env, userId, body.courseId);
  if (enrollment instanceof Response) return enrollment;
  const existing = await repo.getAgent(env.DB, body.courseId, agentId);
  if (!existing) return error("Agent not found", 404);
  // Course defaults: instructor only. Personal: owner only.
  if (existing.owner_user_id === null) {
    if (enrollment.role !== "instructor") return error("Instructor only", 403);
  } else if (existing.owner_user_id !== userId) {
    return error("Agent not found", 404);
  }
  const patch: { name?: string; systemPrompt?: string } = {};
  if (body.name !== undefined) {
    const trimmed = body.name.trim().slice(0, MAX_AGENT_NAME);
    if (!trimmed) return error("name cannot be empty", 400);
    patch.name = trimmed;
  }
  if (body.systemPrompt !== undefined) {
    const trimmed = body.systemPrompt.trim();
    if (!trimmed) return error("systemPrompt cannot be empty", 400);
    if (trimmed.length > MAX_AGENT_PROMPT) {
      return error(`systemPrompt exceeds ${MAX_AGENT_PROMPT} chars`, 413);
    }
    patch.systemPrompt = trimmed;
  }
  const updated = await repo.updateAgent(env.DB, body.courseId, agentId, patch);
  if (!updated) return error("Agent not found", 404);
  return json({ agent: toAgentDTO(updated) });
}

export async function deleteAgentRoute(
  env: Env,
  identity: Identity,
  url: URL,
  agentId: string,
): Promise<Response> {
  const userId = requireUser(identity);
  if (userId instanceof Response) return userId;
  const courseId = url.searchParams.get("courseId");
  if (!courseId) return error("courseId is required", 400);
  const enrollment = await loadEnrollment(env, userId, courseId);
  if (enrollment instanceof Response) return enrollment;
  const existing = await repo.getAgent(env.DB, courseId, agentId);
  if (!existing) return error("Agent not found", 404);
  if (existing.owner_user_id === null) {
    if (enrollment.role !== "instructor") return error("Instructor only", 403);
  } else if (existing.owner_user_id !== userId) {
    return error("Agent not found", 404);
  }
  const ok = await repo.deleteAgent(env.DB, courseId, agentId);
  if (!ok) return error("Agent not found", 404);
  return json({ ok: true });
}

// ─── Conversations ──────────────────────────────────────────────────────

export async function listConversationsRoute(
  env: Env,
  identity: Identity,
  url: URL,
  documentId: string,
): Promise<Response> {
  const userId = requireUser(identity);
  if (userId instanceof Response) return userId;
  const courseId = url.searchParams.get("courseId");
  if (!courseId) return error("courseId is required", 400);
  const enrollmentError = await requireEnrollment(env, userId, courseId);
  if (enrollmentError) return enrollmentError;
  const doc = await repo.getDocument(env.DB, courseId, userId, documentId);
  if (!doc) return error("Document not found", 404);
  const rows = await repo.listConversationsForDocument(env.DB, documentId, userId);
  return json({ conversations: rows.map(toConversationDTO) });
}

export async function createConversationRoute(
  req: Request,
  env: Env,
  identity: Identity,
  documentId: string,
): Promise<Response> {
  const userId = requireUser(identity);
  if (userId instanceof Response) return userId;
  const body = (await req.json().catch(() => null)) as {
    courseId?: string;
    agentId?: string;
  } | null;
  if (!body?.courseId || !body.agentId) {
    return error("courseId, agentId required", 400);
  }
  const enrollmentError = await requireEnrollment(env, userId, body.courseId);
  if (enrollmentError) return enrollmentError;
  const doc = await repo.getDocument(env.DB, body.courseId, userId, documentId);
  if (!doc) return error("Document not found", 404);
  const agent = await repo.getAgent(env.DB, body.courseId, body.agentId);
  if (!agent) return error("Agent not found", 404);
  if (agent.owner_user_id !== null && agent.owner_user_id !== userId) {
    return error("Agent not found", 404);
  }
  const conv = await repo.createConversation(env.DB, {
    documentId,
    courseId: body.courseId,
    userId,
    agent,
  });
  return json({ conversation: toConversationDTO(conv) }, 201);
}

export async function deleteConversationRoute(
  env: Env,
  identity: Identity,
  url: URL,
  conversationId: string,
): Promise<Response> {
  const userId = requireUser(identity);
  if (userId instanceof Response) return userId;
  const courseId = url.searchParams.get("courseId");
  if (!courseId) return error("courseId is required", 400);
  const enrollmentError = await requireEnrollment(env, userId, courseId);
  if (enrollmentError) return enrollmentError;
  const ok = await repo.deleteConversation(env.DB, userId, conversationId);
  if (!ok) return error("Conversation not found", 404);
  return json({ ok: true });
}

export async function listMessagesRoute(
  env: Env,
  identity: Identity,
  url: URL,
  conversationId: string,
): Promise<Response> {
  const userId = requireUser(identity);
  if (userId instanceof Response) return userId;
  const courseId = url.searchParams.get("courseId");
  if (!courseId) return error("courseId is required", 400);
  const enrollmentError = await requireEnrollment(env, userId, courseId);
  if (enrollmentError) return enrollmentError;
  const conv = await repo.getConversation(env.DB, userId, conversationId);
  if (!conv) return error("Conversation not found", 404);
  const rows = await repo.listMessages(env.DB, conversationId);
  return json({ messages: rows.map(toMessageDTO) });
}

// ─── Chat turn (SSE stream) ─────────────────────────────────────────────

/**
 * Stream a chat turn: read history, call the configured LLM provider,
 * emit `delta` events as tokens arrive, commit user+assistant turns
 * atomically on success, emit `done` with the assistant message id.
 * Errors land on the `error` event before the stream closes.
 *
 * Wire format mirrors the existing /api/conversations/:id/messages
 * endpoint so the client SSE reader is the same shape.
 */
export async function sendMessageRoute(
  req: Request,
  env: Env,
  identity: Identity,
  conversationId: string,
): Promise<Response> {
  const userId = requireUser(identity);
  if (userId instanceof Response) return userId;
  const body = (await req.json().catch(() => null)) as {
    courseId?: string;
    content?: string;
  } | null;
  if (!body?.courseId || !body.content) {
    return error("courseId, content required", 400);
  }
  const content = body.content.trim();
  if (!content) return error("content cannot be empty", 400);
  if (content.length > MAX_USER_MESSAGE_CHARS) {
    return error(`message exceeds ${MAX_USER_MESSAGE_CHARS} chars`, 413);
  }
  const enrollmentError = await requireEnrollment(env, userId, body.courseId);
  if (enrollmentError) return enrollmentError;
  const conv = await repo.getConversation(env.DB, userId, conversationId);
  if (!conv) return error("Conversation not found", 404);
  if (conv.course_id !== body.courseId) {
    return error("Conversation not in this course", 403);
  }

  const history = await repo.listMessages(env.DB, conversationId);
  const llmMessages = buildBoundedHistory(history, content);

  // BYO key (slice 5). A student may supply their own provider key via the
  // X-Provenance-LLM-Key header so the institution doesn't pay for their
  // usage. The key is used for THIS request only — never written to D1, R2,
  // KV, or any log line. If absent, fall back to the institution key.
  // We don't echo the key in any error, and we don't `console.log` the
  // request object anywhere in this path.
  const byoKey = readByoKey(req);
  const apiKey = byoKey ?? env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return error(
      "No LLM key available. Add your own key, or ask your instructor to configure one.",
      400,
    );
  }

  const provider: LLMProvider = new AnthropicProvider({
    apiKey,
    model: env.DEFAULT_MODEL,
  });

  const seedTitleIfMissing = conv.title === null;
  const encoder = new TextEncoder();
  const abort = new AbortController();
  let raw = "";
  let committed = false;

  const stream = new ReadableStream({
    async start(controller) {
      try {
        controller.enqueue(
          encoder.encode(
            sse("started", { conversationId: conv.id, agent: conv.agent_name_snapshot }),
          ),
        );
        for await (const chunk of provider.stream(llmMessages, {
          system: { instructions: conv.agent_prompt_snapshot },
          signal: abort.signal,
        })) {
          if (chunk.delta) {
            raw += chunk.delta;
            controller.enqueue(encoder.encode(sse("delta", { text: chunk.delta })));
          }
        }
        const reply = raw.trim();
        const { assistantMessageId } = await repo.commitChatTurn(env.DB, {
          conversationId: conv.id,
          userContent: content,
          assistantContent: reply,
          seedTitleIfMissing,
        });
        committed = true;
        controller.enqueue(
          encoder.encode(
            sse("done", {
              assistantMessageId,
              // Slice 4 reads this to wire the "Insert at cursor" button.
              title: seedTitleIfMissing ? excerpt(content) : conv.title,
            }),
          ),
        );
        controller.close();
      } catch (err) {
        const message =
          err instanceof ProviderError ? err.message : "stream failed";
        controller.enqueue(encoder.encode(sse("error", { message })));
        controller.close();
      }
    },
    async cancel() {
      abort.abort();
      if (!committed) {
        // Nothing to clean up — we hadn't committed any rows yet.
      }
    },
  });

  return new Response(stream, {
    headers: {
      "content-type": "text/event-stream",
      "cache-control": "no-cache",
    },
  });
}

// ─── Helpers ────────────────────────────────────────────────────────────

/**
 * Read the optional student-supplied LLM key from the request header.
 * Returns null when absent or obviously malformed. The key is never
 * persisted or logged — see the security note in sendMessageRoute.
 *
 * A light sanity bound (length + no control chars) protects against a
 * header that would make the upstream provider request malformed; we
 * intentionally do NOT validate the key's provider-specific shape here
 * (that's the provider's job, and it differs per provider).
 */
function readByoKey(req: Request): string | null {
  const raw = req.headers.get("x-provenance-llm-key");
  if (!raw) return null;
  const key = raw.trim();
  if (key.length === 0 || key.length > 400) return null;
  // Reject anything with control characters / whitespace that can't be a key.
  if (/[\s\x00-\x1f]/.test(key)) return null;
  return key;
}

function sse(event: string, data: unknown): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

/**
 * Trim chat history to the trailing MAX_CHAT_HISTORY_TURNS messages then
 * further drop oldest until total chars fit under MAX_CHAT_HISTORY_CHARS.
 * Mirrors the tutoring-side bounds so input-token billing stays predictable.
 */
function buildBoundedHistory(
  rows: { role: "user" | "assistant"; content: string }[],
  currentUserMessage: string,
): LLMMessage[] {
  let trimmed = rows.slice(-MAX_CHAT_HISTORY_TURNS);
  let totalChars = trimmed.reduce((s, r) => s + r.content.length, 0)
    + currentUserMessage.length;
  while (trimmed.length > 0 && totalChars > MAX_CHAT_HISTORY_CHARS) {
    totalChars -= trimmed[0]!.content.length;
    trimmed = trimmed.slice(1);
  }
  return [
    ...trimmed.map((r) => ({ role: r.role, content: r.content }) as LLMMessage),
    { role: "user", content: currentUserMessage },
  ];
}

function excerpt(s: string): string {
  const single = s.replace(/\s+/g, " ").trim();
  return single.length <= 60 ? single : single.slice(0, 60) + "…";
}

// ─── Submissions (slice 6) ──────────────────────────────────────────────

/** POST /documents/:id/submissions — mint a share token. Owner-only.
 *  Replays the doc's edit_events into a frozen provenance render and
 *  stores it; the public viewer reads that render with no auth. */
export async function createSubmissionRoute(
  req: Request,
  env: Env,
  identity: Identity,
  documentId: string,
): Promise<Response> {
  const userId = requireUser(identity);
  if (userId instanceof Response) return userId;
  const body = (await req.json().catch(() => null)) as { courseId?: string } | null;
  if (!body?.courseId) return error("courseId required", 400);
  const enrollmentError = await requireEnrollment(env, userId, body.courseId);
  if (enrollmentError) return enrollmentError;
  const doc = await repo.getDocument(env.DB, body.courseId, userId, documentId);
  if (!doc) return error("Document not found", 404);

  // Build the frozen render from the authoritative event log + the doc's
  // current text. Independent of any student-facing coloring.
  const events = await repo.allEventsForDocument(env.DB, documentId);
  let text = "";
  try {
    text = plainTextFromDoc(JSON.parse(doc.body_json));
  } catch {
    text = "";
  }
  const render = buildRender(text, events);
  const snapshotEventSeq = events.length > 0 ? events[events.length - 1]!.client_seq : 0;

  const row = await repo.createSubmission(env.DB, {
    documentId,
    courseId: body.courseId,
    userId,
    titleSnapshot: doc.title,
    renderJson: JSON.stringify(render),
    snapshotEventSeq,
  });
  return json({ token: row.token, createdAt: row.created_at }, 201);
}

/** GET /documents/:id/submissions — list this document's share tokens. */
export async function listSubmissionsRoute(
  env: Env,
  identity: Identity,
  url: URL,
  documentId: string,
): Promise<Response> {
  const userId = requireUser(identity);
  if (userId instanceof Response) return userId;
  const courseId = url.searchParams.get("courseId");
  if (!courseId) return error("courseId is required", 400);
  const enrollmentError = await requireEnrollment(env, userId, courseId);
  if (enrollmentError) return enrollmentError;
  const doc = await repo.getDocument(env.DB, courseId, userId, documentId);
  if (!doc) return error("Document not found", 404);
  const rows = await repo.listSubmissionsForDocument(env.DB, documentId, userId);
  return json({
    submissions: rows.map((r) => ({
      token: r.token,
      createdAt: r.created_at,
      revokedAt: r.revoked_at,
    })),
  });
}

/** DELETE /submissions/:token — revoke. Owner-only. */
export async function revokeSubmissionRoute(
  env: Env,
  identity: Identity,
  token: string,
): Promise<Response> {
  const userId = requireUser(identity);
  if (userId instanceof Response) return userId;
  const ok = await repo.revokeSubmission(env.DB, token, userId);
  if (!ok) return error("Submission not found", 404);
  return json({ ok: true });
}

// ── Public (unauthenticated) ────────────────────────────────────────────

/** GET /public/submissions/:token — the frozen colored render. No auth. */
export async function publicSubmissionRoute(
  env: Env,
  token: string,
): Promise<Response> {
  const row = await repo.getActiveSubmission(env.DB, token);
  if (!row) return error("This link is no longer available", 404);
  let render: unknown = { text: "", runs: [] };
  try {
    render = JSON.parse(row.render_json);
  } catch {
    /* keep the empty render */
  }
  return json({
    title: row.title_snapshot,
    createdAt: row.created_at,
    render,
  });
}

/** GET /public/submissions/:token/conversations — light drill-down into
 *  the chat history behind a shared document. No auth. */
export async function publicSubmissionConversationsRoute(
  env: Env,
  token: string,
): Promise<Response> {
  const row = await repo.getActiveSubmission(env.DB, token);
  if (!row) return error("This link is no longer available", 404);
  const convs = await repo.listConversationsForDocumentPublic(env.DB, row.document_id);
  const out = [];
  for (const c of convs) {
    const messages = await repo.listMessages(env.DB, c.id);
    out.push({
      id: c.id,
      agentName: c.agent_name_snapshot,
      title: c.title,
      messages: messages.map((m) => ({ role: m.role, content: m.content })),
    });
  }
  return json({ conversations: out });
}
