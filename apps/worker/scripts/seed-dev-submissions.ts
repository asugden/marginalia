// Dev-only: fill a course in the LOCAL database with fake students and their
// submissions, so the assignment → student submission hierarchy can be seen
// without recruiting a class.
//
//   npm run db:seed:submissions -- --course <courseId>
//   npm run db:seed:submissions -- --course <courseId> --clean   # remove only
//
// Always runs against the local D1 (`wrangler d1 execute --local`); there is
// no flag to point it anywhere else. Re-running replaces what it made before.
// Everything it creates has an id starting `devseed_`, which is how --clean
// finds it. Wrangler needs Node 22+.
//
// It also adds assignments of its own, titled "[dev] …": a writing assignment
// with two checkpoints and a coding assignment, both due in the recent past so
// lateness shows, and a coding project due in three weeks so the student
// dashboard has work beyond the next week.
//
// Renders are built with the app's own provenance code from synthetic edit
// logs, so origin bars, paste counts, and lateness come out exactly as real
// submissions would. Students are given different profiles — all typed, one
// paste, several pastes, heavy LLM, autocorrect, mixed — and a few submit
// nothing, so "Not submitted yet" has people in it too.

import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildRender, type LogEvent, type Origin } from "@marginalia/provenance";
import { buildSubmissionRender, type CodeEventRow } from "../src/modules/code/render.js";
import type { NotebookContent } from "../src/modules/code/types.js";

const PREFIX = "devseed_";
const HOUR = 3_600_000;
const DAY = 24 * HOUR;

// ── args ────────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
const courseId = args[args.indexOf("--course") + 1];
const cleanOnly = args.includes("--clean");
if (!args.includes("--course") || !courseId || courseId.startsWith("--")) {
  console.error("usage: seed-dev-submissions --course <courseId> [--clean]");
  process.exit(1);
}

// ── local D1 ────────────────────────────────────────────────────────────

const workerDir = new URL("..", import.meta.url).pathname;

function query<T>(sql: string): T[] {
  const out = execFileSync("npx", ["wrangler", "d1", "execute", "DB", "--local", "--json", "--command", sql], {
    cwd: workerDir,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "inherit"],
  });
  return (JSON.parse(out) as { results: T[] }[])[0]!.results;
}

function runFile(sql: string): void {
  const file = join(mkdtempSync(join(tmpdir(), "devseed-")), "seed.sql");
  writeFileSync(file, sql);
  execFileSync("npx", ["wrangler", "d1", "execute", "DB", "--local", "--file", file], {
    cwd: workerDir,
    stdio: "inherit",
  });
}

const q = (v: string | number | null): string =>
  v === null ? "NULL" : typeof v === "number" ? String(v) : `'${v.replace(/'/g, "''")}'`;

function insert(table: string, row: Record<string, string | number | null>): string {
  const cols = Object.keys(row);
  return `INSERT INTO ${table} (${cols.join(", ")}) VALUES (${cols.map((c) => q(row[c]!)).join(", ")});`;
}

// ── fixtures ────────────────────────────────────────────────────────────

type Profile = "typed" | "one-paste" | "many-pastes" | "llm" | "autocorrect" | "mixed" | "none";

const STUDENTS: { name: string; profile: Profile; late?: boolean; resubmits?: number; renames?: boolean }[] = [
  { name: "Ada Park", profile: "typed" },
  { name: "Ben Okafor", profile: "one-paste", resubmits: 2 },
  { name: "Chloe Ramos", profile: "many-pastes", late: true },
  { name: "Dev Mehta", profile: "llm", renames: true },
  { name: "Elif Kaya", profile: "autocorrect" },
  { name: "Felix Wu", profile: "mixed", late: true, resubmits: 1 },
  { name: "Grace Lin", profile: "none" },
  { name: "Hugo Silva", profile: "none" },
];

const PROSE = [
  "The question this assignment asks is narrower than it first looks.",
  "Most of the evidence points one way, but the strongest counterexample deserves a careful hearing.",
  "I start from the definition we used in class and test it against three cases.",
  "The first case fits cleanly; the second only fits if we relax one assumption.",
  "That assumption turns out to carry most of the argument's weight.",
  "So the conclusion holds, but for a reason different from the one I expected when I began.",
];
const PASTED = "According to the course reader, the effect is strongest when the sample is small.";
const FROM_LLM =
  "One way to frame this is as a trade-off between precision and coverage: tightening the criteria improves accuracy but excludes borderline cases that may matter most.";

