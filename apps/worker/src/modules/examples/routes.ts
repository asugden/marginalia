// Dispatch for /api/examples/*. Called from apps/worker/src/index.ts.
//
// Note what is NOT here: nothing serves the example pages themselves. Examples
// are static SPA routes under /examples/<slug>, public and unauthenticated,
// and this module does not gate them. Every endpoint below is about a course's
// *relationship* to an example — which ones it curates, and two narrow usage
// signals — never about whether the page may be viewed.
//
// Instructor surface:
//   GET    /api/examples/course?courseId=        curated list (edit view)
//   PUT    /api/examples/course?courseId=        replace the curated list
//   GET    /api/examples/usage?courseId=         anonymous aggregate + floor
//   GET    /api/examples/completions?courseId=   binary roster
//
// Student surface (signed-in, any enrolled role):
//   GET    /api/examples/course/mine?courseId=   curated list + own completions
//   POST   /api/examples/usage                   anonymous beacon → 204
//   POST   /api/examples/completions             mark complete
//   DELETE /api/examples/completions             un-mark

import type { Env } from "../../env.js";
import type { Identity } from "../../auth.js";
import {
  getCourseExamplesRoute,
  getMyCourseExamplesRoute,
  listCompletionsRoute,
  listUsageRoute,
  markCompleteRoute,
  putCourseExamplesRoute,
  unmarkCompleteRoute,
  usageBeaconRoute,
} from "./handlers.js";

export async function routeExamples(
  req: Request,
  env: Env,
  url: URL,
  identity: Identity,
  parts: string[], // ["api", "examples", ...]
): Promise<Response | null> {
  const [, , head, sub] = parts;

  if (head === "usage" && parts.length === 3) {
    if (req.method === "POST") return usageBeaconRoute(req, env, identity);
    if (req.method === "GET") return listUsageRoute(env, identity, url);
  }

  if (head === "completions" && parts.length === 3) {
    if (req.method === "GET") return listCompletionsRoute(env, identity, url);
    if (req.method === "POST") return markCompleteRoute(req, env, identity);
    if (req.method === "DELETE") return unmarkCompleteRoute(req, env, identity, url);
  }

  if (head === "course") {
    if (parts.length === 3) {
      if (req.method === "GET") return getCourseExamplesRoute(env, identity, url);
      if (req.method === "PUT") return putCourseExamplesRoute(req, env, identity, url);
    }
    if (parts.length === 4 && sub === "mine" && req.method === "GET") {
      return getMyCourseExamplesRoute(env, identity, url);
    }
  }

  return null;
}
