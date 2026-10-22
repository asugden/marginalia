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
import { DEV_PREVIEW_COOKIE, sessionTtlMs } from "./auth.js";
import { isStaff } from "./permissions.js";

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
      forceAccountPicker: env.AUTH_GOOGLE_FORCE_ACCOUNT_PICKER === "true",
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

function callbackUrl(req: Request, env: Env): string {
  const u = new URL(req.url);
  // Local dev is decided by ENVIRONMENT, NOT by anything on the request.
  // Under `wrangler dev` the request is rewritten to the custom domain in
  // wrangler.toml's `routes`, so a browser hitting http://localhost:8787
  // arrives here as http://<production-host>/... — the hostname and the port
  // are both gone. Sniffing req.url for "localhost" therefore never matches,
  // and the redirect_uri comes out as the production https:// URL, which the
  // IdP rejects with redirect_uri_mismatch against the registered
  // http://localhost:<port>/auth/callback.
  //
  // DEV_CALLBACK_ORIGIN carries the origin the browser actually used, since
  // the worker has no way to recover it. Defaults to the conventional wrangler
  // dev port so the common case needs no configuration.
  if (env.ENVIRONMENT === "dev") {
    const origin = env.DEV_CALLBACK_ORIGIN ?? "http://localhost:8787";
    return `${origin.replace(/\/$/, "")}/auth/callback`;
  }
  // Everywhere else: always https, regardless of the scheme the request
  // arrived with. Cloudflare's "Always Use HTTPS" should upgrade first, but
  // deciding it here makes the worker structurally incapable of emitting an
  // http redirect_uri even if that edge setting is ever off.
  return `https://${u.host}/auth/callback`;
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
 * POST /auth/act-as-student  { acting: boolean, courseId?: string }
 *
 * Enter or leave a course preview. Entering needs a courseId and a staff
 * enrollment (instructor or TA) in that course; the session then acts as the
 * course's sample student (created on first use — repo.getOrCreateSampleStudent)
 * until it leaves. Leaving is always allowed so a session can never get stuck.
 *
 * The preview lives on the session row (or, on the local dev bypass, a
 * cookie), so it clears on logout/expiry and is invisible to any other device
 * the user is signed in on.
 */
async function handleActAsStudent(req: Request, env: Env): Promise<Response> {
  const body = (await req.json().catch(() => null)) as {
    acting?: boolean;
    courseId?: unknown;
  } | null;
  const acting = body?.acting === true;
  const courseId = typeof body?.courseId === "string" ? body.courseId : null;

  // Who is really signed in — never the sample student, even mid-preview.
  const dev =
    env.ENVIRONMENT === "dev" && env.DEV_AUTH_BYPASS === "true" && !!env.DEV_AUTH_EMAIL;
  let realUserId: string | null = null;
  let sid: string | null = null;
  if (dev) {
    const u = await repo.findUserByEmail(env.DB, DEFAULT_ORG, env.DEV_AUTH_EMAIL!.toLowerCase());
    realUserId = u?.id ?? null;
  } else {
    sid = parseCookies(req.headers.get("cookie"))[SESSION_COOKIE] ?? null;
    const session = sid ? await findActiveSession(env.DB, sid, Date.now()) : null;
    realUserId = session?.user_id ?? null;
  }
  if (!realUserId) return json({ error: "Not signed in" }, 401);

  let sampleId: string | null = null;
  if (acting) {
    if (!courseId) return json({ error: "courseId is required to preview" }, 400);
    const enrollment = await repo.findEnrollment(env.DB, courseId, realUserId);
    if (!enrollment || !isStaff(enrollment.role)) {
      return json({ error: "Only course staff can preview the student experience." }, 403);
    }
    const sample = await repo.getOrCreateSampleStudent(env.DB, courseId);
    if (!sample) return json({ error: "Course not found" }, 404);
    sampleId = sample.id;
  }

  if (dev) {
    const cookie = buildCookie({
      name: DEV_PREVIEW_COOKIE,
      value: sampleId ?? "",
      maxAge: sampleId ? 60 * 60 * 24 : 0,
      secure: false,
    });
    return json({ actingAsStudent: acting, courseId: acting ? courseId : null }, 200, {
      "set-cookie": cookie,
    });
  }
  await setActingAsStudent(env.DB, sid!, acting, sampleId);
  return json({ actingAsStudent: acting, courseId: acting ? courseId : null });
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
  // ?retry=1 is set only by handleCallback when it restarts a login whose
  // state cookie had vanished. Folding it into the signed state carries it
  // through the IdP round-trip so the callback can refuse to retry twice.
  const retried = url.searchParams.get("retry") === "1";
  // Two signed blobs sharing one nonce. The cookie copy carries the PKCE
  // verifier; the `state` parameter copy does NOT (see AuthState.codeVerifier
  // for why). The callback binds them by nonce, so a state parameter without
  // its matching cookie — or vice versa — is refused.
  const publicState = { nonce, returnTo, ...(retried && { retried }) };
  const stateParam = await signState(publicState, env.SESSION_SIGNING_KEY);
  const cookieState = await signState(
    { ...publicState, codeVerifier: verifier },
    env.SESSION_SIGNING_KEY,
  );
  const authUrl = await provider.authorizationUrl({
    state: stateParam,
    codeChallenge: challenge,
    redirectUri: callbackUrl(req, env),
  });
  const stateCookie = buildCookie({
    name: OIDC_STATE_COOKIE,
    value: cookieState,
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

  // The state cookie and the state param are two signed blobs minted
  // together at /auth/login and bound by a shared nonce (the cookie copy
  // additionally holds the PKCE verifier). Both must verify and the nonces
  // must agree — a forged state alongside a real cookie, or a real state
  // replayed without its cookie, is rejected below.
  const cookies = parseCookies(req.headers.get("cookie"));
  const stateCookie = cookies[OIDC_STATE_COOKIE];
  const cookieState = stateCookie
    ? await verifyState(stateCookie, env.SESSION_SIGNING_KEY)
    : null;
  const stateOk =
    cookieState !== null &&
    typeof cookieState.codeVerifier === "string" &&
    (await verifyState(stateParam, env.SESSION_SIGNING_KEY))?.nonce === cookieState.nonce;
  if (!stateOk) {
    // Two very different situations reach this branch, and only one is an
    // attack:
    //
    //   * Cookie ABSENT — benign and recoverable. The 10-minute state
    //     lifetime lapsed on a slow consent screen, the user had the login
    //     page open in two tabs, or some other flow clobbered the cookie.
    //     Nothing is being forged; the login simply went stale. Dead-ending
    //     a student on a raw JSON error here is the bug we're fixing.
    //
    //   * Cookie PRESENT but DIFFERENT — this is the CSRF signature (a
    //     forged `state` alongside a real session's cookie). Never retry it;
    //     an automatic re-login would hand the attacker the retry loop.
    //
    // The absent case restarts the dance ONCE. The one-shot marker rides
    // inside the signed state (AuthState.retried), so a login that already
    // is a retry can't be retried again — a persistently broken cookie jar
    // (third-party cookies fully blocked, say) surfaces the error instead of
    // bouncing the browser forever.
    //
    // The returning state is signature-verified BEFORE anything on it is
    // trusted: an unsigned or forged blob yields null, which both denies the
    // retry and falls returnTo back to "/", so this path can neither be
    // used to smuggle a redirect target nor to reset someone's retry budget.
    const stale = env.SESSION_SIGNING_KEY
      ? await verifyState(stateParam, env.SESSION_SIGNING_KEY)
      : null;
    if (!stateCookie && stale && !stale.retried) {
      const dest = safeReturnTo(stale.returnTo);
      return new Response(null, {
        status: 302,
        headers: {
          location: `/auth/login?retry=1&return_to=${encodeURIComponent(dest)}`,
        },
      });
    }
    return json({ error: "Invalid state cookie" }, 400);
  }
  // The gate above established cookieState is verified and holds the
  // verifier; everything from here on reads the cookie copy, which is the
  // one the browser (not the URL) delivered.
  const state = cookieState!;
  const codeVerifier = state.codeVerifier!;

  let identity: ExternalIdentity;
  try {
    identity = await provider.exchangeCode({
      code,
      codeVerifier,
      redirectUri: callbackUrl(req, env),
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
