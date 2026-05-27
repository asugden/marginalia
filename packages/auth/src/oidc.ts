// Generic OIDC dance. Implements the AuthProvider contract for any IdP that
// publishes a well-known/openid-configuration document. GoogleProvider just
// pre-wires the issuer and adds the (Google-specific) `hd` parameter.
//
// The OIDC code-with-PKCE flow is six HTTP calls and a JWT verify:
//   1. /auth/login   → GET .well-known/openid-configuration (once, cached)
//   2.                 redirect browser to authorization_endpoint
//   3. /auth/callback → POST token_endpoint with code + verifier + client creds
//   4.                 GET jwks_uri (cached by jose's createRemoteJWKSet)
//   5.                 verify id_token signature + iss + aud + exp + nonce
//   6.                 return ExternalIdentity to the worker
//
// We deliberately keep this small (no third-party "OAuth library"); Workers
// have native crypto/fetch/URL and jose handles the JWT verify.

import { createRemoteJWKSet, jwtVerify } from "jose";
import type {
  AuthProvider,
  ExternalIdentity,
  OidcDiscovery,
} from "./types.js";

/**
 * One-isolate cache of discovery documents + JWKS resolvers per issuer.
 * Discovery + JWKS rotate rarely; key rotation triggers a refetch inside
 * jose on a verify failure for an unknown kid.
 */
interface IssuerCache {
  discovery: OidcDiscovery;
  jwks: ReturnType<typeof createRemoteJWKSet>;
  fetchedAt: number;
}
const issuerCache = new Map<string, IssuerCache>();
const DISCOVERY_TTL_MS = 60 * 60 * 1000; // 1h

async function discoverIssuer(issuer: string): Promise<IssuerCache> {
  const cached = issuerCache.get(issuer);
  if (cached && Date.now() - cached.fetchedAt < DISCOVERY_TTL_MS) {
    return cached;
  }
  // Spec: well-known URL is `<issuer>/.well-known/openid-configuration`.
  // No trailing slash collapsing here — RFC 8414 says issuer MUST NOT end
  // with /, but many IdPs (looking at Authentik) do; tolerate it.
  const base = issuer.replace(/\/$/, "");
  const res = await fetch(`${base}/.well-known/openid-configuration`);
  if (!res.ok) {
    throw new Error(
      `OIDC discovery failed for ${issuer}: HTTP ${res.status}`,
    );
  }
  const discovery = (await res.json()) as OidcDiscovery;
  if (
    !discovery.authorization_endpoint ||
    !discovery.token_endpoint ||
    !discovery.jwks_uri
  ) {
    throw new Error(
      `OIDC discovery document for ${issuer} is missing required endpoints`,
    );
  }
  const entry: IssuerCache = {
    discovery,
    jwks: createRemoteJWKSet(new URL(discovery.jwks_uri), {
      cacheMaxAge: 60 * 60 * 1000,
      cooldownDuration: 30 * 1000,
    }),
    fetchedAt: Date.now(),
  };
  issuerCache.set(issuer, entry);
  return entry;
}

export interface OidcProviderOptions {
  /** AuthProvider id (stored on users.external_provider). */
  id: string;
  /** IdP issuer URL. */
  issuer: string;
  clientId: string;
  clientSecret: string;
  /** Extra parameters appended to the authorization URL. Provider-specific
   *  knobs (Google's `hd`, `prompt`, etc.) layer in here. */
  authParams?: Record<string, string>;
  /** OIDC scopes; defaults to "openid email profile" which is the minimum
   *  for an email + display name. */
  scope?: string;
}

export class OidcProvider implements AuthProvider {
  readonly id: string;
  readonly issuer: string;
  readonly clientId: string;
  readonly clientSecret: string;
  readonly authParams: Record<string, string>;
  readonly scope: string;

  constructor(opts: OidcProviderOptions) {
    this.id = opts.id;
    this.issuer = opts.issuer;
    this.clientId = opts.clientId;
    this.clientSecret = opts.clientSecret;
    this.authParams = opts.authParams ?? {};
    this.scope = opts.scope ?? "openid email profile";
  }

