// Behavioural checks for the code module's pure helpers.
//
//   npx tsx apps/worker/src/modules/code/notebook.test.ts
//
// Exit code is non-zero on failure.

import {
  buildNotebookContext,
  buildChatInstructions,
  NOTEBOOK_CHAT_RULES,
  novelReplyText,
  sanitizeContent,
} from "./notebook.js";
import { buildSubmissionRender, type CodeEventRow } from "./render.js";
import type { NotebookContent } from "./types.js";

let failures = 0;
let checks = 0;
function check(label: string, ok: boolean, detail?: unknown): void {
  checks++;
  if (ok) console.log(`ok    ${label}`);
  else {
    failures++;
    console.error(`FAIL  ${label}${detail !== undefined ? `\n      ${JSON.stringify(detail)}` : ""}`);
  }
}

// ── sanitizeContent ─────────────────────────────────────────────────────

{
  const r = sanitizeContent({
    cells: [
      {
        id: "a",
        type: "code",
        source: "print(1)",
        extra: "dropped",
        outputs: [
          { type: "stream", name: "stdout", text: "1\n" },
          { type: "html", html: "<script>alert(1)</script>" },
          { type: "image", mime: "image/png", data: "iVBORw0KGgo=" },
          { type: "image", mime: "image/svg+xml", data: "PHN2Zz4=" },
          { type: "image", mime: "image/png", data: "not base64!" },
        ],
      },
      { id: "b", type: "markdown", source: "# Title" },
    ],
  });
  check("valid notebook is accepted", typeof r !== "string", r);
  if (typeof r !== "string") {
    const a = r.cells[0]!;
    check("unknown cell fields are dropped", !("extra" in a));
    check("unknown output kinds are dropped (no raw HTML survives)", !JSON.stringify(r).includes("<script>"));
    check("non-PNG and non-base64 images are dropped", a.outputs?.length === 2, a.outputs);
    check("markdown cells carry no outputs", r.cells[1]!.outputs === undefined);
  }
}

check("duplicate cell ids are rejected", typeof sanitizeContent({
  cells: [
    { id: "a", type: "code", source: "" },
    { id: "a", type: "code", source: "" },
  ],
}) === "string");
check("bad cell type is rejected", typeof sanitizeContent({ cells: [{ id: "a", type: "raw", source: "" }] }) === "string");
check("missing cells array is rejected", typeof sanitizeContent({}) === "string");

{
  const r = sanitizeContent({
    cells: [{ id: "a", type: "code", source: "", outputs: [{ type: "stream", name: "stdout", text: "x".repeat(60_000) }] }],
  });
  const text = typeof r === "string" ? "" : (r.cells[0]!.outputs![0] as { text: string }).text;
  check("runaway output is truncated, not rejected", typeof r !== "string" && text.length < 60_000 && text.endsWith("(output truncated)"));
}

// ── buildNotebookContext ────────────────────────────────────────────────

const small: NotebookContent = {
  cells: [
    { id: "m", type: "markdown", source: "Load the data" },
    {
      id: "c",
      type: "code",
      source: "df = pd.read_csv('x.csv')",
      outputs: [{ type: "error", ename: "NameError", evalue: "name 'pd' is not defined", traceback: "line 1" }],
    },
  ],
};
{
  const ctx = buildNotebookContext(small, "c");
  check("context includes the error the student hit", ctx.includes("NameError: name 'pd' is not defined"));
  check("context marks the focused cell", ctx.includes("Cell 2 (code) — the student is asking about this cell"));
  check("context numbers cells from 1", ctx.includes("### Cell 1 (markdown)"));
}
check("empty notebook is described, not blank", buildNotebookContext({ cells: [] }, null) === "The notebook is empty.");

{
  const big: NotebookContent = {
    cells: Array.from({ length: 40 }, (_, i) => ({
      id: `c${i}`,
      type: "code" as const,
      source: `# cell ${i}\n` + "x = 1\n".repeat(80),
    })),
  };
  const ctx = buildNotebookContext(big, "c20", 4_000);
  check("over-budget context stays within budget (plus omission notes)", ctx.length < 4_600, ctx.length);
  check("over-budget context keeps the focused cell", ctx.includes("# cell 20"));
  check("over-budget context keeps neighbours before distant cells", ctx.includes("# cell 19") && !ctx.includes("# cell 0\n"));
  check("over-budget context states what it omitted", /cells omitted for length/.test(ctx));
}

// ── buildChatInstructions ──────────────────────────────────────────────

{
  const p = buildChatInstructions({
    voiceFragment: "You speak like a patient lab partner.",
    assignmentTitle: "Linear regression",
    assignmentInstructions: "Fit a line.",
    instructorPrompt: "Always mention residuals.",
  });
  check("the chosen voice comes first", p.startsWith("You speak like a patient lab partner."));
  check("the notebook rules follow the voice, whatever it is", p.includes(NOTEBOOK_CHAT_RULES));
  check("instructor guidance is appended, never substituted", p.includes("Always mention residuals."));
  check("no-solutions floor is present", p.includes("Do not write the solution"));
  const noVoice = buildChatInstructions({
    voiceFragment: "",
    assignmentTitle: "t",
    assignmentInstructions: "",
    instructorPrompt: null,
  });
  check("the floor holds even with an empty voice", noVoice.startsWith(NOTEBOOK_CHAT_RULES));
}

// ── novel AI chat text ────────────────────────────────────────────────────

{
  const nb: NotebookContent = { cells: [{ id: "a", type: "code", source: "total = 0\nfor v in values:" }] };
  const reply = "Start from what you have:\ntotal = 0\nfor v in values:\n    total += v * w";
  const novel = novelReplyText(reply, nb);
  check("lines the student already wrote are not AI chat text", !novel.includes("total = 0") && !novel.includes("for v in values:"));
  check("lines the AI chat added are", novel.includes("total += v * w"));
}

// ── submission render ───────────────────────────────────────────────────

{
  const loop = "for price in prices:\n    total = total + price\nprint(total)";
  const typed = [...loop].map((ch, i): CodeEventRow => ({
    cell_id: "c", kind: "insert", offset: i, length: 1, text: ch, origin: "human",
    restored_origins: null, client_seq: i + 1, created_at: 10_000 + i * 200,
  }));
  const content: NotebookContent = { cells: [{ id: "s", type: "code", source: "values = [1]" }, { id: "c", type: "code", source: loop }] };
  const quoted = buildSubmissionRender(content, { s: "values = [1]" }, typed, [
    { role: "assistant", novel_text: loop, created_at: 60_000 },
  ]);
  const s = quoted.cells.s!.runs;
  check("starter cell renders as provided", s.length === 1 && s[0]!.origin === "provided" && s[0]!.length === 12, s);
  check("code typed before the AI chat echoed it stays typed", quoted.totals.human === loop.length, quoted.totals);
  const copied = buildSubmissionRender(content, { s: "values = [1]" }, typed, [
    { role: "assistant", novel_text: loop, created_at: 1_000 },
  ]);
  check("code typed out after the AI chat gave it is from the AI chat", copied.totals.llm === loop.length, copied.totals);
}

console.log(`\n${checks - failures}/${checks} passed`);
if (failures) process.exit(1);
