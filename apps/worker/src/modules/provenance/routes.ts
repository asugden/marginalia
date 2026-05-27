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
//   DELETE /api/provenance/conversations/:id?courseId=             delete

import type { Env } from "../../env.js";
import type { Identity } from "../../auth.js";
import {
  appendEventsRoute,
  createAgentRoute,
  createConversationRoute,
  createDocumentRoute,
  deleteAgentRoute,
  deleteConversationRoute,
  deleteDocumentRoute,
  getAgentRoute,
  getDocumentRoute,
  listAgentsRoute,
  listConversationsRoute,
  listDocumentsRoute,
  listEventsRoute,
  listMessagesRoute,
  sendMessageRoute,
  updateAgentRoute,
  updateDocumentRoute,
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
