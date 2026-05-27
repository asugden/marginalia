// D1-backed session store. Schema is migration 0004:
//
//   sessions(id, user_id, created_at, expires_at, last_seen_at,
//            user_agent, ip_hash)
//
// One row per (browser × user); the row's `id` is the opaque value stored
// in the session cookie. Rolling expiration is handled by touchSession()
// at the call site (only writes if more than ~24h passed since the last
// touch) so a chatty client doesn't write-amplify D1.

import type { SessionRow, UserRow } from "@marginalia/schema";

const enc = new TextEncoder();

function base64urlBytes(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** Mint a 256-bit opaque session id (base64url-encoded). */
export function newSessionId(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return base64urlBytes(bytes);
}

/**
 * HMAC the client IP with a per-instance secret before storage. Lets the
 * /me "active devices" view distinguish sessions across IPs without
 * persisting an actual IP. If the secret rotates, old hashes still work
 * for comparison-against-itself but won't match a fresh hash of the same
 * IP — acceptable; ip_hash is informational, not a security boundary.
 */
export async function hashIp(ip: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const buf = await crypto.subtle.sign("HMAC", key, enc.encode(ip));
  return base64urlBytes(new Uint8Array(buf));
}

export interface CreateSessionParams {
  userId: string;
  ttlMs: number;
  userAgent?: string | null;
  ipHash?: string | null;
}

export async function createSession(
  db: D1Database,
  params: CreateSessionParams,
): Promise<SessionRow> {
  const now = Date.now();
  const row: SessionRow = {
    id: newSessionId(),
    user_id: params.userId,
    created_at: now,
    expires_at: now + params.ttlMs,
    last_seen_at: now,
    user_agent: params.userAgent ?? null,
    ip_hash: params.ipHash ?? null,
  };
  await db
    .prepare(
      `INSERT INTO sessions
       (id, user_id, created_at, expires_at, last_seen_at, user_agent, ip_hash)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      row.id,
      row.user_id,
      row.created_at,
      row.expires_at,
      row.last_seen_at,
      row.user_agent,
      row.ip_hash,
    )
    .run();
  return row;
}

/** Look up by cookie id, scoping to "not yet expired" so an expired row
 *  can't be revived by a touch. */
export async function findActiveSession(
  db: D1Database,
  id: string,
  nowMs: number,
): Promise<SessionRow | null> {
  return db
    .prepare(
      `SELECT * FROM sessions WHERE id = ? AND expires_at > ?`,
    )
    .bind(id, nowMs)
    .first<SessionRow>();
}

/**
 * Single-query session + user lookup. Used by the worker's authenticate()
 * on every API request — joining saves one D1 round-trip per request.
 *
 * Returns null when the session is missing, expired, or its user row was
 * deleted (the user_id reference can become dangling if an admin wipes a
 * user row by hand; treat as logged-out).
 */
export async function findActiveSessionWithUser(
  db: D1Database,
  id: string,
  nowMs: number,
): Promise<{ session: SessionRow; user: UserRow } | null> {
  const row = await db
    .prepare(
      `SELECT
         s.id           AS s_id,
         s.user_id      AS s_user_id,
         s.created_at   AS s_created_at,
         s.expires_at   AS s_expires_at,
         s.last_seen_at AS s_last_seen_at,
         s.user_agent   AS s_user_agent,
         s.ip_hash      AS s_ip_hash,
         u.*
       FROM sessions s
       JOIN users u ON u.id = s.user_id
       WHERE s.id = ? AND s.expires_at > ?`,
    )
    .bind(id, nowMs)
    .first<Record<string, unknown>>();
  if (!row) return null;
  const session: SessionRow = {
    id: row.s_id as string,
    user_id: row.s_user_id as string,
    created_at: row.s_created_at as number,
    expires_at: row.s_expires_at as number,
    last_seen_at: row.s_last_seen_at as number,
    user_agent: (row.s_user_agent as string | null) ?? null,
    ip_hash: (row.s_ip_hash as string | null) ?? null,
  };
  // The rest of the columns are users.* — strip the s_ prefixed ones.
  const user = {} as Record<string, unknown>;
  for (const [k, v] of Object.entries(row)) {
    if (!k.startsWith("s_")) user[k] = v;
  }
  return { session, user: user as unknown as UserRow };
}

/**
 * Rolling expiration: bump last_seen_at on every request, and bump
 * expires_at to (now + ttlMs) when more than `idleWriteWindowMs` has
 * passed since the last bump. The write window keeps a chatty client from
 * issuing one UPDATE per request.
 */
export async function touchSession(
  db: D1Database,
  session: SessionRow,
  ttlMs: number,
  idleWriteWindowMs: number,
): Promise<void> {
  const now = Date.now();
  if (now - session.last_seen_at < idleWriteWindowMs) return;
  const newExpiry = now + ttlMs;
  await db
    .prepare(
      `UPDATE sessions
         SET last_seen_at = ?, expires_at = ?
       WHERE id = ?`,
    )
    .bind(now, newExpiry, session.id)
    .run();
}

/** Delete one session — used by /auth/logout. */
export async function deleteSession(
  db: D1Database,
  id: string,
): Promise<void> {
  await db.prepare(`DELETE FROM sessions WHERE id = ?`).bind(id).run();
}

/** Sweep expired rows. Wired up by the scheduled handler in M7. */
export async function deleteExpiredSessions(
  db: D1Database,
  nowMs: number,
): Promise<number> {
  const result = await db
    .prepare(`DELETE FROM sessions WHERE expires_at <= ?`)
    .bind(nowMs)
    .run();
  return result.meta?.changes ?? 0;
}

/** Bulk-revoke all sessions for one user — useful when an admin demotes
 *  themselves out of an instance, or for the /me "sign out everywhere"
 *  action (not in v0.6 UI, but kept here so M7 has it). */
export async function deleteSessionsForUser(
  db: D1Database,
  userId: string,
): Promise<number> {
  const result = await db
    .prepare(`DELETE FROM sessions WHERE user_id = ?`)
    .bind(userId)
    .run();
  return result.meta?.changes ?? 0;
}
