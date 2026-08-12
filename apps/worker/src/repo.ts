// Data access. Every function that touches student data takes a course_id and
// filters on it. If you add a query here that omits course_id, that's a bug.

import type {
  AgentRow,
  AgentVariantAssignmentRow,
  AuditLogRow,
  CollectionRow,
  CollectionSourceKind,
  CollectionSourceRow,
  CollectionSourceStatus,
  ConversationRow,
  CourseJoinCodeRow,
  CourseRow,
  EnrollmentRole,
  EnrollmentRow,
  MessageRow,
  MessageSourceRow,
  TermSeason,
  UserRow,
  VoiceRow,
} from "@marginalia/schema";

const now = () => Date.now();
const id = (prefix: string) => `${prefix}_${crypto.randomUUID()}`;

/** Look up a user by email within an org. */
export async function findUserByEmail(
  db: D1Database,
  orgId: string,
  email: string,
): Promise<UserRow | null> {
  return db
    .prepare("SELECT * FROM users WHERE org_id = ? AND email = ?")
    .bind(orgId, email)
    .first<UserRow>();
}

/** Look up by primary key. */
export async function findUserById(
  db: D1Database,
  userId: string,
): Promise<UserRow | null> {
  return db
    .prepare("SELECT * FROM users WHERE id = ?")
    .bind(userId)
    .first<UserRow>();
}

/**
 * v0.6 — look up by (provider, subject). Once a row is claimed by an OIDC
 * sign-in this is the canonical identity lookup; email becomes display only.
 */
export async function findUserByExternalSubject(
  db: D1Database,
  provider: string,
  subject: string,
): Promise<UserRow | null> {
  return db
    .prepare(
      `SELECT * FROM users
        WHERE external_provider = ? AND external_subject = ?`,
    )
    .bind(provider, subject)
    .first<UserRow>();
}

/**
 * v0.6 — claim a pre-created `users` row at first OIDC sign-in. Idempotent:
 * if the row already has a matching subject, the UPDATE is a no-op. Returns
 * the updated row (re-read so callers see the freshly-set fields).
 *
 * Optionally bumps display_name if the IdP provided one and the row didn't
 * have one yet — never overwrites a non-null display_name (a user may have
 * personalised it elsewhere; we won't clobber that on every callback).
 */
export async function claimUserBySubject(
  db: D1Database,
  userId: string,
  params: {
    provider: string;
    subject: string;
    displayName: string | null;
    emailVerifiedAt: number;
  },
): Promise<void> {
  await db
    .prepare(
      `UPDATE users
          SET external_provider = ?,
              external_subject  = ?,
              email_verified_at = ?,
              display_name = COALESCE(display_name, ?)
        WHERE id = ?`,
    )
    .bind(
      params.provider,
      params.subject,
      params.emailVerifiedAt,
      params.displayName,
      userId,
    )
    .run();
}

/**
 * v0.6 — promote the named emails to admin. The env var (INSTANCE_ADMIN_EMAILS)
 * is the FLOOR: this never demotes. Called at /auth/callback time so the
 * very first sign-in by a seeded admin lands them in the admin set without a
 * separate bootstrap step. Idempotent.
 */
export async function reconcileAdminEmails(
  db: D1Database,
  orgId: string,
  emails: string[],
): Promise<void> {
  if (emails.length === 0) return;
  const placeholders = emails.map(() => "?").join(",");
  await db
    .prepare(
      `UPDATE users SET is_admin = 1
        WHERE org_id = ?
          AND is_admin = 0
          AND LOWER(email) IN (${placeholders})`,
    )
    .bind(orgId, ...emails.map((e) => e.toLowerCase()))
    .run();
}

/** Set an explicit admin flag. Admin-UI promote/demote calls this; the env
 *  reconciler does not (it has its own bulk path). */
export async function setUserAdmin(
  db: D1Database,
  userId: string,
  isAdmin: boolean,
): Promise<void> {
  await db
    .prepare(`UPDATE users SET is_admin = ? WHERE id = ?`)
    .bind(isAdmin ? 1 : 0, userId)
    .run();
}

/** Confirm the user is enrolled in the course. Authorization gate. */
export async function findEnrollment(
  db: D1Database,
  courseId: string,
  userId: string,
): Promise<EnrollmentRow | null> {
  return db
    .prepare("SELECT * FROM enrollments WHERE course_id = ? AND user_id = ?")
    .bind(courseId, userId)
    .first<EnrollmentRow>();
}

/** Every enrollment for a user. Used for "what courses am I in?" listings. */
export async function listEnrollmentsForUser(
  db: D1Database,
  userId: string,
): Promise<EnrollmentRow[]> {
  const { results } = await db
    .prepare("SELECT * FROM enrollments WHERE user_id = ?")
    .bind(userId)
    .all<EnrollmentRow>();
  return results ?? [];
}

/**
 * Every enrollment for a user, enriched with the course name. Used by
 * the per-user view (v0.7 §3.8) so the page can render "Stats 2026 ·
 * instructor" rather than just a course id.
 */
export interface UserEnrollmentRow {
  courseId: string;
  courseName: string;
  role: EnrollmentRole;
  joinedAt: number;
  /** v1.0 §6 — lazy-reveal flags for the per-course dashboard tab strip.
   *  Defaults false until the feature is used once (see
   *  markCourseFeatureShown), at which point the flag flips to true and
   *  stays on. Read by the SPA's CourseDashboardPage to decide which
   *  tabs render. */
  showAttendance: boolean;
  showCollections: boolean;
  /** Provenance writing tool — when true, students see the document without
   *  origin coloring (recording is unaffected). Instructors always see it.
   *  Default false. */
  hideProvenanceMarks: boolean;
  /** Whether the provenance writing module is enabled for this course (v1.1).
   *  A real on/off toggle, default ON — when off, students don't see the
   *  writing tool at all. */
  provenanceEnabled: boolean;
  /** Whether the Agents extension is enabled for this course (migration 0018).
   *  A real on/off toggle, default ON — when off, the Agents tab disappears
   *  from the instructor nav and agents disappear from the student view. */
  agentsEnabled: boolean;
  /** v1.2 (migration 0017) — the semester this course is taught in, or null
   *  when unscheduled. Academic year is derived client-side from
   *  (termSeason, termYear). */
  termSeason: TermSeason | null;
  termYear: number | null;
  /** Active window, Unix ms at UTC day boundaries (null = open-ended). A course
   *  is "current" when now is within [startDate, endDate] — see isCourseCurrent
   *  in term.ts. Replaces the removed manual archived flag. */
  startDate: number | null;
  endDate: number | null;
}
export async function listEnrollmentsForUserEnriched(
  db: D1Database,
  userId: string,
): Promise<UserEnrollmentRow[]> {
  // LEFT JOIN course_settings so the missing-row case (most courses, until
  // the first feature-use writes a row) shows as NULL → falsy → tab hidden.
  // COALESCE in the SELECT keeps the column boolean-ish even when the row
  // is absent.
  const { results } = await db
    .prepare(
      // Sources (show_collections) and Provenance (provenance_enabled) default
      // ON when there is no settings row (COALESCE default 1) — both are
      // optional modules that ship enabled. Attendance stays default-off
      // (opt-in, in-person only). See migration 0015.
      `SELECT e.course_id, c.name AS course_name, e.role,
              e.created_at AS joined_at,
              c.term_season, c.term_year, c.start_date, c.end_date,
              COALESCE(s.show_attendance, 0)  AS show_attendance,
              COALESCE(s.show_collections, 1) AS show_collections,
              COALESCE(s.hide_provenance_marks, 0) AS hide_provenance_marks,
              COALESCE(s.provenance_enabled, 1) AS provenance_enabled,
              COALESCE(s.agents_enabled, 1) AS agents_enabled
       FROM enrollments e
       JOIN courses c ON c.id = e.course_id
       LEFT JOIN course_settings s ON s.course_id = e.course_id
       WHERE e.user_id = ?
       ORDER BY e.created_at DESC`,
    )
    .bind(userId)
    .all<{
      course_id: string;
      course_name: string;
      role: EnrollmentRole;
      joined_at: number;
      term_season: TermSeason | null;
      term_year: number | null;
      start_date: number | null;
      end_date: number | null;
      show_attendance: number;
      show_collections: number;
      hide_provenance_marks: number;
      provenance_enabled: number;
      agents_enabled: number;
    }>();
  return (results ?? []).map((r) => ({
    courseId: r.course_id,
    courseName: r.course_name,
    role: r.role,
    joinedAt: r.joined_at,
    termSeason: r.term_season,
    termYear: r.term_year,
    startDate: r.start_date,
    endDate: r.end_date,
    showAttendance: r.show_attendance === 1,
    showCollections: r.show_collections === 1,
    hideProvenanceMarks: r.hide_provenance_marks === 1,
    provenanceEnabled: r.provenance_enabled === 1,
    agentsEnabled: r.agents_enabled === 1,
  }));
}

