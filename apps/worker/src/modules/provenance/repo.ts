// D1 queries for the provenance module. Every query filters by course_id
// AND owner_user_id — a document belongs to one student in one course,
// no cross-course or cross-user reads.

import type {
  ProvenanceAgentRow,
  ProvenanceConversationRow,
  ProvenanceDocumentRow,
  ProvenanceEventRow,
  ProvenanceMessageRow,
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
      e.timingBlob ?? null,
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
  },
): Promise<ProvenanceAgentRow> {
  const now = Date.now();
  const id = newAgentId();
  await db
    .prepare(
      `INSERT INTO provenance_agents
         (id, course_id, owner_user_id, name, system_prompt, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      id,
      params.courseId,
      params.ownerUserId,
      params.name,
      params.systemPrompt,
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
  patch: { name?: string; systemPrompt?: string },
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
          agent_name_snapshot, agent_prompt_snapshot,
          title, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, NULL, ?, ?)`,
    )
    .bind(
      id,
      params.documentId,
      params.courseId,
      params.userId,
      params.agent.id,
      params.agent.name,
      params.agent.system_prompt,
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
