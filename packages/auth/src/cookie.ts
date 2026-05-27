// Cookie attribute string builder + parser.
//
// The plan's §10 risk mitigation is "a unit test asserts the attribute
// string for every session-mint code path." That test (cookie.test.ts)
// imports buildCookie from here; if anyone slips SameSite=None into a
// codepath that wasn't supposed to have it, the assertion fails. Don't
// inline ad-hoc cookie strings elsewhere — call buildCookie.

export interface CookieAttrs {
  name: string;
  value: string;
  /** Seconds from now; 0 deletes (via Max-Age=0). */
  maxAge: number;
  /** Defaults to "Lax" — the OIDC redirect from Google must carry the
   *  cookie back, and Strict blocks that. */
  sameSite?: "Lax" | "Strict" | "None";
  /** Defaults to "/". */
  path?: string;
  /** Defaults to true. Set false only in tests against http://localhost
   *  when a browser refuses Secure cookies. */
  secure?: boolean;
  /** Defaults to true. */
  httpOnly?: boolean;
}

export function buildCookie(a: CookieAttrs): string {
  // v0.6-plan §10: refuse SameSite=None on the session cookie. SameSite=None
  // would expose mutating endpoints to CSRF from third-party origins (the
  // worker doesn't ship a standalone CSRF token; the cookie's same-site
  // restriction IS the defence). A future contributor reaching for None to
  // "make embedding work" should hit this before it ships.
  if (a.name === SESSION_COOKIE && a.sameSite === "None") {
    throw new Error(
      "Refusing to mint session cookie with SameSite=None — would defeat CSRF protection. See docs/v0.6-plan.md §10.",
    );
  }
  const parts = [`${a.name}=${a.value}`];
  parts.push(`Max-Age=${a.maxAge}`);
  parts.push(`Path=${a.path ?? "/"}`);
  parts.push(`SameSite=${a.sameSite ?? "Lax"}`);
  if (a.httpOnly !== false) parts.push("HttpOnly");
  if (a.secure !== false) parts.push("Secure");
  return parts.join("; ");
}

/** Parse a `Cookie:` request header into a name→value map. Values are not
 *  URL-decoded; the worker stores opaque ids that don't contain `%`. */
export function parseCookies(header: string | null): Record<string, string> {
  const out: Record<string, string> = {};
  if (!header) return out;
  for (const piece of header.split(";")) {
    const eq = piece.indexOf("=");
    if (eq < 0) continue;
    const k = piece.slice(0, eq).trim();
    const v = piece.slice(eq + 1).trim();
    if (k) out[k] = v;
  }
  return out;
}

/** The session cookie name. Centralised so the worker, the cookie tests,
 *  and the (eventual) /auth/logout helper all agree. */
export const SESSION_COOKIE = "marginalia_session";

/** Short-lived cookie carrying the signed AuthState across /auth/login →
 *  /auth/callback. Lifetime is 10 minutes — long enough for a human to
 *  complete the IdP consent screen, short enough that an abandoned login
 *  page doesn't leave a usable verifier sitting in the browser. */
export const OIDC_STATE_COOKIE = "marginalia_oidc_state";
export const OIDC_STATE_MAX_AGE = 10 * 60; // seconds