/** Ordered pieces of a submission, each with how it got there. */
type Piece = { origin: Origin; text: string };

function piecesFor(profile: Profile, sentences: number): Piece[] {
  const typed = (i: number): Piece => ({ origin: "human", text: PROSE[i % PROSE.length]! + " " });
  const out: Piece[] = [];
  for (let i = 0; i < sentences; i++) {
    out.push(typed(i));
    if (profile === "one-paste" && i === 1) out.push({ origin: "pasted", text: PASTED + " " });
    if (profile === "many-pastes" && i % 2 === 0) out.push({ origin: "pasted", text: PASTED + " " });
    if (profile === "llm" && i % 2 === 1) out.push({ origin: "llm", text: FROM_LLM + " " });
    if (profile === "autocorrect" && i % 2 === 0) out.push({ origin: "edited", text: "definitely " });
    if (profile === "mixed" && i === 1) out.push({ origin: "pasted", text: PASTED + " " });
    if (profile === "mixed" && i === 3) out.push({ origin: "llm", text: FROM_LLM + " " });
  }
  return out;
}

/** The pieces as an append-only edit log, starting from `base` characters. */
function eventsFor(pieces: Piece[], base: number, t0: number): LogEvent[] {
  const events: LogEvent[] = [];
  let offset = base;
  let seq = 0;
  let clock = t0;
  for (const p of pieces) {
    // Typing arrives word by word; imports arrive whole.
    const chunks = p.origin === "human" ? p.text.match(/\S+\s*/g) ?? [p.text] : [p.text];
    for (const text of chunks) {
      clock += p.origin === "human" ? 2_000 : 500;
      events.push({
        kind: p.origin === "pasted" ? "paste" : p.origin === "llm" ? "llm_insert" : "insert",
        offset,
        length: text.length,
        text,
        origin: p.origin,
        clientSeq: ++seq,
        createdAt: clock,
      });
      offset += text.length;
    }
  }
  return events;
}

/** When the n-th submission (0 = first) lands, relative to the deadline. */
function submittedAt(due: number | null, s: (typeof STUDENTS)[number], n: number, total: number): number {
  // With no deadline nothing can be late; land everything in the past.
  const last =
    due === null ? Date.now() - (2 + (s.late ? 0 : 4)) * HOUR : s.late ? due + 5 * HOUR : due - 6 * HOUR;
  // Never in the future, even for a deadline that hasn't passed yet.
  return Math.min(last, Date.now() - HOUR) - (total - 1 - n) * DAY;
}

// ── read the course ─────────────────────────────────────────────────────

const [course] = query<{ org_id: string }>(`SELECT org_id FROM courses WHERE id = ${q(courseId)}`);
if (!course) {
  console.error(`No course ${courseId} in the local database.`);
  process.exit(1);
}

const clean = [
  `DELETE FROM provenance_submissions WHERE token LIKE '${PREFIX}%';`,
  `DELETE FROM provenance_documents WHERE id LIKE '${PREFIX}%';`,
  `DELETE FROM code_submissions WHERE id LIKE '${PREFIX}%';`,
  `DELETE FROM code_notebooks WHERE id LIKE '${PREFIX}%';`,
  `DELETE FROM enrollments WHERE id LIKE '${PREFIX}%';`,
  `DELETE FROM users WHERE id LIKE '${PREFIX}%';`,
  `DELETE FROM course_items WHERE id LIKE '${PREFIX}%';`,
  `DELETE FROM provenance_assignment_checkpoints WHERE id LIKE '${PREFIX}%';`,
  `DELETE FROM provenance_assignments WHERE id LIKE '${PREFIX}%';`,
  `DELETE FROM code_assignments WHERE id LIKE '${PREFIX}%';`,
];

if (cleanOnly) {
  runFile(clean.join("\n"));
  console.log("Removed every devseed_ row.");
  process.exit(0);
}

