// D1 queries for the code module. Every query filters by course_id, and
// every notebook read is also scoped to its owner — the one exception is the
// instructor's submission view, which crosses the owner boundary and is
// gated by role in handlers.ts before it gets here.

import type { CodeEventRow } from "./render.js";
import type {
  AssignmentMode,
  CodeAssignmentRow,
  CodeMessageRow,
  CodeNotebookRow,
  CodeSubmissionRow,
} from "./types.js";

const now = () => Date.now();
const newAssignmentId = () => `casg_${crypto.randomUUID()}`;
const newNotebookId = () => `cnb_${crypto.randomUUID()}`;
const newMessageId = () => `cmsg_${crypto.randomUUID()}`;
const newSubmissionId = () => `csub_${crypto.randomUUID()}`;
const newEventId = () => `cev_${crypto.randomUUID()}`;

// ── course flag ─────────────────────────────────────────────────────────

/** Whether the course has the code module turned on. Missing settings row
 *  reads as off — the module is opt-in. */
export async function codeEnabled(db: D1Database, courseId: string): Promise<boolean> {
  const row = await db
    .prepare(`SELECT code_enabled FROM course_settings WHERE course_id = ?`)
    .bind(courseId)
    .first<{ code_enabled: number }>();
  return row?.code_enabled === 1;
}

export async function enrollmentRole(
  db: D1Database,
  courseId: string,
  userId: string,
): Promise<string | null> {
  const row = await db
    .prepare(`SELECT role FROM enrollments WHERE course_id = ? AND user_id = ?`)
    .bind(courseId, userId)
    .first<{ role: string }>();
  return row?.role ?? null;
}

// ── assignments ─────────────────────────────────────────────────────────

export async function listAssignments(
  db: D1Database,
  courseId: string,
  includeArchived: boolean,
): Promise<CodeAssignmentRow[]> {
  const { results } = await db
    .prepare(
      `SELECT * FROM code_assignments
        WHERE course_id = ? ${includeArchived ? "" : "AND archived_at IS NULL"}
        ORDER BY (due_at IS NULL), due_at ASC, created_at DESC`,
    )
    .bind(courseId)
    .all<CodeAssignmentRow>();
  return results ?? [];
}

export async function getAssignment(
  db: D1Database,
  courseId: string,
  id: string,
): Promise<CodeAssignmentRow | null> {
  return db
    .prepare(`SELECT * FROM code_assignments WHERE id = ? AND course_id = ?`)
    .bind(id, courseId)
    .first<CodeAssignmentRow>();
}

export interface AssignmentInput {
  title: string;
  instructions: string;
  starterJson: string;
  aiEnabled: boolean;
  aiPrompt: string | null;
  dueAt: number | null;
  mode: AssignmentMode;
}

