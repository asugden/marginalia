// Dispatch for /api/onboarding/*. Called from apps/worker/src/index.ts.
//
//   GET  /api/onboarding/progress?courseId=   the caller's tour progress
//   PUT  /api/onboarding/progress             save part of it
//
// Course staff only. Everything a tour sets up (settings, assignments, the
// guided agent) goes through each feature's own endpoints — this module
// stores progress and nothing else.

import type { Env } from "../../env.js";
import type { Identity } from "../../auth.js";
import { getProgressRoute, putProgressRoute } from "./handlers.js";

export async function routeOnboarding(
  req: Request,
  env: Env,
  url: URL,
  identity: Identity,
  parts: string[], // ["api", "onboarding", ...]
): Promise<Response | null> {
  const [, , head] = parts;
  if (head === "progress" && parts.length === 3) {
    if (req.method === "GET") return getProgressRoute(env, identity, url);
    if (req.method === "PUT") return putProgressRoute(req, env, identity);
  }
  return null;
}
