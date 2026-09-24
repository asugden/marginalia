// Pure helpers for the code module: validating a notebook the client sends,
// and turning a notebook into context for the tutor. No D1, no env — so
// these are testable standalone (see notebook.test.ts).

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

// ── tutor context ───────────────────────────────────────────────────────

/** Budget for the notebook excerpt sent to the tutor on each turn. */
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

/** One cell as the tutor sees it. Outputs are shown so the tutor can read
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
 * The notebook as tutor context. When the whole thing fits the budget it is
 * sent whole. Otherwise the focused cell is kept, then cells are added
 * outward from it — nearer cells first — until the budget runs out, and the
 * omission is stated so the tutor doesn't reason about code it cannot see.
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
 * The built-in tutor instructions. An instructor's per-assignment prompt is
 * appended beneath, never substituted, so the no-solutions floor holds even
 * when an instructor's own text doesn't mention it.
 */
export const DEFAULT_TUTOR_PROMPT = `You are a programming tutor beside a student's Python notebook in a course. The notebook runs in the student's browser with numpy, pandas, matplotlib, scikit-learn and scipy available.

Your job is to help the student learn to write and debug the code themselves.

- Do not write the solution to the assignment, and do not rewrite the student's cells for them. If asked to, say so briefly and offer the next step instead.
- When there is an error, help the student read it: point to the line and the part of the message that matters, and ask what they think it means.
- Ask one question at a time. Prefer a hint to an explanation, and an explanation to code.
- Short snippets (a few lines) are fine to illustrate a concept or an API, on a different example than the student's own problem.
- Be concise. Refer to cells by number ("in cell 3").
- You can see the notebook as it was last saved, including outputs and errors. You cannot run code.`;

export function buildTutorInstructions(params: {
  assignmentTitle: string;
  assignmentInstructions: string;
  instructorPrompt: string | null;
}): string {
  const sections = [DEFAULT_TUTOR_PROMPT];
  sections.push(
    `## The assignment\nTitle: ${params.assignmentTitle}\n${params.assignmentInstructions.trim() || "(no written instructions)"}`,
  );
  if (params.instructorPrompt?.trim()) {
    sections.push(`## Guidance from the instructor\n${params.instructorPrompt.trim()}`);
  }
  return sections.join("\n\n");
}

/** Short stable hash of the tutor instructions, recorded on every message. */
export async function promptHash(prompt: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(prompt));
  return [...new Uint8Array(buf)]
    .slice(0, 8)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
