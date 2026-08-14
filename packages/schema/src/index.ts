// Row types mirroring migrations/0001_init.sql. Hand-kept in sync with the
// SQL — when a migration changes a table, update the matching interface here.

// Course term helpers (season / academic year / archival). See term.ts.
export * from "./term.js";
import type { TermSeason } from "./term.js";

// v0.6 dropped `ta` — see migration 0004. Any code still narrowing on `ta`
// is dead and should be removed alongside the migration deploy.
export type EnrollmentRole = "student" | "instructor";

export interface OrganizationRow {
  id: string;
  name: string;
  created_at: number;
}

export interface UserRow {
  id: string;
  org_id: string;
  email: string;
  display_name: string | null;
  last_seen_at: number | null;
  created_at: number;
  /** v0.6: AuthProvider id ("google", "oidc-<institution>"). Null until the
   *  first OIDC sign-in claims this row. */
  external_provider: string | null;
  /** v0.6: stable per-IdP subject (for OIDC, iss+sub). Null until claimed. */
  external_subject: string | null;
  /** v0.6: timestamp at which the IdP last attested email verification. */
  email_verified_at: number | null;
  /** v0.6: instance-wide admin flag, orthogonal to course enrollments. */
  is_admin: number;
}

export interface CourseRow {
  id: string;
  org_id: string;
  name: string;
  created_at: number;
  /** v1.2 (migration 0017) — the semester this course is taught in, or NULL
   *  for an unscheduled course. The academic year is derived from
   *  (term_season, term_year), never stored — see term.ts. */
  term_season: TermSeason | null;
  /** Calendar year of `term_season` (2026 = Fall 2026). NULL when unscheduled. */
  term_year: number | null;
  /** Active window as Unix ms at UTC day boundaries (start = start-of-day,
   *  end = inclusive end-of-day). A course is "current" when now is within
   *  [start_date, end_date]; a NULL bound is open-ended. This is the sole
   *  source of truth for active vs past — there is no manual archived flag.
   *  See isCourseCurrent() in term.ts. */
  start_date: number | null;
  end_date: number | null;
}

export interface EnrollmentRow {
  id: string;
  course_id: string;
  user_id: string;
  role: EnrollmentRole;
  created_at: number;
}

/**
 * The top-level thing a student picks from a list. Renamed from `assignments`
 * in v0.4. `definition` is JSON-encoded AgentDefinition.
 */
export interface AgentRow {
  id: string;
  course_id: string;
  title: string;
  definition: string;
  created_at: number;
  updated_at: number;
}

/**
 * v1.1 (migration 0017) — a student's sticky hidden-variant assignment for
 * one agent. Written once, on the student's first start of a split agent;
 * reused for every later conversation on that agent. `variant_id` is the
 * AgentVariant.id from the JSON definition (no FK — arms live in a blob).
 */
export interface AgentVariantAssignmentRow {
  id: string;
  course_id: string;
  agent_id: string;
  user_id: string;
  variant_id: string;
  created_at: number;
}

/**
 * Instructor-authored voice (a bundled prompt fragment). Renamed from `agents`
 * in v0.4 — the v0.2 `agents` table held curated personas; v0.4 calls those
 * "voices" and uses "agent" for the top-level concept.
 */
export interface VoiceRow {
  id: string;
  /** v0.7 §1: legacy column, retained one release for migration safety.
   *  v0.7 reads/writes go through owner_user_id; new voices author at the
   *  user level, not the course level. */
  course_id: string | null;
  name: string;
  description: string;
  system_prompt_fragment: string;
  created_at: number;
  updated_at: number;
  /** v0.7 §1: the user who authored the voice. Voices appear in their
   *  picker; they can share with named users via voice_shares. NULL on
   *  orphaned rows (voices whose course had no instructor at migration
   *  time — should never occur in practice). */
  owner_user_id: string | null;
}

