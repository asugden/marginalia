// Shared types for the questions module.

export type BoardStatus = "draft" | "open" | "closed";

export interface QuestionBoardRow {
  id: string;
  course_id: string;
  title: string;
  status: BoardStatus;
  created_by: string;
  created_at: number;
  opened_at: number | null;
  closed_at: number | null;
}

/** A board row with its visible question count, as the list query returns it. */
export interface QuestionBoardListRow extends QuestionBoardRow {
  question_count: number;
}

export interface QuestionEntryRow {
  id: string;
  board_id: string;
  course_id: string;
  user_id: string;
  body: string;
  created_at: number;
  updated_at: number;
  hidden_at: number | null;
}

export interface BoardDTO {
  id: string;
  courseId: string;
  title: string;
  status: BoardStatus;
  createdAt: number;
  openedAt: number | null;
  closedAt: number | null;
  /** Questions the caller can see: staff count hidden ones, students don't. */
  questionCount: number;
}

/**
 * One question as the API returns it. There is deliberately no author field:
 * questions are anonymous to everyone, staff included. `mine` tells the caller
 * which questions they may edit or delete, and says nothing to anyone else.
 */
export interface EntryDTO {
  id: string;
  body: string;
  createdAt: number;
  updatedAt: number;
  mine: boolean;
  /** Only ever true in a staff response; students never receive hidden rows. */
  hidden: boolean;
}

export function rowToBoard(row: QuestionBoardRow, questionCount: number): BoardDTO {
  return {
    id: row.id,
    courseId: row.course_id,
    title: row.title,
    status: row.status,
    createdAt: row.created_at,
    openedAt: row.opened_at,
    closedAt: row.closed_at,
    questionCount,
  };
}

export function rowToEntry(row: QuestionEntryRow, callerId: string): EntryDTO {
  return {
    id: row.id,
    body: row.body,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    mine: row.user_id === callerId,
    hidden: row.hidden_at !== null,
  };
}
