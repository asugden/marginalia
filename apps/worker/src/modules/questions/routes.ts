// Dispatch for /api/questions/*. Called from apps/worker/src/index.ts.
//
// Anyone enrolled in the course:
//   GET    /api/questions/boards?courseId=     boards (staff also see drafts)
//   GET    /api/questions/live?courseId=       the most recently opened open board
//   GET    /api/questions/boards/:id           one board + its questions
//   POST   /api/questions/boards/:id/entries   ask a question (open boards)
//   PATCH  /api/questions/entries/:id          edit your own (open boards); staff: hide
//   DELETE /api/questions/entries/:id          delete your own (open boards); staff: any
//
// Course staff (run_questions):
//   POST   /api/questions/boards               create a draft board
//   PATCH  /api/questions/boards/:id           rename, open, close
//   DELETE /api/questions/boards/:id           delete a board and its questions

import type { Env } from "../../env.js";
import type { Identity } from "../../auth.js";
import {
  createBoardRoute,
  createEntryRoute,
  deleteBoardRoute,
  deleteEntryRoute,
  getBoardRoute,
  listBoardsRoute,
  liveBoardRoute,
  updateBoardRoute,
  updateEntryRoute,
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
    return liveBoardRoute(env, identity, url);
  }

  if (head === "boards") {
    if (parts.length === 3) {
      if (req.method === "GET") return listBoardsRoute(env, identity, url);
      if (req.method === "POST") return createBoardRoute(req, env, identity);
    }
    if (id && parts.length === 4) {
      if (req.method === "GET") return getBoardRoute(env, identity, id);
      if (req.method === "PATCH") return updateBoardRoute(req, env, identity, id);
      if (req.method === "DELETE") return deleteBoardRoute(env, identity, id);
    }
    if (id && parts.length === 5 && sub === "entries" && req.method === "POST") {
      return createEntryRoute(req, env, identity, id);
    }
  }

  if (head === "entries" && id && parts.length === 4) {
    if (req.method === "PATCH") return updateEntryRoute(req, env, identity, id);
    if (req.method === "DELETE") return deleteEntryRoute(env, identity, id);
  }

  return null;
}
