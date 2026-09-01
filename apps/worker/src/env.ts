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
  /**
   * Anthropic-direct key. Used for the bring-your-own-key fallback and when
   * LLM_PROVIDER is "anthropic". May be unset on deployments that route all
   * institution-funded traffic through an OpenAI-compatible endpoint.
   */
  ANTHROPIC_API_KEY?: string;
  /**
   * Which provider adapter serves institution-funded requests:
   * "anthropic" (default) or "openai-compatible".
   */
  LLM_PROVIDER?: string;
  /**
   * Endpoint root for LLM_PROVIDER="openai-compatible" — an OpenAI-compatible
   * gateway or self-hosted runtime. With or without a trailing "/v1".
   */
  LLM_BASE_URL?: string;
  /**
   * Credential for LLM_PROVIDER="openai-compatible".
   *
   * Deployments whose institution mandates a different secret name can set
   * LLM_API_KEY_VAR to that name and the worker will read the credential from
   * there instead — so a local naming convention never has to be reflected in
   * this (brand-neutral) codebase.
   */
  LLM_API_KEY?: string;
  /**
   * Optional indirection: the name of the env var actually holding the
   * OpenAI-compatible credential, when it isn't LLM_API_KEY. The var it names
   * must be set as a Worker secret like any other credential.
   */
  LLM_API_KEY_VAR?: string;
  /**
   * Default model id, in whichever namespace the configured provider uses.
   * Gateways commonly rewrite ids, so treat this as an opaque string.
   */
  DEFAULT_MODEL: string;
  /**
   * Cheapest model id for incidental work (conversation-title generation).
   * Unset disables that work rather than paying the chat model's rate for it.
   */
  TITLE_MODEL?: string;
  /**
   * Default model for provenance chat, used when a voice names none (including
   * the built-in voices, which have no database row to hold a choice).
   *
   * Separate from DEFAULT_MODEL so document Q&A can sit on a cheap floor while
   * the rest of the instance runs on a stronger model. Falls back to
   * DEFAULT_MODEL when unset.
   */
  PROVENANCE_DEFAULT_MODEL?: string;
  /**
   * Models instructors may assign to an agent, as JSON:
   *   [{"id":"<provider model id>","label":"Human-facing name"}]
   * Advisory: the worker passes ids through opaquely and the provider endpoint
   * remains the authority on what is actually servable.
   */
  LLM_MODELS?: string;
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

  /**
   * "true" to always show Google's account chooser (`prompt=select_account`).
   * Default (unset) skips it, so a browser with a single Google session signs
   * in without an extra tap — worth it when sign-in happens inside a
   * time-limited flow. Enable on shared/lab machines, where silently reusing
   * the cached account is the greater risk.
   */
  AUTH_GOOGLE_FORCE_ACCOUNT_PICKER?: string;
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