/** v0.7 §1 — explicit by-user share. Owner grants a named user the right
 *  to *use* (not edit) the voice in their own agents. */
export interface VoiceShareRow {
  voice_id: string;
  user_id: string;
  created_at: number;
}

/** Renamed from `source_corpora` in v0.4. */
export interface CollectionRow {
  id: string;
  course_id: string;
  name: string;
  description: string | null;
  created_at: number;
  updated_at: number;
}

export type CollectionSourceStatus = "pending" | "indexed" | "failed";
export type CollectionSourceKind = "pdf" | "markdown" | "text" | "url";

/** Renamed from `corpus_sources` in v0.4. v0.4 §4 broadened to markdown / text / url. */
export interface CollectionSourceRow {
  id: string;
  collection_id: string;
  course_id: string;
  filename: string;
  r2_key: string;
  byte_size: number;
  kind: CollectionSourceKind;
  /** Original URL when kind='url'; null otherwise. */
  source_url: string | null;
  /** Set when kind='url' has been fetched (initial or refresh). */
  fetched_at: number | null;
  content_type: string | null;
  chunks: number;
  status: CollectionSourceStatus;
  error: string | null;
  created_at: number;
  updated_at: number;
}

export interface ConversationRow {
  id: string;
  course_id: string;
  user_id: string;
  agent_id: string | null;
  /** JSON-encoded AgentDefinition captured at conversation start. */
  definition_snapshot: string;
  /** JSON-encoded BackboneState, or null when the agent has no backbone. */
  backbone_state: string | null;
  turn_count: number;
  /** Free-chat: lazy-generated by the cheapest model. Backbone: stays null (server-derives at read). */
  title: string | null;
  /** Bounded attempt counter for free-chat title-gen. See migration comment. */
  title_attempts: number;
  /** Set when a backbone exits or is otherwise terminated. Read-only thereafter. */
  completed_at: number | null;
  /** Display title of the agent at the time this conversation was created.
   *  Survives agent deletion so old conversations don't all read as
   *  "(deleted agent)". See migration 0002 + v0.5 §7. */
  agent_title_snapshot: string | null;
  created_at: number;
  updated_at: number;
}

export interface MessageRow {
  id: string;
  conversation_id: string;
  course_id: string;
  role: "user" | "assistant";
  content: string;
  seq: number;
  created_at: number;
}

/**
 * v0.6 — D1-backed session. Created at /auth/callback after a successful OIDC
 * exchange, looked up by cookie id on every API request, expires_at extended
 * on a rolling basis up to SESSION_TTL_DAYS.
 */
export interface SessionRow {
  id: string;
  user_id: string;
  created_at: number;
  expires_at: number;
  last_seen_at: number;
  user_agent: string | null;
  ip_hash: string | null;
  /**
   * Session-scoped "act as student" downgrade (migration 0016). When 1, the
   * worker reports the owner's per-course role as `student` so an instructor
   * can run their own authored agents exactly as a student would, without a
   * second account. Ephemeral: clears on logout/expiry; never touches the
   * real `enrollments` role.
   */
  acting_as_student: number;
}

/**
 * v0.6 — course join code. Student-only self-enroll. `code` is the
 * human-typable primary key; `uses` increments atomically with the
 * enrollment insert so concurrent claims can't exceed `max_uses`.
 */
export interface CourseJoinCodeRow {
  code: string;
  course_id: string;
  email_domain: string | null;
  expires_at: number | null;
  max_uses: number | null;
  uses: number;
  created_by: string;
  created_at: number;
  revoked_at: number | null;
}

/**
 * v0.6 — append-only audit log entry. One row per admin action.
 * `payload` is JSON text for action-specific extra fields.
 */
export interface AuditLogRow {
  id: string;
  actor_id: string;
  action: string;
  target_kind: string | null;
  target_id: string | null;
  payload: string | null;
  created_at: number;
}

