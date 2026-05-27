-- v0.6 — Replace Cloudflare Access with app-level OAuth/OIDC.
--
-- This migration is schema-only: it adds the tables and columns the new auth
-- and admin paths need, normalises the enrollment role enum, and seeds nothing.
-- The worker keeps using Cf-Access until M3 lands and is later retired in M7.
--
-- Touches:
--   * users          add external_provider, external_subject, email_verified_at, is_admin
--   * enrollments    drop the `ta` role: any existing row becomes `instructor`,
--                    then the CHECK constraint is rebuilt without 'ta'
--   * sessions       new table: opaque cookie-id → user, with rolling expiry
--   * course_join_codes  new table: short, instructor-issued, student-only codes
--   * audit_log      new table: append-only record of admin actions
--
-- See docs/v0.6-plan.md §1–§5 for the why behind each piece.

-- ── users: identity claims captured at OIDC callback time ──────────────────
--
-- external_provider is the AuthProvider id ("google", "oidc-<institution>");
-- external_subject is the IdP's stable per-account identifier (for OIDC,
-- iss+sub). Together they identify the user; email is for display + roster
-- lookup. email_verified_at records when an IdP attested email verification
-- so we don't have to re-verify per request. display_name already exists on
-- this table (migration 0001) and continues to hold whatever the IdP returns
-- the most recent time.

ALTER TABLE users ADD COLUMN external_provider TEXT;
ALTER TABLE users ADD COLUMN external_subject  TEXT;
ALTER TABLE users ADD COLUMN email_verified_at INTEGER;
ALTER TABLE users ADD COLUMN is_admin          INTEGER NOT NULL DEFAULT 0;

-- A given (provider, subject) maps to at most one user row. Partial index so
-- rows that haven't been claimed yet (pre-created by the roster path, no
-- sign-in yet) don't all collide on (NULL, NULL).
CREATE UNIQUE INDEX idx_users_external
  ON users(external_provider, external_subject)
  WHERE external_subject IS NOT NULL;

-- Listing instance admins is a hot read on the /admin page; partial index
-- keeps the index tiny (one row per admin, not one per user).
CREATE INDEX idx_users_admins ON users(is_admin) WHERE is_admin = 1;

-- ── enrollments: drop the `ta` role ────────────────────────────────────────
--
-- v0.4/v0.5 carried `ta` as a third enrollment role with no behavioural
-- difference from `instructor`. v0.6 collapses to {student, instructor}.
--
-- SQLite cannot ALTER a CHECK constraint in place: standard swap-table dance.
-- Run inside the migration transaction so a partial swap can't leave the DB
-- with two tables of the same name.

UPDATE enrollments SET role = 'instructor' WHERE role = 'ta';

CREATE TABLE enrollments_new (
  id          TEXT PRIMARY KEY,
  course_id   TEXT NOT NULL REFERENCES courses(id),
  user_id     TEXT NOT NULL REFERENCES users(id),
  role        TEXT NOT NULL CHECK (role IN ('student', 'instructor')),
  created_at  INTEGER NOT NULL,
  UNIQUE (course_id, user_id)
);

INSERT INTO enrollments_new (id, course_id, user_id, role, created_at)
  SELECT id, course_id, user_id, role, created_at FROM enrollments;

DROP TABLE enrollments;
ALTER TABLE enrollments_new RENAME TO enrollments;

CREATE INDEX idx_enrollments_course ON enrollments(course_id);
CREATE INDEX idx_enrollments_user   ON enrollments(user_id);

-- ── sessions: D1-backed session cookies ────────────────────────────────────
--
-- Storage rationale (docs/v0.6-plan.md §2): D1 lets /api/me join on users in
-- one query; KV would require two lookups, and session reads happen on every
-- request. At classroom scale the table stays tiny.
--
-- last_seen_at gets bumped (rate-limited) and expires_at gets extended on a
-- rolling basis from the worker; the schema enforces nothing about that
-- cadence. user_agent is coarse free-text; ip_hash is HMAC-SHA256(ip, key)
-- so a leaked dump can't be used to reverse-engineer a student's IP.

CREATE TABLE sessions (
  id              TEXT PRIMARY KEY,
  user_id         TEXT NOT NULL REFERENCES users(id),
  created_at      INTEGER NOT NULL,
  expires_at      INTEGER NOT NULL,
  last_seen_at    INTEGER NOT NULL,
  user_agent      TEXT,
  ip_hash         TEXT
);

-- For per-user "active devices" lookups and bulk-revoke-by-user.
CREATE INDEX idx_sessions_user ON sessions(user_id);
-- For the scheduled cleanup job that sweeps expired rows.
CREATE INDEX idx_sessions_expires ON sessions(expires_at);

-- ── course_join_codes: self-serve student enrollment ──────────────────────
--
-- Codes are student-only by design (see plan §"Drop the ta role"); promoting
-- to instructor is a deliberate act on the Roster page, not something to
-- grant by code. The optional email_domain gate defends against a leaked
-- code being claimed by random Internet users; instructors typically scope
-- to their institution's domain when generating.

CREATE TABLE course_join_codes (
  code            TEXT PRIMARY KEY,
  course_id       TEXT NOT NULL REFERENCES courses(id),
  email_domain    TEXT,
  expires_at      INTEGER,
  max_uses        INTEGER,
  uses            INTEGER NOT NULL DEFAULT 0,
  created_by      TEXT NOT NULL REFERENCES users(id),
  created_at      INTEGER NOT NULL,
  revoked_at      INTEGER
);

CREATE INDEX idx_join_codes_course ON course_join_codes(course_id);

-- ── audit_log: append-only record of admin actions ────────────────────────
--
-- Records (and only records) admin actions: promote/demote, course create
-- /delete, join-code revoke. Every admin endpoint inserts one row. Read
-- back on /admin → Audit log tab. Tiny at classroom scale — admin actions
-- are rare relative to student turns.

CREATE TABLE audit_log (
  id           TEXT PRIMARY KEY,
  actor_id     TEXT NOT NULL REFERENCES users(id),
  action       TEXT NOT NULL,         -- e.g. "admin.promote", "course.delete"
  target_kind  TEXT,                  -- "user" | "course" | "join_code" | null
  target_id    TEXT,                  -- the affected row id, when applicable
  payload      TEXT,                  -- JSON: action-specific extra fields
  created_at   INTEGER NOT NULL
);

CREATE INDEX idx_audit_log_created ON audit_log(created_at DESC);
CREATE INDEX idx_audit_log_actor   ON audit_log(actor_id, created_at DESC);
