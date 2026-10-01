// Public types for the auth package. Mirrors the LLMProvider approach:
// one small interface, multiple adapters.
//
// Identity is `(provider_id, subject)`, never email. Emails can be reassigned
// (e.g. graduating students lose their institutional address) — an account
// must not merge into whoever inherits the address later.

/**
 * Stable per-IdP identifier captured at OIDC callback time. Used to mint
 * a session; never stored on the wire beyond the redirect dance.
 */
export interface ExternalIdentity {
  /** For OIDC, `iss + ":" + sub` so the same subject across distinct issuers
   *  can't collide. NOT the email. */
  subject: string;
  /** Always normalised lowercase. */
  email: string;
  /** False only if the IdP explicitly asserts the email is unverified
   *  (`email_verified: false`). True when the IdP attests verification OR
   *  omits the claim entirely — `email_verified` is optional in OIDC and
   *  some IdPs (Microsoft Entra ID among them) never mint it. The worker
   *  rejects false. */
  emailVerified: boolean;
  /** Optional display name; falls back to local-part of email at upsert time. */
  displayName: string | null;
}

/**
 * State the worker carries through the OIDC redirect. The `nonce` defends
 * against CSRF on the callback; `codeVerifier` is the PKCE secret bound to
 * the `code_challenge` we sent at /auth/login; `returnTo` is the in-app path
 * to land on after a successful sign-in (validated against an in-app allowlist
 * by the worker, not by this package).
 */
export interface AuthState {
  nonce: string;
  returnTo: string;
  /**
   * PKCE verifier. Present ONLY in the copy of the state that lives in the
   * HttpOnly cookie; the copy sent to the IdP as the `state` query parameter
   * omits it. The blob is signed, not encrypted, and the `state` parameter
   * is visible in the authorization URL, IdP logs, browser history and the
   * callback URL — carrying the verifier there would let anyone who
   * observes an unredeemed callback URL redeem the code themselves, which is
   * the authorization-code-injection attack PKCE exists to prevent.
   */
  codeVerifier?: string;
  /**
   * Set when this login is the one-shot retry of a callback whose state
   * cookie had gone missing. It rides the signed state (not the query
   * string) because the `redirect_uri` is registered with the IdP by exact
   * match and must not be varied, and because being inside the HMAC means a
   * client can neither forge nor strip it. The callback refuses to retry a
   * login already carrying this, which is what bounds the recovery to a
   * single attempt. Absent on a normal first login.
   */
  retried?: boolean;
}

/**
 * The adapter contract. Each implementation owns its provider id (e.g.
 * "google", "oidc-myschool"), its authorization URL construction, and its code
 * exchange — including ID-token verification against the provider's JWKS
 * and `aud`/`iss` checks. Worker code never touches those primitives.
 */
export interface AuthProvider {
  /** Stable provider id stored on `users.external_provider`. */
  id: string;
  /** Build the URL the browser should redirect to to begin sign-in. */
  authorizationUrl(params: {
    state: string;
    /** PKCE S256 code challenge derived from `AuthState.codeVerifier`. */
    codeChallenge: string;
    /** Absolute callback URL registered with the IdP. */
    redirectUri: string;
  }): Promise<string>;
  /** Exchange the auth code returned to the callback for an identity. */
  exchangeCode(params: {
    code: string;
    codeVerifier: string;
    redirectUri: string;
  }): Promise<ExternalIdentity>;
}

/**
 * OIDC discovery document (subset we use). The well-known endpoint returns
 * many more fields; only these matter for the dance we run.
 */
export interface OidcDiscovery {
  issuer: string;
  authorization_endpoint: string;
  token_endpoint: string;
  jwks_uri: string;
  end_session_endpoint?: string;
}
