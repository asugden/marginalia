// Request handlers for the questions module. See README.md.
//
// A session (one class meeting) holds boards (one per presenter). The session
// is the window: while it is open, anyone enrolled asks questions on any of
// its boards.
//
// Two kinds of caller, both enrolled in the course:
//   - Staff (a role holding `run_questions`) create, rename, open, close and
//     delete sessions; add, rename and delete boards; and hide or delete any
//     question.
//   - Everyone, staff included, reads open and closed sessions and asks
//     questions while a session is open; each person may edit or delete their
//     own questions until it closes.
//
// No response ever carries a question's author. That is the module's one
// privacy invariant; see EntryDTO in types.ts.

import type { Env } from "../../env.js";
import type { Identity } from "../../auth.js";
import { can } from "../../permissions.js";
import * as repo from "./repo.js";
import {
  rowToBoard,
  rowToEntry,
  rowToSession,
  type QuestionBoardRow,
  type QuestionEntryRow,
  type QuestionSessionRow,
} from "./types.js";

const MAX_TITLE_CHARS = 120;
const MAX_BODY_CHARS = 1_000;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
const error = (message: string, status: number, code?: string) =>
  json(code ? { error: message, code } : { error: message }, status);

/** Who the caller is in a course: their id and whether they run sessions. */
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

const staffOnly = () => error("Course staff only", 403);

/**
 * Resolve a session and the caller's standing in its course. A draft session
 * is reported as missing to students, so its existence (and title) stays
 * private until staff open it.
 */
async function sessionFor(
  env: Env,
  identity: Identity,
  sessionId: string,
): Promise<{ session: QuestionSessionRow; m: Member } | Response> {
  const session = await repo.getSession(env.DB, sessionId);
  if (!session) return error("Session not found", 404);
  const m = await member(env, identity, session.course_id);
  if (m instanceof Response) return m;
  if (session.status === "draft" && !m.staff) return error("Session not found", 404);
  return { session, m };
}

async function boardFor(
  env: Env,
  identity: Identity,
  boardId: string,
): Promise<{ board: QuestionBoardRow; session: QuestionSessionRow; m: Member } | Response> {
  const board = await repo.getBoard(env.DB, boardId);
  if (!board) return error("Board not found", 404);
  const resolved = await sessionFor(env, identity, board.session_id);
  if (resolved instanceof Response) {
    return resolved.status === 404 ? error("Board not found", 404) : resolved;
  }
  return { board, ...resolved };
}

async function entryFor(
  env: Env,
  identity: Identity,
  entryId: string,
): Promise<
  | { entry: QuestionEntryRow; board: QuestionBoardRow; session: QuestionSessionRow; m: Member }
  | Response
