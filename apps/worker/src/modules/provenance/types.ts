// Shared types for the provenance module.
// See ./README.md for the full design across all slices. This file
// grows as later slices add the origin/edit-event/agent/conversation
// machinery. Slice 1 = documents only.

import type {
  ProvenanceAgentRow,
  ProvenanceAssignmentCheckpointRow,
  ProvenanceAssignmentRow,
  ProvenanceConversationRow,
  ProvenanceDocumentRow,
  ProvenanceEventRow,
  ProvenanceEventKind,
  ProvenanceMessageRole,
  ProvenanceMessageRow,
  ProvenanceOrigin,
  ProvenanceOriginRun,
} from "@marginalia/schema";

export type {
  ProvenanceAgentRow,
  ProvenanceAssignmentCheckpointRow,
  ProvenanceAssignmentRow,
  ProvenanceConversationRow,
  ProvenanceDocumentRow,
  ProvenanceEventRow,
  ProvenanceEventKind,
  ProvenanceMessageRole,
  ProvenanceMessageRow,
  ProvenanceOrigin,
  ProvenanceOriginRun,
};

/**
 * Wire shape for an inbound event from the client. id is assigned
 * server-side; created_at is server-side too. The client owns
 * client_seq (monotonic per document) so we can dedupe retries.
 */
export interface InboundEvent {
  clientSeq: number;
  kind: ProvenanceEventKind;
  offset: number;
  length: number;
  text?: string;
  origin?: ProvenanceOrigin;
  sourceMessageId?: string;
  timingBlob?: string;
  /** Origins the removed range carried (delete). Slice 8 Part 0. */
  removedOrigins?: ProvenanceOriginRun[];
  /** Origins to restore for text moved within the document (move). */
  restoredOrigins?: ProvenanceOriginRun[];
}

export interface OutboundEvent {
  id: string;
  clientSeq: number;
  kind: ProvenanceEventKind;
  offset: number;
  length: number;
  text: string | null;
  origin: ProvenanceOrigin | null;
  sourceMessageId: string | null;
  createdAt: number;
}

export function toOutboundEvent(row: ProvenanceEventRow): OutboundEvent {
  return {
    id: row.id,
    clientSeq: row.client_seq,
    kind: row.kind,
    offset: row.offset,
    length: row.length,
    text: row.text,
    origin: row.origin,
    sourceMessageId: row.source_message_id,
    createdAt: row.created_at,
  };
}

/** Wire shape returned to the client for a single document. */
export interface ProvenanceDocumentDTO {
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

/** Compact shape for list views. */
export interface ProvenanceDocumentSummary {
  id: string;
  title: string;
  wordCount: number;
  charCount: number;
  updatedAt: number;
}

export function toDocumentDTO(row: ProvenanceDocumentRow): ProvenanceDocumentDTO {
  return {
    id: row.id,
    courseId: row.course_id,
    ownerUserId: row.owner_user_id,
    title: row.title,
    bodyJson: JSON.parse(row.body_json),
    wordCount: row.word_count,
    charCount: row.char_count,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function toDocumentSummary(row: ProvenanceDocumentRow): ProvenanceDocumentSummary {
  return {
    id: row.id,
    title: row.title,
    wordCount: row.word_count,
    charCount: row.char_count,
    updatedAt: row.updated_at,
  };
}

// ── Chat DTOs (slice 3) ─────────────────────────────────────────────────

export interface AgentDTO {
  id: string;
  courseId: string;
  /** Null = course default; non-null = owned by this user. */
  ownerUserId: string | null;
  name: string;
  systemPrompt: string;
  /**
   * Provider model id, or null when no explicit choice is set (the configured
   * provenance default applies). Only instructors can change it.
   */
  model: string | null;
  createdAt: number;
  updatedAt: number;
}

/** Compact shape for the picker — no prompt body. */
export interface AgentSummary {
  id: string;
  name: string;
  /** true if the caller authored this agent (otherwise it's a course default). */
  mine: boolean;
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
  role: ProvenanceMessageRole;
  content: string;
  seq: number;
  createdAt: number;
}

export function toAgentDTO(row: ProvenanceAgentRow): AgentDTO {
  return {
    id: row.id,
    courseId: row.course_id,
    ownerUserId: row.owner_user_id,
    name: row.name,
    systemPrompt: row.system_prompt,
    model: row.model,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function toAgentSummary(row: ProvenanceAgentRow, userId: string): AgentSummary {
  return { id: row.id, name: row.name, mine: row.owner_user_id === userId };
}

export function toConversationDTO(row: ProvenanceConversationRow): ConversationDTO {
  return {
    id: row.id,
    documentId: row.document_id,
    agentId: row.agent_id,
    agentName: row.agent_name_snapshot,
    title: row.title,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function toMessageDTO(row: ProvenanceMessageRow): MessageDTO {
  return {
    id: row.id,
    role: row.role,
    content: row.content,
    seq: row.seq,
    createdAt: row.created_at,
  };
}

// ── Assignment DTOs ──────────────────────────────────────────────────────

export interface CheckpointDTO {
  id: string;
  name: string;
  /** Epoch ms, or null when the checkpoint has no deadline. */
  dueAt: number | null;
}

export interface AssignmentDTO {
  id: string;
  courseId: string;
  title: string;
  instructions: string;
  /** In the instructor's chosen order, which is not necessarily date order. */
  checkpoints: CheckpointDTO[];
  archivedAt: number | null;
  createdAt: number;
  updatedAt: number;
}

export function toCheckpointDTO(row: ProvenanceAssignmentCheckpointRow): CheckpointDTO {
  return { id: row.id, name: row.name, dueAt: row.due_at };
}

export function toAssignmentDTO(
  row: ProvenanceAssignmentRow,
  checkpoints: ProvenanceAssignmentCheckpointRow[],
): AssignmentDTO {
  return {
    id: row.id,
    courseId: row.course_id,
    title: row.title,
    instructions: row.instructions,
    checkpoints: checkpoints.map(toCheckpointDTO),
    archivedAt: row.archived_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/** One student's state at one checkpoint, as the roster grid renders it. */
export interface RosterCellDTO {
  checkpointId: string;
  /** Null when this student has submitted nothing to this checkpoint. */
  token: string | null;
  submittedAt: number | null;
  /**
   * `submittedAt > dueAt`, computed on read. A checkpoint with no deadline is
   * never late, and nothing here is stored — moving a deadline moves the flag.
   * It reports a timestamp against a date and nothing more: it is not a score,
   * and no surface may render it as one.
   */
  late: boolean;
}

export interface RosterStudentDTO {
  userId: string;
  email: string;
  displayName: string | null;
  /** One entry per checkpoint, in checkpoint order, present or not. */
  cells: RosterCellDTO[];
}
