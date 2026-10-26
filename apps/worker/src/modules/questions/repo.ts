// D1 access for question_sessions, question_boards and question_entries.
// Every query is scoped by course_id, directly or through a session or board
// the caller already resolved.

import type {
  QuestionBoardListRow,
  QuestionBoardRow,
  QuestionEntryRow,
  QuestionSessionListRow,
  QuestionSessionRow,
  SessionStatus,
} from "./types.js";

const newSessionId = () => `qs_${crypto.randomUUID()}`;
const newBoardId = () => `qb_${crypto.randomUUID()}`;
const newEntryId = () => `qe_${crypto.randomUUID()}`;

// ── sessions ───────────────────────────────────────────────────────────────

export async function getSession(db: D1Database, id: string): Promise<QuestionSessionRow | null> {
  return db
    .prepare(`SELECT * FROM question_sessions WHERE id = ?`)
    .bind(id)
    .first<QuestionSessionRow>();
}

/** Sessions in a course, newest first, each with its board count. Students
 *  never see drafts. */
export async function listSessions(
  db: D1Database,
  courseId: string,
  staff: boolean,
): Promise<QuestionSessionListRow[]> {
  const { results } = await db
    .prepare(
      `SELECT s.*,
              (SELECT COUNT(*) FROM question_boards b WHERE b.session_id = s.id) AS board_count
         FROM question_sessions s
        WHERE s.course_id = ? AND (? = 1 OR s.status != 'draft')
        ORDER BY s.created_at DESC`,
    )
    .bind(courseId, staff ? 1 : 0)
    .all<QuestionSessionListRow>();
  return results ?? [];
}

/** The open session that was opened most recently, if any — what the "live"
 *  prompt points people at. */
export async function latestOpenSession(
  db: D1Database,
  courseId: string,
): Promise<QuestionSessionRow | null> {
  return db
    .prepare(
      `SELECT * FROM question_sessions
        WHERE course_id = ? AND status = 'open'
        ORDER BY opened_at DESC
        LIMIT 1`,
    )
    .bind(courseId)
    .first<QuestionSessionRow>();
}

