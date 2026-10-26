// Request handlers for the questions module. See README.md.
//
// Two kinds of caller, both enrolled in the board's course:
//   - Staff (a role holding `run_questions`) create, rename, open, close and
//     delete boards, and hide or delete any question.
//   - Everyone, staff included, reads open and closed boards and asks
//     questions while a board is open; each person may edit or delete their
//     own questions until it closes.
//
// No response ever carries a question's author. That is the module's one
// privacy invariant; see EntryDTO in types.ts.

import type { Env } from "../../env.js";
import type { Identity } from "../../auth.js";
import { can } from "../../permissions.js";
import * as repo from "./repo.js";
import { rowToBoard, rowToEntry, type QuestionBoardRow, type QuestionEntryRow } from "./types.js";

const MAX_TITLE_CHARS = 120;
const MAX_BODY_CHARS = 1_000;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
const error = (message: string, status: number, code?: string) =>
  json(code ? { error: message, code } : { error: message }, status);

/** Who the caller is in a course: their id and whether they run boards. */
interface Member {
  userId: string;
  staff: boolean;
}

async function member(env: Env, identity: Identity, courseId: string): Promise<Member | Response> {
  if (!identity.userId) return error("Sign in required", 401);
  const row = await env.DB
    .prepare(`SELECT role FROM enrollments WHERE course_id = ? AND user_id = ?`)
    .bind(courseId, identity.userId)
    .first<{ role: string }>();
  if (!row) return error("Not enrolled in this course", 403);
  return { userId: identity.userId, staff: can(row.role, "run_questions") };
}

async function staffMember(env: Env, identity: Identity, courseId: string): Promise<Member | Response> {
  const m = await member(env, identity, courseId);
  if (m instanceof Response) return m;
  if (!m.staff) return error("Course staff only", 403);
  return m;
}

/**
 * Resolve a board and the caller's standing in its course. A draft board is
 * reported as missing to students, so its existence (and title) stays private
 * until staff open it.
 */
async function boardFor(
  env: Env,
  identity: Identity,
  boardId: string,
): Promise<{ board: QuestionBoardRow; m: Member } | Response> {
  const board = await repo.getBoard(env.DB, boardId);
  if (!board) return error("Board not found", 404);
  const m = await member(env, identity, board.course_id);
  if (m instanceof Response) return m;
  if (board.status === "draft" && !m.staff) return error("Board not found", 404);
  return { board, m };
}

async function entryFor(
  env: Env,
  identity: Identity,
  entryId: string,
): Promise<{ entry: QuestionEntryRow; board: QuestionBoardRow; m: Member } | Response> {
  const entry = await repo.getEntry(env.DB, entryId);
  if (!entry) return error("Question not found", 404);
  const resolved = await boardFor(env, identity, entry.board_id);
  if (resolved instanceof Response) return resolved;
  // A student asking for a hidden question learns nothing about it.
  if (entry.hidden_at !== null && !resolved.m.staff && entry.user_id !== resolved.m.userId) {
    return error("Question not found", 404);
  }
  return { entry, ...resolved };
}

function cleanTitle(v: unknown): string | Response {
  if (typeof v !== "string") return error("title is required", 400);
  const t = v.trim();
  if (!t) return error("title is required", 400);
  if (t.length > MAX_TITLE_CHARS) return error(`title must be ${MAX_TITLE_CHARS} characters or fewer`, 400);
  return t;
}

function cleanBody(v: unknown): string | Response {
  if (typeof v !== "string") return error("body is required", 400);
  const b = v.trim();
  if (!b) return error("body is required", 400);
  if (b.length > MAX_BODY_CHARS) return error(`A question must be ${MAX_BODY_CHARS} characters or fewer`, 400);
  return b;
}

const closedError = () => error("This board is closed to new questions", 409, "board_closed");

async function readJson(req: Request): Promise<Record<string, unknown>> {
  const body = (await req.json().catch(() => null)) as unknown;
  return body && typeof body === "object" && !Array.isArray(body) ? (body as Record<string, unknown>) : {};
}

// ── boards ─────────────────────────────────────────────────────────────────

/** GET /boards?courseId= → { boards, staff } */
export async function listBoardsRoute(env: Env, identity: Identity, url: URL): Promise<Response> {
  const courseId = url.searchParams.get("courseId");
  if (!courseId) return error("courseId is required", 400);
  const m = await member(env, identity, courseId);
  if (m instanceof Response) return m;
  const rows = await repo.listBoards(env.DB, courseId, m.staff);
  return json({ boards: rows.map((r) => rowToBoard(r, r.question_count)), staff: m.staff });
}

/** GET /live?courseId= → { board: BoardDTO | null }. Polled by every open
 *  page in the course, so it is one indexed query and nothing else. */
export async function liveBoardRoute(env: Env, identity: Identity, url: URL): Promise<Response> {
  const courseId = url.searchParams.get("courseId");
  if (!courseId) return error("courseId is required", 400);
  const m = await member(env, identity, courseId);
  if (m instanceof Response) return m;
  const row = await repo.latestOpenBoard(env.DB, courseId);
  return json({ board: row ? rowToBoard(row, 0) : null });
}

