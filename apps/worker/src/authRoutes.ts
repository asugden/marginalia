// /auth/* routes: the OIDC dance + session cookie management.
//
// These routes run BEFORE the global authenticate() gate in index.ts —
// login/callback are inherently unauthenticated (the whole point is to
// bootstrap a session), logout and session look up the cookie themselves.
//
// Identity model: a user is keyed by (external_provider, external_subject)
// once claimed; before claim, by email. The callback in handleCallback()
// implements the plan §3 upsert: subject-match → email-match → fresh row.

import {
  GoogleProvider,
  OidcProvider,
  buildCookie,
  createSession,
  deleteSession,
  findActiveSession,
  hashIp,
  newNonce,
  newPkcePair,
  OIDC_STATE_COOKIE,
  OIDC_STATE_MAX_AGE,
  parseCookies,
  SESSION_COOKIE,
  setActingAsStudent,
  signState,
  verifyState,
  type AuthProvider,
  type ExternalIdentity,
} from "@marginalia/auth";
import type { Env } from "./env.js";
import * as repo from "./repo.js";
import { sessionTtlMs } from "./auth.js";

const DEFAULT_ORG = "default";

/** Resolve the configured AuthProvider, or null if none is wired. */
export function getAuthProvider(env: Env): AuthProvider | null {
  const which = env.AUTH_PROVIDER;
  if (!which) return null;
  if (which === "google") {
    if (!env.AUTH_GOOGLE_CLIENT_ID || !env.AUTH_GOOGLE_CLIENT_SECRET) {
      return null;
    }
    return new GoogleProvider({
      clientId: env.AUTH_GOOGLE_CLIENT_ID,
      clientSecret: env.AUTH_GOOGLE_CLIENT_SECRET,
      hostedDomain: env.AUTH_GOOGLE_HD,
    });
  }
  if (which === "oidc") {
    if (
      !env.AUTH_OIDC_ISSUER ||
      !env.AUTH_OIDC_CLIENT_ID ||
      !env.AUTH_OIDC_CLIENT_SECRET
    ) {
      return null;
    }
    return new OidcProvider({
      id: `oidc-${new URL(env.AUTH_OIDC_ISSUER).hostname}`,
      issuer: env.AUTH_OIDC_ISSUER,
      clientId: env.AUTH_OIDC_CLIENT_ID,
      clientSecret: env.AUTH_OIDC_CLIENT_SECRET,
    });
  }
  return null;
}

function callbackUrl(req: Request): string {
  const u = new URL(req.url);
  // Force https on the redirect_uri. The worker echoes back whatever scheme
  // the browser arrived with, so a plain http:// link would emit an http
  // redirect_uri and Google (which only has the https URI registered) rejects
  // it with redirect_uri_mismatch. Cloudflare's "Always Use HTTPS" should
  // upgrade first, but this makes the worker structurally incapable of
  // emitting http even if that edge setting is ever off. Localhost stays http
  // so local dev (http://localhost:8787/auth/callback) keeps working.
  const scheme = u.hostname === "localhost" ? u.protocol : "https:";
  return `${scheme}//${u.host}/auth/callback`;
}

const json = (body: unknown, status = 200, headers: HeadersInit = {}) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...headers },
  });

/**
 * Validate a `?return_to=` against an allowlist of in-app paths. We don't
 * accept arbitrary absolute URLs (open-redirect surface). The allowlist is
 * "starts with /" + a small denylist for `//foo.com` style smuggling.
 */
function safeReturnTo(input: string | null): string {
  if (!input) return "/";
  if (!input.startsWith("/")) return "/";
  if (input.startsWith("//")) return "/";
  // Strip any embedded \r\n that could leak into a Location header.
  if (/[\r\n]/.test(input)) return "/";
  return input;
}

export async function handleAuthRoute(
  req: Request,
  env: Env,
  url: URL,
): Promise<Response | null> {
  if (!url.pathname.startsWith("/auth/")) return null;
  const segment = url.pathname.slice("/auth/".length);

  if (segment === "login" && req.method === "GET") {
    return handleLogin(req, env, url);
  }
  if (segment === "callback" && req.method === "GET") {
    return handleCallback(req, env, url);
  }
  if (segment === "logout" && req.method === "POST") {
    return handleLogout(req, env);
  }
  if (segment === "session" && req.method === "GET") {
    return handleSession(req, env);
  }
  if (segment === "act-as-student" && req.method === "POST") {
    return handleActAsStudent(req, env);
  }
  return new Response("Not found", { status: 404 });
}

