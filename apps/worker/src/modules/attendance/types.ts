// Shared types for the attendance module.

export interface AttendanceSessionRow {
  id: string;
  course_id: string;
  opened_by: string;
  session_date: string;
  label: string;
  center_lat: number | null;
  center_lon: number | null;
  radius_m: number | null;
  token_key_hex: string;
  opened_at: number;
  closed_at: number | null;
}

export interface AttendanceCheckinRow {
  id: string;
  session_id: string;
  course_id: string;
  user_id: string;
  lat: number | null;
  lon: number | null;
  accuracy_m: number | null;
  distance_m: number | null;
  fingerprint_hash: string;
  device_cookie: string;
  ip_hash: string | null;
  flags: string;
  created_at: number;
}

export type CheckinFlag =
  | "outside_radius"
  | "no_geofence"
  | "no_location"
  | "duplicate_device"
  | "duplicate_cookie"
  | "late"
  /** Enrollment was created by this check-in rather than a roster import. */
  | "auto_enrolled";

export interface SessionDTO {
  id: string;
  courseId: string;
  sessionDate: string;
  label: string;
  centerLat: number | null;
  centerLon: number | null;
  radiusM: number | null;
  openedAt: number;
  closedAt: number | null;
  /** Stable scan target; the QR encodes this. */
  checkInUrl: string;
}

export interface CheckinDTO {
  id: string;
  userId: string;
  email: string | null;
  displayName: string | null;
  lat: number | null;
  lon: number | null;
  distanceM: number | null;
  flags: CheckinFlag[];
  createdAt: number;
}

export function rowToSession(row: AttendanceSessionRow, origin: string): SessionDTO {
  return {
    id: row.id,
    courseId: row.course_id,
    sessionDate: row.session_date,
    label: row.label,
    centerLat: row.center_lat,
    centerLon: row.center_lon,
    radiusM: row.radius_m,
    openedAt: row.opened_at,
    closedAt: row.closed_at,
    checkInUrl: `${origin}/a/${row.id}`,
  };
}

export function parseFlags(s: string): CheckinFlag[] {
  if (!s) return [];
  return s.split(",").filter(Boolean) as CheckinFlag[];
}
