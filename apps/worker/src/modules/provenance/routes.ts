// Dispatch for /api/provenance/*. Called from apps/worker/src/index.ts
// when the first path segment after /api/ is "provenance".
//
// Documents (slice 1)
//   GET    /api/provenance/documents?courseId=               list mine in this course
//   POST   /api/provenance/documents                         create
//   GET    /api/provenance/documents/:id?courseId=           fetch one
//   PATCH  /api/provenance/documents/:id                     update title / body / counts
//   DELETE /api/provenance/documents/:id?courseId=           delete
//
// Events (slice 2)
//   POST   /api/provenance/documents/:id/events              append a batch
//   GET    /api/provenance/documents/:id/events?courseId=    list events for replay
//
// Agents (slice 3)
//   GET    /api/provenance/agents?courseId=                  list course defaults + own
//   POST   /api/provenance/agents                            create (personal or, instructor, course-default)
//   GET    /api/provenance/agents/:id?courseId=              fetch one
//   PATCH  /api/provenance/agents/:id                        rename / re-prompt
//   DELETE /api/provenance/agents/:id?courseId=              delete
//
// Conversations (slice 3)
//   GET    /api/provenance/documents/:id/conversations?courseId=   list per document
//   POST   /api/provenance/documents/:id/conversations             create with an agent
//   GET    /api/provenance/conversations/:id/messages?courseId=    fetch history
//   POST   /api/provenance/conversations/:id/messages              SSE stream a turn
//   PATCH  /api/provenance/conversations/:id                        rename (title)
//   DELETE /api/provenance/conversations/:id?courseId=             delete
//
// Submissions (slice 6 — authed)
//   POST   /api/provenance/documents/:id/submissions               mint a share token
//   GET    /api/provenance/documents/:id/submissions?courseId=     list this doc's tokens
//   GET    /api/provenance/submissions?courseId=                   course-wide — INSTRUCTOR ONLY
//   DELETE /api/provenance/submissions/:token                      revoke
//
// Course settings (hide-marks toggle)
//   GET    /api/provenance/settings?courseId=                       read display settings
//   PATCH  /api/provenance/settings                                 set (instructor only)
//
// Share-token views (slice 6 — INSTRUCTOR-ONLY; "public" is a legacy path name)
//   GET    /api/provenance/public/submissions/:token               frozen colored render
//   GET    /api/provenance/public/submissions/:token/conversations chat drill-down

import type { Env } from "../../env.js";
import type { Identity } from "../../auth.js";
import {
  appendEventsRoute,
  createAgentRoute,
  createConversationRoute,
  createDocumentRoute,
  createSubmissionRoute,
  deleteAgentRoute,
  deleteConversationRoute,
  deleteDocumentRoute,
  getAgentRoute,
  getDocumentRoute,
  getSettingsRoute,
  listAgentsRoute,
  listConversationsRoute,
  listCourseSubmissionsRoute,
  listDocumentsRoute,
  listEventsRoute,
  listMessagesRoute,
  listSubmissionsRoute,
  publicSubmissionConversationsRoute,
  publicSubmissionRoute,
  revokeSubmissionRoute,
  sendMessageRoute,
  updateAgentRoute,
  updateConversationRoute,
  updateDocumentRoute,
  updateSettingsRoute,
} from "./handlers.js";