  async authorizationUrl(params: {
    state: string;
    codeChallenge: string;
    redirectUri: string;
  }): Promise<string> {
    const { discovery } = await discoverIssuer(this.issuer);
    const url = new URL(discovery.authorization_endpoint);
    const search = url.searchParams;
    search.set("response_type", "code");
    search.set("client_id", this.clientId);
    search.set("redirect_uri", params.redirectUri);
    search.set("scope", this.scope);
    search.set("state", params.state);
    // PKCE: required even for confidential clients (docs/v0.6-plan.md §3).
    // Costs nothing and blocks a class of authorization-code interception
    // attacks.
    search.set("code_challenge", params.codeChallenge);
    search.set("code_challenge_method", "S256");
    for (const [k, v] of Object.entries(this.authParams)) {
      search.set(k, v);
    }
    return url.toString();
  }

  async exchangeCode(params: {
    code: string;
    codeVerifier: string;
    redirectUri: string;
  }): Promise<ExternalIdentity> {
    const { discovery, jwks } = await discoverIssuer(this.issuer);

    // Token endpoint POST. Form-encoded per RFC 6749. We send client
    // credentials in the body (client_secret_post) rather than HTTP basic
    // auth — both are spec-compliant, body form is friendlier when the
    // secret has odd chars.
    const body = new URLSearchParams();
    body.set("grant_type", "authorization_code");
    body.set("code", params.code);
    body.set("redirect_uri", params.redirectUri);
    body.set("client_id", this.clientId);
    body.set("client_secret", this.clientSecret);
    body.set("code_verifier", params.codeVerifier);

    const tokenRes = await fetch(discovery.token_endpoint, {
      method: "POST",
      headers: {
        "content-type": "application/x-www-form-urlencoded",
        accept: "application/json",
      },
      body: body.toString(),
    });
    if (!tokenRes.ok) {
      // Read once; the IdP usually includes a useful error description.
      const detail = await tokenRes.text().catch(() => "");
      throw new Error(
        `OIDC token exchange failed: HTTP ${tokenRes.status} ${detail.slice(0, 200)}`,
      );
    }
    const tokens = (await tokenRes.json()) as {
      id_token?: string;
      access_token?: string;
      token_type?: string;
    };
    if (!tokens.id_token) {
      throw new Error("OIDC token response missing id_token");
    }

    // Verify the ID token's signature against the issuer's JWKS, check
    // issuer + audience + expiry. jose checks `exp` automatically.
    const { payload } = await jwtVerify(tokens.id_token, jwks, {
      issuer: this.issuer,
      audience: this.clientId,
    });

    const sub = typeof payload.sub === "string" ? payload.sub : null;
    const email = typeof payload.email === "string" ? payload.email : null;
    if (!sub || !email) {
      throw new Error("OIDC id_token missing sub or email claim");
    }
    // Normalise: lowercase email + namespace subject by issuer so two IdPs
    // that happen to mint the same `sub` (rare but possible) can't collide.
    const emailVerified =
      payload.email_verified === true || payload.email_verified === "true";
    const displayName =
      typeof payload.name === "string" && payload.name.trim()
        ? payload.name.trim()
        : null;

    return {
      subject: `${this.issuer}:${sub}`,
      email: email.toLowerCase(),
      emailVerified,
      displayName,
    };
  }
}

/**
 * Google-specific OIDC adapter. Same dance as the generic OidcProvider with
 * the issuer fixed and `prompt=select_account` so a user signed into
 * multiple Google accounts gets the picker instead of silently re-using
 * whichever the browser cached.
 *
 * Optional `hostedDomain` maps to Google's `hd` parameter, which restricts
 * the picker to one GSuite domain (e.g. "example.edu") for institutions
 * that want the IdP-side gate. `hd` is advisory — the IdP can be bypassed
 * — so we still verify the email domain in the worker on every callback
 * via ALLOWED_EMAIL_DOMAINS.
 */
export interface GoogleProviderOptions {
  clientId: string;
  clientSecret: string;
  /** Restrict the picker to a single GSuite domain. */
  hostedDomain?: string;
}

export class GoogleProvider extends OidcProvider {
  constructor(opts: GoogleProviderOptions) {
    const authParams: Record<string, string> = { prompt: "select_account" };
    if (opts.hostedDomain) authParams.hd = opts.hostedDomain;
    super({
      id: "google",
      issuer: "https://accounts.google.com",
      clientId: opts.clientId,
      clientSecret: opts.clientSecret,
      authParams,
    });
  }
}

// Test-only escape hatch: clear the issuer cache between tests so a mocked
// fetch in one case doesn't leak to the next. Not exported from the package
// barrel; tests import directly from "./oidc.js".
export function _resetIssuerCacheForTests(): void {
  issuerCache.clear();
}