/**
 * POST /auth/act-as-student  { acting: boolean }
 *
 * Flip the current session's "act as student" downgrade. Entering (acting
 * true) is gated on holding an instructor enrollment *somewhere* — the same
 * instance-wide check the voice-preview feature uses — so a plain student
 * can't grant themselves the (harmless, but confusing) student-of-a-student
 * state. Exiting is always allowed so a session can never get stuck.
 *
 * The flag lives on the session row, so it clears on logout/expiry and is
 * invisible to any other device the user is signed in on.
 */
async function handleActAsStudent(req: Request, env: Env): Promise<Response> {
  const cookies = parseCookies(req.headers.get("cookie"));
  const sid = cookies[SESSION_COOKIE];
  if (!sid) return json({ error: "Not signed in" }, 401);
  const session = await findActiveSession(env.DB, sid, Date.now());
  if (!session) return json({ error: "Not signed in" }, 401);

  const body = (await req.json().catch(() => null)) as {
    acting?: boolean;
  } | null;
  const acting = body?.acting === true;

  if (acting) {
    const isInstructor = await repo.userIsInstructorAnywhere(
      env.DB,
      session.user_id,
    );
    if (!isInstructor) {
      return json(
        { error: "Only instructors can preview the student experience." },
        403,
      );
    }
  }

  await setActingAsStudent(env.DB, sid, acting);
  return json({ actingAsStudent: acting });
}

async function handleLogin(
  req: Request,
  env: Env,
  url: URL,
): Promise<Response> {
  const provider = getAuthProvider(env);
  if (!provider || !env.SESSION_SIGNING_KEY) {
    return json({ error: "Auth provider not configured" }, 503);
  }
  const returnTo = safeReturnTo(url.searchParams.get("return_to"));
  const { verifier, challenge } = await newPkcePair();
  const nonce = newNonce();
  const signed = await signState(
    { nonce, returnTo, codeVerifier: verifier },
    env.SESSION_SIGNING_KEY,
  );
  const authUrl = await provider.authorizationUrl({
    state: signed,
    codeChallenge: challenge,
    redirectUri: callbackUrl(req),
  });
  const stateCookie = buildCookie({
    name: OIDC_STATE_COOKIE,
    value: signed,
    maxAge: OIDC_STATE_MAX_AGE,
    sameSite: "Lax",
  });
  return new Response(null, {
    status: 302,
    headers: { location: authUrl, "set-cookie": stateCookie },
  });
}

