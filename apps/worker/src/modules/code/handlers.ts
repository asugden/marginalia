// Request handlers for the code module.
//
// The server never runs student code. Python executes in the student's
// browser; this module stores notebooks, the AI chat conversation, and
// submitted snapshots, and proxies chat turns through the LLMProvider.
//
// Two gates apply throughout:
//   1. The course must have the module turned on (course_settings.code_enabled,
//      default off). Instructors pass regardless, so they can author before
//      opening it to the class.
//   2. The AI chat is per assignment (code_assignments.ai_enabled, default
//      off). It is enforced here on every turn, not just hidden in the UI.
//
// Origins (typed / pasted / from the AI chat / provided) are recorded only for
// assignments in 'submit' mode, and rendered with the writing tool's shared
// provenance code when a notebook is submitted. See render.ts.

import { ProviderError, type Message as LLMMessage } from "@marginalia/providers";
import { llmConfigured, provenanceDefaultModel, providerFor } from "../../llm.js";
import type { Env } from "../../env.js";
import type { Identity } from "../../auth.js";
import {
  ensureItem as ensureCourseItem,
  removeItemForPayload as removeCourseItem,
  renameItemForPayload as renameCourseItem,
  setArchivedForPayload as setCourseItemArchived,
  setDueForPayload as setCourseItemDue,
} from "../course-items/sync.js";
import { findLibraryVoice, LIBRARY } from "@marginalia/voices";
import * as coreRepo from "../../repo.js";
import * as repo from "./repo.js";
import {
  MAX_NOTEBOOK_BYTES,
  DEFAULT_VOICE_ID,
  buildNotebookContext,
  buildChatInstructions,
  novelReplyText,
  promptHash,
  sanitizeContent,
} from "./notebook.js";
import { buildSubmissionRender, parseBaseline } from "./render.js";
import {
  isLate,
  parseContent,
  toAssignmentDTO,
  toMessageDTO,
  toNotebookSummary,
  type CodeAssignmentRow,
  type CodeMessageDTO,
  type AssignmentMode,
  type CodeNotebookRow,
  type CodeVoiceRef,
  parseVoiceRef,
  type NotebookContent,
  type NotebookDTO,
  type RosterStudentDTO,
  type SubmissionRender,
} from "./types.js";

const MAX_TITLE = 200;
const MAX_INSTRUCTIONS = 20_000;
const MAX_AI_PROMPT = 8_000;
const MAX_USER_MESSAGE = 8_000;
const MAX_HISTORY_TURNS = 20;
const MAX_HISTORY_CHARS = 32_000;
const MAX_CHAT_TOKENS = 1_200;
const MAX_EVENTS_PER_BATCH = 500;
const MAX_EVENT_TEXT = 50_000;
const EVENT_KINDS: ReadonlySet<string> = new Set(["insert", "delete", "paste", "llm_insert", "move"]);
const EVENT_ORIGINS: ReadonlySet<string> = new Set(["human", "llm", "pasted", "edited", "provided"]);
const CELL_ID = /^[A-Za-z0-9_-]{1,64}$/;

/**
 * Validate a voice from the assignment editor. A library voice must exist; an
 * instructor's own voice must be one they can use (owned or shared with them),
 * the same rule the agent editor applies. Returns the JSON to store, null to
 * clear back to the default, undefined when not supplied, or an error.
 */
async function parseVoice(
  env: Env,
  raw: unknown,
  userId: string,
): Promise<string | null | undefined | Response> {
  if (raw === undefined) return undefined;
  if (raw === null) return null;
  const v = raw as { kind?: unknown; id?: unknown; voiceId?: unknown };
  if (v.kind === "library" && typeof v.id === "string") {
    if (!LIBRARY.some((l) => l.id === v.id)) return error(`Unknown voice: ${v.id}`, 400);
    return JSON.stringify({ kind: "library", id: v.id } satisfies CodeVoiceRef);
  }
  if (v.kind === "custom-ref" && typeof v.voiceId === "string") {
    const usable = await coreRepo.findVoiceUsableByUser(env.DB, v.voiceId, userId);
    if (!usable) return error("Voice not found, or not shared with you", 400);
    return JSON.stringify({ kind: "custom-ref", voiceId: v.voiceId } satisfies CodeVoiceRef);
  }
  return error("voice must be a library voice or one of your own", 400);
}

/**
 * The chat's voice text for an assignment, resolved on every turn. A voice
 * that has since been deleted (or a library id that no longer exists) falls
 * back to the default library voice rather than failing the student's turn.
 */
async function voiceFragment(env: Env, assignment: CodeAssignmentRow): Promise<string> {
  const ref = parseVoiceRef(assignment.voice_json);
  if (ref?.kind === "custom-ref") {
    const row = await coreRepo.findVoiceById(env.DB, ref.voiceId);
    if (row) return row.system_prompt_fragment;
  } else if (ref?.kind === "library") {
    const lib = findLibraryVoice(ref.id);
    if (lib) return lib.systemPromptFragment;
  }
  return findLibraryVoice(DEFAULT_VOICE_ID)?.systemPromptFragment ?? "";
}

