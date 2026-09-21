// D1 queries for the provenance module. Every query filters by course_id
// AND owner_user_id — a document belongs to one student in one course,
// no cross-course or cross-user reads.

import type {
  ProvenanceAgentRow,
  ProvenanceAssignmentCheckpointRow,
  ProvenanceAssignmentRow,
  ProvenanceConversationRow,
  ProvenanceDocumentRow,
  ProvenanceEventRow,
  ProvenanceMessageRow,
  ProvenanceOriginRun,
  ProvenanceSubmissionRow,
} from "@marginalia/schema";
import type { InboundEvent } from "./types.js";

const EMPTY_DOC = '{"type":"doc","content":[]}';

const newId = () => `pdoc_${crypto.randomUUID()}`;
const newEventId = () => `pev_${crypto.randomUUID()}`;
const newAgentId = () => `pag_${crypto.randomUUID()}`;
const newConversationId = () => `pconv_${crypto.randomUUID()}`;
const newMessageId = () => `pmsg_${crypto.randomUUID()}`;

export async function listDocuments(
  db: D1Database,
  courseId: string,
  ownerUserId: string,
): Promise<ProvenanceDocumentRow[]> {
  const { results } = await db
    .prepare(
      `SELECT * FROM provenance_documents
        WHERE course_id = ? AND owner_user_id = ?
        ORDER BY updated_at DESC`,
    )
    .bind(courseId, ownerUserId)
    .all<ProvenanceDocumentRow>();
  return results ?? [];
}

export async function getDocument(
  db: D1Database,
  courseId: string,
  ownerUserId: string,
  id: string,
): Promise<ProvenanceDocumentRow | null> {
  return db
    .prepare(
      `SELECT * FROM provenance_documents
        WHERE id = ? AND course_id = ? AND owner_user_id = ?`,
    )
    .bind(id, courseId, ownerUserId)
    .first<ProvenanceDocumentRow>();
}

export async function createDocument(
  db: D1Database,
  params: {
    courseId: string;
    ownerUserId: string;
    title: string;
  },
): Promise<ProvenanceDocumentRow> {
  const now = Date.now();
  const id = newId();
  await db
    .prepare(
      `INSERT INTO provenance_documents
         (id, course_id, owner_user_id, title, body_json,
          word_count, char_count, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, 0, 0, ?, ?)`,
    )
    .bind(
      id,
      params.courseId,
      params.ownerUserId,
      params.title,
      EMPTY_DOC,
      now,
      now,
    )
    .run();
  const row = await db
    .prepare(`SELECT * FROM provenance_documents WHERE id = ?`)
    .bind(id)
    .first<ProvenanceDocumentRow>();
  if (!row) throw new Error("createDocument: row not found after insert");
  return row;
}

export async function updateDocument(
  db: D1Database,
  courseId: string,
  ownerUserId: string,
  id: string,
  patch: {
    title?: string;
    bodyJson?: string;
    wordCount?: number;
    charCount?: number;
  },
): Promise<ProvenanceDocumentRow | null> {
  const sets: string[] = [];
  const binds: unknown[] = [];
  if (patch.title !== undefined) {
    sets.push("title = ?");
    binds.push(patch.title);
  }
  if (patch.bodyJson !== undefined) {
    sets.push("body_json = ?");
    binds.push(patch.bodyJson);
  }
  if (patch.wordCount !== undefined) {
    sets.push("word_count = ?");
    binds.push(patch.wordCount);
  }
  if (patch.charCount !== undefined) {
    sets.push("char_count = ?");
    binds.push(patch.charCount);
  }
  if (sets.length === 0) {
    return getDocument(db, courseId, ownerUserId, id);
  }
  sets.push("updated_at = ?");
  binds.push(Date.now());
  binds.push(id, courseId, ownerUserId);
  await db
    .prepare(
      `UPDATE provenance_documents
          SET ${sets.join(", ")}
        WHERE id = ? AND course_id = ? AND owner_user_id = ?`,
    )
    .bind(...binds)
    .run();
  return getDocument(db, courseId, ownerUserId, id);
}

/**
 * Per-event JSON sidecar stored in the `timing_blob` column.
 *
 * That column has always held opaque JSON (slice 2 wrote `{gapsMs:[...]}`);
 * slice 8 adds origin runs for deletes and moves alongside it rather than
 * taking a migration for two rarely-read fields. Old rows parse fine — a blob
 * with only `gapsMs` simply yields no runs.
 */
export interface EventSidecar {
  gapsMs?: number[];
  /** Origins the removed range carried (delete). */
  removedOrigins?: ProvenanceOriginRun[];
  /** Origins the client asks to restore for a move; re-derived at mint. */
  restoredOrigins?: ProvenanceOriginRun[];
}

