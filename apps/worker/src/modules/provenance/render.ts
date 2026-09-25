// Frozen provenance render for a writing document.
//
// The algorithm — replay, move verification, retype detection, the paste
// inventory and the audit — lives in @marginalia/provenance, shared with every
// other surface that records where text came from. This file only adapts the
// writing tool's event rows to that package and extracts plain text from a
// Tiptap document. Improve detection there, not here.
//
// The writing tool's one policy choice: a retyped match takes the origin
// `pasted` whether it reproduces a paste or a chat-panel insert. It is the same
// fact — content entered this document through the clipboard or the chat panel
// — and how it travelled into the final text doesn't change what happened.

import type { ProvenanceEventRow, ProvenanceOriginRun } from "@marginalia/schema";
import {
  buildRender as buildSharedRender,
  RENDER_VERSION,
  type LogEvent,
  type PasteRecord as SharedPasteRecord,
  type ProvenanceAudit,
} from "@marginalia/provenance";
import { decodeSidecar } from "./repo.js";

type Origin = ProvenanceOriginRun["origin"];

export interface ProvenanceRun {
  origin: Origin;
  length: number;
}
export type PasteRecord = SharedPasteRecord<Origin>;
export type { ProvenanceAudit };
export { RENDER_VERSION };

export interface ProvenanceRender {
  /** Schema version for the frozen blob. Absent = pre-slice-8. */
  v?: number;
  text: string;
  runs: ProvenanceRun[];
  pastes?: PasteRecord[];
  audit?: ProvenanceAudit;
}

/** Map a stored row into the shared log shape. */
function toLogEvent(ev: ProvenanceEventRow): LogEvent<Origin> {
  return {
    kind: ev.kind,
    offset: ev.offset,
    length: ev.length,
    text: ev.text,
    origin: ev.origin,
    clientSeq: ev.client_seq,
    createdAt: ev.created_at,
    restoredOrigins: ev.kind === "move" ? decodeSidecar(ev.timing_blob).restoredOrigins ?? null : null,
  };
}

/**
 * Build the frozen render. `text` is the document's plain-text projection
 * (extracted from body_json by the caller). `events` is the full event log in
 * client_seq order.
 *
 * PRIVACY: deleted text is read (as fingerprint corpus and to verify moves)
 * but never written into the render; see @marginalia/provenance.
 */
export function buildRender(text: string, events: ProvenanceEventRow[]): ProvenanceRender {
  return buildSharedRender<Origin>(text, events.map(toLogEvent), {
    corpusOrigin: () => "pasted",
  });
}

/**
 * Extract a plain-text projection from a Tiptap doc JSON node. Text nodes
 * contribute their `text`; block nodes get a trailing newline so
 * paragraphs don't run together. Not a Markdown renderer — the viewer
 * styles from runs, not from this text's structure.
 */
export function plainTextFromDoc(node: unknown): string {
  let out = "";
  const visit = (n: unknown): void => {
    if (!n || typeof n !== "object") return;
    const obj = n as { type?: string; text?: string; content?: unknown[] };
    if (obj.type === "text" && typeof obj.text === "string") {
      out += obj.text;
      return;
    }
    if (Array.isArray(obj.content)) {
      for (const child of obj.content) visit(child);
    }
    if (
      obj.type === "paragraph" ||
      obj.type === "heading" ||
      obj.type === "listItem" ||
      obj.type === "blockquote"
    ) {
      out += "\n";
    }
  };
  visit(node);
  return out.replace(/\n+$/, "");
}
