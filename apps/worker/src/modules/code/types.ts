// Shared types for the code module (browser-run Python notebooks).
//
// The notebook document is a small JSON shape of our own rather than the
// Jupyter .ipynb format. Only the parts the platform uses are modelled, and
// every output kind is structured data — never raw HTML — so a submitted
// notebook can be rendered on an instructor's screen without executing or
// injecting anything the student's code produced.

import type { Origin, OriginRun, ProvenanceAudit, PasteRecord } from "@marginalia/provenance";

export type CellType = "code" | "markdown";
export type AssignmentMode = "submit" | "practice";

export type CellOutput =
  | { type: "stream"; name: "stdout" | "stderr"; text: string }
  /** The repr of a cell's final expression. */
  | { type: "result"; text: string }
  /** A rendered figure. `data` is base64 without a data: prefix. */
  | { type: "image"; mime: "image/png"; data: string }
  /** A DataFrame (or Series), flattened to strings in the runtime. */
  | {
      type: "table";
      columns: string[];
      index: string[];
      rows: string[][];
      /** Full shape before truncation, [rows, columns]. */
      shape: [number, number];
    }
  | { type: "error"; ename: string; evalue: string; traceback: string };

export interface Cell {
  id: string;
  type: CellType;
  source: string;
  outputs?: CellOutput[];
  /** The editor's live origin guess for `source`, kept so a reload (and a
   *  move between cells) restores it. Never authoritative: the render an
   *  instructor sees is recomputed from code_events. */
  origins?: OriginRun[];
}

export interface NotebookContent {
  cells: Cell[];
}

// ── rows ────────────────────────────────────────────────────────────────

export interface CodeAssignmentRow {
  id: string;
  course_id: string;
  title: string;
  instructions: string;
  starter_json: string;
  ai_enabled: number;
  ai_prompt: string | null;
  due_at: number | null;
  mode: AssignmentMode;
  created_at: number;
  updated_at: number;
  archived_at: number | null;
}

export interface CodeNotebookRow {
  id: string;
  course_id: string;
  owner_user_id: string;
  assignment_id: string | null;
  title: string;
  cells_json: string;
  baseline_json: string | null;
  created_at: number;
  updated_at: number;
}

export interface CodeMessageRow {
  id: string;
  notebook_id: string;
  course_id: string;
  role: "user" | "assistant";
  content: string;
  prompt_hash: string;
  novel_text: string | null;
  created_at: number;
}

export interface CodeSubmissionRow {
  id: string;
  course_id: string;
  assignment_id: string;
  notebook_id: string;
  owner_user_id: string;
  title: string;
  cells_json: string;
  messages_json: string;
  render_json: string | null;
  created_at: number;
}

// ── DTOs ────────────────────────────────────────────────────────────────

export interface CodeAssignmentDTO {
  id: string;
  courseId: string;
  title: string;
  instructions: string;
  aiEnabled: boolean;
  /** Instructor-only. Omitted for students: the tutor's instructions are
   *  the instructor's, and a student has no use for them. */
  aiPrompt?: string | null;
  dueAt: number | null;
  mode: AssignmentMode;
  archivedAt: number | null;
  createdAt: number;
  updatedAt: number;
  /** Present on single fetches only; the list omits it. */
  starter?: NotebookContent;
}

export interface NotebookSummaryDTO {
  id: string;
  title: string;
  assignmentId: string | null;
  updatedAt: number;
}

export interface NotebookDTO extends NotebookSummaryDTO {
  courseId: string;
  content: NotebookContent;
  createdAt: number;
  /** Whether the AI tutor is available beside this notebook. Derived from
   *  the assignment; a scratch notebook has none. */
  aiEnabled: boolean;
  /** The assignment's title, instructions, and deadline, for the header. */
  assignment: {
    title: string;
    instructions: string;
    dueAt: number | null;
    mode: AssignmentMode;
  } | null;
  /** Whether edits are being recorded (an assignment in submit mode). */
  tracking: boolean;
  /** Highest client_seq the server holds for this notebook's log. */
  eventSeq: number;
}

/** One cell's origin render, computed at submission time. */
export interface CellRender {
  runs: OriginRun[];
  pastes: PasteRecord[];
  audit: ProvenanceAudit;
}

export interface SubmissionRender {
  v: 1;
  cells: Record<string, CellRender>;
  /** Characters per origin across every cell. */
  totals: Record<Origin, number>;
}

export interface CodeMessageDTO {
  id: string;
  role: "user" | "assistant";
  content: string;
  createdAt: number;
}

export interface SubmissionSummaryDTO {
  id: string;
  assignmentId: string;
  submittedAt: number;
  late: boolean;
}

export interface SubmissionDTO extends SubmissionSummaryDTO {
  title: string;
  content: NotebookContent;
  student: { userId: string; email: string; displayName: string | null };
  /** The tutor conversation as it stood at submission time. */
  messages: CodeMessageDTO[];
  /** Null when nothing was recorded (a practice-mode or pre-tracking copy). */
  render: SubmissionRender | null;
}

export interface RosterStudentDTO {
  userId: string;
  email: string;
  displayName: string | null;
  /** Latest submission, or null when the student has submitted nothing. */
  latest: SubmissionSummaryDTO | null;
  submissionCount: number;
}

// ── mappers ─────────────────────────────────────────────────────────────

export function parseContent(raw: string): NotebookContent {
  try {
    const v = JSON.parse(raw) as { cells?: unknown };
    return { cells: Array.isArray(v.cells) ? (v.cells as Cell[]) : [] };
  } catch {
    return { cells: [] };
  }
}

export function isLate(submittedAt: number, dueAt: number | null): boolean {
  return dueAt !== null && submittedAt > dueAt;
}

export function toAssignmentDTO(
  row: CodeAssignmentRow,
  opts: { instructor: boolean; withStarter?: boolean },
): CodeAssignmentDTO {
  return {
    id: row.id,
    courseId: row.course_id,
    title: row.title,
    instructions: row.instructions,
    aiEnabled: row.ai_enabled === 1,
    mode: row.mode === "practice" ? "practice" : "submit",
    ...(opts.instructor ? { aiPrompt: row.ai_prompt } : {}),
    dueAt: row.due_at,
    archivedAt: row.archived_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    ...(opts.withStarter ? { starter: parseContent(row.starter_json) } : {}),
  };
}

export function toNotebookSummary(row: CodeNotebookRow): NotebookSummaryDTO {
  return {
    id: row.id,
    title: row.title,
    assignmentId: row.assignment_id,
    updatedAt: row.updated_at,
  };
}

export function toMessageDTO(row: CodeMessageRow): CodeMessageDTO {
  return { id: row.id, role: row.role, content: row.content, createdAt: row.created_at };
}