// The seed's own assignments, with deadlines, so late work has something to
// be late for.
{
  const t = Date.now();
  const essay = `${PREFIX}pasg_essay`;
  const pset = `${PREFIX}casg_pset`;
  const psetDue = t - 2 * DAY;
  runFile(
    [
      ...clean,
      insert("provenance_assignments", {
        id: essay,
        course_id: courseId,
        title: "[dev] Argument essay",
        instructions: "Make one claim and defend it against the strongest objection.",
        created_at: t - 14 * DAY,
        updated_at: t - 14 * DAY,
        archived_at: null,
      }),
      insert("provenance_assignment_checkpoints", {
        id: `${PREFIX}pcp_draft`,
        assignment_id: essay,
        ord: 0,
        name: "Draft",
        due_at: t - 4 * DAY,
      }),
      insert("provenance_assignment_checkpoints", {
        id: `${PREFIX}pcp_final`,
        assignment_id: essay,
        ord: 1,
        name: "Final",
        due_at: t - 1 * DAY,
      }),
      insert("code_assignments", {
        id: pset,
        course_id: courseId,
        title: "[dev] Problem set",
        instructions: "Compute the summary statistics, then explain them in a text cell.",
        starter_json: JSON.stringify({
          cells: [
            { id: "devseed_md", type: "markdown", source: "# Problem set\n\nRun each cell, then **explain** the result." },
            { id: "devseed_code", type: "code", source: "values = [3, 1, 4, 1, 5, 9, 2, 6]" },
          ],
        }),
        due_at: psetDue,
        mode: "submit",
        created_at: t - 14 * DAY,
        updated_at: t - 14 * DAY,
        archived_at: null,
      }),
      insert("code_assignments", {
        id: `${PREFIX}casg_project`,
        course_id: courseId,
        title: "[dev] Final project",
        instructions: "Pick a dataset and tell a story with it.",
        starter_json: JSON.stringify({ cells: [] }),
        due_at: t + 21 * DAY,
        mode: "submit",
        created_at: t - 14 * DAY,
        updated_at: t - 14 * DAY,
        archived_at: null,
      }),
      insert("course_items", {
        id: `${PREFIX}ci_project`,
        course_id: courseId,
        kind: "code",
        payload_ref: `${PREFIX}casg_project`,
        title: "[dev] Final project",
        ord: 902,
        assigned_at: null,
        due_at: t + 21 * DAY,
        note: null,
        archived_at: null,
        created_at: t,
        updated_at: t,
      }),
      insert("course_items", {
        id: `${PREFIX}ci_essay`,
        course_id: courseId,
        kind: "writing",
        payload_ref: essay,
        title: "[dev] Argument essay",
        ord: 900,
        assigned_at: null,
        due_at: null,
        note: null,
        archived_at: null,
        created_at: t,
        updated_at: t,
      }),
      insert("course_items", {
        id: `${PREFIX}ci_pset`,
        course_id: courseId,
        kind: "code",
        payload_ref: pset,
        title: "[dev] Problem set",
        ord: 901,
        assigned_at: null,
        due_at: psetDue,
        note: null,
        archived_at: null,
        created_at: t,
        updated_at: t,
      }),
    ].join("\n"),
  );
}

const checkpoints = query<{ assignment_id: string; title: string; checkpoint_id: string; due_at: number | null }>(
  `SELECT a.id AS assignment_id, a.title, c.id AS checkpoint_id, c.due_at
     FROM provenance_assignments a
     JOIN provenance_assignment_checkpoints c ON c.assignment_id = a.id
    WHERE a.course_id = ${q(courseId)}
    ORDER BY a.id, c.ord`,
);
const codeAssignments = query<{ id: string; title: string; starter_json: string; due_at: number | null }>(
  `SELECT id, title, starter_json, due_at FROM code_assignments
    WHERE course_id = ${q(courseId)} AND mode = 'submit' AND id != '${PREFIX}casg_project'`,
);

// ── build ───────────────────────────────────────────────────────────────

const sql: string[] = [];
const now = Date.now();
let writingCount = 0;
let codeCount = 0;