/**
 * Provenance module — writing tool that tracks word-level origin.
 * Documents (slice 1) + append-only edit-event log (slice 2). Chat
 * tables land later. See modules/provenance/README.md.
 */
export type ProvenanceEventKind =
  | "insert"
  | "delete"
  | "paste"
  | "llm_insert"
  | "replace" // slice 7: spellcheck/autocorrect/Grammarly word replacement
  | "move"; // slice 8: cut/copy + paste within the same document
export type ProvenanceOrigin = "human" | "llm" | "pasted" | "edited";

/** One run of identical origins — compact transport for a character range. */
export interface ProvenanceOriginRun {
  origin: ProvenanceOrigin;
  length: number;
}

export interface ProvenanceEventRow {
  id: string;
  document_id: string;
  course_id: string;
  user_id: string;
  kind: ProvenanceEventKind;
  offset: number;
  length: number;
  text: string | null;
  origin: ProvenanceOrigin | null;
  source_message_id: string | null;
  timing_blob: string | null;
  client_seq: number;
  created_at: number;
}

export interface ProvenanceDocumentRow {
  id: string;
  course_id: string;
  owner_user_id: string;
  title: string;
  /** Tiptap doc JSON, serialised. */
  body_json: string;
  word_count: number;
  char_count: number;
  created_at: number;
  updated_at: number;
}

/**
 * Provenance chat (slice 3): per-document agents + conversations + messages.
 * Separate from the existing agents/voices/conversations schema because the
 * chat is structurally simpler and modules don't import each other's tables.
 */
export interface ProvenanceAgentRow {
  id: string;
  course_id: string;
  /** NULL = course-default (instructor-authored). Non-null = student-private. */
  owner_user_id: string | null;
  name: string;
  system_prompt: string;
  /**
   * Optional per-voice model override. Opaque provider model id; NULL means the
   * worker's configured provenance default applies. Validated against the
   * deployment's model list, never against a hardcoded set — valid ids depend
   * on which provider the instance points at.
   */
  model: string | null;
  created_at: number;
  updated_at: number;
}

export interface ProvenanceConversationRow {
  id: string;
  document_id: string;
  course_id: string;
  user_id: string;
  /** Nulled when the agent is deleted; snapshot fields keep the chat readable. */
  agent_id: string | null;
  agent_name_snapshot: string;
  agent_prompt_snapshot: string;
  /**
   * Model captured at conversation start, so the transcript stays attributable
   * after the voice is edited or deleted. NULL means no explicit choice was in
   * effect — the configured provenance default applied.
   */
  agent_model_snapshot: string | null;
  title: string | null;
  created_at: number;
  updated_at: number;
}

export type ProvenanceMessageRole = "user" | "assistant";

export interface ProvenanceMessageRow {
  id: string;
  conversation_id: string;
  role: ProvenanceMessageRole;
  content: string;
  seq: number;
  created_at: number;
}

/**
 * Slice 6 — a shareable, frozen, read-only view of a document. The
 * render is computed server-side from edit_events at mint time and
 * stored as JSON so the public viewer needs no auth and no replay.
 */
export interface ProvenanceSubmissionRow {
  token: string;
  document_id: string;
  course_id: string;
  user_id: string;
  title_snapshot: string;
  /** JSON: { text: string, runs: { origin, length }[] }. */
  render_json: string;
  snapshot_event_seq: number;
  created_at: number;
  revoked_at: number | null;
}

/** v0.5 §3 — citation a RAG-grounded assistant message leaned on. Display
 *  fields are snapshotted on insert so a citation pill survives the source
 *  later being removed from its collection. */
export interface MessageSourceRow {
  message_id: string;
  /** Live FK; null after the source row is deleted. */
  source_id: string | null;
  /** 1-based citation order within the message (first cited = 1). */
  ordinal: number;
  filename: string;
  kind: string;
  source_url: string | null;
  r2_key: string | null;
  created_at: number;
}