/**
 * v1.0 §6 — flip a per-course feature flag on. Called the first time an
 * instructor opens an attendance session or creates a collection so the
 * matching dashboard tab becomes visible. Idempotent — once on, stays
 * on (subsequent writes are no-ops on the boolean but refresh
 * updated_at).
 *
 * One round trip via INSERT … ON CONFLICT … DO UPDATE: avoids the
 * read-then-write race that two concurrent first-time creators could
 * otherwise lose.
 */
export async function markCourseFeatureShown(
  db: D1Database,
  courseId: string,
  feature: "attendance" | "collections",
): Promise<void> {
  const column = feature === "attendance" ? "show_attendance" : "show_collections";
  const ts = now();
  await db
    .prepare(
      `INSERT INTO course_settings (course_id, ${column}, updated_at)
       VALUES (?, 1, ?)
       ON CONFLICT(course_id) DO UPDATE
         SET ${column} = 1, updated_at = excluded.updated_at`,
    )
    .bind(courseId, ts)
    .run();
}

/** v1.1 — set a per-course module flag to an explicit on/off value. Unlike
 *  markCourseFeatureShown (one-way reveal), this is bidirectional so the
 *  course-admin toggles can turn Agents / Provenance / Attendance back off.
 *  (Library is no longer toggleable — see migration 0018.) Same
 *  single-round-trip upsert; the column allow-list keeps the interpolated
 *  identifier safe. */
export async function setCourseFeature(
  db: D1Database,
  courseId: string,
  feature: "attendance" | "agents" | "provenance",
  enabled: boolean,
): Promise<void> {
  const column =
    feature === "attendance"
      ? "show_attendance"
      : feature === "agents"
        ? "agents_enabled"
        : "provenance_enabled";
  await db
    .prepare(
      `INSERT INTO course_settings (course_id, ${column}, updated_at)
       VALUES (?, ?, ?)
       ON CONFLICT(course_id) DO UPDATE
         SET ${column} = excluded.${column}, updated_at = excluded.updated_at`,
    )
    .bind(courseId, enabled ? 1 : 0, now())
    .run();
}

/**
 * Bump users.last_seen_at, rate-limited. We refuse the write if the stored
 * value is within `windowMs` of now — avoids write amplification when a
 * single user fires many requests in close succession (page load, polling,
 * etc.). Pass the user row we already have so we don't re-query.
 */
export async function touchUserLastSeen(
  db: D1Database,
  user: UserRow,
  windowMs: number,
): Promise<void> {
  const ts = now();
  if (user.last_seen_at !== null && ts - user.last_seen_at < windowMs) return;
  // Concurrent requests for the same user can both pass the in-memory check
  // above and race here; the `last_seen_at < ?` clause makes the UPDATE a
  // single-statement guard at the row level so only the first writer wins.
  await db
    .prepare(
      `UPDATE users SET last_seen_at = ?
       WHERE id = ?
         AND (last_seen_at IS NULL OR last_seen_at < ?)`,
    )
    .bind(ts, user.id, ts - windowMs)
    .run();
}

/**
 * Cheap existence check used to gate cost-amplification endpoints (the
 * voice preview turn) to users who hold instructor enrollment somewhere
 * on the instance. Returns true even if the user is an instructor on a
 * course they don't currently care about — that's intentional; the
 * "anyone signed in could burn API credits" threat model is per-account,
 * not per-course.
 */
export async function userIsInstructorAnywhere(
  db: D1Database,
  userId: string,
): Promise<boolean> {
  const row = await db
    .prepare(
      `SELECT 1 FROM enrollments WHERE user_id = ? AND role = 'instructor' LIMIT 1`,
    )
    .bind(userId)
    .first<{ "1": number }>();
  return !!row;
}

/**
 * By-id variant that skips the precheck — the WHERE clause is the only
 * needed guard, and we don't have the row to inspect last_seen_at against.
 * Used on the hot waitUntil path where authenticate() already loaded the
 * row via session JOIN; saves one D1 read per request.
 */
export async function touchUserLastSeenById(
  db: D1Database,
  userId: string,
  windowMs: number,
): Promise<void> {
  const ts = now();
  await db
    .prepare(
      `UPDATE users SET last_seen_at = ?
       WHERE id = ?
         AND (last_seen_at IS NULL OR last_seen_at < ?)`,
    )
    .bind(ts, userId, ts - windowMs)
    .run();
}

// ── roster (instructor-only management of who's in a course) ──────────────

export interface RosterEntry {
  userId: string;
  email: string;
  displayName: string | null;
  role: EnrollmentRole;
  joinedAt: number;
  lastSeenAt: number | null;
}

/**
 * Join users + enrollments for one course. Filtered by course_id (the only
 * tenancy boundary that matters here). Used by the /author/roster page.
 */
export async function listRosterForCourse(
  db: D1Database,
  courseId: string,
): Promise<RosterEntry[]> {
  const { results } = await db
    .prepare(
      `SELECT u.id AS user_id, u.email, u.display_name, u.last_seen_at,
              e.role, e.created_at AS joined_at
       FROM enrollments e
       JOIN users u ON u.id = e.user_id
       WHERE e.course_id = ?
       ORDER BY e.created_at DESC`,
    )
    .bind(courseId)
    .all<{
      user_id: string;
      email: string;
      display_name: string | null;
      last_seen_at: number | null;
      role: EnrollmentRole;
      joined_at: number;
    }>();
  return (results ?? []).map((r) => ({
    userId: r.user_id,
    email: r.email,
    displayName: r.display_name,
    role: r.role,
    joinedAt: r.joined_at,
    lastSeenAt: r.last_seen_at,
  }));
}

/** Create a new user row. Used by the roster "add by email" path when the
 *  email hasn't signed in yet. The user is "claimed" on their first
 *  authenticated request. */
export async function createUser(
  db: D1Database,
  params: { orgId: string; email: string; displayName?: string | null },
): Promise<UserRow> {
  const row: UserRow = {
    id: id("user"),
    org_id: params.orgId,
    email: params.email,
    display_name: params.displayName ?? null,
    last_seen_at: null,
    created_at: now(),
    // v0.6: row starts unclaimed (no external_subject yet). First successful
    // OIDC callback whose email matches will claim it. See plan §3.
    external_provider: null,
    external_subject: null,
    email_verified_at: null,
    is_admin: 0,
  };
  await db
    .prepare(
      `INSERT INTO users (id, org_id, email, display_name, last_seen_at, created_at)
       VALUES (?, ?, ?, ?, NULL, ?)`,
    )
    .bind(row.id, row.org_id, row.email, row.display_name, row.created_at)
    .run();
  return row;
}

export async function createEnrollment(
  db: D1Database,
  params: { courseId: string; userId: string; role: EnrollmentRole },
): Promise<EnrollmentRow> {
  const row: EnrollmentRow = {
    id: id("enr"),
    course_id: params.courseId,
    user_id: params.userId,
    role: params.role,
    created_at: now(),
  };
  await db
    .prepare(
      `INSERT INTO enrollments (id, course_id, user_id, role, created_at)
       VALUES (?, ?, ?, ?, ?)`,
    )
    .bind(row.id, row.course_id, row.user_id, row.role, row.created_at)
    .run();
  return row;
}

export async function updateEnrollmentRole(
  db: D1Database,
  courseId: string,
  userId: string,
  role: EnrollmentRole,
): Promise<void> {
  await db
    .prepare(
      `UPDATE enrollments SET role = ?
       WHERE course_id = ? AND user_id = ?`,
    )
    .bind(role, courseId, userId)
    .run();
}

export async function deleteEnrollment(
  db: D1Database,
  courseId: string,
  userId: string,
): Promise<void> {
  await db
    .prepare(`DELETE FROM enrollments WHERE course_id = ? AND user_id = ?`)
    .bind(courseId, userId)
    .run();
}

// ── agents (top-level: what students pick) ─────────────────────────────────