STUDENTS.forEach((s, i) => {
  const userId = `${PREFIX}user_${i + 1}`;
  sql.push(
    insert("users", {
      id: userId,
      org_id: course.org_id,
      email: `dev-student-${i + 1}@example.edu`,
      display_name: s.name,
      created_at: now,
    }),
    insert("enrollments", {
      id: `${PREFIX}enr_${i + 1}`,
      course_id: courseId,
      user_id: userId,
      role: "student",
      created_at: now,
    }),
  );
  if (s.profile === "none") return;
  const total = 1 + (s.resubmits ?? 0);

  // Writing: one document per student per assignment; a submission per
  // checkpoint, with earlier (shorter) drafts behind the last one.
  const docs = new Set<string>();
  for (const cp of checkpoints) {
    const docId = `${PREFIX}doc_${i + 1}_${cp.assignment_id}`;
    const title = s.renames ? `${cp.title} (draft)` : cp.title;
    const final = piecesFor(s.profile, PROSE.length);
    const text = final.map((p) => p.text).join("").trimEnd();
    if (!docs.has(docId)) {
      docs.add(docId);
      sql.push(
        insert("provenance_documents", {
          id: docId,
          course_id: courseId,
          owner_user_id: userId,
          title,
          body_json: JSON.stringify({
            type: "doc",
            content: [{ type: "paragraph", content: [{ type: "text", text }] }],
          }),
          word_count: text.split(/\s+/).length,
          char_count: text.length,
          event_coords: "text",
          assignment_id: cp.assignment_id,
          created_at: now - 10 * DAY,
          updated_at: now,
        }),
      );
    }
    for (let n = 0; n < total; n++) {
      const at = submittedAt(cp.due_at, s, n, total);
      // Earlier drafts are prefixes of the final text.
      const pieces = final.slice(0, Math.ceil((final.length * (n + 1)) / total));
      const draft = pieces.map((p) => p.text).join("");
      const render = buildRender<Origin>(draft, eventsFor(pieces, 0, at - HOUR), {
        corpusOrigin: () => "pasted",
      });
      sql.push(
        insert("provenance_submissions", {
          token: `${PREFIX}${i + 1}_${cp.checkpoint_id}_${n}`,
          document_id: docId,
          course_id: courseId,
          user_id: userId,
          title_snapshot: title,
          render_json: JSON.stringify(render),
          snapshot_event_seq: 0,
          created_at: at,
          revoked_at: null,
          assignment_id: cp.assignment_id,
          checkpoint_id: cp.checkpoint_id,
        }),
      );
      writingCount++;
    }
  }

  // Code: the starter notebook plus the student's own work appended to the
  // first code cell (or a new cell when the starter has none).
  for (const a of codeAssignments) {
    const starter = JSON.parse(a.starter_json) as NotebookContent;
    const baseline: Record<string, string> = {};
    for (const c of starter.cells) if (c.source) baseline[c.id] = c.source;
    const target = starter.cells.find((c) => c.type === "code");
    const cellId = target?.id ?? "devseed_cell";
    const start = target?.source ?? "";
    const nbId = `${PREFIX}nb_${i + 1}_${a.id}`;

    const pieces: Piece[] = piecesFor(s.profile, 4).map((p) => ({
      origin: p.origin,
      text: "\n# " + p.text.trim(),
    }));
    const contentFor = (ps: Piece[]): NotebookContent => {
      const source = start + ps.map((p) => p.text).join("");
      const cells = target
        ? starter.cells.map((c) => (c.id === cellId ? { ...c, source } : c))
        : [...starter.cells, { id: cellId, type: "code" as const, source }];
      return { cells };
    };

    sql.push(
      insert("code_notebooks", {
        id: nbId,
        course_id: courseId,
        owner_user_id: userId,
        assignment_id: a.id,
        title: a.title,
        cells_json: JSON.stringify(contentFor(pieces)),
        baseline_json: JSON.stringify(baseline),
        created_at: now - 10 * DAY,
        updated_at: now,
      }),
    );
    for (let n = 0; n < total; n++) {
      const at = submittedAt(a.due_at, s, n, total);
      const ps = pieces.slice(0, Math.ceil((pieces.length * (n + 1)) / total));
      const content = contentFor(ps);
      const events: CodeEventRow[] = eventsFor(ps, start.length, at - HOUR).map((e) => ({
        cell_id: cellId,
        kind: e.kind,
        offset: e.offset,
        length: e.length,
        text: e.text,
        origin: e.origin,
        restored_origins: null,
        client_seq: e.clientSeq,
        created_at: e.createdAt,
      }));
      const render = buildSubmissionRender(content, baseline, events, []);
      sql.push(
        insert("code_submissions", {
          id: `${PREFIX}csub_${i + 1}_${a.id}_${n}`,
          course_id: courseId,
          assignment_id: a.id,
          notebook_id: nbId,
          owner_user_id: userId,
          title: a.title,
          cells_json: JSON.stringify(content),
          messages_json: "[]",
          render_json: JSON.stringify(render),
          created_at: at,
        }),
      );
      codeCount++;
    }
  }
});

runFile(sql.join("\n"));
console.log(
  `Seeded ${STUDENTS.length} students (${STUDENTS.filter((s) => s.profile === "none").length} with nothing submitted), ` +
    `${writingCount} writing and ${codeCount} code submissions across ` +
    `${checkpoints.length} checkpoint(s) and ${codeAssignments.length} code assignment(s).`,
);
