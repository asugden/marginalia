// Dispatch for /api/attendance/*. Called from apps/worker/src/index.ts.
//
// Instructor surface:
//   GET    /api/attendance/sessions?courseId=         list sessions in a course
//   POST   /api/attendance/sessions                   open a session
//   GET    /api/attendance/sessions/:id               session + roster of check-ins
//   POST   /api/attendance/sessions/:id/close         close
//   GET    /api/attendance/sessions/:id/qr-token      rotating QR token (poll)
//   GET    /api/attendance/sessions/:id/export.csv    Canvas-friendly CSV
//
// Student check-in surface (signed-in, any enrolled role):
//   GET    /api/attendance/check/:id/info             minimal session info
//   POST   /api/attendance/check/:id                  submit check-in

import type { Env } from "../../env.js";
import type { Identity } from "../../auth.js";
import {
  checkInfoRoute,
  closeSessionRoute,
  exportCsvRoute,
  getQrTokenRoute,
  getSessionRoute,
  listSessionsRoute,
  openSessionRoute,
  submitCheckinRoute,
} from "./handlers.js";

export async function routeAttendance(
  req: Request,
  env: Env,
  url: URL,
  identity: Identity,
  parts: string[], // ["api", "attendance", ...]
): Promise<Response | null> {
  const [, , head, idOrTail, sub] = parts;

  if (head === "sessions") {
    if (req.method === "GET" && parts.length === 3) {
      return listSessionsRoute(env, identity, url);
    }
    if (req.method === "POST" && parts.length === 3) {
      return openSessionRoute(req, env, identity, url);
    }
    if (idOrTail && parts.length === 4 && req.method === "GET") {
      return getSessionRoute(env, identity, url, idOrTail);
    }
    if (idOrTail && parts.length === 5) {
      if (sub === "close" && req.method === "POST") {
        return closeSessionRoute(env, identity, idOrTail);
      }
      if (sub === "qr-token" && req.method === "GET") {
        return getQrTokenRoute(env, identity, idOrTail);
      }
      if (sub === "export.csv" && req.method === "GET") {
        return exportCsvRoute(env, identity, idOrTail);
      }
    }
  }

  if (head === "check" && idOrTail) {
    if (parts.length === 5 && sub === "info" && req.method === "GET") {
      return checkInfoRoute(env, idOrTail);
    }
    if (parts.length === 4 && req.method === "POST") {
      return submitCheckinRoute(req, env, identity, idOrTail);
    }
  }

  return null;
}
