// Request handlers for the attendance module.
//
// Trust model:
//   - Signed-in students hit POST /check/:sessionId, submitting a short-lived
//     token (rotates every 30s, 90s total validity), browser geolocation, and
//     a device fingerprint hash. We always record the check-in but mark it
//     with flags so the instructor can review edge cases after class.
//   - The instructor surface lives under /sessions and is gated by the
//     instructor role on the course.

import type { Env } from "../../env.js";
import type { Identity } from "../../auth.js";
import * as repo from "./repo.js";
import {
  parseFlags,
  rowToSession,
  type CheckinDTO,
  type CheckinFlag,
  type SessionDTO,
} from "./types.js";

// ── constants ──────────────────────────────────────────────────────────────
const TOKEN_PERIOD_MS = 30_000;   // a fresh token every 30s
const TOKEN_GRACE_PERIODS = 2;    // tokens from the previous 2 windows still validate
const DEFAULT_RADIUS_M = 75;      // generous classroom radius
const DEVICE_COOKIE = "att_dev";
const DEVICE_COOKIE_MAX_AGE = 60 * 60 * 24 * 365 * 2; // 2 years

const MAX_LABEL_CHARS = 120;

// ── tiny helpers ───────────────────────────────────────────────────────────
const json = (body: unknown, status = 200, extraHeaders: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...extraHeaders },
  });

const errorResponse = (message: string, status: number) =>
  json({ error: message }, status);

function requireUser(identity: Identity): string | Response {
  if (!identity.userId) return errorResponse("Sign in required", 401);
  return identity.userId;
}

async function getEnrollmentRole(
  env: Env,
  userId: string,
  courseId: string,
): Promise<string | null> {
  const row = await env.DB
    .prepare(`SELECT role FROM enrollments WHERE course_id = ? AND user_id = ?`)
    .bind(courseId, userId)
    .first<{ role: string }>();
  return row?.role ?? null;
}

async function requireInstructor(
  env: Env,
  identity: Identity,
  courseId: string,
): Promise<string | Response> {
  const userId = requireUser(identity);
  if (userId instanceof Response) return userId;
  const role = await getEnrollmentRole(env, userId, courseId);
  if (role !== "instructor") return errorResponse("Instructor only", 403);
  return userId;
}

// ── crypto helpers ─────────────────────────────────────────────────────────
function hexToBytes(hex: string): Uint8Array {
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i += 1) {
    out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join("");
}

function randomHex(byteLength: number): string {
  const bytes = new Uint8Array(byteLength);
  crypto.getRandomValues(bytes);
  return bytesToHex(bytes);
}

async function hmacSha256(keyHex: string, data: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    hexToBytes(keyHex),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(data));
  return bytesToHex(new Uint8Array(sig));
}

/** Token for a given (session, time-window). Encoded as "<window>.<hmac10>". */
async function makeToken(keyHex: string, sessionId: string, windowIdx: number): Promise<string> {
  const sig = await hmacSha256(keyHex, `${sessionId}:${windowIdx}`);
  return `${windowIdx}.${sig.slice(0, 16)}`;
}