export async function routeProvenance(
  req: Request,
  env: Env,
  url: URL,
  identity: Identity,
  parts: string[], // ["api", "provenance", ...]
): Promise<Response | null> {
  // parts[0] === "api", parts[1] === "provenance"
  const [, , head, tail] = parts;

  if (head === "documents") {
    if (req.method === "GET" && parts.length === 3) {
      return listDocumentsRoute(env, identity, url);
    }
    if (req.method === "POST" && parts.length === 3) {
      return createDocumentRoute(req, env, identity);
    }
    if (tail && parts.length === 4) {
      if (req.method === "GET") return getDocumentRoute(env, identity, url, tail);
      if (req.method === "PATCH") return updateDocumentRoute(req, env, identity, tail);
      if (req.method === "DELETE") return deleteDocumentRoute(env, identity, url, tail);
    }
    if (tail && parts.length === 5 && parts[4] === "events") {
      if (req.method === "POST") return appendEventsRoute(req, env, identity, tail);
      if (req.method === "GET") return listEventsRoute(env, identity, url, tail);
    }
    if (tail && parts.length === 5 && parts[4] === "conversations") {
      if (req.method === "GET") return listConversationsRoute(env, identity, url, tail);
      if (req.method === "POST") return createConversationRoute(req, env, identity, tail);
    }
    if (tail && parts.length === 5 && parts[4] === "submissions") {
      if (req.method === "GET") return listSubmissionsRoute(env, identity, url, tail);
      if (req.method === "POST") return createSubmissionRoute(req, env, identity, tail);
    }
  }

  // Course-wide submission list (instructor-only). Distinct from the
  // per-document, owner-scoped list under /documents/:id/submissions.
  if (head === "submissions" && parts.length === 3) {
    if (req.method === "GET") return listCourseSubmissionsRoute(env, identity, url);
  }

  if (head === "submissions" && tail && parts.length === 4) {
    if (req.method === "DELETE") return revokeSubmissionRoute(env, identity, tail);
  }

  // Share-token views. Authenticated + instructor-gated (the "public" segment
  // is a historical path name); see routeSubmissionViews below.
  if (head === "public") {
    return routeSubmissionViews(req, env, identity, parts);
  }

  if (head === "settings" && parts.length === 3) {
    if (req.method === "GET") return getSettingsRoute(env, identity, url);
    if (req.method === "PATCH") return updateSettingsRoute(req, env, identity);
  }

  if (head === "agents") {
    if (req.method === "GET" && parts.length === 3) {
      return listAgentsRoute(env, identity, url);
    }
    if (req.method === "POST" && parts.length === 3) {
      return createAgentRoute(req, env, identity);
    }
    if (tail && parts.length === 4) {
      if (req.method === "GET") return getAgentRoute(env, identity, url, tail);
      if (req.method === "PATCH") return updateAgentRoute(req, env, identity, tail);
      if (req.method === "DELETE") return deleteAgentRoute(env, identity, url, tail);
    }
  }

  if (head === "conversations" && tail) {
    if (parts.length === 4 && req.method === "PATCH") {
      return updateConversationRoute(req, env, identity, tail);
    }
    if (parts.length === 4 && req.method === "DELETE") {
      return deleteConversationRoute(env, identity, url, tail);
    }
    if (parts.length === 5 && parts[4] === "messages") {
      if (req.method === "GET") return listMessagesRoute(env, identity, url, tail);
      if (req.method === "POST") return sendMessageRoute(req, env, identity, tail);
    }
  }

  return null; // unmatched — caller falls through to the global 404.
}

/**
 * Share-token reads. The `/public/` path segment is a **historical name** — these
 * routes are no longer unauthenticated. They are dispatched from the authed
 * router above (see `head === "public"`) and each handler requires an instructor
 * enrollment in the submission's course; see `requireSubmissionInstructor`.
 *
 * The path is kept so previously-shared links resolve to a real endpoint (and
 * get a sign-in prompt / "no longer available") rather than a bare 404.
 *
 *   GET /api/provenance/public/submissions/:token
 *   GET /api/provenance/public/submissions/:token/conversations
 */
async function routeSubmissionViews(
  req: Request,
  env: Env,
  identity: Identity,
  parts: string[], // ["api", "provenance", "public", ...]
): Promise<Response | null> {
  if (req.method !== "GET") return null;
  // parts: api / provenance / public / submissions / :token [/ conversations]
  if (parts[3] !== "submissions") return null;
  const token = parts[4];
  if (!token) return null;
  if (parts.length === 5) {
    return publicSubmissionRoute(env, identity, token);
  }
  if (parts.length === 6 && parts[5] === "conversations") {
    return publicSubmissionConversationsRoute(env, identity, token);
  }
  return null;
}
