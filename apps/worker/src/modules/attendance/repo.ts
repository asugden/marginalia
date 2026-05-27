// D1 queries for the attendance module. Every query filters by course_id or
// scopes through a session that itself is course-scoped. The (course_id,
// session_date) pair is the duplicate-detection scope: a device or cookie
// that already signed in student X for course C today cannot sign in
// student Y for course C today, but is free to sign in for another course.

import type {
  AttendanceCheckinRow,
  AttendanceSessionRow,
} from "./types.js";

const newSessionId = () => `att_${crypto.randomUUID()}`;
const newCheckinId = () => `atc_${crypto.randomUUID()}`;

export async function createSession(
  db: D1Database,
  params: {
    courseId: string;
    openedBy: string;
    sessionDate: string;
    label: string;
    centerLat: number | null;
    centerLon: number | null;
    radiusM: number | null;
    tokenKeyHex: string;
  },
): Promise<AttendanceSessionRow> {
  const id = newSessionId();
  const now = Date.now();
  await db
    .prepare(
      `INSERT INTO attendance_sessions
         (id, course_id, opened_by, session_date, label,
          center_lat, center_lon, radius_m, token_key_hex,
          opened_at, closed_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)`,
    )
    .bind(
      id,
      params.courseId,
      params.openedBy,
      params.sessionDate,
      params.label,
      params.centerLat,
      params.centerLon,
      params.radiusM,
      params.tokenKeyHex,
      now,
    )
    .run();
  const row = await getSession(db, id);
  if (!row) throw new Error("createSession: row not found after insert");
  return row;
}

export async function getSession(
  db: D1Database,
  id: string,
): Promise<AttendanceSessionRow | null> {
  return db
    .prepare(`SELECT * FROM attendance_sessions WHERE id = ?`)
    .bind(id)
    .first<AttendanceSessionRow>();
}

export async function listSessionsForCourse(
  db: D1Database,
  courseId: string,
): Promise<AttendanceSessionRow[]> {
  const { results } = await db
    .prepare(
      `SELECT * FROM attendance_sessions
        WHERE course_id = ?
        ORDER BY opened_at DESC
        LIMIT 200`,
    )
    .bind(courseId)
    .all<AttendanceSessionRow>();
  return results ?? [];
}

export async function closeSession(
  db: D1Database,
  id: string,
): Promise<void> {
  await db
    .prepare(`UPDATE attendance_sessions SET closed_at = ? WHERE id = ?`)
    .bind(Date.now(), id)
    .run();
}

export async function getCheckin(
  db: D1Database,
  sessionId: string,
  userId: string,
): Promise<AttendanceCheckinRow | null> {
  return db
    .prepare(
      `SELECT * FROM attendance_checkins
        WHERE session_id = ? AND user_id = ?`,
    )
    .bind(sessionId, userId)
    .first<AttendanceCheckinRow>();
}

export async function insertCheckin(
  db: D1Database,
  params: {
    sessionId: string;
    courseId: string;
    userId: string;
    lat: number | null;
    lon: number | null;
    accuracyM: number | null;
    distanceM: number | null;
    fingerprintHash: string;
    deviceCookie: string;
    ipHash: string | null;
    flags: string;
  },
): Promise<AttendanceCheckinRow> {
  const id = newCheckinId();
  const now = Date.now();
  await db
    .prepare(
      `INSERT INTO attendance_checkins
         (id, session_id, course_id, user_id, lat, lon, accuracy_m,
          distance_m, fingerprint_hash, device_cookie, ip_hash, flags,
          created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      id,
      params.sessionId,
      params.courseId,
      params.userId,
      params.lat,
      params.lon,
      params.accuracyM,
      params.distanceM,
      params.fingerprintHash,
      params.deviceCookie,
      params.ipHash,
      params.flags,
      now,
    )
    .run();
  const row = await db
    .prepare(`SELECT * FROM attendance_checkins WHERE id = ?`)
    .bind(id)
    .first<AttendanceCheckinRow>();
  if (!row) throw new Error("insertCheckin: row not found after insert");
  return row;
}

/** Check-ins from a different user, on the same course+day, that already used
 *  this device cookie or fingerprint. Used to flag (not block) phone-passing. */
export async function findDuplicateDeviceUse(
  db: D1Database,
  params: {
    courseId: string;
    sessionDate: string;
    userId: string;
    deviceCookie: string;
    fingerprintHash: string;
  },
): Promise<{ cookieMatch: boolean; fingerprintMatch: boolean }> {
  const { results } = await db
    .prepare(
      `SELECT c.device_cookie, c.fingerprint_hash
         FROM attendance_checkins c
         JOIN attendance_sessions s ON s.id = c.session_id
        WHERE c.course_id = ?
          AND s.session_date = ?
          AND c.user_id <> ?
          AND (c.device_cookie = ? OR c.fingerprint_hash = ?)`,
    )
    .bind(
      params.courseId,
      params.sessionDate,
      params.userId,
      params.deviceCookie,
      params.fingerprintHash,
    )
    .all<{ device_cookie: string; fingerprint_hash: string }>();
  let cookieMatch = false;
  let fingerprintMatch = false;
  for (const r of results ?? []) {
    if (r.device_cookie === params.deviceCookie) cookieMatch = true;
    if (r.fingerprint_hash === params.fingerprintHash) fingerprintMatch = true;
  }
  return { cookieMatch, fingerprintMatch };
}

export interface CheckinWithUser extends AttendanceCheckinRow {
  email: string | null;
  display_name: string | null;
}

export async function listCheckinsWithUsers(
  db: D1Database,
  sessionId: string,
): Promise<CheckinWithUser[]> {
  const { results } = await db
    .prepare(
      `SELECT c.*, u.email AS email, u.display_name AS display_name
         FROM attendance_checkins c
         LEFT JOIN users u ON u.id = c.user_id
        WHERE c.session_id = ?
        ORDER BY c.created_at ASC`,
    )
    .bind(sessionId)
    .all<CheckinWithUser>();
  return results ?? [];
}
