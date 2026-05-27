-- 0009 — attendance module.
-- In-person attendance via a rotating QR code + signed-in student check-in.
-- Trust model: soft geofence (always accept, flag if outside radius), 30s
-- rotating token defeats screenshot-and-text, device cookie + fingerprint
-- defeat phone-passing within a single (course, day).
--
-- See apps/worker/src/modules/attendance/README.md.

CREATE TABLE attendance_sessions (
  id              TEXT PRIMARY KEY,
  course_id       TEXT NOT NULL REFERENCES courses(id),
  opened_by       TEXT NOT NULL REFERENCES users(id),
  -- YYYY-MM-DD in the instructor's local day. The (course_id, session_date)
  -- pair is the duplicate-detection scope for device fingerprints and cookies.
  session_date    TEXT NOT NULL,
  label           TEXT NOT NULL DEFAULT '',
  -- Optional geo center (decimal degrees) + radius (meters). When null, every
  -- check-in is flagged "no_geofence" but still accepted.
  center_lat      REAL,
  center_lon      REAL,
  radius_m        INTEGER,
  -- Random 32-byte HMAC key (hex). Used to sign rotating tokens. Generated
  -- per session so closing/reopening invalidates outstanding tokens.
  token_key_hex   TEXT NOT NULL,
  opened_at       INTEGER NOT NULL,
  closed_at       INTEGER
);

CREATE INDEX idx_attendance_sessions_course_date
  ON attendance_sessions(course_id, session_date DESC);

CREATE TABLE attendance_checkins (
  id                  TEXT PRIMARY KEY,
  session_id          TEXT NOT NULL REFERENCES attendance_sessions(id) ON DELETE CASCADE,
  course_id           TEXT NOT NULL REFERENCES courses(id),
  user_id             TEXT NOT NULL REFERENCES users(id),
  -- Geo as reported by the browser. Null if denied / unavailable.
  lat                 REAL,
  lon                 REAL,
  accuracy_m          REAL,
  distance_m          REAL,
  -- SHA-256 hex of stable browser signals (UA + screen + tz + lang + platform).
  fingerprint_hash    TEXT NOT NULL,
  -- Long-lived cookie value bound to this device; survives across courses.
  device_cookie       TEXT NOT NULL,
  -- HMAC-SHA256 of client IP using SESSION_SIGNING_KEY. For after-the-fact
  -- review only; never displayed.
  ip_hash             TEXT,
  -- Comma-separated subset of: outside_radius, no_geofence, no_location,
  -- duplicate_device, duplicate_cookie, late.
  flags               TEXT NOT NULL DEFAULT '',
  created_at          INTEGER NOT NULL,
  UNIQUE(session_id, user_id)
);

CREATE INDEX idx_attendance_checkins_session
  ON attendance_checkins(session_id, created_at);
-- Used by duplicate detection: "did this cookie/fingerprint already sign in
-- a different student for this course today?"
CREATE INDEX idx_attendance_checkins_course_day_device
  ON attendance_checkins(course_id, device_cookie);
CREATE INDEX idx_attendance_checkins_course_day_fp
  ON attendance_checkins(course_id, fingerprint_hash);