async function verifyToken(
  keyHex: string,
  sessionId: string,
  token: string,
  nowMs: number,
): Promise<boolean> {
  const dot = token.indexOf(".");
  if (dot <= 0) return false;
  const claimed = Number(token.slice(0, dot));
  if (!Number.isFinite(claimed)) return false;
  const currentWindow = Math.floor(nowMs / TOKEN_PERIOD_MS);
  // Accept the current window and the prior TOKEN_GRACE_PERIODS windows.
  if (claimed > currentWindow || claimed < currentWindow - TOKEN_GRACE_PERIODS) return false;
  const expected = await makeToken(keyHex, sessionId, claimed);
  return timingSafeEqual(expected, token);
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

// ── geo ────────────────────────────────────────────────────────────────────
/** Great-circle distance in meters between two lat/lon points. */
function haversineM(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6_371_000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

// ── cookies ────────────────────────────────────────────────────────────────
function readCookie(req: Request, name: string): string | null {
  const header = req.headers.get("cookie");
  if (!header) return null;
  for (const part of header.split(";")) {
    const eq = part.indexOf("=");
    if (eq < 0) continue;
    if (part.slice(0, eq).trim() === name) {
      return decodeURIComponent(part.slice(eq + 1).trim());
    }
  }
  return null;
}

function deviceCookieHeader(value: string): string {
  // SameSite=Lax so it accompanies the QR redirect; HttpOnly so JS can't read
  // and leak it; Secure in prod (Cloudflare is always https).
  return `${DEVICE_COOKIE}=${encodeURIComponent(value)}; Path=/; Max-Age=${DEVICE_COOKIE_MAX_AGE}; HttpOnly; Secure; SameSite=Lax`;
}

// ── instructor routes ──────────────────────────────────────────────────────

interface OpenSessionBody {
  courseId?: string;
  label?: string;
  centerLat?: number | null;
  centerLon?: number | null;
  radiusM?: number | null;
}

export async function openSessionRoute(
  req: Request,
  env: Env,
  identity: Identity,
  url: URL,
): Promise<Response> {
  const body = (await req.json().catch(() => null)) as OpenSessionBody | null;
  if (!body || typeof body.courseId !== "string") {
    return errorResponse("courseId is required", 400);
  }
  const courseId = body.courseId;
  const userIdOrResp = await requireInstructor(env, identity, courseId);
  if (userIdOrResp instanceof Response) return userIdOrResp;

  const label = (body.label ?? "").trim().slice(0, MAX_LABEL_CHARS);
  const centerLat = typeof body.centerLat === "number" ? body.centerLat : null;
  const centerLon = typeof body.centerLon === "number" ? body.centerLon : null;
  const radiusM = typeof body.radiusM === "number"
    ? Math.max(10, Math.min(2_000, Math.round(body.radiusM)))
    : (centerLat !== null && centerLon !== null ? DEFAULT_RADIUS_M : null);

  // Session date = instructor's UTC date. Local-day skew at midnight is
  // acceptable for an MVP; we can revisit if it bites in practice.
  const sessionDate = new Date().toISOString().slice(0, 10);

  const row = await repo.createSession(env.DB, {
    courseId,
    openedBy: userIdOrResp,
    sessionDate,
    label,
    centerLat,
    centerLon,
    radiusM,
    tokenKeyHex: randomHex(32),
  });
  return json({ session: rowToSession(row, url.origin) }, 201);
}

export async function getSessionRoute(
  env: Env,
  identity: Identity,
  url: URL,
  sessionId: string,
): Promise<Response> {
  const session = await repo.getSession(env.DB, sessionId);
  if (!session) return errorResponse("Session not found", 404);
  const userIdOrResp = await requireInstructor(env, identity, session.course_id);
  if (userIdOrResp instanceof Response) return userIdOrResp;
  const rows = await repo.listCheckinsWithUsers(env.DB, sessionId);
  const checkins: CheckinDTO[] = rows.map((r) => ({
    id: r.id,
    userId: r.user_id,
    email: r.email,
    displayName: r.display_name,
    lat: r.lat,
    lon: r.lon,
    distanceM: r.distance_m,
    flags: parseFlags(r.flags),
    createdAt: r.created_at,
  }));
  return json({ session: rowToSession(session, url.origin), checkins });
}

export async function listSessionsRoute(
  env: Env,
  identity: Identity,
  url: URL,
): Promise<Response> {
  const courseId = url.searchParams.get("courseId");
  if (!courseId) return errorResponse("courseId is required", 400);
  const userIdOrResp = await requireInstructor(env, identity, courseId);
  if (userIdOrResp instanceof Response) return userIdOrResp;
  const rows = await repo.listSessionsForCourse(env.DB, courseId);
  const sessions: SessionDTO[] = rows.map((r) => rowToSession(r, url.origin));
  return json({ sessions });
}

export async function closeSessionRoute(
  env: Env,
  identity: Identity,
  sessionId: string,
): Promise<Response> {
  const session = await repo.getSession(env.DB, sessionId);
  if (!session) return errorResponse("Session not found", 404);
  const userIdOrResp = await requireInstructor(env, identity, session.course_id);
  if (userIdOrResp instanceof Response) return userIdOrResp;
  await repo.closeSession(env.DB, sessionId);
  return json({ ok: true });
}

/** Instructor poll: returns the currently-valid token. Cache busted via the
 *  client polling every ~15s. We could SSE this, but a tiny GET keeps the
 *  Worker stateless and the cost rounding-error-low. */
export async function getQrTokenRoute(
  env: Env,
  identity: Identity,
  sessionId: string,
): Promise<Response> {
  const session = await repo.getSession(env.DB, sessionId);
  if (!session) return errorResponse("Session not found", 404);
  const userIdOrResp = await requireInstructor(env, identity, session.course_id);
  if (userIdOrResp instanceof Response) return userIdOrResp;
  if (session.closed_at) return errorResponse("Session is closed", 410);
  const now = Date.now();
  const windowIdx = Math.floor(now / TOKEN_PERIOD_MS);
  const token = await makeToken(session.token_key_hex, sessionId, windowIdx);
  const nextRotationAt = (windowIdx + 1) * TOKEN_PERIOD_MS;
  return json(
    { token, nextRotationAt, periodMs: TOKEN_PERIOD_MS },
    200,
    { "cache-control": "no-store" },
  );
}

export async function exportCsvRoute(
  env: Env,
  identity: Identity,
  sessionId: string,
): Promise<Response> {
  const session = await repo.getSession(env.DB, sessionId);
  if (!session) return errorResponse("Session not found", 404);
  const userIdOrResp = await requireInstructor(env, identity, session.course_id);
  if (userIdOrResp instanceof Response) return userIdOrResp;
  const rows = await repo.listCheckinsWithUsers(env.DB, sessionId);

  // Canvas-friendly: a column per student with their attendance state. The
  // instructor pastes the (email, status) pairs into a custom assignment in
  // the Canvas gradebook. We keep this minimal and let the instructor decide
  // the scoring scheme.
  const header = ["email", "display_name", "status", "flags", "distance_m", "checked_in_at"];
  const lines = [header.join(",")];
  for (const r of rows) {
    const flags = parseFlags(r.flags);
    const status = flags.length === 0 ? "present" : "present_flagged";
    lines.push([
      csv(r.email ?? ""),
      csv(r.display_name ?? ""),
      status,
      csv(flags.join("|")),
      r.distance_m === null ? "" : String(Math.round(r.distance_m)),
      new Date(r.created_at).toISOString(),
    ].join(","));
  }
  const body = lines.join("\n") + "\n";
  const filename = `attendance-${session.session_date}-${session.id}.csv`;
  return new Response(body, {
    status: 200,
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="${filename}"`,
    },
  });
}

function csv(value: string): string {
  if (/[",\n]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}

// ── student check-in path ──────────────────────────────────────────────────

/** Minimal session info exposed to a student visiting the check-in page.
 *  No PII, no instructor email, no roster. */
export async function checkInfoRoute(
  env: Env,
  sessionId: string,
): Promise<Response> {
  const session = await repo.getSession(env.DB, sessionId);
  if (!session) return errorResponse("Session not found", 404);
  const course = await env.DB
    .prepare(`SELECT title FROM courses WHERE id = ?`)
    .bind(session.course_id)
    .first<{ title: string }>();
  return json({
    sessionId,
    courseTitle: course?.title ?? "",
    sessionDate: session.session_date,
    label: session.label,
    open: session.closed_at === null,
    periodMs: TOKEN_PERIOD_MS,
  });
}

interface CheckinBody {
  token?: string;
  lat?: number | null;
  lon?: number | null;
  accuracyM?: number | null;
  fingerprint?: string;
}

/** Stable SHA-256 of the device fingerprint string the client sends.
 *  We rehash server-side so the client can't precompute someone else's
 *  fingerprint without also crafting matching browser headers. */
async function hashFingerprint(raw: string, salt: string): Promise<string> {
  const buf = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(`${salt}|${raw}`),
  );
  return bytesToHex(new Uint8Array(buf));
}

export async function submitCheckinRoute(
  req: Request,
  env: Env,
  identity: Identity,
  sessionId: string,
): Promise<Response> {
  const userIdOrResp = requireUser(identity);
  if (userIdOrResp instanceof Response) return userIdOrResp;
  const userId = userIdOrResp;

  const session = await repo.getSession(env.DB, sessionId);
  if (!session) return errorResponse("Session not found", 404);
  if (session.closed_at) return errorResponse("This session is closed", 410);

  // The student must be enrolled in the course (any role) to check in.
  const role = await getEnrollmentRole(env, userId, session.course_id);
  if (!role) return errorResponse("You are not enrolled in this course", 403);

  const body = (await req.json().catch(() => null)) as CheckinBody | null;
  if (!body || typeof body.token !== "string" || typeof body.fingerprint !== "string") {
    return errorResponse("Missing fields", 400);
  }
  const now = Date.now();
  const tokenOk = await verifyToken(session.token_key_hex, sessionId, body.token, now);
  if (!tokenOk) return errorResponse("This check-in code has expired. Reload the page.", 403);

  // Existing check-in? Idempotent: report success without re-inserting.
  const existing = await repo.getCheckin(env.DB, sessionId, userId);
  if (existing) {
    return json({ ok: true, alreadyCheckedIn: true, flags: parseFlags(existing.flags) });
  }

  // Device cookie: read or mint.
  let deviceCookie = readCookie(req, DEVICE_COOKIE);
  let setCookie: string | null = null;
  if (!deviceCookie) {
    deviceCookie = crypto.randomUUID();
    setCookie = deviceCookieHeader(deviceCookie);
  }

  // Fingerprint hash, salted with the signing key so the on-disk value is
  // not directly comparable to a raw browser hash an outsider could compute.
  const salt = env.SESSION_SIGNING_KEY ?? "att-default-salt";
  const fingerprintHash = await hashFingerprint(body.fingerprint, salt);

  // Flags.
  const flags: CheckinFlag[] = [];
  const lat = typeof body.lat === "number" ? body.lat : null;
  const lon = typeof body.lon === "number" ? body.lon : null;
  const accuracyM = typeof body.accuracyM === "number" ? body.accuracyM : null;
  let distanceM: number | null = null;
  if (session.center_lat === null || session.center_lon === null || session.radius_m === null) {
    flags.push("no_geofence");
  } else if (lat === null || lon === null) {
    flags.push("no_location");
  } else {
    distanceM = haversineM(lat, lon, session.center_lat, session.center_lon);
    // Allow GPS accuracy to widen the radius (e.g. 75m radius + 30m accuracy
    // = 105m effective). Phones indoors regularly report 20-50m accuracy.
    const effectiveRadius = session.radius_m + (accuracyM ?? 0);
    if (distanceM > effectiveRadius) flags.push("outside_radius");
  }

  const dup = await repo.findDuplicateDeviceUse(env.DB, {
    courseId: session.course_id,
    sessionDate: session.session_date,
    userId,
    deviceCookie,
    fingerprintHash,
  });
  if (dup.cookieMatch) flags.push("duplicate_cookie");
  if (dup.fingerprintMatch && !dup.cookieMatch) flags.push("duplicate_device");

  const ipHash = await hashClientIp(req, salt);

  await repo.insertCheckin(env.DB, {
    sessionId,
    courseId: session.course_id,
    userId,
    lat,
    lon,
    accuracyM,
    distanceM,
    fingerprintHash,
    deviceCookie,
    ipHash,
    flags: flags.join(","),
  });

  const headers: Record<string, string> = { "content-type": "application/json" };
  if (setCookie) headers["set-cookie"] = setCookie;
  return new Response(JSON.stringify({ ok: true, flags }), { status: 200, headers });
}

async function hashClientIp(req: Request, salt: string): Promise<string | null> {
  const ip = req.headers.get("cf-connecting-ip");
  if (!ip) return null;
  const buf = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(`${salt}|ip|${ip}`),
  );
  return bytesToHex(new Uint8Array(buf));
}
