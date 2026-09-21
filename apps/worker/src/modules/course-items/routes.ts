// Dispatch for /api/course-items/*. Called from apps/worker/src/index.ts.
//
// Instructor surface (gated on enrollments.role = 'instructor'):
//   POST   /api/course-items              assign an existing payload
//   PATCH  /api/course-items/:id          edit dates / title / note / archive
//   DELETE /api/course-items/:id          unassign (payload survives)
//   POST   /api/course-items/reorder      apply an explicit order
//
// Any enrolled role:
//   GET    /api/course-items?courseId=    the combined list + the CALLER'S OWN
//                                         completion state
//
// Note what is absent: there is no course-wide completion matrix. Per-kind
// rosters live in the modules that own them (the writing roster, the examples
// completion roster), each under its own rules. Combining four different kinds
// of evidence into one grid would make them read as equivalent — see the
// module README.

import type { Env } from "../../env.js";
import type { Identity } from "../../auth.js";
import {
  createItemRoute,
  deleteItemRoute,
  listItemsRoute,
  patchItemRoute,
  reorderItemsRoute,
} from "./handlers.js";

export async function routeCourseItems(
  req: Request,
  env: Env,
  url: URL,
  identity: Identity,
  parts: string[], // ["api", "course-items", ...]
): Promise<Response | null> {
  const [, , head] = parts;

  if (parts.length === 2) {
    if (req.method === "GET") return listItemsRoute(env, identity, url);
    if (req.method === "POST") return createItemRoute(req, env, identity);
  }

  if (parts.length === 3 && head) {
    // The literal `reorder` segment is checked before treating `head` as an
    // id. Item ids are server-minted `citem_<uuid>`, so no real id can collide
    // with it.
    if (head === "reorder" && req.method === "POST") {
      return reorderItemsRoute(req, env, identity, url);
    }
    if (req.method === "PATCH") {
      return patchItemRoute(req, env, identity, url, head);
    }
    if (req.method === "DELETE") {
      return deleteItemRoute(env, identity, url, head);
    }
  }

  return null;
}
