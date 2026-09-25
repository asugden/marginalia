// Origin render for a submitted notebook.
//
// Every cell is its own text with its own event log, rendered by the same
// @marginalia/provenance code the writing tool uses — so an improvement to
// retype detection, move handling or the audit applies here automatically.
// This file only supplies the notebook's policy:
//
//   - Starter text replays first as `provided`: instructor-supplied, never
//     counted as the student's typing.
//   - An import from the tutor panel stays `llm`, and so does typed text that
//     reproduces it. A clipboard import from anywhere else is `pasted`.
//   - Tutor replies are also a retype source even if never pasted, but only
//     their novel lines (see novelReplyText), and only against text typed
//     after the reply arrived. Code the student wrote first can never be
//     attributed to a tutor that later quoted it.

import {
  buildRender,
  countOrigins,
  type CorpusEntry,
  type LogEvent,
  type Origin,
  type OriginRun,
} from "@marginalia/provenance";
import type { CellRender, CodeMessageRow, NotebookContent, SubmissionRender } from "./types.js";

/** A stored event, as the repo returns it. */
export interface CodeEventRow {
  cell_id: string;
  kind: LogEvent["kind"];
  offset: number;
  length: number;
  text: string | null;
  origin: Origin | null;
  restored_origins: string | null;
  client_seq: number;
  created_at: number;
}

function parseRuns(raw: string | null): OriginRun[] | null {
  if (!raw) return null;
  try {
    const v = JSON.parse(raw) as unknown;
    return Array.isArray(v) ? (v as OriginRun[]) : null;
  } catch {
    return null;
  }
}

export function parseBaseline(raw: string | null): Record<string, string> {
  if (!raw) return {};
  try {
    const v = JSON.parse(raw) as unknown;
    return v && typeof v === "object" ? (v as Record<string, string>) : {};
  } catch {
    return {};
  }
}

export function buildSubmissionRender(
  content: NotebookContent,
  baseline: Record<string, string>,
  events: ReadonlyArray<CodeEventRow>,
  messages: ReadonlyArray<Pick<CodeMessageRow, "role" | "novel_text" | "created_at">>,
): SubmissionRender {
  const byCell = new Map<string, LogEvent[]>();
  for (const e of events) {
    const list = byCell.get(e.cell_id) ?? [];
    list.push({
      kind: e.kind,
      offset: e.offset,
      length: e.length,
      text: e.text,
      origin: e.origin,
      clientSeq: e.client_seq,
      createdAt: e.created_at,
      restoredOrigins: e.kind === "move" ? parseRuns(e.restored_origins) : null,
    });
    byCell.set(e.cell_id, list);
  }

  const tutorCorpus: CorpusEntry[] = messages
    .filter((m) => m.role === "assistant" && m.novel_text)
    .map((m) => ({ text: m.novel_text!, origin: "llm" as const, after: m.created_at }));

  const cells: Record<string, CellRender> = {};
  const allRuns: OriginRun[] = [];
  for (const cell of content.cells) {
    const start = baseline[cell.id];
    const r = buildRender(cell.source, byCell.get(cell.id) ?? [], {
      baseline: start ? { length: start.length, origin: "provided" } : null,
      corpusOrigin: (e) => (e.kind === "llm_insert" ? "llm" : "pasted"),
      extraCorpus: tutorCorpus,
      importKinds: ["paste", "llm_insert"],
      labelImports: true,
    });
    cells[cell.id] = { runs: r.runs, pastes: r.pastes ?? [], audit: r.audit! };
    allRuns.push(...r.runs);
  }
  return { v: 1, cells, totals: countOrigins(allRuns) };
}
