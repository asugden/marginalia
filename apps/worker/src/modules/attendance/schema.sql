-- Reference snapshot of the attendance module's tables.
-- The authoritative migration lives in packages/schema/migrations/0009_attendance.sql.

CREATE TABLE attendance_sessions (
  id              TEXT PRIMARY KEY,
  course_id       TEXT NOT NULL,
  opened_by       TEXT NOT NULL,
  session_date    TEXT NOT NULL,                 -- YYYY-MM-DD
  label           TEXT NOT NULL DEFAULT '',
  center_lat      REAL,
  center_lon      REAL,
  radius_m        INTEGER,
  token_key_hex   TEXT NOT NULL,                 -- 32-byte HMAC key, hex
  opened_at       INTEGER NOT NULL,
  closed_at       INTEGER
);

CREATE TABLE attendance_checkins (
  id                  TEXT PRIMARY KEY,
  session_id          TEXT NOT NULL,
  course_id           TEXT NOT NULL,
  user_id             TEXT NOT NULL,
  lat                 REAL,
  lon                 REAL,
  accuracy_m          REAL,
  distance_m          REAL,
  fingerprint_hash    TEXT NOT NULL,
  device_cookie       TEXT NOT NULL,
  ip_hash             TEXT,
  flags               TEXT NOT NULL DEFAULT '',  -- comma-separated
  created_at          INTEGER NOT NULL,
  UNIQUE(session_id, user_id)
);
