// Authentication for the worker. v0.6 replaced Cloudflare Access with
// app-level OAuth/OIDC; the Access JWT fallback was retired post-cutover
// (operations.md "Removing Cloudflare Access"). The session cookie is
// the only authenticated path now besides the local-dev bypass.
//
//   1. dev bypass        — ENVIRONMENT=dev + DEV_AUTH_BYPASS=true
//   2. session cookie    — D1 sessions table; the only production path
//
// authenticate() returns a richer Identity than v0.4: callers that need
// userId / isAdmin can use it directly without re-querying users.

import {
  findActiveSessionWithUser,
  parseCookies,
  SESSION_COOKIE,
  touchSession,
} from "@marginalia/auth";
import type { UserRow } from "@marginalia/schema";
import type { Env } from "./env.js";
import * as repo from "./repo.js";

/** Identity attached to every authenticated request. */
export interface Identity {
  /** users.id — non-null in production (OIDC callback creates the row
   *  before issuing the session). Null only on the dev bypass when the
   *  configured email doesn't yet have a row. */
  userId: string | null;
  email: string;
  displayName: string | null;
  isAdmin: boolean;
  /** users.can_create_courses (0028). Admins may create courses regardless;
   *  use permissions.canCreateCourses() rather than reading this alone. */
  canCreateCourses: boolean;
  /** users.genai_opt_out (0029): hide AI features from this person's own
   *  screens. Reaches a course only when all its instructors opted out. */
  genaiOptOut: boolean;
  /**
   * True while previewing a course as its sample student (0030). The identity
   * fields above then describe the SAMPLE STUDENT, not the person signed in —
   * every endpoint answers exactly as it would for a student. Only preview
   * chrome should look at `preview` below.
   */
  actingAsStudent: boolean;
  /** Who is really signed in while previewing, and which course. Null when
   *  not previewing. Read by /api/me and the act-as route, nothing else. */
  preview: { realUserId: string; realEmail: string; courseId: string } | null;
  /** Which mechanism authenticated this request. */
  via: "session" | "dev";
}

// v0.1 single-tenant default. Phase 2 derives org from the authenticated email.
const DEFAULT_ORG = "default";

const SESSION_IDLE_WRITE_MS = 24 * 60 * 60 * 1000; // bump expiry at most once a day
const DEFAULT_SESSION_TTL_DAYS = 30;

export function sessionTtlMs(env: Env): number {
  const days = Number(env.SESSION_TTL_DAYS) || DEFAULT_SESSION_TTL_DAYS;
  return days * 24 * 60 * 60 * 1000;
}

/**
 * Resolve the caller's identity, or null if unauthenticated.
 *
 * Two paths:
 *   • dev — only honoured when ENVIRONMENT === "dev"; lets local runs
 *     bypass the OIDC dance.
 *   • session — the production path: read the session cookie, look
 *     it up in D1 via a single JOIN, hydrate the user row. Rolling
 *     expiration bumps last_seen_at and extends expires_at, but at most
 *     once per SESSION_IDLE_WRITE_MS so a chatty client doesn't write-
 *     amplify D1.
 */
export async function authenticate(
  req: Request,
  env: Env,
): Promise<Identity | null> {
  // 1) dev bypass
  if (
    env.ENVIRONMENT === "dev" &&
    env.DEV_AUTH_BYPASS === "true" &&
    env.DEV_AUTH_EMAIL
  ) {
    const email = env.DEV_AUTH_EMAIL.toLowerCase();
    const user = await repo.findUserByEmail(env.DB, DEFAULT_ORG, email);
    // The dev bypass has no session row, so a preview rides a cookie instead.
    const devPreview = parseCookies(req.headers.get("cookie"))[DEV_PREVIEW_COOKIE];
    if (user && devPreview) {
      const sample = await loadSample(env, devPreview);
      if (sample) return sampleIdentity(sample, user, "dev");
    }
    return {
      userId: user?.id ?? null,
      email,
      displayName: user?.display_name ?? null,
      isAdmin: user?.is_admin === 1,
      canCreateCourses: user?.can_create_courses === 1,
      genaiOptOut: user?.genai_opt_out === 1,
      actingAsStudent: false,
      preview: null,
      via: "dev",
    };
  }

  // 2) session cookie. Single-query JOIN to save a D1 round-trip per request.
  const cookies = parseCookies(req.headers.get("cookie"));
  const sid = cookies[SESSION_COOKIE];
  if (sid) {
    const hit = await findActiveSessionWithUser(env.DB, sid, Date.now());
    if (hit) {
      const { session, user } = hit;
      // Fire-and-forget rolling extension. Errors here shouldn't fail the
      // request — at worst the session expires earlier than ideal.
      touchSession(env.DB, session, sessionTtlMs(env), SESSION_IDLE_WRITE_MS).catch(
        (e) => console.warn("touchSession failed:", e),
      );
      // Previewing: authenticate as the course's sample student. A stale or
      // tampered pointer (not a sample row) falls through to the real user.
      if (session.acting_as_user_id) {
        const sample = await loadSample(env, session.acting_as_user_id);
        if (sample) return sampleIdentity(sample, user, "session");
      }
      return {
        userId: user.id,
        email: user.email,
        displayName: user.display_name,
        isAdmin: user.is_admin === 1,
        canCreateCourses: user.can_create_courses === 1,
        genaiOptOut: user.genai_opt_out === 1,
        actingAsStudent: false,
        preview: null,
        via: "session",
      };
    }
    // Cookie referenced a missing/expired session, or a session whose user
    // row was deleted out from under it. Treat as unauthenticated.
  }

  return null;
}

/** Dev-bypass stand-in for sessions.acting_as_user_id (no session row). */
export const DEV_PREVIEW_COOKIE = "marginalia_dev_preview";

/** A sample-student row by id, or null if the id isn't one. */
async function loadSample(env: Env, userId: string): Promise<UserRow | null> {
  const row = await repo.findUserById(env.DB, userId);
  return row && row.is_sample === 1 && row.sample_course_id ? row : null;
}

/** The identity a preview runs under: the sample student, with no admin or
 *  course-creation powers and no personal preferences of the real user. */
function sampleIdentity(
  sample: UserRow,
  real: { id: string; email: string },
  via: Identity["via"],
): Identity {
  return {
    userId: sample.id,
    email: sample.email,
    displayName: sample.display_name,
    isAdmin: false,
    canCreateCourses: false,
    genaiOptOut: false,
    actingAsStudent: true,
    preview: {
      realUserId: real.id,
      realEmail: real.email,
      courseId: sample.sample_course_id!,
    },
    via,
  };
}

/**
 * Hard-fail before serving any request when ENVIRONMENT="production" and
 * app-level auth isn't configured. With Cloudflare Access retired, the
 * only acceptable production config is AUTH_PROVIDER + SESSION_SIGNING_KEY.
 */
export function assertProdConfigured(env: Env): Response | null {
  if (env.ENVIRONMENT === "dev") return null;
  if (env.AUTH_PROVIDER && env.SESSION_SIGNING_KEY) return null;
  return new Response(
    JSON.stringify({
      error:
        "Worker misconfigured: production requires AUTH_PROVIDER + SESSION_SIGNING_KEY. Set AUTH_PROVIDER in wrangler.toml [vars] and SESSION_SIGNING_KEY via `wrangler secret put`, then redeploy.",
    }),
    { status: 503, headers: { "content-type": "application/json" } },
  );
}