function encodeSidecar(e: InboundEvent): string | null {
  // timingBlob arrives as pre-serialized JSON from the client ({gapsMs}).
  let base: EventSidecar = {};
  if (e.timingBlob) {
    try {
      const parsed = JSON.parse(e.timingBlob) as EventSidecar;
      if (parsed && typeof parsed === "object") base = parsed;
    } catch {
      // Unparseable timing data is not worth failing an append over; the
      // event itself still carries the provenance that matters.
    }
  }
  if (e.removedOrigins?.length) base.removedOrigins = e.removedOrigins;
  if (e.restoredOrigins?.length) base.restoredOrigins = e.restoredOrigins;
  return Object.keys(base).length > 0 ? JSON.stringify(base) : null;
}

/** Parse a row's sidecar. Never throws — a corrupt blob reads as empty. */
export function decodeSidecar(blob: string | null): EventSidecar {
  if (!blob) return {};
  try {
    const parsed = JSON.parse(blob) as EventSidecar;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

/**
 * Append a batch of events. Drops any event whose client_seq has
 * already been recorded for this document (idempotent retry safety).
 * Returns the number of newly-inserted rows + the new max client_seq.
 */
export async function appendEvents(
  db: D1Database,
  params: {
    documentId: string;
    courseId: string;
    userId: string;
    events: InboundEvent[];
  },
): Promise<{ inserted: number; maxClientSeq: number }> {
  if (params.events.length === 0) {
    const max = await maxClientSeq(db, params.documentId);
    return { inserted: 0, maxClientSeq: max };
  }
  const knownMax = await maxClientSeq(db, params.documentId);
  const fresh = params.events.filter((e) => e.clientSeq > knownMax);
  if (fresh.length === 0) return { inserted: 0, maxClientSeq: knownMax };

  const now = Date.now();
  const stmt = db.prepare(
    `INSERT INTO provenance_events
       (id, document_id, course_id, user_id, kind, offset, length,
        text, origin, source_message_id, timing_blob, client_seq, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  const binds = fresh.map((e) =>
    stmt.bind(
      newEventId(),
      params.documentId,
      params.courseId,
      params.userId,
      e.kind,
      e.offset,
      e.length,
      e.text ?? null,
      e.origin ?? null,
      e.sourceMessageId ?? null,
      encodeSidecar(e),
      e.clientSeq,
      now,
    ),
  );
  await db.batch(binds);
  return {
    inserted: fresh.length,
    maxClientSeq: fresh[fresh.length - 1]!.clientSeq,
  };
}

async function maxClientSeq(
  db: D1Database,
  documentId: string,
): Promise<number> {
  const row = await db
    .prepare(
      `SELECT MAX(client_seq) AS max_seq FROM provenance_events
        WHERE document_id = ?`,
    )
    .bind(documentId)
    .first<{ max_seq: number | null }>();
  return row?.max_seq ?? 0;
}

/**
 * List events for a document in client_seq order. Supports cursor
 * paging by passing the last-seen client_seq as `afterSeq`.
 */
export async function listEvents(
  db: D1Database,
  params: {
    documentId: string;
    afterSeq?: number;
    limit?: number;
  },
): Promise<ProvenanceEventRow[]> {
  const limit = Math.min(params.limit ?? 500, 2_000);
  const afterSeq = params.afterSeq ?? 0;
  const { results } = await db
    .prepare(
      `SELECT * FROM provenance_events
        WHERE document_id = ? AND client_seq > ?
        ORDER BY client_seq ASC
        LIMIT ?`,
    )
    .bind(params.documentId, afterSeq, limit)
    .all<ProvenanceEventRow>();
  return results ?? [];
}

export async function deleteDocument(
  db: D1Database,
  courseId: string,
  ownerUserId: string,
  id: string,
): Promise<boolean> {
  const res = await db
    .prepare(
      `DELETE FROM provenance_documents
        WHERE id = ? AND course_id = ? AND owner_user_id = ?`,
    )
    .bind(id, courseId, ownerUserId)
    .run();
  return (res.meta?.changes ?? 0) > 0;
}

// ── Agents ───────────────────────────────────────────────────────────────
//
// Two visibility tiers per course:
//   - course defaults: owner_user_id IS NULL, authored by an instructor,
//     visible to every enrolled student.
//   - personal: owner_user_id = <student>, visible only to them.
//
// listAgentsForUser returns both buckets in one call.

export async function listAgentsForUser(
  db: D1Database,
  courseId: string,
  userId: string,
): Promise<ProvenanceAgentRow[]> {
  const { results } = await db
    .prepare(
      `SELECT * FROM provenance_agents
        WHERE course_id = ?
          AND (owner_user_id IS NULL OR owner_user_id = ?)
        ORDER BY (owner_user_id IS NULL) DESC, updated_at DESC`,
    )
    .bind(courseId, userId)
    .all<ProvenanceAgentRow>();
  return results ?? [];
}

export async function getAgent(
  db: D1Database,
  courseId: string,
  agentId: string,
): Promise<ProvenanceAgentRow | null> {
  return db
    .prepare(
      `SELECT * FROM provenance_agents WHERE id = ? AND course_id = ?`,
    )
    .bind(agentId, courseId)
    .first<ProvenanceAgentRow>();
}

export async function createAgent(
  db: D1Database,
  params: {
    courseId: string;
    ownerUserId: string | null;
    name: string;
    systemPrompt: string;
    /** Opaque provider model id, or null to use the configured default. */
    model?: string | null;
  },
): Promise<ProvenanceAgentRow> {
  const now = Date.now();
  const id = newAgentId();
  await db
    .prepare(
      `INSERT INTO provenance_agents
         (id, course_id, owner_user_id, name, system_prompt, model, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      id,
      params.courseId,
      params.ownerUserId,
      params.name,
      params.systemPrompt,
      params.model ?? null,
      now,
      now,
    )
    .run();
  const row = await db
    .prepare(`SELECT * FROM provenance_agents WHERE id = ?`)
    .bind(id)
    .first<ProvenanceAgentRow>();
  if (!row) throw new Error("createAgent: row not found after insert");
  return row;
}

export async function updateAgent(
  db: D1Database,
  courseId: string,
  agentId: string,
  patch: { name?: string; systemPrompt?: string; model?: string | null },
): Promise<ProvenanceAgentRow | null> {
  const sets: string[] = [];
  const binds: unknown[] = [];
  if (patch.name !== undefined) {
    sets.push("name = ?");
    binds.push(patch.name);
  }
  if (patch.systemPrompt !== undefined) {
    sets.push("system_prompt = ?");
    binds.push(patch.systemPrompt);
  }
  // An explicit null clears the override, returning this voice to the
  // configured default — distinct from omitting the field, which leaves it be.
  if (patch.model !== undefined) {
    sets.push("model = ?");
    binds.push(patch.model);
  }
  if (sets.length === 0) return getAgent(db, courseId, agentId);
  sets.push("updated_at = ?");
  binds.push(Date.now());
  binds.push(agentId, courseId);
  await db
    .prepare(
      `UPDATE provenance_agents
          SET ${sets.join(", ")}
        WHERE id = ? AND course_id = ?`,
    )
    .bind(...binds)
    .run();
  return getAgent(db, courseId, agentId);
}

export async function deleteAgent(
  db: D1Database,
  courseId: string,
  agentId: string,
): Promise<boolean> {
  // Null out the FK on any conversation that referenced this agent so the
  // chat history stays readable via the snapshot fields.
  await db
    .prepare(
      `UPDATE provenance_conversations
          SET agent_id = NULL, updated_at = ?
        WHERE agent_id = ? AND course_id = ?`,
    )
    .bind(Date.now(), agentId, courseId)
    .run();
  const res = await db
    .prepare(`DELETE FROM provenance_agents WHERE id = ? AND course_id = ?`)
    .bind(agentId, courseId)
    .run();
  return (res.meta?.changes ?? 0) > 0;
}

// ── Conversations ────────────────────────────────────────────────────────

export async function listConversationsForDocument(
  db: D1Database,
  documentId: string,
  userId: string,
): Promise<ProvenanceConversationRow[]> {
  const { results } = await db
    .prepare(
      `SELECT * FROM provenance_conversations
        WHERE document_id = ? AND user_id = ?
        ORDER BY updated_at DESC`,
    )
    .bind(documentId, userId)
    .all<ProvenanceConversationRow>();
  return results ?? [];
}

export async function getConversation(
  db: D1Database,
  userId: string,
  conversationId: string,
): Promise<ProvenanceConversationRow | null> {
  return db
    .prepare(
      `SELECT * FROM provenance_conversations WHERE id = ? AND user_id = ?`,
    )
    .bind(conversationId, userId)
    .first<ProvenanceConversationRow>();
}

export async function createConversation(
  db: D1Database,
  params: {
    documentId: string;
    courseId: string;
    userId: string;
    agent: ProvenanceAgentRow;
  },
): Promise<ProvenanceConversationRow> {
  const now = Date.now();
  const id = newConversationId();
  await db
    .prepare(
      `INSERT INTO provenance_conversations
         (id, document_id, course_id, user_id, agent_id,
          agent_name_snapshot, agent_prompt_snapshot, agent_model_snapshot,
          title, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?)`,
    )
    .bind(
      id,
      params.documentId,
      params.courseId,
      params.userId,
      params.agent.id,
      params.agent.name,
      params.agent.system_prompt,
      // NULL when the voice names no model: the configured default applies, and
      // stays applicable if that default is later changed.
      params.agent.model ?? null,
      now,
      now,
    )
    .run();
  const row = await db
    .prepare(`SELECT * FROM provenance_conversations WHERE id = ?`)
    .bind(id)
    .first<ProvenanceConversationRow>();
  if (!row) throw new Error("createConversation: row not found after insert");
  return row;
}

export async function deleteConversation(
  db: D1Database,
  userId: string,
  conversationId: string,
): Promise<boolean> {
  const res = await db
    .prepare(
      `DELETE FROM provenance_conversations WHERE id = ? AND user_id = ?`,
    )
    .bind(conversationId, userId)
    .run();
  return (res.meta?.changes ?? 0) > 0;
}

/**
 * Rename a conversation (owner only). Deliberately does NOT touch
 * `updated_at`: that column tracks the last chat turn and drives the
 * "last used" timestamp shown in the chat-history drawer — renaming a
 * conversation is not the same as using it. Returns the updated row, or
 * null if no conversation matched (wrong id or not the owner).
 */
export async function renameConversation(
  db: D1Database,
  userId: string,
  conversationId: string,
  title: string,
): Promise<ProvenanceConversationRow | null> {
  const res = await db
    .prepare(
      `UPDATE provenance_conversations SET title = ? WHERE id = ? AND user_id = ?`,
    )
    .bind(title, conversationId, userId)
    .run();
  if ((res.meta?.changes ?? 0) === 0) return null;
  return db
    .prepare(`SELECT * FROM provenance_conversations WHERE id = ?`)
    .bind(conversationId)
    .first<ProvenanceConversationRow>();
}

// ── Messages ─────────────────────────────────────────────────────────────

export async function listMessages(
  db: D1Database,
  conversationId: string,
): Promise<ProvenanceMessageRow[]> {
  const { results } = await db
    .prepare(
      `SELECT * FROM provenance_messages
        WHERE conversation_id = ?
        ORDER BY seq ASC`,
    )
    .bind(conversationId)
    .all<ProvenanceMessageRow>();
  return results ?? [];
}

/**
 * Insert user + assistant rows atomically with race-safe seq numbering,
 * and bump the conversation's updated_at. Mirrors the pattern used by
 * the shared commitTurn helper. If the conversation has no title yet,
 * stamp one from the first user message (first 60 chars, single line).
 */
export async function commitChatTurn(
  db: D1Database,
  params: {
    conversationId: string;
    userContent: string;
    assistantContent: string;
    /** When set, lazily fills in the conversation title. */
    seedTitleIfMissing: boolean;
  },
): Promise<{ userMessageId: string; assistantMessageId: string }> {
  const ts = Date.now();
  const userId = newMessageId();
  const asstId = newMessageId();
  const title = seedTitle(params.userContent);
  const stmts = [
    db
      .prepare(
        `INSERT INTO provenance_messages
           (id, conversation_id, role, content, seq, created_at)
         VALUES (
           ?, ?, 'user', ?,
           (SELECT COALESCE(MAX(seq), -1) + 1
              FROM provenance_messages WHERE conversation_id = ?),
           ?
         )`,
      )
      .bind(userId, params.conversationId, params.userContent, params.conversationId, ts),
    db
      .prepare(
        `INSERT INTO provenance_messages
           (id, conversation_id, role, content, seq, created_at)
         VALUES (
           ?, ?, 'assistant', ?,
           (SELECT COALESCE(MAX(seq), -1) + 1
              FROM provenance_messages WHERE conversation_id = ?),
           ?
         )`,
      )
      .bind(asstId, params.conversationId, params.assistantContent, params.conversationId, ts),
    params.seedTitleIfMissing
      ? db
          .prepare(
            `UPDATE provenance_conversations
                SET title = COALESCE(title, ?), updated_at = ?
              WHERE id = ?`,
          )
          .bind(title, ts, params.conversationId)
      : db
          .prepare(
            `UPDATE provenance_conversations
                SET updated_at = ?
              WHERE id = ?`,
          )
          .bind(ts, params.conversationId),
  ];
  await db.batch(stmts);
  return { userMessageId: userId, assistantMessageId: asstId };
}

function seedTitle(text: string): string {
  const single = text.replace(/\s+/g, " ").trim();
  return single.length <= 60 ? single : single.slice(0, 60) + "…";
}

// ── Submissions (slice 6) ──────────────────────────────────────────────

/** All events for a document in client_seq order — used by render replay
 *  at mint time. No paging: a mint is rare and we need the full history. */
export async function allEventsForDocument(
  db: D1Database,
  documentId: string,
): Promise<ProvenanceEventRow[]> {
  const { results } = await db
    .prepare(
      `SELECT * FROM provenance_events
        WHERE document_id = ?
        ORDER BY client_seq ASC`,
    )
    .bind(documentId)
    .all<ProvenanceEventRow>();
  return results ?? [];
}

/** Unguessable URL-safe token. 192 bits of randomness, base64url. */
function newSubmissionToken(): string {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export async function createSubmission(
  db: D1Database,
  params: {
    documentId: string;
    courseId: string;
    userId: string;
    titleSnapshot: string;
    renderJson: string;
    snapshotEventSeq: number;
  },
): Promise<ProvenanceSubmissionRow> {
  const token = newSubmissionToken();
  const now = Date.now();
  await db
    .prepare(
      `INSERT INTO provenance_submissions
         (token, document_id, course_id, user_id, title_snapshot,
          render_json, snapshot_event_seq, created_at, revoked_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL)`,
    )
    .bind(
      token,
      params.documentId,
      params.courseId,
      params.userId,
      params.titleSnapshot,
      params.renderJson,
      params.snapshotEventSeq,
      now,
    )
    .run();
  const row = await db
    .prepare(`SELECT * FROM provenance_submissions WHERE token = ?`)
    .bind(token)
    .first<ProvenanceSubmissionRow>();
  if (!row) throw new Error("createSubmission: row not found after insert");
  return row;
}

/** Public read by token. Returns null if missing OR revoked. */
export async function getActiveSubmission(
  db: D1Database,
  token: string,
): Promise<ProvenanceSubmissionRow | null> {
  const row = await db
    .prepare(`SELECT * FROM provenance_submissions WHERE token = ?`)
    .bind(token)
    .first<ProvenanceSubmissionRow>();
  if (!row || row.revoked_at !== null) return null;
  return row;
}

export async function listSubmissionsForDocument(
  db: D1Database,
  documentId: string,
  userId: string,
): Promise<ProvenanceSubmissionRow[]> {
  const { results } = await db
    .prepare(
      `SELECT * FROM provenance_submissions
        WHERE document_id = ? AND user_id = ?
        ORDER BY created_at DESC`,
    )
    .bind(documentId, userId)
    .all<ProvenanceSubmissionRow>();
  return results ?? [];
}

export interface CourseSubmissionRow {
  token: string;
  document_id: string;
  title_snapshot: string;
  created_at: number;
  revoked_at: number | null;
  render_json: string;
  user_id: string;
  student_email: string;
  student_name: string | null;
  /** Assignment context, all null when the submission is unattached. */
  assignment_id: string | null;
  assignment_title: string | null;
  checkpoint_id: string | null;
  checkpoint_name: string | null;
  checkpoint_due_at: number | null;
}

/**
 * Every submission checkpoint in a course, newest first — the instructor's
 * course-wide view. Unlike `listSubmissionsForDocument` (owner-scoped, for the
 * share modal) this deliberately crosses the owner boundary, so the caller MUST
 * have verified an instructor enrollment in `courseId` first.
 *
 * `render_json` is selected so the caller can report per-origin totals without a
 * second query per row; the list endpoint summarizes it and does not ship the
 * full render to the client.
 *
 * Assignment context comes in via LEFT JOINs so unattached submissions — every
 * row predating assignments, plus anything submitted outside one — still list
 * with null assignment fields rather than dropping out.
 */
export async function listSubmissionsForCourse(
  db: D1Database,
  courseId: string,
): Promise<CourseSubmissionRow[]> {
  const { results } = await db
    .prepare(
      `SELECT s.token, s.document_id, s.title_snapshot, s.created_at,
              s.revoked_at, s.render_json, s.user_id,
              u.email AS student_email, u.display_name AS student_name,
              s.assignment_id,
              a.title  AS assignment_title,
              s.checkpoint_id,
              c.name   AS checkpoint_name,
              c.due_at AS checkpoint_due_at
         FROM provenance_submissions s
         JOIN users u ON u.id = s.user_id
         LEFT JOIN provenance_assignments a ON a.id = s.assignment_id
         LEFT JOIN provenance_assignment_checkpoints c ON c.id = s.checkpoint_id
        WHERE s.course_id = ?
        ORDER BY s.created_at DESC`,
    )
    .bind(courseId)
    .all<CourseSubmissionRow>();
  return results ?? [];
}

/** Fetch a submission row by token regardless of revoked state — used to
 *  authorize revocation (needs the owner + course before deciding). */
export async function getSubmissionMeta(
  db: D1Database,
  token: string,
): Promise<ProvenanceSubmissionRow | null> {
  const row = await db
    .prepare(`SELECT * FROM provenance_submissions WHERE token = ?`)
    .bind(token)
    .first<ProvenanceSubmissionRow>();
  return row ?? null;
}

/** Revoke a token. Owner-scoped. Returns true if a row was revoked. */
export async function revokeSubmission(
  db: D1Database,
  token: string,
  userId: string,
): Promise<boolean> {
  const res = await db
    .prepare(
      `UPDATE provenance_submissions
          SET revoked_at = ?
        WHERE token = ? AND user_id = ? AND revoked_at IS NULL`,
    )
    .bind(Date.now(), token, userId)
    .run();
  return (res.meta?.changes ?? 0) > 0;
}

/** Conversations for a document, regardless of caller — used by the public
 *  drill-down. The document's owner_user_id gates who could mint a share
 *  in the first place, so a holder of the token is authorized to read. */
export async function listConversationsForDocumentPublic(
  db: D1Database,
  documentId: string,
): Promise<ProvenanceConversationRow[]> {
  const { results } = await db
    .prepare(
      `SELECT * FROM provenance_conversations
        WHERE document_id = ?
        ORDER BY created_at ASC`,
    )
    .bind(documentId)
    .all<ProvenanceConversationRow>();
  return results ?? [];
}

// ── Course settings (hide-marks toggle) ─────────────────────────────────

/**
 * Set the per-course "hide provenance marks from students" flag. A genuine
 * two-way toggle (instructors can turn coloring back on), so it writes the
 * explicit value. Upsert via INSERT … ON CONFLICT so a course with no
 * settings row yet is handled in one round trip. The shared course_settings
 * row is read elsewhere (listEnrollmentsForUserEnriched) for /api/me.
 */
export async function setHideProvenanceMarks(
  db: D1Database,
  courseId: string,
  hide: boolean,
): Promise<void> {
  await db
    .prepare(
      `INSERT INTO course_settings (course_id, hide_provenance_marks, updated_at)
       VALUES (?, ?, ?)
       ON CONFLICT(course_id) DO UPDATE
         SET hide_provenance_marks = excluded.hide_provenance_marks,
             updated_at = excluded.updated_at`,
    )
    .bind(courseId, hide ? 1 : 0, Date.now())
    .run();
}

// ── Assignments + checkpoints ───────────────────────────────────────────
//
// An assignment names a piece of writing; its checkpoints are the moments it
// is due. Everything here is course-scoped, and checkpoints reach their course
// only through their assignment — so every checkpoint query joins back up to
// `provenance_assignments` rather than trusting an id from the wire.
//
// Lateness never appears in this file. It is `submitted_at > due_at`, computed
// where the roster is rendered; a stored flag would survive the instructor
// moving the deadline.

const newAssignmentId = () => `pasg_${crypto.randomUUID()}`;
const newCheckpointId = () => `pcp_${crypto.randomUUID()}`;

/** A checkpoint as authored: name, order, optional deadline. */
export interface CheckpointInput {
  name: string;
  /** Epoch ms, or null for "no deadline" — such a checkpoint is never late. */
  dueAt: number | null;
}

export async function listAssignments(
  db: D1Database,
  courseId: string,
  opts: { includeArchived: boolean },
): Promise<ProvenanceAssignmentRow[]> {
  const { results } = await db
    .prepare(
      `SELECT * FROM provenance_assignments
        WHERE course_id = ?
          AND (? = 1 OR archived_at IS NULL)
        ORDER BY created_at DESC`,
    )
    .bind(courseId, opts.includeArchived ? 1 : 0)
    .all<ProvenanceAssignmentRow>();
  return results ?? [];
}

export async function getAssignment(
  db: D1Database,
  courseId: string,
  assignmentId: string,
): Promise<ProvenanceAssignmentRow | null> {
  return db
    .prepare(
      `SELECT * FROM provenance_assignments WHERE id = ? AND course_id = ?`,
    )
    .bind(assignmentId, courseId)
    .first<ProvenanceAssignmentRow>();
}

/** Checkpoints for one assignment, in the instructor's chosen order. */
export async function listCheckpoints(
  db: D1Database,
  assignmentId: string,
): Promise<ProvenanceAssignmentCheckpointRow[]> {
  const { results } = await db
    .prepare(
      `SELECT * FROM provenance_assignment_checkpoints
        WHERE assignment_id = ?
        ORDER BY ord ASC`,
    )
    .bind(assignmentId)
    .all<ProvenanceAssignmentCheckpointRow>();
  return results ?? [];
}

/**
 * Checkpoints for every assignment in a course, so the list view can render
 * each assignment's deadlines without one query per row. Ordered so a caller
 * can bucket by assignment_id and keep each bucket's `ord` sequence intact.
 */
export async function listCheckpointsForCourse(
  db: D1Database,
  courseId: string,
): Promise<ProvenanceAssignmentCheckpointRow[]> {
  const { results } = await db
    .prepare(
      `SELECT c.* FROM provenance_assignment_checkpoints c
         JOIN provenance_assignments a ON a.id = c.assignment_id
        WHERE a.course_id = ?
        ORDER BY c.assignment_id, c.ord ASC`,
    )
    .bind(courseId)
    .all<ProvenanceAssignmentCheckpointRow>();
  return results ?? [];
}

export async function createAssignment(
  db: D1Database,
  params: {
    courseId: string;
    title: string;
    instructions: string;
    checkpoints: CheckpointInput[];
  },
): Promise<ProvenanceAssignmentRow> {
  const now = Date.now();
  const id = newAssignmentId();
  const stmts = [
    db
      .prepare(
        `INSERT INTO provenance_assignments
           (id, course_id, title, instructions, created_at, updated_at, archived_at)
         VALUES (?, ?, ?, ?, ?, ?, NULL)`,
      )
      .bind(id, params.courseId, params.title, params.instructions, now, now),
    ...checkpointInserts(db, id, params.checkpoints),
  ];
  await db.batch(stmts);
  const row = await db
    .prepare(`SELECT * FROM provenance_assignments WHERE id = ?`)
    .bind(id)
    .first<ProvenanceAssignmentRow>();
  if (!row) throw new Error("createAssignment: row not found after insert");
  return row;
}

function checkpointInserts(
  db: D1Database,
  assignmentId: string,
  checkpoints: CheckpointInput[],
): D1PreparedStatement[] {
  const stmt = db.prepare(
    `INSERT INTO provenance_assignment_checkpoints
       (id, assignment_id, ord, name, due_at)
     VALUES (?, ?, ?, ?, ?)`,
  );
  return checkpoints.map((c, i) =>
    stmt.bind(newCheckpointId(), assignmentId, i, c.name, c.dueAt),
  );
}

/**
 * Update an assignment's fields and, when `checkpoints` is supplied, replace
 * its checkpoint list wholesale.
 *
 * Replace-not-merge is deliberate: the editor sends the full ordered list, and
 * reconciling adds/removes/reorders against stored ids would be a lot of
 * machinery for a handful of rows. The cost is that editing a checkpoint mints
 * a new id, so submissions already attached to the old one keep pointing at a
 * row that no longer exists — which is why `checkpoint_id` carries no FK and
 * the roster treats an unresolvable id as simply unattached. Omitting
 * `checkpoints` leaves the existing ones alone, which is the path the
 * title/instructions edit takes.
 */
export async function updateAssignment(
  db: D1Database,
  courseId: string,
  assignmentId: string,
  patch: {
    title?: string;
    instructions?: string;
    archived?: boolean;
    checkpoints?: CheckpointInput[];
  },
): Promise<ProvenanceAssignmentRow | null> {
  const existing = await getAssignment(db, courseId, assignmentId);
  if (!existing) return null;

  const sets: string[] = [];
  const binds: unknown[] = [];
  if (patch.title !== undefined) {
    sets.push("title = ?");
    binds.push(patch.title);
  }
  if (patch.instructions !== undefined) {
    sets.push("instructions = ?");
    binds.push(patch.instructions);
  }
  if (patch.archived !== undefined) {
    sets.push("archived_at = ?");
    binds.push(patch.archived ? Date.now() : null);
  }

  const stmts: D1PreparedStatement[] = [];
  if (sets.length > 0) {
    sets.push("updated_at = ?");
    binds.push(Date.now());
    binds.push(assignmentId, courseId);
    stmts.push(
      db
        .prepare(
          `UPDATE provenance_assignments
              SET ${sets.join(", ")}
            WHERE id = ? AND course_id = ?`,
        )
        .bind(...binds),
    );
  }
  if (patch.checkpoints !== undefined) {
    stmts.push(
      db
        .prepare(
          `DELETE FROM provenance_assignment_checkpoints WHERE assignment_id = ?`,
        )
        .bind(assignmentId),
      ...checkpointInserts(db, assignmentId, patch.checkpoints),
    );
  }
  if (stmts.length > 0) await db.batch(stmts);
  return getAssignment(db, courseId, assignmentId);
}

/**
 * Delete an assignment and its checkpoints. Submissions attached to it survive
 * — `assignment_id` carries no FK — and fall back to reading as unattached,
 * so deleting an assignment never destroys a student's frozen snapshot.
 */
export async function deleteAssignment(
  db: D1Database,
  courseId: string,
  assignmentId: string,
): Promise<boolean> {
  const res = await db
    .prepare(`DELETE FROM provenance_assignments WHERE id = ? AND course_id = ?`)
    .bind(assignmentId, courseId)
    .run();
  return (res.meta?.changes ?? 0) > 0;
}

/**
 * Resolve a checkpoint together with the course it belongs to, so a handler can
 * verify the (assignment, checkpoint, course) triple in one round trip rather
 * than trusting the assignment id the client paired it with.
 */
export async function getCheckpointWithCourse(
  db: D1Database,
  checkpointId: string,
): Promise<{ checkpoint: ProvenanceAssignmentCheckpointRow; courseId: string } | null> {
  const row = await db
    .prepare(
      `SELECT c.*, a.course_id AS _course_id
         FROM provenance_assignment_checkpoints c
         JOIN provenance_assignments a ON a.id = c.assignment_id
        WHERE c.id = ?`,
    )
    .bind(checkpointId)
    .first<ProvenanceAssignmentCheckpointRow & { _course_id: string }>();
  if (!row) return null;
  const { _course_id, ...checkpoint } = row;
  return { checkpoint, courseId: _course_id };
}

export interface AssignmentRosterRow {
  user_id: string;
  student_email: string;
  student_name: string | null;
  /** Null on the synthetic row a student with no submissions still produces. */
  checkpoint_id: string | null;
  token: string | null;
  created_at: number | null;
  revoked_at: number | null;
  title_snapshot: string | null;
}

/**
 * One row per (enrolled student × checkpoint they submitted to), plus a bare
 * row for every student who submitted nothing.
 *
 * The LEFT JOIN from `enrollments` is the entire point of this query. The
 * course-wide submissions list can only show what exists, so a student who
 * never submitted is simply absent from it — and that is exactly the student an
 * instructor opens this page to find. Driving from the roster instead means
 * "submitted nothing" is a visible cell rather than an absence the reader has
 * to notice.
 *
 * Only the latest submission per (student, checkpoint) survives: students
 * resubmit repeatedly against a deadline, and the cell shows where they landed.
 * Revoked submissions are excluded from that pick — an instructor who withdrew
 * one should see the state behind it, not a dangling reference.
 *
 * Deliberately returns raw timestamps. Lateness is computed by the caller
 * against the checkpoint's current `due_at`, never stored, so moving a deadline
 * moves the flag with it.
 */
export async function listAssignmentRoster(
  db: D1Database,
  courseId: string,
  assignmentId: string,
): Promise<AssignmentRosterRow[]> {
  const { results } = await db
    .prepare(
      `SELECT e.user_id,
              u.email        AS student_email,
              u.display_name AS student_name,
              s.checkpoint_id,
              s.token,
              s.created_at,
              s.revoked_at,
              s.title_snapshot
         FROM enrollments e
         JOIN users u ON u.id = e.user_id
         LEFT JOIN provenance_submissions s
                ON s.user_id = e.user_id
               AND s.course_id = e.course_id
               AND s.assignment_id = ?
               AND s.revoked_at IS NULL
               -- Latest per (student, checkpoint): no later live submission
               -- from the same student to the same checkpoint exists.
               AND NOT EXISTS (
                     SELECT 1 FROM provenance_submissions s2
                      WHERE s2.user_id = s.user_id
                        AND s2.checkpoint_id = s.checkpoint_id
                        AND s2.assignment_id = s.assignment_id
                        AND s2.revoked_at IS NULL
                        AND s2.created_at > s.created_at
                   )
        WHERE e.course_id = ?
          AND e.role = 'student'
        ORDER BY COALESCE(u.display_name, u.email) COLLATE NOCASE ASC`,
    )
    .bind(assignmentId, courseId)
    .all<AssignmentRosterRow>();
  return results ?? [];
}

/**
 * Attach a submission to an assignment checkpoint. Called immediately after
 * `createSubmission` rather than folded into it, so the unattached path — still
 * the default, and the only one that existed before assignments — inserts
 * exactly the columns it always did.
 */
export async function attachSubmission(
  db: D1Database,
  token: string,
  assignmentId: string,
  checkpointId: string,
): Promise<void> {
  await db
    .prepare(
      `UPDATE provenance_submissions
          SET assignment_id = ?, checkpoint_id = ?
        WHERE token = ?`,
    )
    .bind(assignmentId, checkpointId, token)
    .run();
}
