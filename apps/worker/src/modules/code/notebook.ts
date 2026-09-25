// Pure helpers for the code module: validating a notebook the client sends,
// and turning a notebook into context for the AI chat. No D1, no env — so
// these are testable standalone (see notebook.test.ts).

import type { Origin, OriginRun } from "@marginalia/provenance";
import type { Cell, CellOutput, NotebookContent } from "./types.js";

/** D1 caps a row near 2 MB. Stay well under it, figures included. */
export const MAX_NOTEBOOK_BYTES = 1_800_000;
export const MAX_CELLS = 400;
export const MAX_SOURCE_CHARS = 100_000;
const MAX_OUTPUTS_PER_CELL = 50;
const MAX_TEXT_OUTPUT_CHARS = 50_000;
const MAX_TABLE_ROWS = 100;
const MAX_TABLE_COLS = 50;
const MAX_CELL_TEXT = 500;
const BASE64 = /^[A-Za-z0-9+/]+={0,2}$/;
const CELL_ID = /^[A-Za-z0-9_-]{1,64}$/;

/**
 * Validate and normalise a notebook from the client.
 *
 * Returns a clean copy built from an explicit field list — unknown fields are
 * dropped, not forwarded — or an error string. Oversized text outputs are
 * truncated rather than rejected, because a runaway print loop should cost
 * the student their tail of output, not their whole save.
 */
export function sanitizeContent(raw: unknown): NotebookContent | string {
  if (!raw || typeof raw !== "object") return "content must be an object";
  const cellsRaw = (raw as { cells?: unknown }).cells;
  if (!Array.isArray(cellsRaw)) return "content.cells must be an array";
  if (cellsRaw.length > MAX_CELLS) return `a notebook holds at most ${MAX_CELLS} cells`;

  const seen = new Set<string>();
  const cells: Cell[] = [];
  for (const c of cellsRaw) {
    if (!c || typeof c !== "object") return "each cell must be an object";
    const cell = c as Record<string, unknown>;
    const id = cell.id;
    if (typeof id !== "string" || !CELL_ID.test(id)) return "cell id is invalid";
    if (seen.has(id)) return "cell ids must be unique";
    seen.add(id);
    if (cell.type !== "code" && cell.type !== "markdown") {
      return "cell type must be code or markdown";
    }
    if (typeof cell.source !== "string") return "cell source must be a string";
    if (cell.source.length > MAX_SOURCE_CHARS) return "a cell is too long";
    const out: Cell = { id, type: cell.type, source: cell.source };
    const origins = sanitizeOrigins(cell.origins, cell.source.length);
    if (origins) out.origins = origins;
    if (cell.type === "code" && Array.isArray(cell.outputs)) {
      const outputs: CellOutput[] = [];
      for (const o of cell.outputs.slice(0, MAX_OUTPUTS_PER_CELL)) {
        const clean = sanitizeOutput(o);
        if (clean) outputs.push(clean);
      }
      out.outputs = outputs;
    }
    cells.push(out);
  }
  return { cells };
}

const ORIGINS: ReadonlySet<string> = new Set<Origin>(["human", "llm", "pasted", "edited", "provided"]);
const MAX_RUNS_PER_CELL = 2_000;

/**
 * Keep a cell's live origin runs only if they are well-formed and cover the
 * source exactly. Anything else is dropped (the cell then reads as unmarked),
 * not repaired — these are a client-side display aid, and the authoritative
 * render is recomputed from the event log.
 */
function sanitizeOrigins(raw: unknown, sourceLength: number): OriginRun[] | null {
  if (!Array.isArray(raw) || raw.length === 0 || raw.length > MAX_RUNS_PER_CELL) return null;
  const out: OriginRun[] = [];
  let total = 0;
  for (const r of raw) {
    if (!r || typeof r !== "object") return null;
    const { origin, length } = r as { origin?: unknown; length?: unknown };
    if (typeof origin !== "string" || !ORIGINS.has(origin)) return null;
    if (typeof length !== "number" || !Number.isInteger(length) || length <= 0) return null;
    out.push({ origin: origin as Origin, length });
    total += length;
  }
  return total === sourceLength ? out : null;
}

