// Compute a frozen provenance render from the authoritative edit_events
// log. This is the source of truth for the instructor/public view — it
// does NOT depend on the marks stored in the document's body_json, so it
// works even if we later hide provenance coloring from students while
// they write.
//
// Replay model: maintain an array of per-character origins. Walk events
// in client_seq order:
//   insert / paste / llm_insert  → splice `length` chars of the event's
//                                  origin in at `offset`.
//   delete                       → remove `length` chars at `offset`.
//
// We track ORIGIN per position, not the characters themselves — the
// actual text comes from the document's current plain-text projection
// (the events don't reliably store deleted text). If the replayed length
// and text length drift (e.g. a lost event batch), we reconcile so runs
// always sum to text.length and never crash a viewer over a data gap.

import type { ProvenanceEventRow, ProvenanceOrigin } from "@marginalia/schema";

type Origin = ProvenanceOrigin | "edited";

export interface ProvenanceRun {
  origin: Origin;
  length: number;
}

export interface ProvenanceRender {
  text: string;
  runs: ProvenanceRun[];
}

function replayOrigins(events: ProvenanceEventRow[]): Origin[] {
  const origins: Origin[] = [];
  for (const ev of events) {
    const off = Math.max(0, Math.min(ev.offset, origins.length));
    if (ev.kind === "delete") {
      const len = Math.max(0, Math.min(ev.length, origins.length - off));
      origins.splice(off, len);
      continue;
    }
    // insert | paste | llm_insert
    const origin: Origin = (ev.origin as Origin) ?? "human";
    const len = Math.max(0, ev.length);
    if (len === 0) continue;
    origins.splice(off, 0, ...new Array<Origin>(len).fill(origin));
  }
  return origins;
}

function encodeRuns(origins: Origin[]): ProvenanceRun[] {
  const runs: ProvenanceRun[] = [];
  for (const o of origins) {
    const last = runs[runs.length - 1];
    if (last && last.origin === o) last.length += 1;
    else runs.push({ origin: o, length: 1 });
  }
  return runs;
}

/**
 * Build the frozen render. `text` is the document's plain-text projection
 * (extracted from body_json by the caller). `events` is the full event
 * log in client_seq order. Reconciles replay length to text length by
 * truncating or padding with "human" so runs always sum to text.length.
 */
export function buildRender(text: string, events: ProvenanceEventRow[]): ProvenanceRender {
  let origins = replayOrigins(events);
  if (origins.length > text.length) {
    origins = origins.slice(0, text.length);
  } else if (origins.length < text.length) {
    origins = origins.concat(new Array<Origin>(text.length - origins.length).fill("human"));
  }
  return { text, runs: encodeRuns(origins) };
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