export async function createSession(
  db: D1Database,
  courseId: string,
  title: string,
  createdBy: string,
): Promise<QuestionSessionRow> {
  const row: QuestionSessionRow = {
    id: newSessionId(),
    course_id: courseId,
    title,
    status: "draft",
    created_by: createdBy,
    created_at: Date.now(),
    opened_at: null,
    closed_at: null,
  };
  await db
    .prepare(
      `INSERT INTO question_sessions (id, course_id, title, status, created_by, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
    )
    .bind(row.id, row.course_id, row.title, row.status, row.created_by, row.created_at)
    .run();
  return row;
}

export async function renameSession(db: D1Database, id: string, courseId: string, title: string) {
  await db
    .prepare(`UPDATE question_sessions SET title = ? WHERE id = ? AND course_id = ?`)
    .bind(title, id, courseId)
    .run();
}

/** Open or close a session, stamping when. A session never returns to draft:
 *  once students have seen it, it stays visible to them. */
export async function setSessionStatus(
  db: D1Database,
  id: string,
  courseId: string,
  status: Exclude<SessionStatus, "draft">,
) {
  const sql =
    status === "open"
      ? `UPDATE question_sessions SET status = 'open', opened_at = ?, closed_at = NULL
          WHERE id = ? AND course_id = ?`
      : `UPDATE question_sessions SET status = 'closed', closed_at = ?
          WHERE id = ? AND course_id = ?`;
  await db.prepare(sql).bind(Date.now(), id, courseId).run();
}

/** Delete a session with its boards and their questions. */
export async function deleteSession(db: D1Database, id: string, courseId: string) {
  await db.batch([
    db
      .prepare(
        `DELETE FROM question_entries
          WHERE course_id = ? AND board_id IN (SELECT id FROM question_boards WHERE session_id = ?)`,
      )
      .bind(courseId, id),
    db.prepare(`DELETE FROM question_boards WHERE session_id = ? AND course_id = ?`).bind(id, courseId),
    db.prepare(`DELETE FROM question_sessions WHERE id = ? AND course_id = ?`).bind(id, courseId),
  ]);
}

// ── boards ─────────────────────────────────────────────────────────────────

export async function getBoard(db: D1Database, id: string): Promise<QuestionBoardRow | null> {
  return db
    .prepare(`SELECT * FROM question_boards WHERE id = ?`)
    .bind(id)
    .first<QuestionBoardRow>();
}

/** A session's boards in order, each with its question count (hidden ones
 *  only when `staff`). */
export async function listBoards(
  db: D1Database,
  session: QuestionSessionRow,
  staff: boolean,
): Promise<QuestionBoardListRow[]> {
  const { results } = await db
    .prepare(
      `SELECT b.*,
              (SELECT COUNT(*) FROM question_entries e
                WHERE e.board_id = b.id AND (? = 1 OR e.hidden_at IS NULL)) AS question_count
         FROM question_boards b
        WHERE b.session_id = ? AND b.course_id = ?
        ORDER BY b.position ASC`,
    )
    .bind(staff ? 1 : 0, session.id, session.course_id)
    .all<QuestionBoardListRow>();
  return results ?? [];
}

/** Add a board at the end of the session. */
export async function createBoard(
  db: D1Database,
  session: QuestionSessionRow,
  title: string,
): Promise<QuestionBoardRow> {
  const last = await db
    .prepare(`SELECT MAX(position) AS p FROM question_boards WHERE session_id = ?`)
    .bind(session.id)
    .first<{ p: number | null }>();
  const row: QuestionBoardRow = {
    id: newBoardId(),
    session_id: session.id,
    course_id: session.course_id,
    title,
    position: (last?.p ?? -1) + 1,
    created_at: Date.now(),
  };
  await db
    .prepare(
      `INSERT INTO question_boards (id, session_id, course_id, title, position, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
    )
    .bind(row.id, row.session_id, row.course_id, row.title, row.position, row.created_at)
    .run();
  return row;
}

export async function renameBoard(db: D1Database, board: QuestionBoardRow, title: string) {
  await db
    .prepare(`UPDATE question_boards SET title = ? WHERE id = ? AND course_id = ?`)
    .bind(title, board.id, board.course_id)
    .run();
}

export async function deleteBoard(db: D1Database, board: QuestionBoardRow) {
  await db.batch([
    db
      .prepare(`DELETE FROM question_entries WHERE board_id = ? AND course_id = ?`)
      .bind(board.id, board.course_id),
    db
      .prepare(`DELETE FROM question_boards WHERE id = ? AND course_id = ?`)
      .bind(board.id, board.course_id),
  ]);
}

// ── questions ──────────────────────────────────────────────────────────────

/** A board's questions, oldest first. Hidden ones only when `staff`. */
export async function listEntries(
  db: D1Database,
  board: QuestionBoardRow,
  staff: boolean,
): Promise<QuestionEntryRow[]> {
  const { results } = await db
    .prepare(
      `SELECT * FROM question_entries
        WHERE board_id = ? AND course_id = ? AND (? = 1 OR hidden_at IS NULL)
        ORDER BY created_at ASC`,
    )
    .bind(board.id, board.course_id, staff ? 1 : 0)
    .all<QuestionEntryRow>();
  return results ?? [];
}

export async function getEntry(db: D1Database, id: string): Promise<QuestionEntryRow | null> {
  return db
    .prepare(`SELECT * FROM question_entries WHERE id = ?`)
    .bind(id)
    .first<QuestionEntryRow>();
}

export async function createEntry(
  db: D1Database,
  board: QuestionBoardRow,
  userId: string,
  body: string,
): Promise<QuestionEntryRow> {
  const now = Date.now();
  const row: QuestionEntryRow = {
    id: newEntryId(),
    board_id: board.id,
    course_id: board.course_id,
    user_id: userId,
    body,
    created_at: now,
    updated_at: now,
    hidden_at: null,
  };
  await db
    .prepare(
      `INSERT INTO question_entries (id, board_id, course_id, user_id, body, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(row.id, row.board_id, row.course_id, row.user_id, row.body, row.created_at, row.updated_at)
    .run();
  return row;
}

export async function updateEntryBody(db: D1Database, entry: QuestionEntryRow, body: string) {
  await db
    .prepare(`UPDATE question_entries SET body = ?, updated_at = ? WHERE id = ? AND course_id = ?`)
    .bind(body, Date.now(), entry.id, entry.course_id)
    .run();
}

export async function setEntryHidden(db: D1Database, entry: QuestionEntryRow, hidden: boolean) {
  await db
    .prepare(`UPDATE question_entries SET hidden_at = ? WHERE id = ? AND course_id = ?`)
    .bind(hidden ? Date.now() : null, entry.id, entry.course_id)
    .run();
}

export async function deleteEntry(db: D1Database, entry: QuestionEntryRow) {
  await db
    .prepare(`DELETE FROM question_entries WHERE id = ? AND course_id = ?`)
    .bind(entry.id, entry.course_id)
    .run();
}