/** Fetch one agent, scoped to its course. */
export async function getAgent(
  db: D1Database,
  courseId: string,
  agentId: string,
): Promise<AgentRow | null> {
  return db
    .prepare("SELECT * FROM agents WHERE id = ? AND course_id = ?")
    .bind(agentId, courseId)
    .first<AgentRow>();
}

/** List agents in a course, most recently updated first. */
export async function listAgents(
  db: D1Database,
  courseId: string,
): Promise<AgentRow[]> {
  const { results } = await db
    .prepare(
      "SELECT * FROM agents WHERE course_id = ? ORDER BY updated_at DESC",
    )
    .bind(courseId)
    .all<AgentRow>();
  return results ?? [];
}

/**
 * v1.0 §4 — find an agent by id alone, without requiring the caller to
 * supply its course id. Used by the "duplicate into course" flow, where
 * the source agent lives in some course the caller knows by id but not
 * by name. The caller must still pass the row's `course_id` through an
 * enrollment+role check before acting on the result.
 */
export async function findAgentById(
  db: D1Database,
  agentId: string,
): Promise<AgentRow | null> {
  return db
    .prepare("SELECT * FROM agents WHERE id = ?")
    .bind(agentId)
    .first<AgentRow>();
}

// ── hidden variant assignments (v1.1) ──────────────────────────────────────

/** The current sticky assignment for (agent, user), or null if none yet. */
export async function findVariantAssignment(
  db: D1Database,
  agentId: string,
  userId: string,
): Promise<AgentVariantAssignmentRow | null> {
  return db
    .prepare(
      "SELECT * FROM agent_variant_assignments WHERE agent_id = ? AND user_id = ?",
    )
    .bind(agentId, userId)
    .first<AgentVariantAssignmentRow>();
}

/**
 * Get this student's sticky arm for a split agent, assigning one on first
 * call. Balanced: picks (uniformly at random) among the arms with the
 * fewest current assignments, so groups stay even as students trickle in.
 *
 * `validVariantIds` is the arm-id set from the *current* definition. We only
 * ever assign to one of these, so an arm removed from the definition after
 * some students were assigned won't receive new students — but existing
 * assignments to a since-removed arm are preserved (sticky), and the caller
 * falls back to a surviving arm for their voice when that happens.
 *
 * Concurrency: two first-starts for the same student could race. The INSERT
 * is guarded by the UNIQUE(agent_id, user_id) constraint with ON CONFLICT DO
 * NOTHING; we then re-read, so both requests converge on whichever row won —
 * a student can never end up double-assigned.
 */
export async function getOrAssignVariant(
  db: D1Database,
  params: {
    courseId: string;
    agentId: string;
    userId: string;
    validVariantIds: string[];
  },
): Promise<string> {
  const { courseId, agentId, userId, validVariantIds } = params;
  if (validVariantIds.length === 0) {
    throw new Error("getOrAssignVariant called with no valid variant ids");
  }

  const existing = await findVariantAssignment(db, agentId, userId);
  if (existing) return existing.variant_id;

  // Balanced pick: tally current assignments per arm, choose among the
  // least-filled valid arms. Arms with zero assignments don't appear in the
  // GROUP BY, so seed every valid arm at 0 first.
  const counts = new Map<string, number>(validVariantIds.map((v) => [v, 0]));
  const { results } = await db
    .prepare(
      `SELECT variant_id, COUNT(*) AS n
       FROM agent_variant_assignments
       WHERE agent_id = ?
       GROUP BY variant_id`,
    )
    .bind(agentId)
    .all<{ variant_id: string; n: number }>();
  for (const r of results ?? []) {
    if (counts.has(r.variant_id)) counts.set(r.variant_id, r.n);
  }
  let min = Infinity;
  for (const v of validVariantIds) min = Math.min(min, counts.get(v) ?? 0);
  const leastFilled = validVariantIds.filter((v) => (counts.get(v) ?? 0) === min);
  // leastFilled is non-empty (validVariantIds is non-empty and min is drawn
  // from it), so the index is always in range.
  const chosen = leastFilled[Math.floor(Math.random() * leastFilled.length)]!;

  await db
    .prepare(
      `INSERT INTO agent_variant_assignments
         (id, course_id, agent_id, user_id, variant_id, created_at)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT (agent_id, user_id) DO NOTHING`,
    )
    .bind(id("varasg"), courseId, agentId, userId, chosen, now())
    .run();

  // Re-read: if a concurrent request won the insert, its variant is
  // authoritative and ours was a no-op.
  const settled = await findVariantAssignment(db, agentId, userId);
  return settled?.variant_id ?? chosen;
}

/** One row of the instructor variant-results table. */
export interface VariantResultEntry {
  userId: string;
  email: string;
  displayName: string | null;
  variantId: string;
  threadCount: number;
}

/**
 * Per-student variant assignments for one agent, with how many conversations
 * each student has started against it. Instructor-only; course-scoped.
 * Students who were assigned but haven't chatted still appear (threadCount 0).
 */
export async function listVariantResults(
  db: D1Database,
  courseId: string,
  agentId: string,
): Promise<VariantResultEntry[]> {
  const { results } = await db
    .prepare(
      `SELECT a.user_id, u.email, u.display_name, a.variant_id,
              (SELECT COUNT(*) FROM conversations c
                 WHERE c.agent_id = a.agent_id AND c.user_id = a.user_id) AS thread_count
       FROM agent_variant_assignments a
       JOIN users u ON u.id = a.user_id
       WHERE a.agent_id = ? AND a.course_id = ?
       ORDER BY a.variant_id, u.email`,
    )
    .bind(agentId, courseId)
    .all<{
      user_id: string;
      email: string;
      display_name: string | null;
      variant_id: string;
      thread_count: number;
    }>();
  return (results ?? []).map((r) => ({
    userId: r.user_id,
    email: r.email,
    displayName: r.display_name,
    variantId: r.variant_id,
    threadCount: r.thread_count,
  }));
}

/**
 * For each agent in a course, the caller's most recent conversation against
 * it (or null). Drives the Start/Continue/Completed surface on the home page
 * (v0.4 §13). One row per agent that the caller has talked to.
 */
export interface LastConversationByAgent {
  agentId: string;
  conversationId: string;
  updatedAt: number;
  completedAt: number | null;
}
export async function listLastConversationsByAgent(
  db: D1Database,
  courseId: string,
  userId: string,
): Promise<LastConversationByAgent[]> {
  // Per-agent "most recent conversation owned by this user." The earlier
  // version relied on SQLite's bare-columns-with-MAX() behavior to return
  // sibling columns from the same row as MAX(updated_at); that semantics is
  // not portable and is not guaranteed for arbitrary bare columns like
  // `completed_at`. A correlated subquery is the safest formulation that
  // works on every SQLite version D1 might run.
  //
  // The EXISTS(messages) clause filters out empty ghost rows — historically
  // possible from the pre-§14 "create then send" flow, and from §14 failure
  // paths where the LLM call errored before any message was committed.
  // Without it the home page would surface "Continue" pointing at a
  // conversation with no transcript.
  const { results } = await db
    .prepare(
      `SELECT c.agent_id, c.id AS conv_id, c.updated_at, c.completed_at
         FROM conversations c
        WHERE c.user_id = ?
          AND c.course_id = ?
          AND c.agent_id IS NOT NULL
          AND EXISTS (SELECT 1 FROM messages m WHERE m.conversation_id = c.id)
          AND c.updated_at = (
            SELECT MAX(c2.updated_at)
              FROM conversations c2
             WHERE c2.user_id = c.user_id
               AND c2.course_id = c.course_id
               AND c2.agent_id = c.agent_id
               AND EXISTS (SELECT 1 FROM messages m2 WHERE m2.conversation_id = c2.id)
          )`,
    )
    .bind(userId, courseId)
    .all<{
      agent_id: string;
      conv_id: string;
      updated_at: number;
      completed_at: number | null;
    }>();
  return (results ?? []).map((r) => ({
    agentId: r.agent_id,
    conversationId: r.conv_id,
    updatedAt: r.updated_at,
    completedAt: r.completed_at,
  }));
}