> {
  const entry = await repo.getEntry(env.DB, entryId);
  if (!entry) return error("Question not found", 404);
  const resolved = await boardFor(env, identity, entry.board_id);
  if (resolved instanceof Response) return resolved;
  // A student asking for someone else's hidden question learns nothing about it.
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

const closedError = () => error("This session is closed to new questions", 409, "session_closed");

async function readJson(req: Request): Promise<Record<string, unknown>> {
  const body = (await req.json().catch(() => null)) as unknown;
  return body && typeof body === "object" && !Array.isArray(body) ? (body as Record<string, unknown>) : {};
}

async function boardsOf(env: Env, session: QuestionSessionRow, staff: boolean) {
  const rows = await repo.listBoards(env.DB, session, staff);
  return rows.map((r) => rowToBoard(r, r.question_count));
}

// ── sessions ───────────────────────────────────────────────────────────────

/** GET /sessions?courseId= → { sessions, staff } */
export async function listSessionsRoute(env: Env, identity: Identity, url: URL): Promise<Response> {
  const courseId = url.searchParams.get("courseId");
  if (!courseId) return error("courseId is required", 400);
  const m = await member(env, identity, courseId);
  if (m instanceof Response) return m;
  const rows = await repo.listSessions(env.DB, courseId, m.staff);
  return json({ sessions: rows.map((r) => rowToSession(r, r.board_count)), staff: m.staff });
}

/** GET /live?courseId= → { session: SessionDTO | null }. Polled by every open
 *  page in the course, so it is one indexed query and nothing else. */
export async function liveSessionRoute(env: Env, identity: Identity, url: URL): Promise<Response> {
  const courseId = url.searchParams.get("courseId");
  if (!courseId) return error("courseId is required", 400);
  const m = await member(env, identity, courseId);
  if (m instanceof Response) return m;
  const row = await repo.latestOpenSession(env.DB, courseId);
  return json({ session: row ? rowToSession(row, 0) : null });
}

/** POST /sessions { courseId, title } → { session }. Created as a draft. */
export async function createSessionRoute(req: Request, env: Env, identity: Identity): Promise<Response> {
  const body = await readJson(req);
  const courseId = typeof body.courseId === "string" ? body.courseId : null;
  if (!courseId) return error("courseId is required", 400);
  const m = await member(env, identity, courseId);
  if (m instanceof Response) return m;
  if (!m.staff) return staffOnly();
  const title = cleanTitle(body.title);
  if (title instanceof Response) return title;
  const row = await repo.createSession(env.DB, courseId, title, m.userId);
  return json({ session: rowToSession(row, 0) }, 201);
}

/** GET /sessions/:id → { session, boards, staff } */
export async function getSessionRoute(env: Env, identity: Identity, sessionId: string): Promise<Response> {
  const resolved = await sessionFor(env, identity, sessionId);
  if (resolved instanceof Response) return resolved;
  const { session, m } = resolved;
  const boards = await boardsOf(env, session, m.staff);
  return json({ session: rowToSession(session, boards.length), boards, staff: m.staff });
}

/** PATCH /sessions/:id { title?, status?: "open" | "closed" } → { session } */
export async function updateSessionRoute(
  req: Request,
  env: Env,
  identity: Identity,
  sessionId: string,
): Promise<Response> {
  const resolved = await sessionFor(env, identity, sessionId);
  if (resolved instanceof Response) return resolved;
  const { session, m } = resolved;
  if (!m.staff) return staffOnly();
  const body = await readJson(req);
  if (body.title !== undefined) {
    const title = cleanTitle(body.title);
    if (title instanceof Response) return title;
    await repo.renameSession(env.DB, session.id, session.course_id, title);
  }
  if (body.status !== undefined) {
    if (body.status !== "open" && body.status !== "closed") {
      return error("status must be open or closed", 400);
    }
    if (body.status === "closed" && session.status === "draft") {
      return error("Open the session before closing it", 400);
    }
    if (body.status !== session.status) {
      await repo.setSessionStatus(env.DB, session.id, session.course_id, body.status);
    }
  }
  const fresh = (await repo.getSession(env.DB, session.id))!;
  const boards = await repo.listBoards(env.DB, fresh, true);
  return json({ session: rowToSession(fresh, boards.length) });
}

/** DELETE /sessions/:id → { ok } — the session, its boards, their questions. */
export async function deleteSessionRoute(env: Env, identity: Identity, sessionId: string): Promise<Response> {
  const resolved = await sessionFor(env, identity, sessionId);
  if (resolved instanceof Response) return resolved;
  if (!resolved.m.staff) return staffOnly();
  await repo.deleteSession(env.DB, resolved.session.id, resolved.session.course_id);
  return json({ ok: true });
}

// ── boards ─────────────────────────────────────────────────────────────────

/** POST /sessions/:id/boards { title } → { board }. Appended to the session;
 *  allowed while it is open, for the presenter nobody planned for. */
export async function createBoardRoute(
  req: Request,
  env: Env,
  identity: Identity,
  sessionId: string,
): Promise<Response> {
  const resolved = await sessionFor(env, identity, sessionId);
  if (resolved instanceof Response) return resolved;
  if (!resolved.m.staff) return staffOnly();
  const title = cleanTitle((await readJson(req)).title);
  if (title instanceof Response) return title;
  const row = await repo.createBoard(env.DB, resolved.session, title);
  return json({ board: rowToBoard(row, 0) }, 201);
}

/** GET /boards/:id → { board, session, boards, entries, staff }. `boards` is
 *  the whole session, for moving between presenters. */
export async function getBoardRoute(env: Env, identity: Identity, boardId: string): Promise<Response> {
  const resolved = await boardFor(env, identity, boardId);
  if (resolved instanceof Response) return resolved;
  const { board, session, m } = resolved;
  const [entries, boards] = await Promise.all([
    repo.listEntries(env.DB, board, m.staff),
    boardsOf(env, session, m.staff),
  ]);
  return json({
    board: rowToBoard(board, entries.length),
    session: rowToSession(session, boards.length),
    boards,
    entries: entries.map((e) => rowToEntry(e, m.userId)),
    staff: m.staff,
  });
}

/** PATCH /boards/:id { title } → { board } */
export async function updateBoardRoute(
  req: Request,
  env: Env,
  identity: Identity,
  boardId: string,
): Promise<Response> {
  const resolved = await boardFor(env, identity, boardId);
  if (resolved instanceof Response) return resolved;
  const { board, m } = resolved;
  if (!m.staff) return staffOnly();
  const title = cleanTitle((await readJson(req)).title);
  if (title instanceof Response) return title;
  await repo.renameBoard(env.DB, board, title);
  const entries = await repo.listEntries(env.DB, board, true);
  return json({ board: rowToBoard({ ...board, title }, entries.length) });
}

/** DELETE /boards/:id → { ok } — the board and every question on it. */
export async function deleteBoardRoute(env: Env, identity: Identity, boardId: string): Promise<Response> {
  const resolved = await boardFor(env, identity, boardId);
  if (resolved instanceof Response) return resolved;
  if (!resolved.m.staff) return staffOnly();
  await repo.deleteBoard(env.DB, resolved.board);
  return json({ ok: true });
}

// ── questions ──────────────────────────────────────────────────────────────

/** POST /boards/:id/entries { body } → { entry }. Open sessions only. */
export async function createEntryRoute(
  req: Request,
  env: Env,
  identity: Identity,
  boardId: string,
): Promise<Response> {
  const resolved = await boardFor(env, identity, boardId);
  if (resolved instanceof Response) return resolved;
  const { board, session, m } = resolved;
  if (session.status !== "open") return closedError();
  const text = cleanBody((await readJson(req)).body);
  if (text instanceof Response) return text;
  const row = await repo.createEntry(env.DB, board, m.userId, text);
  return json({ entry: rowToEntry(row, m.userId) }, 201);
}

/**
 * PATCH /entries/:id { body?, hidden? } → { entry }
 *   body   — the author, while the session is open.
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
  const { entry, session, m } = resolved;
  const body = await readJson(req);
  if (body.body !== undefined) {
    if (entry.user_id !== m.userId) return error("You can only edit your own questions", 403);
    if (session.status !== "open") return closedError();
    const text = cleanBody(body.body);
    if (text instanceof Response) return text;
    await repo.updateEntryBody(env.DB, entry, text);
  }
  if (body.hidden !== undefined) {
    if (!m.staff) return staffOnly();
    if (typeof body.hidden !== "boolean") return error("hidden must be a boolean", 400);
    await repo.setEntryHidden(env.DB, entry, body.hidden);
  }
  const fresh = (await repo.getEntry(env.DB, entry.id))!;
  return json({ entry: rowToEntry(fresh, m.userId) });
}

/** DELETE /entries/:id → { ok }. The author while the session is open; staff
 *  at any time. */
export async function deleteEntryRoute(env: Env, identity: Identity, entryId: string): Promise<Response> {
  const resolved = await entryFor(env, identity, entryId);
  if (resolved instanceof Response) return resolved;
  const { entry, session, m } = resolved;
  if (!m.staff) {
    if (entry.user_id !== m.userId) return error("You can only delete your own questions", 403);
    if (session.status !== "open") return closedError();
  }
  await repo.deleteEntry(env.DB, entry);
  return json({ ok: true });
}