/**
 * The part of a AI reply that is new to the student: every line of the
 * reply except those already present (whitespace-normalized) somewhere in the
 * notebook when it was sent. Retype detection compares against this, so a
 * chat quoting the student's own code back to them can never make that code
 * read as AI-written.
 */
export function novelReplyText(reply: string, content: NotebookContent): string {
  const norm = (s: string) => s.replace(/\s+/g, " ").trim();
  const existing = new Set<string>();
  for (const c of content.cells) {
    for (const line of c.source.split("\n")) {
      const n = norm(line);
      if (n) existing.add(n);
    }
  }
  return reply
    .split("\n")
    .filter((line) => {
      const n = norm(line);
      return n.length > 0 && !existing.has(n);
    })
    .join("\n");
}

function clip(s: unknown, max: number): string {
  const str = typeof s === "string" ? s : "";
  return str.length <= max ? str : str.slice(0, max) + "\n… (output truncated)";
}

function sanitizeOutput(o: unknown): CellOutput | null {
  if (!o || typeof o !== "object") return null;
  const r = o as Record<string, unknown>;
  switch (r.type) {
    case "stream":
      return {
        type: "stream",
        name: r.name === "stderr" ? "stderr" : "stdout",
        text: clip(r.text, MAX_TEXT_OUTPUT_CHARS),
      };
    case "result":
      return { type: "result", text: clip(r.text, MAX_TEXT_OUTPUT_CHARS) };
    case "image":
      // PNG only, base64 only. Rendered through an <img> data URI, so nothing
      // here can execute; the check keeps junk out of storage.
      if (r.mime !== "image/png" || typeof r.data !== "string") return null;
      if (!BASE64.test(r.data)) return null;
      return { type: "image", mime: "image/png", data: r.data };
    case "table": {
      const strs = (v: unknown, max: number) =>
        Array.isArray(v) ? v.slice(0, max).map((x) => clip(String(x), MAX_CELL_TEXT)) : [];
      const columns = strs(r.columns, MAX_TABLE_COLS);
      const rows = Array.isArray(r.rows)
        ? r.rows.slice(0, MAX_TABLE_ROWS).map((row) => strs(row, MAX_TABLE_COLS))
        : [];
      const shape = Array.isArray(r.shape) ? r.shape : [];
      const n = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? Math.max(0, Math.floor(v)) : 0);
      return {
        type: "table",
        columns,
        index: strs(r.index, MAX_TABLE_ROWS),
        rows,
        shape: [n(shape[0]), n(shape[1])],
      };
    }
    case "error":
      return {
        type: "error",
        ename: clip(r.ename, 200),
        evalue: clip(r.evalue, 5_000),
        traceback: clip(r.traceback, 20_000),
      };
    default:
      return null;
  }
}

// ── chat context ───────────────────────────────────────────────────────

/** Budget for the notebook excerpt sent to the AI chat on each turn. */
export const MAX_CONTEXT_CHARS = 24_000;
const MAX_CONTEXT_OUTPUT_CHARS = 1_500;

function describeOutput(o: CellOutput): string {
  switch (o.type) {
    case "stream":
      return o.name === "stderr" ? `[stderr]\n${o.text}` : o.text;
    case "result":
      return o.text;
    case "image":
      return "[figure]";
    case "table":
      return `[table ${o.shape[0]} rows × ${o.shape[1]} columns: ${o.columns.join(", ")}]`;
    case "error":
      return `${o.ename}: ${o.evalue}\n${o.traceback}`;
  }
}

function trimMiddle(s: string, max: number): string {
  if (s.length <= max) return s;
  const half = Math.floor((max - 20) / 2);
  return `${s.slice(0, half)}\n… (trimmed) …\n${s.slice(-half)}`;
}

/** One cell as the AI chat sees it. Outputs are shown so the AI chat can read
 *  the student's actual error, trimmed so one noisy cell can't crowd out
 *  the rest. */
export function describeCell(cell: Cell, n: number, focused: boolean): string {
  const head = `### Cell ${n} (${cell.type})${focused ? " — the student is asking about this cell" : ""}`;
  if (cell.type === "markdown") return `${head}\n${cell.source}`;
  const outputs = (cell.outputs ?? []).map(describeOutput).join("\n");
  const outBlock = outputs
    ? `\nOutput:\n\`\`\`\n${trimMiddle(outputs, MAX_CONTEXT_OUTPUT_CHARS)}\n\`\`\``
    : "\n(not run, or no output)";
  return `${head}\n\`\`\`python\n${cell.source}\n\`\`\`${outBlock}`;
}

