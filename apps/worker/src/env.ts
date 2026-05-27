/** Worker bindings & vars, mirroring wrangler.toml. */
export interface Env {
  DB: D1Database;
  /** Original source files (PDFs, etc.) backing indexed collections. */
  SOURCES: R2Bucket;
  /** Vectorize index holding chunks for every collection; namespaced per collection. */
  VECTORIZE: VectorizeIndex;
  /** Workers AI binding — default embeddings provider. */
  AI: Ai;
  /**
   * Static assets binding for apps/web/dist. `run_worker_first = ["/api/*"]`
   * in wrangler.toml means the asset server handles everything outside /api,
   * so the worker rarely fetches from this binding directly — but it's
   * available if a route ever needs to read an asset programmatically.
   */
  ASSETS: Fetcher;
  ANTHROPIC_API_KEY: string;
  DEFAULT_MODEL: string;
  /** Workers AI embedding model id, e.g. "@cf/baai/bge-base-en-v1.5". */
  EMBEDDING_MODEL: string;
  /** "dev" unlocks the local-only auth bypass; any other value (or absent) hard-disables it. */
  ENVIRONMENT?: string;
  /** Local-dev only. Honored only when ENVIRONMENT === "dev". */
  DEV_AUTH_BYPASS?: string;
  DEV_AUTH_EMAIL?: string;
  /**
   * Comma-separated list of allowed Origin values for CORS. Required when the
   * frontend (Pages) is on a different hostname than the Worker. Empty means
   * no CORS headers are emitted — same-origin only.
   */
  CORS_ALLOWED_ORIGINS?: string;
  // ── v0.6 (app-level OAuth) ────────────────────────────────────────────────
  /**
   * Which AuthProvider runs on this instance: "google" | "oidc".
   * v0.6 supports one configured provider per instance (see plan §1).
   */
  AUTH_PROVIDER?: string;
  AUTH_GOOGLE_CLIENT_ID?: string;
  AUTH_GOOGLE_CLIENT_SECRET?: string;
  /**
   * Google `hd` parameter — restricts the picker to a single GSuite domain
   * (e.g. "example.edu"). The IdP-side gate for institutions that have a
   * single Workspace domain. Advisory only: the worker still verifies email
   * domains on every join-code claim via ALLOWED_EMAIL_DOMAINS.
   */
  AUTH_GOOGLE_HD?: string;
  AUTH_OIDC_ISSUER?: string;
  AUTH_OIDC_CLIENT_ID?: string;
  AUTH_OIDC_CLIENT_SECRET?: string;
  /**
   * HMAC key for signing the `oidc_state` cookie and hashing IP addresses
   * stored on sessions. Set via `wrangler secret put SESSION_SIGNING_KEY`.
   * Must be at least 32 bytes of entropy; rotating invalidates all
   * in-flight /auth/login attempts but not active sessions.
   */
  SESSION_SIGNING_KEY?: string;
  /**
   * Comma-separated emails. Any signed-in user whose email matches gets
   * `users.is_admin = 1`. Bootstrap mechanism: env is the FLOOR, never
   * demotes — explicit demotion is a deliberate act in the admin UI.
   * See plan §5.
   */
  INSTANCE_ADMIN_EMAILS?: string;
  /** Rolling session TTL in days. Defaults to 30 in code. */
  SESSION_TTL_DAYS?: string;
  /**
   * Comma-separated email domains permitted to claim join codes
   * (e.g. "example.edu,grad.example.edu"). When set, a claim from any
   * other domain is refused at the worker. When unset/empty, no domain
   * gate is enforced — mostly useful for local dev. INSTANCE_ADMIN_EMAILS
   * domains are implicitly trusted in addition to this list (so the
   * person running the deploy can always self-onboard).
   */
  ALLOWED_EMAIL_DOMAINS?: string;
}