async function handleCallback(
  req: Request,
  env: Env,
  url: URL,
): Promise<Response> {
  const provider = getAuthProvider(env);
  if (!provider || !env.SESSION_SIGNING_KEY) {
    return json({ error: "Auth provider not configured" }, 503);
  }
  const code = url.searchParams.get("code");
  const stateParam = url.searchParams.get("state");
  const errParam = url.searchParams.get("error");
  if (errParam) {
    return json({ error: `IdP returned error: ${errParam}` }, 400);
  }
  if (!code || !stateParam) {
    return json({ error: "Missing code or state" }, 400);
  }

  // The cookie value MUST equal the state param — if the user navigated
  // to /auth/callback with a forged state but no matching cookie (or vice
  // versa), this rejects it. Both are HMAC-signed; checking equality of
  // the signed blobs is a fast first gate before the crypto verify.
  const cookies = parseCookies(req.headers.get("cookie"));
  const stateCookie = cookies[OIDC_STATE_COOKIE];
  if (!stateCookie || stateCookie !== stateParam) {
    return json({ error: "Invalid state cookie" }, 400);
  }
  const state = await verifyState(stateParam, env.SESSION_SIGNING_KEY);
  if (!state) {
    return json({ error: "Invalid state signature" }, 400);
  }

  let identity: ExternalIdentity;
  try {
    identity = await provider.exchangeCode({
      code,
      codeVerifier: state.codeVerifier,
      redirectUri: callbackUrl(req),
    });
  } catch (err) {
    console.error("OIDC exchange failed:", err);
    return json(
      { error: err instanceof Error ? err.message : "OIDC exchange failed" },
      400,
    );
  }
  if (!identity.emailVerified) {
    return json(
      { error: "Email is not verified at the identity provider" },
      403,
    );
  }

  // Upsert per plan §3.
  const orgId = DEFAULT_ORG;
  const provId = provider.id;
  let userRow = await repo.findUserByExternalSubject(
    env.DB,
    provId,
    identity.subject,
  );
  if (!userRow) {
    // Try to claim a pre-existing row by email (e.g. instructor added the
    // student to a roster before they ever signed in).
    const existing = await repo.findUserByEmail(env.DB, orgId, identity.email);
    if (existing) {
      // Email mismatch case (plan §6 data-side): the row's email is the
      // claim target, so by definition they match here. The "Google subject
      // differs but email collides" case is the *other* path and is the
      // common one — first sign-in. Both reach this branch. Log if the
      // row already had a different external_subject, which would indicate
      // the same email is in use by a different account elsewhere — that
      // shouldn't happen given the unique-email constraint on users, but
      // log defensively.
      if (
        existing.external_subject &&
        existing.external_subject !== identity.subject
      ) {
        console.warn(
          `OIDC callback: email ${identity.email} already claimed by subject ${existing.external_subject}, refusing to overwrite with ${identity.subject}`,
        );
        return json(
          {
            error:
              "This email is already associated with a different sign-in. Contact your administrator if this seems wrong.",
          },
          409,
        );
      }
      await repo.claimUserBySubject(env.DB, existing.id, {
        provider: provId,
        subject: identity.subject,
        displayName: identity.displayName,
        emailVerifiedAt: Date.now(),
      });
      userRow = (await repo.findUserById(env.DB, existing.id))!;
    } else {
      // Fresh user. They have no enrollments yet; the join-code path (M5)
      // is what gets them into a course. Until then HomePage will show the
      // empty state.
      userRow = await repo.createUser(env.DB, {
        orgId,
        email: identity.email,
        displayName: identity.displayName,
      });
      await repo.claimUserBySubject(env.DB, userRow.id, {
        provider: provId,
        subject: identity.subject,
        displayName: identity.displayName,
        emailVerifiedAt: Date.now(),
      });
      userRow = (await repo.findUserById(env.DB, userRow.id))!;
    }
  }

  // Reconcile INSTANCE_ADMIN_EMAILS. Cheap to do per callback; idempotent.
  if (env.INSTANCE_ADMIN_EMAILS) {
    const emails = env.INSTANCE_ADMIN_EMAILS
      .split(",")
      .map((e) => e.trim())
      .filter(Boolean);
    if (emails.length > 0) {
      await repo.reconcileAdminEmails(env.DB, orgId, emails);
    }
  }

  // Mint a session.
  const ua = req.headers.get("user-agent") ?? null;
  const ip = req.headers.get("cf-connecting-ip");
  const ipHash =
    ip && env.SESSION_SIGNING_KEY
      ? await hashIp(ip, env.SESSION_SIGNING_KEY)
      : null;
  const session = await createSession(env.DB, {
    userId: userRow.id,
    ttlMs: sessionTtlMs(env),
    userAgent: ua,
    ipHash,
  });

  const sessionCookie = buildCookie({
    name: SESSION_COOKIE,
    value: session.id,
    maxAge: Math.floor(sessionTtlMs(env) / 1000),
    sameSite: "Lax",
  });
  // Clear the short-lived oidc_state cookie.
  const clearStateCookie = buildCookie({
    name: OIDC_STATE_COOKIE,
    value: "",
    maxAge: 0,
    sameSite: "Lax",
  });
  const headers = new Headers();
  headers.set("location", state.returnTo);
  headers.append("set-cookie", sessionCookie);
  headers.append("set-cookie", clearStateCookie);
  return new Response(null, { status: 302, headers });
}

async function handleLogout(req: Request, env: Env): Promise<Response> {
  const cookies = parseCookies(req.headers.get("cookie"));
  const sid = cookies[SESSION_COOKIE];
  if (sid) await deleteSession(env.DB, sid);
  const clear = buildCookie({
    name: SESSION_COOKIE,
    value: "",
    maxAge: 0,
    sameSite: "Lax",
  });
  return new Response(null, {
    status: 204,
    headers: { "set-cookie": clear },
  });
}

async function handleSession(req: Request, env: Env): Promise<Response> {
  // Mirrors /api/me but cookie-only (Access fallback intentionally omitted —
  // the frontend's "am I signed in?" check should test the v0.6 path).
  const cookies = parseCookies(req.headers.get("cookie"));
  const sid = cookies[SESSION_COOKIE];
  if (!sid) return json({ signedIn: false }, 200);
  const session = await findActiveSession(env.DB, sid, Date.now());
  if (!session) return json({ signedIn: false }, 200);
  const user = await repo.findUserById(env.DB, session.user_id);
  if (!user) return json({ signedIn: false }, 200);
  return json({
    signedIn: true,
    email: user.email,
    displayName: user.display_name,
    isAdmin: user.is_admin === 1,
    userId: user.id,
  });
}
