// Dispatch for /api/code/*. Called from apps/worker/src/index.ts when the
// first path segment after /api/ is "code".
//
// Assignments
//   GET    /api/code/assignments?courseId=[&includeArchived=1]  list
//   POST   /api/code/assignments                                create — INSTRUCTOR
//   GET    /api/code/assignments/:id?courseId=                  fetch with starter
//   PATCH  /api/code/assignments/:id                            edit — INSTRUCTOR
//   DELETE /api/code/assignments/:id?courseId=                  delete — INSTRUCTOR
//   GET    /api/code/assignments/:id/roster?courseId=           every student — INSTRUCTOR
//   POST   /api/code/assignments/:id/tutor-preview              try the tutor on the starter (SSE, nothing stored) — INSTRUCTOR
//
// Notebooks (always the caller's own)
//   GET    /api/code/notebooks?courseId=                        list mine
//   POST   /api/code/notebooks                                  scratch, or open an assignment's
//   GET    /api/code/notebooks/:id?courseId=                    fetch
//   PATCH  /api/code/notebooks/:id                              save title / content
//   DELETE /api/code/notebooks/:id?courseId=                    delete
//   GET    /api/code/notebooks/:id/messages?courseId=           tutor history
//   POST   /api/code/notebooks/:id/messages                     tutor turn (SSE)
//   POST   /api/code/notebooks/:id/events                       append edit events (submit-mode assignments only)
//   GET    /api/code/notebooks/:id/submissions?courseId=        my submissions
//   POST   /api/code/notebooks/:id/submissions                  submit a snapshot
//
// Submissions
//   GET    /api/code/submissions/:id?courseId=                  frozen view — owner or INSTRUCTOR

import type { Env } from "../../env.js";
import type { Identity } from "../../auth.js";
import * as h from "./handlers.js";

export async function routeCode(
  req: Request,
  env: Env,
  url: URL,
  identity: Identity,
  parts: string[], // ["api", "code", ...]
): Promise<Response | null> {
  const [, , head, id, sub] = parts;
  const m = req.method;

  if (head === "assignments") {
    if (parts.length === 3) {
      if (m === "GET") return h.listAssignmentsRoute(env, identity, url);
      if (m === "POST") return h.createAssignmentRoute(req, env, identity);
    }
    if (id && parts.length === 4) {
      if (m === "GET") return h.getAssignmentRoute(env, identity, url, id);
      if (m === "PATCH") return h.updateAssignmentRoute(req, env, identity, id);
      if (m === "DELETE") return h.deleteAssignmentRoute(env, identity, url, id);
    }
    if (id && parts.length === 5 && sub === "roster" && m === "GET") {
      return h.rosterRoute(env, identity, url, id);
    }
    if (id && parts.length === 5 && sub === "tutor-preview" && m === "POST") {
      return h.tutorPreviewRoute(req, env, identity, id);
    }
  }

  if (head === "notebooks") {
    if (parts.length === 3) {
      if (m === "GET") return h.listNotebooksRoute(env, identity, url);
      if (m === "POST") return h.createNotebookRoute(req, env, identity);
    }
    if (id && parts.length === 4) {
      if (m === "GET") return h.getNotebookRoute(env, identity, url, id);
      if (m === "PATCH") return h.updateNotebookRoute(req, env, identity, id);
      if (m === "DELETE") return h.deleteNotebookRoute(env, identity, url, id);
    }
    if (id && parts.length === 5 && sub === "messages") {
      if (m === "GET") return h.listMessagesRoute(env, identity, url, id);
      if (m === "POST") return h.sendMessageRoute(req, env, identity, id);
    }
    if (id && parts.length === 5 && sub === "events" && m === "POST") {
      return h.appendEventsRoute(req, env, identity, id);
    }
    if (id && parts.length === 5 && sub === "submissions") {
      if (m === "GET") return h.listMySubmissionsRoute(env, identity, url, id);
      if (m === "POST") return h.createSubmissionRoute(req, env, identity, id);
    }
  }

  if (head === "submissions" && id && parts.length === 4 && m === "GET") {
    return h.getSubmissionRoute(env, identity, url, id);
  }

  return null;
}
