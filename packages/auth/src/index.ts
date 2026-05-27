// Public barrel for @marginalia/auth.
//
// The worker imports from here only — never reaches into ./oidc.js or
// ./state.js directly. Keeping the surface small means the M3/M7 boundary
// changes don't ripple through unrelated files.

export type {
  AuthProvider,
  AuthState,
  ExternalIdentity,
  OidcDiscovery,
} from "./types.js";

export {
  OidcProvider,
  GoogleProvider,
  type OidcProviderOptions,
  type GoogleProviderOptions,
} from "./oidc.js";

export {
  signState,
  verifyState,
  newPkcePair,
  newNonce,
} from "./state.js";

export {
  buildCookie,
  parseCookies,
  SESSION_COOKIE,
  OIDC_STATE_COOKIE,
  OIDC_STATE_MAX_AGE,
  type CookieAttrs,
} from "./cookie.js";

export {
  createSession,
  findActiveSession,
  findActiveSessionWithUser,
  touchSession,
  deleteSession,
  deleteExpiredSessions,
  deleteSessionsForUser,
  newSessionId,
  hashIp,
  type CreateSessionParams,
} from "./sessions.js";
