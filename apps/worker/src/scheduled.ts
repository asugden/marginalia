// Scheduled handler — wired up by [triggers] in wrangler.toml.
//
// One job today: sweep expired sessions out of D1. The session table is small
// at classroom scale, but over months of use it accumulates rows for browsers
// that signed out long ago. Daily cleanup keeps it bounded without affecting
// any hot path.
//
// Cloudflare invokes this once per scheduled trigger; we don't need to chunk
// the delete because D1 happily eats tens of thousands of rows per query and
// our row counts are orders of magnitude lower.

import { deleteExpiredSessions } from "@marginalia/auth";
import type { Env } from "./env.js";

export async function scheduled(
  _controller: ScheduledController,
  env: Env,
  ctx: ExecutionContext,
): Promise<void> {
  ctx.waitUntil(
    deleteExpiredSessions(env.DB, Date.now())
      .then((count) => {
        if (count > 0) {
          console.log(`session cleanup: deleted ${count} expired rows`);
        }
      })
      .catch((err) => {
        console.error("session cleanup failed:", err);
      }),
  );
}
