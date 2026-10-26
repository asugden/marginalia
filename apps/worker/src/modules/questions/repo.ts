// D1 access for question_boards and question_entries. Every query is scoped
// by course_id, directly or through a board the caller already resolved.

import type {
  BoardStatus,
  QuestionBoardListRow,
  QuestionBoardRow,
  QuestionEntryRow,
} from "./types.js";

const newBoardId = () => `qb_${crypto.randomUUID()}`;
const newEntryId = () => `qe_${crypto.randomUUID()}`;

export async function getBoard(db: D1Database, id: string): Promise<QuestionBoardRow | null> {
  return db
    .prepare(`SELECT * FROM question_boards WHERE id = ?`)
    .bind(id)
    .first<QuestionBoardRow>();
}

/**
 * Boards in a course, newest first, each with its question count. Students
 * never see drafts or hidden questions, so both are filtered here rather than
 * by the caller.
 */
export async function listBoards(
  db: D1Database,
  courseId: string,
  staff: boolean,
): Promise<QuestionBoardListRow[]> {
  const { results } = await db
    .prepare(
      `SELECT b.*,
              (SELECT COUNT(*) FROM question_entries e
                WHERE e.board_id = b.id AND (? = 1 OR e.hidden_at IS NULL)) AS question_count
         FROM question_boards b
        WHERE b.course_id = ? AND (? = 1 OR b.status != 'draft')
        ORDER BY b.created_at DESC`,
    )
    .bind(staff ? 1 : 0, courseId, staff ? 1 : 0)
    .all<QuestionBoardListRow>();
  return results ?? [];
}

/** The open board that was opened most recently, if any — what the "live"
 *  prompt points students at. */
export async function latestOpenBoard(
  db: D1Database,
  courseId: string,
): Promise<QuestionBoardRow | null> {
  return db
    .prepare(
      `SELECT * FROM question_boards
        WHERE course_id = ? AND status = 'open'
        ORDER BY opened_at DESC
        LIMIT 1`,
    )
    .bind(courseId)
    .first<QuestionBoardRow>();
}

export async function createBoard(
  db: D1Database,
  courseId: string,
  title: string,
  createdBy: string,
): Promise<QuestionBoardRow> {
  const row: QuestionBoardRow = {
    id: newBoardId(),
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
      `INSERT INTO question_boards (id, course_id, title, status, created_by, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
    )
    .bind(row.id, row.course_id, row.title, row.status, row.created_by, row.created_at)
    .run();
  return row;
}

export async function renameBoard(db: D1Database, id: string, courseId: string, title: string) {
  await db
    .prepare(`UPDATE question_boards SET title = ? WHERE id = ? AND course_id = ?`)
    .bind(title, id, courseId)
    .run();
}

/** Open or close a board, stamping when. A board never returns to draft:
 *  once students have seen it, it stays visible to them. */
export async function setBoardStatus(
  db: D1Database,
  id: string,
  courseId: string,
  status: Exclude<BoardStatus, "draft">,
) {
  const sql =
    status === "open"
      ? `UPDATE question_boards SET status = 'open', opened_at = ?, closed_at = NULL
          WHERE id = ? AND course_id = ?`
      : `UPDATE question_boards SET status = 'closed', closed_at = ?
          WHERE id = ? AND course_id = ?`;
  await db.prepare(sql).bind(Date.now(), id, courseId).run();
}

export async function deleteBoard(db: D1Database, id: string, courseId: string) {
  await db.batch([
    db.prepare(`DELETE FROM question_entries WHERE board_id = ? AND course_id = ?`).bind(id, courseId),
    db.prepare(`DELETE FROM question_boards WHERE id = ? AND course_id = ?`).bind(id, courseId),
  ]);
}

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
