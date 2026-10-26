// Dispatch for /api/questions/*. Called from apps/worker/src/index.ts.
//
// Anyone enrolled in the course:
//   GET    /api/questions/sessions?courseId=      sessions (staff also see drafts)
//   GET    /api/questions/live?courseId=          the most recently opened open session
//   GET    /api/questions/sessions/:id            one session + its boards
//   GET    /api/questions/boards/:id              one board + its questions + its session
//   POST   /api/questions/boards/:id/entries      ask a question (open sessions)
//   PATCH  /api/questions/entries/:id             edit your own (open sessions); staff: hide
//   DELETE /api/questions/entries/:id             delete your own (open sessions); staff: any
//
// Course staff (run_questions):
//   POST   /api/questions/sessions                create a draft session
//   PATCH  /api/questions/sessions/:id            rename, open, close
//   DELETE /api/questions/sessions/:id            delete it, its boards, their questions
//   POST   /api/questions/sessions/:id/boards     add a board
//   PATCH  /api/questions/boards/:id              rename a board
//   DELETE /api/questions/boards/:id              delete a board and its questions

import type { Env } from "../../env.js";
import type { Identity } from "../../auth.js";
import {
  createBoardRoute,
  createEntryRoute,
  createSessionRoute,
  deleteBoardRoute,
  deleteEntryRoute,
  deleteSessionRoute,
  getBoardRoute,
  getSessionRoute,
  listSessionsRoute,
  liveSessionRoute,
  updateBoardRoute,
  updateEntryRoute,
  updateSessionRoute,
} from "./handlers.js";

export async function routeQuestions(
  req: Request,
  env: Env,
  url: URL,
  identity: Identity,
  parts: string[], // ["api", "questions", ...]
): Promise<Response | null> {
  const [, , head, id, sub] = parts;

  if (head === "live" && parts.length === 3 && req.method === "GET") {
    return liveSessionRoute(env, identity, url);
  }

  if (head === "sessions") {
    if (parts.length === 3) {
      if (req.method === "GET") return listSessionsRoute(env, identity, url);
      if (req.method === "POST") return createSessionRoute(req, env, identity);
    }
    if (id && parts.length === 4) {
      if (req.method === "GET") return getSessionRoute(env, identity, id);
      if (req.method === "PATCH") return updateSessionRoute(req, env, identity, id);
      if (req.method === "DELETE") return deleteSessionRoute(env, identity, id);
    }
    if (id && parts.length === 5 && sub === "boards" && req.method === "POST") {
      return createBoardRoute(req, env, identity, id);
    }
  }

  if (head === "boards" && id) {
    if (parts.length === 4) {
      if (req.method === "GET") return getBoardRoute(env, identity, id);
      if (req.method === "PATCH") return updateBoardRoute(req, env, identity, id);
      if (req.method === "DELETE") return deleteBoardRoute(env, identity, id);
    }
    if (parts.length === 5 && sub === "entries" && req.method === "POST") {
      return createEntryRoute(req, env, identity, id);
    }
  }

  if (head === "entries" && id && parts.length === 4) {
    if (req.method === "PATCH") return updateEntryRoute(req, env, identity, id);
    if (req.method === "DELETE") return deleteEntryRoute(env, identity, id);
  }

  return null;
}