export async function createAgent(
  db: D1Database,
  params: { courseId: string; title: string; definition: string },
): Promise<AgentRow> {
  const row: AgentRow = {
    id: id("agent"),
    course_id: params.courseId,
    title: params.title,
    definition: params.definition,
    created_at: now(),
    updated_at: now(),
  };
  await db
    .prepare(
      `INSERT INTO agents
       (id, course_id, title, definition, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      row.id,
      row.course_id,
      row.title,
      row.definition,
      row.created_at,
      row.updated_at,
    )
    .run();
  return row;
}

export async function updateAgent(
  db: D1Database,
  courseId: string,
  agentId: string,
  params: { title: string; definition: string },
): Promise<void> {
  await db
    .prepare(
      `UPDATE agents SET title = ?, definition = ?, updated_at = ?
       WHERE id = ? AND course_id = ?`,
    )
    .bind(params.title, params.definition, now(), agentId, courseId)
    .run();
}

/**
 * v0.5 §7 — atomic delete-with-orphan: mark in-flight conversations complete,
 * null out agent_id on every conversation that pointed at this agent, then
 * remove the row. The FK on conversations.agent_id is nullable (no CASCADE),
 * so past conversations survive as read-only history.
 *
 * `agent_title_snapshot` is set at insert time (migration 0002) — readers
 * COALESCE on it so the display title survives the agent vanishing.
 */
export async function deleteAgentAndOrphanConversations(
  db: D1Database,
  courseId: string,
  agentId: string,
): Promise<void> {
  const stamp = now();
  await db.batch([
    db
      .prepare(
        `UPDATE conversations
            SET completed_at = COALESCE(completed_at, ?), updated_at = ?
          WHERE agent_id = ? AND course_id = ?`,
      )
      .bind(stamp, stamp, agentId, courseId),
    db
      .prepare(
        `UPDATE conversations SET agent_id = NULL
          WHERE agent_id = ? AND course_id = ?`,
      )
      .bind(agentId, courseId),
    db
      .prepare("DELETE FROM agents WHERE id = ? AND course_id = ?")
      .bind(agentId, courseId),
  ]);
}

// ── voices (v0.7 §1: per-author, with by-user sharing) ────────────────────

/** Voices the user owns. Used by /author/voices "My voices" tab. */
export async function listVoicesOwnedBy(
  db: D1Database,
  ownerUserId: string,
): Promise<VoiceRow[]> {
  const { results } = await db
    .prepare(
      `SELECT * FROM voices WHERE owner_user_id = ? ORDER BY name ASC`,
    )
    .bind(ownerUserId)
    .all<VoiceRow>();
  return results ?? [];
}

/** Voices explicitly shared with the user. Used by "Shared with me" tab. */
export async function listVoicesSharedWith(
  db: D1Database,
  userId: string,
): Promise<VoiceRow[]> {
  const { results } = await db
    .prepare(
      `SELECT v.* FROM voices v
         JOIN voice_shares s ON s.voice_id = v.id
        WHERE s.user_id = ?
        ORDER BY v.name ASC`,
    )
    .bind(userId)
    .all<VoiceRow>();
  return results ?? [];
}

export async function findVoiceById(
  db: D1Database,
  voiceId: string,
): Promise<VoiceRow | null> {
  return db
    .prepare(`SELECT * FROM voices WHERE id = ?`)
    .bind(voiceId)
    .first<VoiceRow>();
}

/**
 * Returns the voice iff `userId` can *use* it in their own agents —
 * either they own it, or it's been shared with them. NULL otherwise
 * (including "voice doesn't exist"; callers don't need to distinguish).
 */
export async function findVoiceUsableByUser(
  db: D1Database,
  voiceId: string,
  userId: string,
): Promise<VoiceRow | null> {
  return db
    .prepare(
      `SELECT v.* FROM voices v
        WHERE v.id = ?
          AND (v.owner_user_id = ?
               OR EXISTS (
                 SELECT 1 FROM voice_shares s
                  WHERE s.voice_id = v.id AND s.user_id = ?
               ))`,
    )
    .bind(voiceId, userId, userId)
    .first<VoiceRow>();
}

export async function createVoice(
  db: D1Database,
  params: {
    ownerUserId: string;
    name: string;
    description: string;
    systemPromptFragment: string;
  },
): Promise<VoiceRow> {
  const row: VoiceRow = {
    id: id("voice"),
    course_id: null,
    name: params.name,
    description: params.description,
    system_prompt_fragment: params.systemPromptFragment,
    created_at: now(),
    updated_at: now(),
    owner_user_id: params.ownerUserId,
  };
  await db
    .prepare(
      `INSERT INTO voices
       (id, course_id, name, description, system_prompt_fragment,
        created_at, updated_at, owner_user_id)
       VALUES (?, NULL, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      row.id,
      row.name,
      row.description,
      row.system_prompt_fragment,
      row.created_at,
      row.updated_at,
      row.owner_user_id,
    )
    .run();
  return row;
}

export async function updateVoice(
  db: D1Database,
  voiceId: string,
  patch: { name: string; description: string; systemPromptFragment: string },
): Promise<void> {
  await db
    .prepare(
      `UPDATE voices
          SET name = ?, description = ?, system_prompt_fragment = ?, updated_at = ?
        WHERE id = ?`,
    )
    .bind(
      patch.name,
      patch.description,
      patch.systemPromptFragment,
      now(),
      voiceId,
    )
    .run();
}

/**
 * Delete a voice. Caller MUST first ensure no live agent references it
 * (see listAgentsReferencingVoice). voice_shares rows are dropped here.
 * Past conversation snapshots are unaffected because they have the voice
 * inlined as `kind: "custom"` already.
 */
export async function deleteVoice(db: D1Database, voiceId: string): Promise<void> {
  await db.batch([
    db.prepare(`DELETE FROM voice_shares WHERE voice_id = ?`).bind(voiceId),
    db.prepare(`DELETE FROM voices WHERE id = ?`).bind(voiceId),
  ]);
}

/**
 * Find live agents whose definition still names this voice. Returns
 * `{ id, courseId, title, ownerEmail }` so the delete UI can surface a
 * helpful list when refusing to delete. JSON_EXTRACT works on D1's
 * SQLite — voice refs are stored as
 *   {"kind":"custom-ref","voiceId":"voice_..."}
 * inside the JSON `definition` column.
 */
export async function listAgentsReferencingVoice(
  db: D1Database,
  voiceId: string,
): Promise<Array<{ id: string; courseId: string; title: string }>> {
  // LIKE keeps the query simple and avoids JSON1 portability worries.
  // The pattern is unique enough to keep false positives near zero,
  // but callers should double-check by parsing the definition.
  const { results } = await db
    .prepare(
      `SELECT id, course_id, title, definition FROM agents
        WHERE definition LIKE ?`,
    )
    .bind(`%"voiceId":"${voiceId}"%`)
    .all<{ id: string; course_id: string; title: string; definition: string }>();
  return (results ?? [])
    .filter((r) => {
      try {
        const def = JSON.parse(r.definition) as { voice?: { kind?: string; voiceId?: string } };
        return def.voice?.kind === "custom-ref" && def.voice.voiceId === voiceId;
      } catch {
        return false;
      }
    })
    .map((r) => ({ id: r.id, courseId: r.course_id, title: r.title }));
}

/** Owners on whom a voice has been shared with whom. */
export async function listVoiceShares(
  db: D1Database,
  voiceId: string,
): Promise<Array<{ userId: string; email: string; displayName: string | null; createdAt: number }>> {
  const { results } = await db
    .prepare(
      `SELECT u.id AS user_id, u.email, u.display_name, s.created_at
         FROM voice_shares s
         JOIN users u ON u.id = s.user_id
        WHERE s.voice_id = ?
        ORDER BY s.created_at DESC`,
    )
    .bind(voiceId)
    .all<{ user_id: string; email: string; display_name: string | null; created_at: number }>();
  return (results ?? []).map((r) => ({
    userId: r.user_id,
    email: r.email,
    displayName: r.display_name,
    createdAt: r.created_at,
  }));
}

export async function createVoiceShare(
  db: D1Database,
  voiceId: string,
  userId: string,
): Promise<void> {
  await db
    .prepare(
      `INSERT OR IGNORE INTO voice_shares (voice_id, user_id, created_at)
       VALUES (?, ?, ?)`,
    )
    .bind(voiceId, userId, now())
    .run();
}

export async function deleteVoiceShare(
  db: D1Database,
  voiceId: string,
  userId: string,
): Promise<void> {
  await db
    .prepare(`DELETE FROM voice_shares WHERE voice_id = ? AND user_id = ?`)
    .bind(voiceId, userId)
    .run();
}

// ── conversations ──────────────────────────────────────────────────────────

export async function createConversation(
  db: D1Database,
  params: {
    courseId: string;
    userId: string;
    agentId: string;
    agentTitle: string;
    definitionSnapshot: string;
    backboneState: string | null;
  },
): Promise<ConversationRow> {
  const row: ConversationRow = {
    id: id("conv"),
    course_id: params.courseId,
    user_id: params.userId,
    agent_id: params.agentId,
    definition_snapshot: params.definitionSnapshot,
    backbone_state: params.backboneState,
    turn_count: 0,
    title: null,
    title_attempts: 0,
    completed_at: null,
    agent_title_snapshot: params.agentTitle,
    created_at: now(),
    updated_at: now(),
  };
  await db
    .prepare(
      `INSERT INTO conversations
       (id, course_id, user_id, agent_id, definition_snapshot,
        backbone_state, turn_count, title, title_attempts,
        completed_at, agent_title_snapshot, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?)`,
    )
    .bind(
      row.id,
      row.course_id,
      row.user_id,
      row.agent_id,
      row.definition_snapshot,
      row.backbone_state,
      row.turn_count,
      row.title,
      row.completed_at,
      row.agent_title_snapshot,
      row.created_at,
      row.updated_at,
    )
    .run();
  return row;
}

/**
 * List a user's conversations across all of their courses, ordered by most
 * recent activity. Caller is responsible for filtering down to courses the
 * user is currently enrolled in if that gate matters at the call site
 * (callers that already authenticate the user and want a sidebar can show all
 * rows owned by that user; revoked-enrollment gating is a per-conversation
 * concern at GET/POST time).
 */
export interface ConversationListRow extends ConversationRow {
  agent_title: string | null;
  message_count: number;
}

/**
 * Sidebar/history listing. Left-joins the agent (so a deleted agent still
 * yields a row) and includes a message count so the title-gen path can skip
 * conversations that don't yet have anything to summarize.
 */
export async function listConversationsForUser(
  db: D1Database,
  userId: string,
  limit: number,
): Promise<ConversationListRow[]> {
  // Hide conversations whose course the user is no longer enrolled in — the
  // per-conversation GET still re-checks enrollment, but the sidebar/history
  // listing shouldn't leak titles for revoked courses either. Inner join
  // against enrollments on (course_id, user_id) is cheap (both indexed).
  const { results } = await db
    .prepare(
      `SELECT c.*, COALESCE(a.title, c.agent_title_snapshot) AS agent_title,
              (SELECT COUNT(*) FROM messages m WHERE m.conversation_id = c.id) AS message_count
         FROM conversations c
         JOIN enrollments e
              ON e.course_id = c.course_id AND e.user_id = c.user_id
         LEFT JOIN agents a ON a.id = c.agent_id
        WHERE c.user_id = ?
        ORDER BY c.updated_at DESC
        LIMIT ?`,
    )
    .bind(userId, limit)
    .all<ConversationListRow>();
  return results ?? [];
}

/** First user + first assistant message for a conversation, used for title-gen. */
export async function firstTurnPair(
  db: D1Database,
  conversationId: string,
): Promise<{ user: string | null; assistant: string | null }> {
  const { results } = await db
    .prepare(
      `SELECT role, content FROM messages
       WHERE conversation_id = ?
       ORDER BY seq ASC
       LIMIT 4`,
    )
    .bind(conversationId)
    .all<{ role: "user" | "assistant"; content: string }>();
  const rows = results ?? [];
  const user = rows.find((r) => r.role === "user")?.content ?? null;
  const assistant = rows.find((r) => r.role === "assistant")?.content ?? null;
  return { user, assistant };
}

/** Lazy-set the LLM-generated title for a free-chat conversation. */
export async function setConversationTitle(
  db: D1Database,
  conversationId: string,
  userId: string,
  title: string,
): Promise<void> {
  // userId guard so a title-gen run can't update someone else's row even if
  // the conversation id is somehow guessed/leaked.
  await db
    .prepare(
      `UPDATE conversations SET title = ?
       WHERE id = ? AND user_id = ? AND title IS NULL`,
    )
    .bind(title, conversationId, userId)
    .run();
}

/**
 * Increment the bounded title-attempt counter for a free-chat row. Called
 * before the title-gen LLM call so a crash mid-call still records the
 * attempt — the listing path skips rows that have exhausted their budget,
 * which is what prevents the "thundering herd" of Haiku calls on every
 * sidebar refresh.
 */
export async function bumpTitleAttempt(
  db: D1Database,
  conversationId: string,
  userId: string,
): Promise<void> {
  await db
    .prepare(
      `UPDATE conversations SET title_attempts = title_attempts + 1
       WHERE id = ? AND user_id = ? AND title IS NULL`,
    )
    .bind(conversationId, userId)
    .run();
}

/**
 * Delete a conversation that was created but never produced a committed
 * message — e.g. the first-turn LLM call failed before commitTurn (§14).
 * Scoped by user_id to keep the helper trivially safe.
 */
export async function deleteEmptyConversation(
  db: D1Database,
  conversationId: string,
  userId: string,
): Promise<void> {
  await db
    .prepare(
      `DELETE FROM conversations
       WHERE id = ? AND user_id = ?
         AND NOT EXISTS (SELECT 1 FROM messages m WHERE m.conversation_id = ?)`,
    )
    .bind(conversationId, userId, conversationId)
    .run();
}

/**
 * Look up a conversation scoped by user AND course; the course gate enforces
 * the documented "filter by course_id on every query" invariant and also
 * stops a user with a stale conversation row from continuing it after their
 * enrollment is revoked (caller still checks enrollment).
 */
export async function findConversationForUser(
  db: D1Database,
  conversationId: string,
  userId: string,
  courseId: string,
): Promise<ConversationRow | null> {
  return db
    .prepare(
      `SELECT * FROM conversations
       WHERE id = ? AND user_id = ? AND course_id = ?`,
    )
    .bind(conversationId, userId, courseId)
    .first<ConversationRow>();
}

/** Look up a conversation by id+user only (no known course yet). Returns course_id for the caller to re-enroll-check. */
export async function findConversationByOwner(
  db: D1Database,
  conversationId: string,
  userId: string,
): Promise<ConversationRow | null> {
  return db
    .prepare(
      `SELECT * FROM conversations WHERE id = ? AND user_id = ?`,
    )
    .bind(conversationId, userId)
    .first<ConversationRow>();
}

/**
 * Same as `findConversationByOwner` but joins the agent row so callers that
 * need the agent's display title don't issue a second query. Returns a flat
 * row with the agent title as `agent_title` (null for deleted agents).
 */
export interface ConversationWithAgent extends ConversationRow {
  agent_title: string | null;
}
export async function findConversationByOwnerWithAgent(
  db: D1Database,
  conversationId: string,
  userId: string,
): Promise<ConversationWithAgent | null> {
  return db
    .prepare(
      `SELECT c.*, COALESCE(a.title, c.agent_title_snapshot) AS agent_title
         FROM conversations c
         LEFT JOIN agents a ON a.id = c.agent_id
        WHERE c.id = ? AND c.user_id = ?`,
    )
    .bind(conversationId, userId)
    .first<ConversationWithAgent>();
}

/** Messages for a conversation, oldest first. Scoped by course_id. Order by seq for determinism. */
export async function listMessages(
  db: D1Database,
  courseId: string,
  conversationId: string,
): Promise<MessageRow[]> {
  const { results } = await db
    .prepare(
      `SELECT * FROM messages
       WHERE conversation_id = ? AND course_id = ?
       ORDER BY seq ASC`,
    )
    .bind(conversationId, courseId)
    .all<MessageRow>();
  return results ?? [];
}

/**
 * Persist the user message, the assistant reply, and the updated conversation
 * state in a single D1 batch. Single-batch persistence keeps the user-message
 * insert from committing when the assistant reply or state update fails — the
 * old "insert user → call LLM → insert assistant" sequence dropped the
 * assistant text on the floor if anything between the two inserts threw.
 *
 * Seq values are computed inside the INSERT using a subquery against the
 * messages table so concurrent posts to the same conversation can't both
 * derive the same seq value, race past a pre-LLM check, and then collide on
 * the UNIQUE (conversation_id, seq) constraint here. The two inserts in this
 * batch are sequenced and the SQLite engine sees the first row before
 * evaluating the second subquery — assistantSeq is always userSeq + 1.
 */
/** v0.5 §3 — one cited source captured in citation order. */
export interface CitationInput {
  sourceId: string | null;
  filename: string;
  kind: string;
  sourceUrl: string | null;
  r2Key: string | null;
}

export async function commitTurn(
  db: D1Database,
  params: {
    conversationId: string;
    courseId: string;
    userContent: string;
    assistantContent: string;
    backboneState: string | null;
    turnCount: number;
    /** Stamp this conversation as complete (backbone hit exit). Once set, never cleared. */
    completedAt?: number | null;
    /** v0.5 §3 — citations on the assistant message, in citation order. */
    citations?: CitationInput[];
  },
): Promise<{ assistantMessageId: string }> {
  const ts = now();
  const userId = id("msg");
  const asstId = id("msg");
  const statements = [
    db
      .prepare(
        `INSERT INTO messages
         (id, conversation_id, course_id, role, content, seq, created_at)
         VALUES (
           ?, ?, ?, 'user', ?,
           (SELECT COALESCE(MAX(seq), -1) + 1
              FROM messages WHERE conversation_id = ?),
           ?
         )`,
      )
      .bind(
        userId,
        params.conversationId,
        params.courseId,
        params.userContent,
        params.conversationId,
        ts,
      ),
    db
      .prepare(
        `INSERT INTO messages
         (id, conversation_id, course_id, role, content, seq, created_at)
         VALUES (
           ?, ?, ?, 'assistant', ?,
           (SELECT COALESCE(MAX(seq), -1) + 1
              FROM messages WHERE conversation_id = ?),
           ?
         )`,
      )
      .bind(
        asstId,
        params.conversationId,
        params.courseId,
        params.assistantContent,
        params.conversationId,
        ts,
      ),
    // COALESCE so a previously-set completed_at can never be cleared by a
    // later turn (defensive — the postMessage path also gates on it, but two
    // layers cost nothing).
    db
      .prepare(
        `UPDATE conversations
         SET backbone_state = ?, turn_count = ?, updated_at = ?,
             completed_at = COALESCE(completed_at, ?)
         WHERE id = ? AND course_id = ?`,
      )
      .bind(
        params.backboneState,
        params.turnCount,
        ts,
        params.completedAt ?? null,
        params.conversationId,
        params.courseId,
      ),
  ];
  for (let i = 0; i < (params.citations?.length ?? 0); i++) {
    const c = params.citations![i]!;
    statements.push(
      db
        .prepare(
          `INSERT INTO message_sources
           (message_id, source_id, ordinal, filename, kind,
            source_url, r2_key, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .bind(
          asstId,
          c.sourceId,
          i + 1,
          c.filename,
          c.kind,
          c.sourceUrl,
          c.r2Key,
          ts,
        ),
    );
  }
  await db.batch(statements);
  return { assistantMessageId: asstId };
}

/** Citations attached to one assistant message, in citation order. */
export async function listMessageSources(
  db: D1Database,
  messageId: string,
): Promise<MessageSourceRow[]> {
  const { results } = await db
    .prepare(
      `SELECT * FROM message_sources WHERE message_id = ? ORDER BY ordinal ASC`,
    )
    .bind(messageId)
    .all<MessageSourceRow>();
  return results ?? [];
}

/** Citations for every assistant message in a conversation. Used by the
 *  history-load path so pills survive page reloads. */
export async function listConversationCitations(
  db: D1Database,
  conversationId: string,
): Promise<MessageSourceRow[]> {
  const { results } = await db
    .prepare(
      `SELECT ms.* FROM message_sources ms
         JOIN messages m ON m.id = ms.message_id
        WHERE m.conversation_id = ?
        ORDER BY m.seq ASC, ms.ordinal ASC`,
    )
    .bind(conversationId)
    .all<MessageSourceRow>();
  return results ?? [];
}

/** Look up source rows by id within a course (for building citation
 *  snapshots from a retrieved-chunk set). */
export async function getCollectionSourcesByIds(
  db: D1Database,
  courseId: string,
  sourceIds: string[],
): Promise<CollectionSourceRow[]> {
  if (sourceIds.length === 0) return [];
  const placeholders = sourceIds.map(() => "?").join(",");
  const { results } = await db
    .prepare(
      `SELECT * FROM collection_sources
        WHERE course_id = ? AND id IN (${placeholders})`,
    )
    .bind(courseId, ...sourceIds)
    .all<CollectionSourceRow>();
  return results ?? [];
}

// ── collections (source documents) ─────────────────────────────────────────

export async function listCollections(
  db: D1Database,
  courseId: string,
): Promise<CollectionRow[]> {
  const { results } = await db
    .prepare(
      "SELECT * FROM collections WHERE course_id = ? ORDER BY updated_at DESC",
    )
    .bind(courseId)
    .all<CollectionRow>();
  return results ?? [];
}

export interface CollectionWithCount extends CollectionRow {
  source_count: number;
}

export async function listCollectionsWithCounts(
  db: D1Database,
  courseId: string,
): Promise<CollectionWithCount[]> {
  const { results } = await db
    .prepare(
      `SELECT c.*, COUNT(s.id) AS source_count
         FROM collections c
         LEFT JOIN collection_sources s ON s.collection_id = c.id
        WHERE c.course_id = ?
        GROUP BY c.id
        ORDER BY c.updated_at DESC`,
    )
    .bind(courseId)
    .all<CollectionWithCount>();
  return results ?? [];
}

export async function getCollection(
  db: D1Database,
  courseId: string,
  collectionId: string,
): Promise<CollectionRow | null> {
  return db
    .prepare("SELECT * FROM collections WHERE id = ? AND course_id = ?")
    .bind(collectionId, courseId)
    .first<CollectionRow>();
}

export async function createCollection(
  db: D1Database,
  params: { courseId: string; name: string; description: string | null },
): Promise<CollectionRow> {
  const row: CollectionRow = {
    id: id("col"),
    course_id: params.courseId,
    name: params.name,
    description: params.description,
    created_at: now(),
    updated_at: now(),
  };
  await db
    .prepare(
      `INSERT INTO collections
       (id, course_id, name, description, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      row.id,
      row.course_id,
      row.name,
      row.description,
      row.created_at,
      row.updated_at,
    )
    .run();
  return row;
}

export async function listCollectionSources(
  db: D1Database,
  courseId: string,
  collectionId: string,
): Promise<CollectionSourceRow[]> {
  const { results } = await db
    .prepare(
      `SELECT * FROM collection_sources
       WHERE collection_id = ? AND course_id = ?
       ORDER BY created_at DESC`,
    )
    .bind(collectionId, courseId)
    .all<CollectionSourceRow>();
  return results ?? [];
}

export async function createCollectionSource(
  db: D1Database,
  params: {
    collectionId: string;
    courseId: string;
    filename: string;
    r2Key: string;
    byteSize: number;
    kind: CollectionSourceKind;
    sourceUrl?: string | null;
    fetchedAt?: number | null;
    contentType?: string | null;
  },
): Promise<CollectionSourceRow> {
  const row: CollectionSourceRow = {
    id: id("src"),
    collection_id: params.collectionId,
    course_id: params.courseId,
    filename: params.filename,
    r2_key: params.r2Key,
    byte_size: params.byteSize,
    kind: params.kind,
    source_url: params.sourceUrl ?? null,
    fetched_at: params.fetchedAt ?? null,
    content_type: params.contentType ?? null,
    chunks: 0,
    status: "pending",
    error: null,
    created_at: now(),
    updated_at: now(),
  };
  await db
    .prepare(
      `INSERT INTO collection_sources
       (id, collection_id, course_id, filename, r2_key, byte_size,
        kind, source_url, fetched_at, content_type,
        chunks, status, error, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      row.id,
      row.collection_id,
      row.course_id,
      row.filename,
      row.r2_key,
      row.byte_size,
      row.kind,
      row.source_url,
      row.fetched_at,
      row.content_type,
      row.chunks,
      row.status,
      row.error,
      row.created_at,
      row.updated_at,
    )
    .run();
  await touchCollection(db, params.courseId, params.collectionId);
  return row;
}

/**
 * Bump the parent collection's updated_at. Called from every write path that
 * touches a collection_source so the collections list orders by real activity,
 * not creation order (v0.4 §8). Pure read paths must not call this.
 */
export async function touchCollection(
  db: D1Database,
  courseId: string,
  collectionId: string,
): Promise<void> {
  await db
    .prepare(
      `UPDATE collections SET updated_at = ?
       WHERE id = ? AND course_id = ?`,
    )
    .bind(now(), collectionId, courseId)
    .run();
}

/** Used by the URL refresh path: swap r2_key, bump fetched_at, reset status. */
export async function refreshCollectionSourceRow(
  db: D1Database,
  courseId: string,
  sourceId: string,
  patch: {
    r2Key: string;
    byteSize: number;
    contentType?: string | null;
    fetchedAt: number;
  },
): Promise<void> {
  await db
    .prepare(
      `UPDATE collection_sources
       SET r2_key = ?, byte_size = ?, content_type = ?, fetched_at = ?,
           chunks = 0, status = 'pending', error = NULL, updated_at = ?
       WHERE id = ? AND course_id = ?`,
    )
    .bind(
      patch.r2Key,
      patch.byteSize,
      patch.contentType ?? null,
      patch.fetchedAt,
      now(),
      sourceId,
      courseId,
    )
    .run();
}

/** Fetch one source row (used by refresh + delete paths). */
export async function getCollectionSource(
  db: D1Database,
  courseId: string,
  sourceId: string,
): Promise<CollectionSourceRow | null> {
  return db
    .prepare(
      `SELECT * FROM collection_sources WHERE id = ? AND course_id = ?`,
    )
    .bind(sourceId, courseId)
    .first<CollectionSourceRow>();
}

/**
 * v0.7 §3.4 — delete one source from a collection. Drops the D1 row; the
 * caller is responsible for R2 + Vectorize cleanup. message_sources rows
 * that referenced this source survive with source_id NULL so past
 * conversation citations still render via their snapshot columns.
 */
export async function deleteCollectionSource(
  db: D1Database,
  courseId: string,
  sourceId: string,
): Promise<void> {
  // Look up the collection so we can bump its updated_at.
  const row = await db
    .prepare(`SELECT collection_id FROM collection_sources WHERE id = ? AND course_id = ?`)
    .bind(sourceId, courseId)
    .first<{ collection_id: string }>();
  await db
    .prepare(
      `UPDATE message_sources SET source_id = NULL WHERE source_id = ?`,
    )
    .bind(sourceId)
    .run();
  await db
    .prepare(
      `DELETE FROM collection_sources WHERE id = ? AND course_id = ?`,
    )
    .bind(sourceId, courseId)
    .run();
  if (row) await touchCollection(db, courseId, row.collection_id);
}

export async function updateCollectionSourceStatus(
  db: D1Database,
  courseId: string,
  sourceId: string,
  patch: { status: CollectionSourceStatus; chunks?: number; error?: string | null },
): Promise<void> {
  await db
    .prepare(
      `UPDATE collection_sources
       SET status = ?, chunks = ?, error = ?, updated_at = ?
       WHERE id = ? AND course_id = ?`,
    )
    .bind(
      patch.status,
      patch.chunks ?? 0,
      patch.error ?? null,
      now(),
      sourceId,
      courseId,
    )
    .run();
  // status change reflects re-indexing — bump the collection so the list view
  // surfaces the activity (§8).
  const row = await db
    .prepare(`SELECT collection_id FROM collection_sources WHERE id = ? AND course_id = ?`)
    .bind(sourceId, courseId)
    .first<{ collection_id: string }>();
  if (row) await touchCollection(db, courseId, row.collection_id);
}

// ── courses ────────────────────────────────────────────────────────────────

/** Look up one course by id (no tenant filter — courses live at org scope;
 *  callers that care about cross-org isolation provide org_id themselves). */
export async function findCourseById(
  db: D1Database,
  courseId: string,
): Promise<CourseRow | null> {
  return db
    .prepare(`SELECT * FROM courses WHERE id = ?`)
    .bind(courseId)
    .first<CourseRow>();
}

export async function listCourses(
  db: D1Database,
  orgId: string,
): Promise<CourseRow[]> {
  const { results } = await db
    .prepare(`SELECT * FROM courses WHERE org_id = ? ORDER BY created_at DESC`)
    .bind(orgId)
    .all<CourseRow>();
  return results ?? [];
}

/**
 * v1.0 §7.5 — admin listing with enrollment count per course. Used by
 * AdminPage's Courses tab so an instance admin can spot "this course
 * has no one in it; delete it." A scalar subquery instead of a
 * GROUP BY join because we want a row per course even when there are
 * zero enrollments.
 */
export interface CourseWithEnrollmentCount {
  id: string;
  name: string;
  createdAt: number;
  enrollmentCount: number;
}
export async function listCoursesWithEnrollmentCounts(
  db: D1Database,
  orgId: string,
): Promise<CourseWithEnrollmentCount[]> {
  const { results } = await db
    .prepare(
      `SELECT c.id, c.name, c.created_at,
              (SELECT COUNT(*) FROM enrollments e WHERE e.course_id = c.id)
                AS enrollment_count
         FROM courses c
        WHERE c.org_id = ?
        ORDER BY c.created_at DESC`,
    )
    .bind(orgId)
    .all<{
      id: string;
      name: string;
      created_at: number;
      enrollment_count: number;
    }>();
  return (results ?? []).map((r) => ({
    id: r.id,
    name: r.name,
    createdAt: r.created_at,
    enrollmentCount: r.enrollment_count,
  }));
}

export async function createCourse(
  db: D1Database,
  params: {
    orgId: string;
    name: string;
    termSeason?: TermSeason | null;
    termYear?: number | null;
    startDate?: number | null;
    endDate?: number | null;
  },
): Promise<CourseRow> {
  const row: CourseRow = {
    id: id("course"),
    org_id: params.orgId,
    name: params.name,
    created_at: now(),
    term_season: params.termSeason ?? null,
    term_year: params.termYear ?? null,
    start_date: params.startDate ?? null,
    end_date: params.endDate ?? null,
  };
  await db
    .prepare(
      `INSERT INTO courses (id, org_id, name, created_at, term_season, term_year, start_date, end_date)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      row.id,
      row.org_id,
      row.name,
      row.created_at,
      row.term_season,
      row.term_year,
      row.start_date,
      row.end_date,
    )
    .run();
  return row;
}

/** Update a course's term and/or active window. Only the fields present in
 *  `patch` are written — undefined leaves the column untouched; an explicit
 *  null clears it. Values are validated by the caller (the route) before this
 *  runs. */
export async function updateCourse(
  db: D1Database,
  courseId: string,
  patch: {
    termSeason?: TermSeason | null;
    termYear?: number | null;
    startDate?: number | null;
    endDate?: number | null;
  },
): Promise<CourseRow | null> {
  const sets: string[] = [];
  const binds: (string | number | null)[] = [];
  if (patch.termSeason !== undefined) {
    sets.push("term_season = ?");
    binds.push(patch.termSeason);
  }
  if (patch.termYear !== undefined) {
    sets.push("term_year = ?");
    binds.push(patch.termYear);
  }
  if (patch.startDate !== undefined) {
    sets.push("start_date = ?");
    binds.push(patch.startDate);
  }
  if (patch.endDate !== undefined) {
    sets.push("end_date = ?");
    binds.push(patch.endDate);
  }
  if (sets.length > 0) {
    binds.push(courseId);
    await db
      .prepare(`UPDATE courses SET ${sets.join(", ")} WHERE id = ?`)
      .bind(...binds)
      .run();
  }
  return findCourseById(db, courseId);
}

// ── join codes (v0.6 §4) ───────────────────────────────────────────────────

export async function listJoinCodes(
  db: D1Database,
  courseId: string,
): Promise<CourseJoinCodeRow[]> {
  const { results } = await db
    .prepare(
      `SELECT * FROM course_join_codes WHERE course_id = ? ORDER BY created_at DESC`,
    )
    .bind(courseId)
    .all<CourseJoinCodeRow>();
  return results ?? [];
}

export async function findJoinCode(
  db: D1Database,
  code: string,
): Promise<CourseJoinCodeRow | null> {
  return db
    .prepare(`SELECT * FROM course_join_codes WHERE code = ?`)
    .bind(code)
    .first<CourseJoinCodeRow>();
}

export async function createJoinCode(
  db: D1Database,
  params: {
    code: string;
    courseId: string;
    emailDomain: string | null;
    expiresAt: number | null;
    maxUses: number | null;
    createdBy: string;
  },
): Promise<CourseJoinCodeRow> {
  const row: CourseJoinCodeRow = {
    code: params.code,
    course_id: params.courseId,
    email_domain: params.emailDomain,
    expires_at: params.expiresAt,
    max_uses: params.maxUses,
    uses: 0,
    created_by: params.createdBy,
    created_at: now(),
    revoked_at: null,
  };
  await db
    .prepare(
      `INSERT INTO course_join_codes
       (code, course_id, email_domain, expires_at, max_uses, uses,
        created_by, created_at, revoked_at)
       VALUES (?, ?, ?, ?, ?, 0, ?, ?, NULL)`,
    )
    .bind(
      row.code,
      row.course_id,
      row.email_domain,
      row.expires_at,
      row.max_uses,
      row.created_by,
      row.created_at,
    )
    .run();
  return row;
}

export async function revokeJoinCode(
  db: D1Database,
  code: string,
  courseId: string,
): Promise<void> {
  await db
    .prepare(
      `UPDATE course_join_codes SET revoked_at = ?
        WHERE code = ? AND course_id = ? AND revoked_at IS NULL`,
    )
    .bind(now(), code, courseId)
    .run();
}

/**
 * Atomic claim: insert the enrollment row and bump uses in one D1 batch.
 *
 * The `uses < max_uses` clause in the UPDATE makes the bump a single-statement
 * guard, so two concurrent claims of a max_uses=1 code can both pass the
 * worker's in-process check yet only one wins the UPDATE — the other ends up
 * with `changes=0` and we surface the "code exhausted" error.
 *
 * Returns the (existing or freshly-inserted) enrollment row; idempotent on
 * re-use by the same user.
 */
export async function claimJoinCode(
  db: D1Database,
  params: { code: CourseJoinCodeRow; userId: string },
): Promise<{ enrollment: EnrollmentRow; alreadyEnrolled: boolean }> {
  const { code, userId } = params;

  // Re-use the existing enrollment if any (idempotent).
  const existing = await findEnrollment(db, code.course_id, userId);
  if (existing) {
    return { enrollment: existing, alreadyEnrolled: true };
  }

  const enrollmentId = id("enr");
  const ts = now();
  const maxUsesClause = code.max_uses === null
    ? "1=1"
    : "uses < max_uses";
  const stmts = [
    db
      .prepare(
        `INSERT INTO enrollments (id, course_id, user_id, role, created_at)
         VALUES (?, ?, ?, 'student', ?)`,
      )
      .bind(enrollmentId, code.course_id, userId, ts),
    db
      .prepare(
        `UPDATE course_join_codes
            SET uses = uses + 1
          WHERE code = ?
            AND revoked_at IS NULL
            AND (expires_at IS NULL OR expires_at > ?)
            AND ${maxUsesClause}`,
      )
      .bind(code.code, ts),
  ];
  const results = await db.batch(stmts);
  // D1 batch returns one result per statement; check the UPDATE's `changes`
  // and refuse the enrollment if the code-row guard failed. (The INSERT
  // already committed in the same batch; an unhappy UPDATE means we need
  // to roll back the INSERT by deleting it. D1 batches are transactional
  // so this should never happen in practice — but if D1's semantics ever
  // diverge from sqlite's, this guard protects us.)
  const updateResult = results[1];
  if ((updateResult?.meta?.changes ?? 0) === 0) {
    await db.prepare(`DELETE FROM enrollments WHERE id = ?`).bind(enrollmentId).run();
    throw new Error("Join code is exhausted, expired, or revoked");
  }
  const enrollment: EnrollmentRow = {
    id: enrollmentId,
    course_id: code.course_id,
    user_id: userId,
    role: "student",
    created_at: ts,
  };
  return { enrollment, alreadyEnrolled: false };
}

// ── audit log (v0.6 §5) ────────────────────────────────────────────────────

export async function appendAuditLog(
  db: D1Database,
  params: {
    actorId: string;
    action: string;
    targetKind?: string | null;
    targetId?: string | null;
    payload?: unknown;
  },
): Promise<void> {
  await db
    .prepare(
      `INSERT INTO audit_log
       (id, actor_id, action, target_kind, target_id, payload, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      id("audit"),
      params.actorId,
      params.action,
      params.targetKind ?? null,
      params.targetId ?? null,
      params.payload === undefined ? null : JSON.stringify(params.payload),
      now(),
    )
    .run();
}

export async function listAuditLog(
  db: D1Database,
  limit: number,
): Promise<AuditLogRow[]> {
  const { results } = await db
    .prepare(
      `SELECT * FROM audit_log ORDER BY created_at DESC LIMIT ?`,
    )
    .bind(limit)
    .all<AuditLogRow>();
  return results ?? [];
}

/**
 * Audit-log slice involving a specific user — either as the actor (they
 * did something) or as the target (something was done to them). Used by
 * the per-user view (v0.7 §3.8).
 */
export async function listAuditLogForUser(
  db: D1Database,
  userId: string,
  limit: number,
): Promise<AuditLogRow[]> {
  const { results } = await db
    .prepare(
      `SELECT * FROM audit_log
       WHERE actor_id = ?
          OR (target_kind = 'user' AND target_id = ?)
       ORDER BY created_at DESC
       LIMIT ?`,
    )
    .bind(userId, userId, limit)
    .all<AuditLogRow>();
  return results ?? [];
}

// ── users (admin views) ────────────────────────────────────────────────────

export interface UserAdminListRow extends UserRow {
  enrollment_count: number;
}

export async function listUsersForAdmin(
  db: D1Database,
  orgId: string,
  limit: number,
  offset: number,
): Promise<UserAdminListRow[]> {
  const { results } = await db
    .prepare(
      `SELECT u.*, (SELECT COUNT(*) FROM enrollments e WHERE e.user_id = u.id)
                  AS enrollment_count
         FROM users u
        WHERE u.org_id = ?
        ORDER BY u.created_at DESC
        LIMIT ? OFFSET ?`,
    )
    .bind(orgId, limit, offset)
    .all<UserAdminListRow>();
  return results ?? [];
}

export async function listAdmins(
  db: D1Database,
  orgId: string,
): Promise<UserRow[]> {
  const { results } = await db
    .prepare(
      `SELECT * FROM users WHERE org_id = ? AND is_admin = 1
        ORDER BY email ASC`,
    )
    .bind(orgId)
    .all<UserRow>();
  return results ?? [];
}

/**
 * v0.6 §"Course delete" — cascade-delete a course. Mirrors the v0.5 §7
 * agent-delete semantics across every agent in the course, then removes
 * collections + sources + course row. Conversation rows are preserved
 * (their agent_id nulls out via deleteAgentAndOrphanConversations) so a
 * student's transcripts survive even if the course is gone — though the
 * conversation get/list paths still require an active enrollment which a
 * course delete by definition removes, so this is more about audit/recovery
 * than student-facing UX. R2 blobs and Vectorize vectors are NOT deleted
 * here — the worker entry handles those (it has the env bindings).
 */
export async function deleteCourseCascade(
  db: D1Database,
  courseId: string,
): Promise<{ collectionIds: string[]; sourceIds: string[] }> {
  // Snapshot every dependent row before deletion so the worker can clean
  // R2 + Vectorize after the DB transaction completes.
  const { results: agentRows } = await db
    .prepare(`SELECT id FROM agents WHERE course_id = ?`)
    .bind(courseId)
    .all<{ id: string }>();
  for (const a of agentRows ?? []) {
    await deleteAgentAndOrphanConversations(db, courseId, a.id);
  }
  const { results: colRows } = await db
    .prepare(`SELECT id FROM collections WHERE course_id = ?`)
    .bind(courseId)
    .all<{ id: string }>();
  const { results: srcRows } = await db
    .prepare(`SELECT id FROM collection_sources WHERE course_id = ?`)
    .bind(courseId)
    .all<{ id: string }>();

  await db.batch([
    // citations don't need a cascade — they're scoped by message_id; deleting
    // the agent already orphaned the conversations and their messages stay.
    db
      .prepare(
        `DELETE FROM collection_sources WHERE course_id = ?`,
      )
      .bind(courseId),
    db
      .prepare(`DELETE FROM collections WHERE course_id = ?`)
      .bind(courseId),
    db
      .prepare(`DELETE FROM voices WHERE course_id = ?`)
      .bind(courseId),
    db
      .prepare(`DELETE FROM course_join_codes WHERE course_id = ?`)
      .bind(courseId),
    db
      .prepare(`DELETE FROM enrollments WHERE course_id = ?`)
      .bind(courseId),
    db
      .prepare(`DELETE FROM courses WHERE id = ?`)
      .bind(courseId),
  ]);

  return {
    collectionIds: (colRows ?? []).map((r) => r.id),
    sourceIds: (srcRows ?? []).map((r) => r.id),
  };
}