/** POST /boards { courseId, title } → { board }. Created as a draft. */
export async function createBoardRoute(req: Request, env: Env, identity: Identity): Promise<Response> {
  const body = await readJson(req);
  const courseId = typeof body.courseId === "string" ? body.courseId : null;
  if (!courseId) return error("courseId is required", 400);
  const m = await staffMember(env, identity, courseId);
  if (m instanceof Response) return m;
  const title = cleanTitle(body.title);
  if (title instanceof Response) return title;
  const row = await repo.createBoard(env.DB, courseId, title, m.userId);
  return json({ board: rowToBoard(row, 0) }, 201);
}

/** GET /boards/:id → { board, entries, staff } */
export async function getBoardRoute(env: Env, identity: Identity, boardId: string): Promise<Response> {
  const resolved = await boardFor(env, identity, boardId);
  if (resolved instanceof Response) return resolved;
  const { board, m } = resolved;
  const entries = await repo.listEntries(env.DB, board, m.staff);
  return json({
    board: rowToBoard(board, entries.length),
    entries: entries.map((e) => rowToEntry(e, m.userId)),
    staff: m.staff,
  });
}

/** PATCH /boards/:id { title?, status?: "open" | "closed" } → { board } */
export async function updateBoardRoute(
  req: Request,
  env: Env,
  identity: Identity,
  boardId: string,
): Promise<Response> {
  const resolved = await boardFor(env, identity, boardId);
  if (resolved instanceof Response) return resolved;
  const { board, m } = resolved;
  if (!m.staff) return error("Course staff only", 403);
  const body = await readJson(req);
  if (body.title !== undefined) {
    const title = cleanTitle(body.title);
    if (title instanceof Response) return title;
    await repo.renameBoard(env.DB, board.id, board.course_id, title);
  }
  if (body.status !== undefined) {
    if (body.status !== "open" && body.status !== "closed") {
      return error("status must be open or closed", 400);
    }
    if (body.status === "closed" && board.status === "draft") {
      return error("Open the board before closing it", 400);
    }
    if (body.status !== board.status) {
      await repo.setBoardStatus(env.DB, board.id, board.course_id, body.status);
    }
  }
  const fresh = (await repo.getBoard(env.DB, board.id))!;
  const entries = await repo.listEntries(env.DB, fresh, true);
  return json({ board: rowToBoard(fresh, entries.length) });
}

/** DELETE /boards/:id → { ok } — the board and every question on it. */
export async function deleteBoardRoute(env: Env, identity: Identity, boardId: string): Promise<Response> {
  const resolved = await boardFor(env, identity, boardId);
  if (resolved instanceof Response) return resolved;
  if (!resolved.m.staff) return error("Course staff only", 403);
  await repo.deleteBoard(env.DB, resolved.board.id, resolved.board.course_id);
  return json({ ok: true });
}

// ── questions ──────────────────────────────────────────────────────────────

/** POST /boards/:id/entries { body } → { entry }. Open boards only. */
export async function createEntryRoute(
  req: Request,
  env: Env,
  identity: Identity,
  boardId: string,
): Promise<Response> {
  const resolved = await boardFor(env, identity, boardId);
  if (resolved instanceof Response) return resolved;
  const { board, m } = resolved;
  if (board.status !== "open") return closedError();
  const text = cleanBody((await readJson(req)).body);
  if (text instanceof Response) return text;
  const row = await repo.createEntry(env.DB, board, m.userId, text);
  return json({ entry: rowToEntry(row, m.userId) }, 201);
}

/**
 * PATCH /entries/:id { body?, hidden? } → { entry }
 *   body   — the author, while the board is open.
 *   hidden — staff, at any time.
 */
export async function updateEntryRoute(
  req: Request,
  env: Env,
  identity: Identity,
  entryId: string,
): Promise<Response> {
  const resolved = await entryFor(env, identity, entryId);
  if (resolved instanceof Response) return resolved;
  const { entry, board, m } = resolved;
  const body = await readJson(req);
  if (body.body !== undefined) {
    if (entry.user_id !== m.userId) return error("You can only edit your own questions", 403);
    if (board.status !== "open") return closedError();
    const text = cleanBody(body.body);
    if (text instanceof Response) return text;
    await repo.updateEntryBody(env.DB, entry, text);
  }
  if (body.hidden !== undefined) {
    if (!m.staff) return error("Course staff only", 403);
    if (typeof body.hidden !== "boolean") return error("hidden must be a boolean", 400);
    await repo.setEntryHidden(env.DB, entry, body.hidden);
  }
  const fresh = (await repo.getEntry(env.DB, entry.id))!;
  return json({ entry: rowToEntry(fresh, m.userId) });
}

/** DELETE /entries/:id → { ok }. The author while the board is open; staff
 *  at any time. */
export async function deleteEntryRoute(env: Env, identity: Identity, entryId: string): Promise<Response> {
  const resolved = await entryFor(env, identity, entryId);
  if (resolved instanceof Response) return resolved;
  const { entry, board, m } = resolved;
  if (!m.staff) {
    if (entry.user_id !== m.userId) return error("You can only delete your own questions", 403);
    if (board.status !== "open") return closedError();
  }
  await repo.deleteEntry(env.DB, entry);
  return json({ ok: true });
}