function parseMode(v: unknown): AssignmentMode | undefined | "invalid" {
  if (v === undefined) return undefined;
  return v === "submit" || v === "practice" ? v : "invalid";
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
const error = (message: string, status: number, code?: string) =>
  json(code ? { error: message, code } : { error: message }, status);

// ── gates ───────────────────────────────────────────────────────────────

interface Caller {
  userId: string;
  role: string;
  instructor: boolean;
}

/**
 * Resolve the caller for a course: signed in, enrolled, and — unless an
 * instructor — in a course that has the module on. An unenabled course
 * answers 404 with a stable code rather than 403, so the client can say
 * "not turned on" instead of "forbidden".
 */
async function resolveCaller(
  env: Env,
  identity: Identity,
  courseId: string | null | undefined,
): Promise<Caller | Response> {
  if (!identity.userId) return error("Sign in required", 401);
  if (!courseId) return error("courseId is required", 400);
  const role = await repo.enrollmentRole(env.DB, courseId, identity.userId);
  if (!role) return error("Not enrolled in this course", 403);
  const instructor = role === "instructor";
  if (!instructor && !(await repo.codeEnabled(env.DB, courseId))) {
    return error("Code is not turned on for this course", 404, "code_disabled");
  }
  return { userId: identity.userId, role, instructor };
}

async function resolveInstructor(
  env: Env,
  identity: Identity,
  courseId: string | null | undefined,
): Promise<Caller | Response> {
  const caller = await resolveCaller(env, identity, courseId);
  if (caller instanceof Response) return caller;
  if (!caller.instructor) return error("Instructors only", 403);
  return caller;
}

// ── parsing ─────────────────────────────────────────────────────────────

function cleanTitle(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim().slice(0, MAX_TITLE);
  return t || null;
}

/** undefined = not supplied, null = clear, number = set. */
function parseDue(v: unknown): number | null | undefined | "invalid" {
  if (v === undefined) return undefined;
  if (v === null) return null;
  if (typeof v === "number" && Number.isFinite(v) && v > 0) return Math.floor(v);
  return "invalid";
}

function serializeContent(raw: unknown): string | Response {
  const clean = sanitizeContent(raw);
  if (typeof clean === "string") return error(clean, 400);
  const s = JSON.stringify(clean);
  if (new TextEncoder().encode(s).length > MAX_NOTEBOOK_BYTES) {
    return error(
      "This notebook is too large to save. Clear some outputs (large figures take the most room) and try again.",
      413,
      "notebook_too_large",
    );
  }
  return s;
}

// ── assignments ─────────────────────────────────────────────────────────

export async function listAssignmentsRoute(
  env: Env,
  identity: Identity,
  url: URL,
): Promise<Response> {
  const courseId = url.searchParams.get("courseId");
  const caller = await resolveCaller(env, identity, courseId);
  if (caller instanceof Response) return caller;
  const includeArchived = caller.instructor && url.searchParams.get("includeArchived") === "1";
  const rows = await repo.listAssignments(env.DB, courseId!, includeArchived);
  return json({
    assignments: rows.map((r) => toAssignmentDTO(r, { instructor: caller.instructor })),
  });
}

export async function getAssignmentRoute(
  env: Env,
  identity: Identity,
  url: URL,
  id: string,
): Promise<Response> {
  const courseId = url.searchParams.get("courseId");
  const caller = await resolveCaller(env, identity, courseId);
  if (caller instanceof Response) return caller;
  const row = await repo.getAssignment(env.DB, courseId!, id);
  if (!row || (row.archived_at !== null && !caller.instructor)) {
    return error("Assignment not found", 404);
  }
  return json({
    assignment: toAssignmentDTO(row, { instructor: caller.instructor, withStarter: true }),
  });
}

interface AssignmentBody {
  courseId?: string;
  title?: unknown;
  instructions?: unknown;
  starter?: unknown;
  aiEnabled?: unknown;
  aiPrompt?: unknown;
  dueAt?: unknown;
  archived?: unknown;
  mode?: unknown;
  voice?: unknown;
}

export async function createAssignmentRoute(
  req: Request,
  env: Env,
  identity: Identity,
): Promise<Response> {
  const body = (await req.json().catch(() => null)) as AssignmentBody | null;
  const caller = await resolveInstructor(env, identity, body?.courseId);
  if (caller instanceof Response) return caller;
  const courseId = body!.courseId!;

  const title = cleanTitle(body!.title);
  if (!title) return error("title is required", 400);
  const instructions =
    typeof body!.instructions === "string" ? body!.instructions.slice(0, MAX_INSTRUCTIONS) : "";
  const dueAt = parseDue(body!.dueAt);
  if (dueAt === "invalid") return error("dueAt must be a timestamp or null", 400);
  const starterJson =
    body!.starter === undefined ? '{"cells":[]}' : serializeContent(body!.starter);
  if (starterJson instanceof Response) return starterJson;
  const aiPrompt =
    typeof body!.aiPrompt === "string" && body!.aiPrompt.trim()
      ? body!.aiPrompt.trim().slice(0, MAX_AI_PROMPT)
      : null;

  const mode = parseMode(body!.mode);
  if (mode === "invalid") return error("mode must be submit or practice", 400);
  const voiceJson = await parseVoice(env, body!.voice, caller.userId);
  if (voiceJson instanceof Response) return voiceJson;
  const row = await repo.createAssignment(env.DB, courseId, {
    title,
    instructions,
    starterJson,
    aiEnabled: body!.aiEnabled === true,
    aiPrompt,
    voiceJson: voiceJson ?? null,
    dueAt: dueAt ?? null,
    mode: mode ?? "submit",
  });
  await ensureCourseItem(env.DB, {
    courseId,
    kind: "code",
    payloadRef: row.id,
    title: row.title,
    dueAt: row.due_at,
  });
  return json({ assignment: toAssignmentDTO(row, { instructor: true, withStarter: true }) }, 201);
}

export async function updateAssignmentRoute(
  req: Request,
  env: Env,
  identity: Identity,
  id: string,
): Promise<Response> {
  const body = (await req.json().catch(() => null)) as AssignmentBody | null;
  const caller = await resolveInstructor(env, identity, body?.courseId);
  if (caller instanceof Response) return caller;
  const courseId = body!.courseId!;
  const before = await repo.getAssignment(env.DB, courseId, id);
  if (!before) return error("Assignment not found", 404);

  const patch: Parameters<typeof repo.updateAssignment>[3] = {};
  if (body!.title !== undefined) {
    const t = cleanTitle(body!.title);
    if (!t) return error("title cannot be empty", 400);
    patch.title = t;
  }
  if (typeof body!.instructions === "string") {
    patch.instructions = body!.instructions.slice(0, MAX_INSTRUCTIONS);
  }
  if (body!.starter !== undefined) {
    const s = serializeContent(body!.starter);
    if (s instanceof Response) return s;
    patch.starterJson = s;
  }
  if (typeof body!.aiEnabled === "boolean") patch.aiEnabled = body!.aiEnabled;
  if (body!.aiPrompt !== undefined) {
    patch.aiPrompt =
      typeof body!.aiPrompt === "string" && body!.aiPrompt.trim()
        ? body!.aiPrompt.trim().slice(0, MAX_AI_PROMPT)
        : null;
  }
  const dueAt = parseDue(body!.dueAt);
  if (dueAt === "invalid") return error("dueAt must be a timestamp or null", 400);
  if (dueAt !== undefined) patch.dueAt = dueAt;
  if (typeof body!.archived === "boolean") patch.archived = body!.archived;
  const mode = parseMode(body!.mode);
  if (mode === "invalid") return error("mode must be submit or practice", 400);
  if (mode !== undefined) patch.mode = mode;
  const voiceJson = await parseVoice(env, body!.voice, caller.userId);
  if (voiceJson instanceof Response) return voiceJson;
  if (voiceJson !== undefined) patch.voiceJson = voiceJson;

  await repo.updateAssignment(env.DB, courseId, id, patch);
  const after = (await repo.getAssignment(env.DB, courseId, id))!;

  // Keep the Assign list in step with the payload.
  await renameCourseItem(env.DB, courseId, "code", id, before.title, after.title);
  if (patch.archived !== undefined) {
    await setCourseItemArchived(env.DB, courseId, "code", id, patch.archived);
  }
  if (patch.dueAt !== undefined) {
    await setCourseItemDue(env.DB, courseId, "code", id, after.due_at);
  }
  return json({ assignment: toAssignmentDTO(after, { instructor: true, withStarter: true }) });
}

export async function deleteAssignmentRoute(
  env: Env,
  identity: Identity,
  url: URL,
  id: string,
): Promise<Response> {
  const courseId = url.searchParams.get("courseId");
  const caller = await resolveInstructor(env, identity, courseId);
  if (caller instanceof Response) return caller;
  const row = await repo.getAssignment(env.DB, courseId!, id);
  if (!row) return error("Assignment not found", 404);
  await repo.deleteAssignment(env.DB, courseId!, id);
  await removeCourseItem(env.DB, courseId!, "code", id);
  return json({ ok: true });
}

export async function rosterRoute(
  env: Env,
  identity: Identity,
  url: URL,
  id: string,
): Promise<Response> {
  const courseId = url.searchParams.get("courseId");
  const caller = await resolveInstructor(env, identity, courseId);
  if (caller instanceof Response) return caller;
  const assignment = await repo.getAssignment(env.DB, courseId!, id);
  if (!assignment) return error("Assignment not found", 404);
  const rows = await repo.listRoster(env.DB, courseId!, id);
  const students: RosterStudentDTO[] = rows.map((r) => ({
    userId: r.user_id,
    email: r.email,
    displayName: r.display_name,
    submissionCount: r.submission_count,
    latest:
      r.submission_id && r.submitted_at !== null
        ? {
            id: r.submission_id,
            assignmentId: id,
            submittedAt: r.submitted_at,
            late: isLate(r.submitted_at, assignment.due_at),
          }
        : null,
  }));
  return json({
    assignment: toAssignmentDTO(assignment, { instructor: true }),
    students,
  });
}

// ── notebooks ───────────────────────────────────────────────────────────

/** Edits are recorded only for a notebook attached to a submit-mode
 *  assignment: that is the only place the record is ever read. */
function isTracked(assignment: CodeAssignmentRow | null): boolean {
  return assignment !== null && assignment.mode !== "practice";
}

async function notebookDTO(env: Env, row: CodeNotebookRow): Promise<NotebookDTO> {
  const assignment = row.assignment_id
    ? await repo.getAssignment(env.DB, row.course_id, row.assignment_id)
    : null;
  const tracking = isTracked(assignment);
  return {
    ...toNotebookSummary(row),
    courseId: row.course_id,
    content: parseContent(row.cells_json),
    createdAt: row.created_at,
    aiEnabled: assignment?.ai_enabled === 1,
    assignment: assignment
      ? {
          title: assignment.title,
          instructions: assignment.instructions,
          dueAt: assignment.due_at,
          mode: assignment.mode === "practice" ? "practice" : "submit",
        }
      : null,
    tracking,
    eventSeq: tracking ? await repo.maxEventSeq(env.DB, row.id) : 0,
  };
}

/**
 * A student's first copy of a starter notebook. Each cell carries a
 * `provided` origin, and the starter text is frozen as the notebook's
 * baseline so the render can replay it before any of the student's edits.
 * Outputs are copied too: an instructor may want a worked example visible.
 */
function copyStarter(starterJson: string): { cellsJson: string; baselineJson: string } {
  const starter = parseContent(starterJson);
  const baseline: Record<string, string> = {};
  const cells = starter.cells.map((c) => {
    if (c.source) baseline[c.id] = c.source;
    const { origins: _drop, ...rest } = c;
    return c.source ? { ...rest, origins: [{ origin: "provided" as const, length: c.source.length }] } : rest;
  });
  return { cellsJson: JSON.stringify({ cells }), baselineJson: JSON.stringify(baseline) };
}

export async function listNotebooksRoute(
  env: Env,
  identity: Identity,
  url: URL,
): Promise<Response> {
  const courseId = url.searchParams.get("courseId");
  const caller = await resolveCaller(env, identity, courseId);
  if (caller instanceof Response) return caller;
  const rows = await repo.listNotebooks(env.DB, courseId!, caller.userId);
  return json({ notebooks: rows.map(toNotebookSummary) });
}

/**
 * POST /notebooks — create a scratch notebook, or open the caller's notebook
 * for an assignment (created from the starter on first open). Idempotent for
 * the assignment case, so "Open" can always POST.
 */
export async function createNotebookRoute(
  req: Request,
  env: Env,
  identity: Identity,
): Promise<Response> {
  const body = (await req.json().catch(() => null)) as {
    courseId?: string;
    title?: unknown;
    assignmentId?: unknown;
  } | null;
  const caller = await resolveCaller(env, identity, body?.courseId);
  if (caller instanceof Response) return caller;
  const courseId = body!.courseId!;

  if (typeof body!.assignmentId === "string") {
    const assignment = await repo.getAssignment(env.DB, courseId, body!.assignmentId);
    if (!assignment || (assignment.archived_at !== null && !caller.instructor)) {
      return error("Assignment not found", 404);
    }
    const existing = await repo.findAssignmentNotebook(env.DB, courseId, caller.userId, assignment.id);
    if (existing) return json({ notebook: await notebookDTO(env, existing) });
    const copy = copyStarter(assignment.starter_json);
    const row = await repo.createNotebook(env.DB, {
      courseId,
      ownerUserId: caller.userId,
      assignmentId: assignment.id,
      title: assignment.title,
      cellsJson: copy.cellsJson,
      baselineJson: copy.baselineJson,
    });
    return json({ notebook: await notebookDTO(env, row) }, 201);
  }

  const row = await repo.createNotebook(env.DB, {
    courseId,
    ownerUserId: caller.userId,
    assignmentId: null,
    title: cleanTitle(body!.title) ?? "Untitled notebook",
    cellsJson: JSON.stringify({ cells: [{ id: "c1", type: "code", source: "" }] }),
    baselineJson: null,
  });
  return json({ notebook: await notebookDTO(env, row) }, 201);
}

export async function getNotebookRoute(
  env: Env,
  identity: Identity,
  url: URL,
  id: string,
): Promise<Response> {
  const courseId = url.searchParams.get("courseId");
  const caller = await resolveCaller(env, identity, courseId);
  if (caller instanceof Response) return caller;
  const row = await repo.getNotebook(env.DB, courseId!, caller.userId, id);
  if (!row) return error("Notebook not found", 404);
  return json({ notebook: await notebookDTO(env, row) });
}

export async function updateNotebookRoute(
  req: Request,
  env: Env,
  identity: Identity,
  id: string,
): Promise<Response> {
  const body = (await req.json().catch(() => null)) as {
    courseId?: string;
    title?: unknown;
    content?: unknown;
  } | null;
  const caller = await resolveCaller(env, identity, body?.courseId);
  if (caller instanceof Response) return caller;
  const courseId = body!.courseId!;
  const row = await repo.getNotebook(env.DB, courseId, caller.userId, id);
  if (!row) return error("Notebook not found", 404);

  const patch: { title?: string; cellsJson?: string } = {};
  if (body!.title !== undefined) {
    const t = cleanTitle(body!.title);
    if (!t) return error("title cannot be empty", 400);
    patch.title = t;
  }
  if (body!.content !== undefined) {
    const s = serializeContent(body!.content);
    if (s instanceof Response) return s;
    patch.cellsJson = s;
  }
  const updatedAt = await repo.updateNotebook(env.DB, courseId, caller.userId, id, patch);
  return json({ ok: true, updatedAt });
}

export async function deleteNotebookRoute(
  env: Env,
  identity: Identity,
  url: URL,
  id: string,
): Promise<Response> {
  const courseId = url.searchParams.get("courseId");
  const caller = await resolveCaller(env, identity, courseId);
  if (caller instanceof Response) return caller;
  const row = await repo.getNotebook(env.DB, courseId!, caller.userId, id);
  if (!row) return error("Notebook not found", 404);
  await repo.deleteNotebook(env.DB, courseId!, caller.userId, id);
  return json({ ok: true });
}

// ── chat ───────────────────────────────────────────────────────────────

export async function listMessagesRoute(
  env: Env,
  identity: Identity,
  url: URL,
  notebookId: string,
): Promise<Response> {
  const courseId = url.searchParams.get("courseId");
  const caller = await resolveCaller(env, identity, courseId);
  if (caller instanceof Response) return caller;
  const nb = await repo.getNotebook(env.DB, courseId!, caller.userId, notebookId);
  if (!nb) return error("Notebook not found", 404);
  const rows = await repo.listMessages(env.DB, courseId!, notebookId);
  return json({ messages: rows.map(toMessageDTO) });
}

function sse(event: string, data: unknown): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

function boundedHistory(
  rows: { role: "user" | "assistant"; content: string }[],
  current: string,
): LLMMessage[] {
  let trimmed = rows.slice(-MAX_HISTORY_TURNS);
  let total = trimmed.reduce((s, r) => s + r.content.length, 0) + current.length;
  while (trimmed.length > 0 && total > MAX_HISTORY_CHARS) {
    total -= trimmed[0]!.content.length;
    trimmed = trimmed.slice(1);
  }
  // Providers expect alternation starting with a user turn.
  while (trimmed.length > 0 && trimmed[0]!.role !== "user") trimmed = trimmed.slice(1);
  return [
    ...trimmed.map((r) => ({ role: r.role, content: r.content }) as LLMMessage),
    { role: "user", content: current },
  ];
}

/**
 * POST /notebooks/:id/messages — one chat turn, streamed as SSE.
 *
 * The AI chat reads the notebook as last SAVED on the server, not a copy the
 * client sends alongside the message: the client flushes its save before
 * sending, and the server then works from the stored row. That keeps the
 * context honest and means there is one notebook shape to validate.
 */
export async function sendMessageRoute(
  req: Request,
  env: Env,
  identity: Identity,
  notebookId: string,
): Promise<Response> {
  const body = (await req.json().catch(() => null)) as {
    courseId?: string;
    content?: unknown;
    focusCellId?: unknown;
  } | null;
  const caller = await resolveCaller(env, identity, body?.courseId);
  if (caller instanceof Response) return caller;
  const courseId = body!.courseId!;
  const content = typeof body!.content === "string" ? body!.content.trim() : "";
  if (!content) return error("content is required", 400);
  if (content.length > MAX_USER_MESSAGE) {
    return error(`message exceeds ${MAX_USER_MESSAGE} chars`, 413);
  }

  const nb = await repo.getNotebook(env.DB, courseId, caller.userId, notebookId);
  if (!nb) return error("Notebook not found", 404);
  const assignment: CodeAssignmentRow | null = nb.assignment_id
    ? await repo.getAssignment(env.DB, courseId, nb.assignment_id)
    : null;
  // Enforced here, not only by hiding the panel: a scratch notebook has no
  // chat, and neither does an assignment the instructor left AI off for.
  if (!assignment || assignment.ai_enabled !== 1) {
    return error("The AI chat is not available for this notebook", 403, "ai_disabled");
  }
  if (!llmConfigured(env)) {
    return error("No AI provider is configured for this deployment", 503, "llm_unconfigured");
  }

  const instructions = buildChatInstructions({
    voiceFragment: await voiceFragment(env, assignment),
    assignmentTitle: assignment.title,
    assignmentInstructions: assignment.instructions,
    instructorPrompt: assignment.ai_prompt,
  });
  const hash = await promptHash(instructions);
  const focusCellId = typeof body!.focusCellId === "string" ? body!.focusCellId : null;
  const context =
    "## The student's notebook (as last saved)\n\n" +
    buildNotebookContext(parseContent(nb.cells_json), focusCellId);

  const history = await repo.listMessages(env.DB, courseId, notebookId);
  const userAt = Date.now();
  return streamTurn(env, boundedHistory(history, content), { instructions, context }, async (reply) => {
    const { assistantMessageId } = await repo.commitTurn(env.DB, {
      notebookId,
      courseId,
      userContent: content,
      assistantContent: reply,
      assistantNovelText: novelReplyText(reply, parseContent(nb.cells_json)),
      promptHash: hash,
      userAt,
    });
    return { assistantMessageId };
  });
}

/**
 * Stream one chat turn as SSE (`delta` frames, then `done` or `error`).
 * `onComplete` runs with the full reply before `done` is sent, and whatever it
 * returns is merged into the `done` payload — the live chat stores the turn
 * there; the instructor's preview stores nothing.
 */
function streamTurn(
  env: Env,
  messages: LLMMessage[],
  system: { instructions: string; context: string },
  onComplete: (reply: string) => Promise<Record<string, unknown>>,
): Response {
  const provider = providerFor(env, provenanceDefaultModel(env));
  const encoder = new TextEncoder();
  const abort = new AbortController();
  let raw = "";

  const stream = new ReadableStream({
    async start(controller) {
      try {
        controller.enqueue(encoder.encode(sse("started", {})));
        for await (const chunk of provider.stream(messages, {
          system,
          maxTokens: MAX_CHAT_TOKENS,
          signal: abort.signal,
        })) {
          if (chunk.delta) {
            raw += chunk.delta;
            controller.enqueue(encoder.encode(sse("delta", { text: chunk.delta })));
          }
        }
        const extra = await onComplete(raw.trim());
        controller.enqueue(encoder.encode(sse("done", extra)));
        controller.close();
      } catch (err) {
        const message = err instanceof ProviderError ? err.message : "stream failed";
        controller.enqueue(encoder.encode(sse("error", { message })));
        controller.close();
      }
    },
    cancel() {
      abort.abort();
    },
  });

  return new Response(stream, {
    headers: { "content-type": "text/event-stream", "cache-control": "no-cache" },
  });
}

// ── submissions ─────────────────────────────────────────────────────────

/** POST /notebooks/:id/submissions — freeze the saved notebook against its
 *  assignment. Always accepted; lateness is a read-time fact. */
export async function createSubmissionRoute(
  req: Request,
  env: Env,
  identity: Identity,
  notebookId: string,
): Promise<Response> {
  const body = (await req.json().catch(() => null)) as { courseId?: string } | null;
  const caller = await resolveCaller(env, identity, body?.courseId);
  if (caller instanceof Response) return caller;
  const courseId = body!.courseId!;
  const nb = await repo.getNotebook(env.DB, courseId, caller.userId, notebookId);
  if (!nb) return error("Notebook not found", 404);
  if (!nb.assignment_id) {
    return error("Only an assignment notebook can be submitted", 400);
  }
  const assignment = await repo.getAssignment(env.DB, courseId, nb.assignment_id);
  if (!assignment) return error("Assignment not found", 404);
  if (assignment.mode === "practice") {
    return error("This assignment is practice: there is nothing to submit", 400, "practice_mode");
  }
  const [messages, events] = await Promise.all([
    repo.listMessages(env.DB, courseId, nb.id),
    repo.listEvents(env.DB, courseId, nb.id),
  ]);
  const content = parseContent(nb.cells_json);
  // Frozen at submission from the event log, never from the cells' own
  // client-side origins — the client proposes, the server disposes.
  const render = buildSubmissionRender(content, parseBaseline(nb.baseline_json), events, messages);
  const row = await repo.createSubmission(env.DB, {
    courseId,
    assignmentId: assignment.id,
    notebookId: nb.id,
    ownerUserId: caller.userId,
    title: nb.title,
    cellsJson: JSON.stringify(stripOrigins(content)),
    messagesJson: JSON.stringify(messages.map(toMessageDTO)),
    renderJson: JSON.stringify(render),
  });
  return json(
    {
      submission: {
        id: row.id,
        assignmentId: row.assignment_id,
        submittedAt: row.created_at,
        late: isLate(row.created_at, assignment.due_at),
      },
    },
    201,
  );
}

export async function listMySubmissionsRoute(
  env: Env,
  identity: Identity,
  url: URL,
  notebookId: string,
): Promise<Response> {
  const courseId = url.searchParams.get("courseId");
  const caller = await resolveCaller(env, identity, courseId);
  if (caller instanceof Response) return caller;
  const nb = await repo.getNotebook(env.DB, courseId!, caller.userId, notebookId);
  if (!nb) return error("Notebook not found", 404);
  if (!nb.assignment_id) return json({ submissions: [] });
  const assignment = await repo.getAssignment(env.DB, courseId!, nb.assignment_id);
  const rows = await repo.listMySubmissions(env.DB, courseId!, caller.userId, nb.assignment_id);
  return json({
    submissions: rows.map((r) => ({
      id: r.id,
      assignmentId: r.assignment_id,
      submittedAt: r.created_at,
      late: isLate(r.created_at, assignment?.due_at ?? null),
    })),
  });
}

/**
 * GET /submissions/:id — the frozen notebook plus the AI chat conversation as
 * it stood at submission time. Readable by the submitting student and by the
 * course's instructors; anyone else gets the same 404 as a bad id.
 */
export async function getSubmissionRoute(
  env: Env,
  identity: Identity,
  url: URL,
  id: string,
): Promise<Response> {
  const courseId = url.searchParams.get("courseId");
  const caller = await resolveCaller(env, identity, courseId);
  if (caller instanceof Response) return caller;
  const row = await repo.getSubmission(env.DB, courseId!, id);
  if (!row || (!caller.instructor && row.owner_user_id !== caller.userId)) {
    return error("Submission not found", 404);
  }
  const [assignment, student] = await Promise.all([
    repo.getAssignment(env.DB, courseId!, row.assignment_id),
    repo.getUser(env.DB, row.owner_user_id),
  ]);
  let messages: CodeMessageDTO[] = [];
  try {
    const parsed = JSON.parse(row.messages_json) as unknown;
    if (Array.isArray(parsed)) messages = parsed as CodeMessageDTO[];
  } catch {
    // A malformed transcript renders as empty rather than failing the view.
  }
  let render: SubmissionRender | null = null;
  try {
    render = row.render_json ? (JSON.parse(row.render_json) as SubmissionRender) : null;
  } catch {
    render = null;
  }
  return json({
    submission: {
      id: row.id,
      assignmentId: row.assignment_id,
      assignmentTitle: assignment?.title ?? null,
      submittedAt: row.created_at,
      late: isLate(row.created_at, assignment?.due_at ?? null),
      title: row.title,
      content: parseContent(row.cells_json),
      student: {
        userId: row.owner_user_id,
        email: student?.email ?? "",
        displayName: student?.display_name ?? null,
      },
      messages,
      // The origin render is for instructors. A student reading their own
      // submission gets the notebook and transcript, not the marks: as in the
      // writing tool, a student-readable render would tell them exactly what
      // to rework until it reads clean.
      render: caller.instructor ? render : null,
    },
  });
}

/** The submitted copy carries no client-side origin guesses; the render is
 *  the only record of origins an instructor sees. */
function stripOrigins(content: NotebookContent): NotebookContent {
  return { cells: content.cells.map(({ origins: _o, ...c }) => c) };
}

// ── edit events ─────────────────────────────────────────────────────────

/**
 * POST /notebooks/:id/events — append a batch of cell edits. Owner only, and
 * only for a tracked notebook: a practice or scratch notebook's edits are
 * never recorded, so the endpoint refuses rather than silently storing them.
 */
export async function appendEventsRoute(
  req: Request,
  env: Env,
  identity: Identity,
  notebookId: string,
): Promise<Response> {
  const body = (await req.json().catch(() => null)) as { courseId?: string; events?: unknown } | null;
  const caller = await resolveCaller(env, identity, body?.courseId);
  if (caller instanceof Response) return caller;
  const courseId = body!.courseId!;
  const nb = await repo.getNotebook(env.DB, courseId, caller.userId, notebookId);
  if (!nb) return error("Notebook not found", 404);
  const assignment = nb.assignment_id ? await repo.getAssignment(env.DB, courseId, nb.assignment_id) : null;
  if (!isTracked(assignment)) return error("This notebook is not recorded", 409, "not_tracked");

  const raw = body!.events;
  if (!Array.isArray(raw)) return error("events must be an array", 400);
  if (raw.length > MAX_EVENTS_PER_BATCH) return error(`at most ${MAX_EVENTS_PER_BATCH} events per batch`, 413);
  const events: repo.InboundCodeEvent[] = [];
  let lastSeq = 0;
  for (let i = 0; i < raw.length; i++) {
    const e = raw[i] as Record<string, unknown>;
    const bad = (m: string) => error(`events[${i}]: ${m}`, 400);
    if (!e || typeof e !== "object") return bad("must be an object");
    if (typeof e.cellId !== "string" || !CELL_ID.test(e.cellId)) return bad("cellId is invalid");
    if (typeof e.kind !== "string" || !EVENT_KINDS.has(e.kind)) return bad("kind is invalid");
    const int = (v: unknown) => typeof v === "number" && Number.isInteger(v) && v >= 0;
    if (!int(e.offset) || !int(e.length)) return bad("offset and length must be non-negative integers");
    if (!int(e.clientSeq) || (e.clientSeq as number) <= lastSeq) return bad("clientSeq must increase");
    lastSeq = e.clientSeq as number;
    const text = typeof e.text === "string" ? e.text : null;
    if (text && text.length > MAX_EVENT_TEXT) return error(`events[${i}]: text too large`, 413);
    const origin = e.origin === null || e.origin === undefined ? null : String(e.origin);
    if (origin !== null && !EVENT_ORIGINS.has(origin)) return bad("origin is invalid");
    let restored: string | null = null;
    if (e.kind === "move" && Array.isArray(e.restoredOrigins)) {
      const runs = (e.restoredOrigins as unknown[]).filter(
        (r): r is { origin: string; length: number } =>
          !!r && typeof r === "object" &&
          EVENT_ORIGINS.has(String((r as { origin?: unknown }).origin)) &&
          int((r as { length?: unknown }).length),
      );
      restored = runs.length ? JSON.stringify(runs.slice(0, 2_000)) : null;
    }
    events.push({
      cellId: e.cellId,
      kind: e.kind as repo.InboundCodeEvent["kind"],
      offset: e.offset as number,
      length: e.length as number,
      text,
      origin: origin as repo.InboundCodeEvent["origin"],
      restoredOrigins: restored,
      clientSeq: e.clientSeq as number,
    });
  }
  const result = await repo.appendEvents(env.DB, { notebookId, courseId, events });
  return json({ ok: true, ...result });
}

// ── chat preview (starter editor) ──────────────────────────────────────

/**
 * POST /assignments/:id/chat-preview — one chat turn against the starter
 * notebook, so an instructor can try the AI chat students will get. Nothing is
 * stored: the client carries the preview conversation itself. Instructors
 * only, and only when the assignment has the AI chat on.
 */
export async function chatPreviewRoute(
  req: Request,
  env: Env,
  identity: Identity,
  assignmentId: string,
): Promise<Response> {
  const body = (await req.json().catch(() => null)) as {
    courseId?: string;
    content?: unknown;
    history?: unknown;
    focusCellId?: unknown;
  } | null;
  const caller = await resolveInstructor(env, identity, body?.courseId);
  if (caller instanceof Response) return caller;
  const courseId = body!.courseId!;
  const content = typeof body!.content === "string" ? body!.content.trim() : "";
  if (!content) return error("content is required", 400);
  if (content.length > MAX_USER_MESSAGE) return error(`message exceeds ${MAX_USER_MESSAGE} chars`, 413);
  const assignment = await repo.getAssignment(env.DB, courseId, assignmentId);
  if (!assignment) return error("Assignment not found", 404);
  if (assignment.ai_enabled !== 1) {
    return error("The AI chat is off for this assignment", 403, "ai_disabled");
  }
  if (!llmConfigured(env)) {
    return error("No AI provider is configured for this deployment", 503, "llm_unconfigured");
  }
  const history = Array.isArray(body!.history)
    ? (body!.history as unknown[])
        .filter(
          (m): m is { role: "user" | "assistant"; content: string } =>
            !!m && typeof m === "object" &&
            ((m as { role?: unknown }).role === "user" || (m as { role?: unknown }).role === "assistant") &&
            typeof (m as { content?: unknown }).content === "string",
        )
        .map((m) => ({ role: m.role, content: m.content.slice(0, MAX_USER_MESSAGE) }))
    : [];
  const instructions = buildChatInstructions({
    voiceFragment: await voiceFragment(env, assignment),
    assignmentTitle: assignment.title,
    assignmentInstructions: assignment.instructions,
    instructorPrompt: assignment.ai_prompt,
  });
  const focusCellId = typeof body!.focusCellId === "string" ? body!.focusCellId : null;
  const context =
    "## The student's notebook (as last saved)\n\n" +
    buildNotebookContext(parseContent(assignment.starter_json), focusCellId);
  return streamTurn(env, boundedHistory(history, content), { instructions, context }, async () => ({}));
}