export async function createAssignment(
  db: D1Database,
  courseId: string,
  input: AssignmentInput,
): Promise<CodeAssignmentRow> {
  const id = newAssignmentId();
  const ts = now();
  await db
    .prepare(
      `INSERT INTO code_assignments
         (id, course_id, title, instructions, starter_json, ai_enabled, ai_prompt,
          due_at, mode, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      id,
      courseId,
      input.title,
      input.instructions,
      input.starterJson,
      input.aiEnabled ? 1 : 0,
      input.aiPrompt,
      input.dueAt,
      input.mode,
      ts,
      ts,
    )
    .run();
  return (await getAssignment(db, courseId, id))!;
}

export async function updateAssignment(
  db: D1Database,
  courseId: string,
  id: string,
  patch: Partial<AssignmentInput> & { archived?: boolean },
): Promise<void> {
  const sets: string[] = [];
  const binds: unknown[] = [];
  const add = (col: string, v: unknown) => {
    sets.push(`${col} = ?`);
    binds.push(v);
  };
  if (patch.title !== undefined) add("title", patch.title);
  if (patch.instructions !== undefined) add("instructions", patch.instructions);
  if (patch.starterJson !== undefined) add("starter_json", patch.starterJson);
  if (patch.aiEnabled !== undefined) add("ai_enabled", patch.aiEnabled ? 1 : 0);
  if (patch.aiPrompt !== undefined) add("ai_prompt", patch.aiPrompt);
  if (patch.dueAt !== undefined) add("due_at", patch.dueAt);
  if (patch.mode !== undefined) add("mode", patch.mode);
  if (patch.archived !== undefined) add("archived_at", patch.archived ? now() : null);
  add("updated_at", now());
  await db
    .prepare(`UPDATE code_assignments SET ${sets.join(", ")} WHERE id = ? AND course_id = ?`)
    .bind(...binds, id, courseId)
    .run();
}

/** Delete an assignment. Students' notebooks survive as scratch notebooks
 *  (detached rather than destroyed); submissions keep their frozen copy. */
export async function deleteAssignment(
  db: D1Database,
  courseId: string,
  id: string,
): Promise<void> {
  await db.batch([
    db
      .prepare(
        `UPDATE code_notebooks SET assignment_id = NULL
          WHERE course_id = ? AND assignment_id = ?`,
      )
      .bind(courseId, id),
    db.prepare(`DELETE FROM code_assignments WHERE id = ? AND course_id = ?`).bind(id, courseId),
  ]);
}

// ── notebooks ───────────────────────────────────────────────────────────

export async function listNotebooks(
  db: D1Database,
  courseId: string,
  ownerUserId: string,
): Promise<CodeNotebookRow[]> {
  const { results } = await db
    .prepare(
      `SELECT id, course_id, owner_user_id, assignment_id, title, '' AS cells_json,
              NULL AS baseline_json, created_at, updated_at
         FROM code_notebooks
        WHERE course_id = ? AND owner_user_id = ?
        ORDER BY updated_at DESC`,
    )
    .bind(courseId, ownerUserId)
    .all<CodeNotebookRow>();
  return results ?? [];
}

export async function getNotebook(
  db: D1Database,
  courseId: string,
  ownerUserId: string,
  id: string,
): Promise<CodeNotebookRow | null> {
  return db
    .prepare(
      `SELECT * FROM code_notebooks WHERE id = ? AND course_id = ? AND owner_user_id = ?`,
    )
    .bind(id, courseId, ownerUserId)
    .first<CodeNotebookRow>();
}

export async function findAssignmentNotebook(
  db: D1Database,
  courseId: string,
  ownerUserId: string,
  assignmentId: string,
): Promise<CodeNotebookRow | null> {
  return db
    .prepare(
      `SELECT * FROM code_notebooks
        WHERE course_id = ? AND owner_user_id = ? AND assignment_id = ?`,
    )
    .bind(courseId, ownerUserId, assignmentId)
    .first<CodeNotebookRow>();
}

export async function createNotebook(
  db: D1Database,
  params: {
    courseId: string;
    ownerUserId: string;
    assignmentId: string | null;
    title: string;
    cellsJson: string;
    baselineJson: string | null;
  },
): Promise<CodeNotebookRow> {
  const id = newNotebookId();
  const ts = now();
  // INSERT OR IGNORE: two tabs opening the same assignment at once race on
  // the unique (owner, assignment) index. The loser re-reads the winner.
  await db
    .prepare(
      `INSERT OR IGNORE INTO code_notebooks
         (id, course_id, owner_user_id, assignment_id, title, cells_json, baseline_json,
          created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      id,
      params.courseId,
      params.ownerUserId,
      params.assignmentId,
      params.title,
      params.cellsJson,
      params.baselineJson,
      ts,
      ts,
    )
    .run();
  const created = await getNotebook(db, params.courseId, params.ownerUserId, id);
  if (created) return created;
  return (await findAssignmentNotebook(
    db,
    params.courseId,
    params.ownerUserId,
    params.assignmentId!,
  ))!;
}

export async function updateNotebook(
  db: D1Database,
  courseId: string,
  ownerUserId: string,
  id: string,
  patch: { title?: string; cellsJson?: string },
): Promise<number> {
  const sets: string[] = [];
  const binds: unknown[] = [];
  if (patch.title !== undefined) {
    sets.push("title = ?");
    binds.push(patch.title);
  }
  if (patch.cellsJson !== undefined) {
    sets.push("cells_json = ?");
    binds.push(patch.cellsJson);
  }
  const ts = now();
  sets.push("updated_at = ?");
  binds.push(ts);
  await db
    .prepare(
      `UPDATE code_notebooks SET ${sets.join(", ")}
        WHERE id = ? AND course_id = ? AND owner_user_id = ?`,
    )
    .bind(...binds, id, courseId, ownerUserId)
    .run();
  return ts;
}

export async function deleteNotebook(
  db: D1Database,
  courseId: string,
  ownerUserId: string,
  id: string,
): Promise<void> {
  // Messages cascade from the notebook. Submissions are deliberately kept:
  // they are an instructor's record of what was handed in.
  await db
    .prepare(`DELETE FROM code_notebooks WHERE id = ? AND course_id = ? AND owner_user_id = ?`)
    .bind(id, courseId, ownerUserId)
    .run();
}

// ── tutor messages ──────────────────────────────────────────────────────

export async function listMessages(
  db: D1Database,
  courseId: string,
  notebookId: string,
  before?: number,
): Promise<CodeMessageRow[]> {
  const { results } = await db
    .prepare(
      `SELECT * FROM code_messages
        WHERE notebook_id = ? AND course_id = ? ${before !== undefined ? "AND created_at <= ?" : ""}
        ORDER BY created_at ASC, id ASC`,
    )
    .bind(...(before !== undefined ? [notebookId, courseId, before] : [notebookId, courseId]))
    .all<CodeMessageRow>();
  return results ?? [];
}

export async function commitTurn(
  db: D1Database,
  params: {
    notebookId: string;
    courseId: string;
    userContent: string;
    assistantContent: string;
    /** See novelReplyText. */
    assistantNovelText: string;
    promptHash: string;
    userAt: number;
  },
): Promise<{ assistantMessageId: string }> {
  const assistantMessageId = newMessageId();
  // The assistant row is stamped one ms after the user row so ordering is
  // stable even when both land in the same millisecond.
  const assistantAt = Math.max(now(), params.userAt + 1);
  await db.batch([
    db
      .prepare(
        `INSERT INTO code_messages (id, notebook_id, course_id, role, content, prompt_hash, created_at)
         VALUES (?, ?, ?, 'user', ?, ?, ?)`,
      )
      .bind(newMessageId(), params.notebookId, params.courseId, params.userContent, params.promptHash, params.userAt),
    db
      .prepare(
        `INSERT INTO code_messages
           (id, notebook_id, course_id, role, content, prompt_hash, novel_text, created_at)
         VALUES (?, ?, ?, 'assistant', ?, ?, ?, ?)`,
      )
      .bind(
        assistantMessageId,
        params.notebookId,
        params.courseId,
        params.assistantContent,
        params.promptHash,
        params.assistantNovelText,
        assistantAt,
      ),
  ]);
  return { assistantMessageId };
}

// ── submissions ─────────────────────────────────────────────────────────

export async function createSubmission(
  db: D1Database,
  params: {
    courseId: string;
    assignmentId: string;
    notebookId: string;
    ownerUserId: string;
    title: string;
    cellsJson: string;
    messagesJson: string;
    renderJson: string | null;
  },
): Promise<CodeSubmissionRow> {
  const row: CodeSubmissionRow = {
    id: newSubmissionId(),
    course_id: params.courseId,
    assignment_id: params.assignmentId,
    notebook_id: params.notebookId,
    owner_user_id: params.ownerUserId,
    title: params.title,
    cells_json: params.cellsJson,
    messages_json: params.messagesJson,
    render_json: params.renderJson,
    created_at: now(),
  };
  await db
    .prepare(
      `INSERT INTO code_submissions
         (id, course_id, assignment_id, notebook_id, owner_user_id, title, cells_json,
          messages_json, render_json, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      row.id,
      row.course_id,
      row.assignment_id,
      row.notebook_id,
      row.owner_user_id,
      row.title,
      row.cells_json,
      row.messages_json,
      row.render_json,
      row.created_at,
    )
    .run();
  return row;
}

export async function listMySubmissions(
  db: D1Database,
  courseId: string,
  ownerUserId: string,
  assignmentId: string,
): Promise<Array<Pick<CodeSubmissionRow, "id" | "assignment_id" | "created_at">>> {
  const { results } = await db
    .prepare(
      `SELECT id, assignment_id, created_at FROM code_submissions
        WHERE course_id = ? AND owner_user_id = ? AND assignment_id = ?
        ORDER BY created_at DESC`,
    )
    .bind(courseId, ownerUserId, assignmentId)
    .all<Pick<CodeSubmissionRow, "id" | "assignment_id" | "created_at">>();
  return results ?? [];
}

export async function getSubmission(
  db: D1Database,
  courseId: string,
  id: string,
): Promise<CodeSubmissionRow | null> {
  return db
    .prepare(`SELECT * FROM code_submissions WHERE id = ? AND course_id = ?`)
    .bind(id, courseId)
    .first<CodeSubmissionRow>();
}

export async function getUser(
  db: D1Database,
  userId: string,
): Promise<{ id: string; email: string; display_name: string | null } | null> {
  return db
    .prepare(`SELECT id, email, display_name FROM users WHERE id = ?`)
    .bind(userId)
    .first<{ id: string; email: string; display_name: string | null }>();
}

export interface RosterRow {
  user_id: string;
  email: string;
  display_name: string | null;
  submission_id: string | null;
  submitted_at: number | null;
  submission_count: number;
}

/** Every enrolled student, with their latest submission to one assignment.
 *  A student who submitted nothing still gets a row — that is the student an
 *  instructor is looking for. */
export async function listRoster(
  db: D1Database,
  courseId: string,
  assignmentId: string,
): Promise<RosterRow[]> {
  const { results } = await db
    .prepare(
      `SELECT e.user_id, u.email, u.display_name,
              s.id AS submission_id, s.created_at AS submitted_at,
              (SELECT COUNT(*) FROM code_submissions c
                WHERE c.course_id = e.course_id AND c.assignment_id = ?
                  AND c.owner_user_id = e.user_id) AS submission_count
         FROM enrollments e
         JOIN users u ON u.id = e.user_id
         LEFT JOIN code_submissions s
                ON s.owner_user_id = e.user_id
               AND s.course_id = e.course_id
               AND s.assignment_id = ?
               AND NOT EXISTS (
                     SELECT 1 FROM code_submissions s2
                      WHERE s2.owner_user_id = s.owner_user_id
                        AND s2.course_id = s.course_id
                        AND s2.assignment_id = s.assignment_id
                        AND (s2.created_at > s.created_at
                             OR (s2.created_at = s.created_at AND s2.id > s.id))
                   )
        WHERE e.course_id = ? AND e.role = 'student'
        ORDER BY COALESCE(u.display_name, u.email) COLLATE NOCASE ASC`,
    )
    .bind(assignmentId, assignmentId, courseId)
    .all<RosterRow>();
  return results ?? [];
}

// ── edit events ─────────────────────────────────────────────────────────

export interface InboundCodeEvent {
  cellId: string;
  kind: CodeEventRow["kind"];
  offset: number;
  length: number;
  text: string | null;
  origin: CodeEventRow["origin"];
  restoredOrigins: string | null;
  clientSeq: number;
}

export async function maxEventSeq(db: D1Database, notebookId: string): Promise<number> {
  const row = await db
    .prepare(`SELECT MAX(client_seq) AS max_seq FROM code_events WHERE notebook_id = ?`)
    .bind(notebookId)
    .first<{ max_seq: number | null }>();
  return row?.max_seq ?? 0;
}

/** Append a batch. Events at or below the stored max client_seq are dropped,
 *  so a retried batch is idempotent. Stamped with server receipt time. */
export async function appendEvents(
  db: D1Database,
  params: { notebookId: string; courseId: string; events: InboundCodeEvent[] },
): Promise<{ inserted: number; maxClientSeq: number }> {
  const known = await maxEventSeq(db, params.notebookId);
  const fresh = params.events.filter((e) => e.clientSeq > known);
  if (fresh.length === 0) return { inserted: 0, maxClientSeq: known };
  const at = now();
  const stmt = db.prepare(
    `INSERT INTO code_events
       (id, notebook_id, course_id, cell_id, kind, offset, length, text, origin,
        restored_origins, client_seq, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  await db.batch(
    fresh.map((e) =>
      stmt.bind(
        newEventId(),
        params.notebookId,
        params.courseId,
        e.cellId,
        e.kind,
        e.offset,
        e.length,
        e.text,
        e.origin,
        e.restoredOrigins,
        e.clientSeq,
        at,
      ),
    ),
  );
  return { inserted: fresh.length, maxClientSeq: fresh[fresh.length - 1]!.clientSeq };
}

export async function listEvents(
  db: D1Database,
  courseId: string,
  notebookId: string,
): Promise<CodeEventRow[]> {
  const { results } = await db
    .prepare(
      `SELECT cell_id, kind, offset, length, text, origin, restored_origins, client_seq, created_at
         FROM code_events WHERE notebook_id = ? AND course_id = ?
        ORDER BY client_seq ASC`,
    )
    .bind(notebookId, courseId)
    .all<CodeEventRow>();
  return results ?? [];
}