/**
 * The notebook as chat context. When the whole thing fits the budget it is
 * sent whole. Otherwise the focused cell is kept, then cells are added
 * outward from it — nearer cells first — until the budget runs out, and the
 * omission is stated so the AI chat doesn't reason about code it cannot see.
 */
export function buildNotebookContext(
  content: NotebookContent,
  focusCellId: string | null,
  budget = MAX_CONTEXT_CHARS,
): string {
  const cells = content.cells;
  if (cells.length === 0) return "The notebook is empty.";
  const focusIdx = focusCellId ? cells.findIndex((c) => c.id === focusCellId) : -1;
  const parts = cells.map((c, i) => describeCell(c, i + 1, i === focusIdx));
  const total = parts.reduce((s, p) => s + p.length + 2, 0);
  if (total <= budget) return parts.join("\n\n");

  const start = focusIdx >= 0 ? focusIdx : cells.length - 1;
  const keep = new Set<number>([start]);
  let used = parts[start]!.length;
  for (let d = 1; d < cells.length; d++) {
    for (const i of [start - d, start + d]) {
      if (i < 0 || i >= cells.length) continue;
      if (used + parts[i]!.length + 2 > budget) continue;
      keep.add(i);
      used += parts[i]!.length + 2;
    }
  }
  const out: string[] = [];
  let skipped = 0;
  for (let i = 0; i < cells.length; i++) {
    if (keep.has(i)) {
      if (skipped) out.push(`(${skipped} cell${skipped === 1 ? "" : "s"} omitted for length)`);
      skipped = 0;
      out.push(parts[i]!);
    } else skipped++;
  }
  if (skipped) out.push(`(${skipped} cell${skipped === 1 ? "" : "s"} omitted for length)`);
  return out.join("\n\n");
}

/**
 * The notebook's fixed rules for the chat. How the chat talks — persona, tone,
 * method — comes from the voice the instructor chose for the assignment (see
 * @marginalia/voices); these rules sit beneath any voice and are never
 * replaced by it, so the no-solutions floor holds whichever voice is chosen
 * and whatever an instructor's own guidance says.
 */
export const NOTEBOOK_CHAT_RULES = `## Where you are
You are the LLM chat beside a student's Python notebook in a course. The notebook runs in the student's browser with numpy, pandas, matplotlib, scikit-learn and scipy available, plus littletorch: a small PyTorch-shaped neural-network library on NumPy (tensors with autograd, nn.Linear, nn.Conv2d, nn.MaxPool2d, losses, optim.SGD and optim.Adam, data.DataLoader). PyTorch itself is not available. You can see the notebook as it was last saved, including outputs and errors. You cannot run code.

## Rules that apply whatever your voice
- Do not write the solution to the assignment, and do not rewrite the student's cells for them. If asked to, say so briefly and offer the next step instead.
- Short snippets (a few lines) are fine to illustrate a concept or an API, on a different example than the student's own problem.
- When there is an error, point to the line and the part of the message that matters.
- Refer to cells by number ("in cell 3").`;

/** The voice used when an assignment names none, or its voice is gone. */
export const DEFAULT_VOICE_ID = "socratic";

export function buildChatInstructions(params: {
  /** The voice's system-prompt fragment: persona, tone, method. */
  voiceFragment: string;
  assignmentTitle: string;
  assignmentInstructions: string;
  instructorPrompt: string | null;
}): string {
  const sections = [params.voiceFragment.trim(), NOTEBOOK_CHAT_RULES].filter(Boolean);
  sections.push(
    `## The assignment\nTitle: ${params.assignmentTitle}\n${params.assignmentInstructions.trim() || "(no written instructions)"}`,
  );
  if (params.instructorPrompt?.trim()) {
    sections.push(`## Guidance from the instructor\n${params.instructorPrompt.trim()}`);
  }
  return sections.join("\n\n");
}

/** Short stable hash of the chat instructions, recorded on every message. */
export async function promptHash(prompt: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(prompt));
  return [...new Uint8Array(buf)]
    .slice(0, 8)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
