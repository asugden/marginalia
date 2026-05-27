# attendance

In-person attendance check-in. The instructor projects a QR code; signed-in
students scan it, tap **I'm present**, and the server records the check-in
with location and device signals. Designed to be painless for honest students
and noisy enough about anomalies that the instructor can spot proxy
attempts after class.

## Trust model

Three signals, layered. Any one is bypassable; the combination is not, in
practice, for a student doing this alongside their friends sitting next
to them.

1. **Rotating token (anti-screenshot).** The QR code resolves to a stable
   URL `/a/<sessionId>`, but the check-in page must include a token that
   the server rotates every 30s (`TOKEN_PERIOD_MS`). The previous two
   windows still verify (`TOKEN_GRACE_PERIODS`), giving roughly 90s of
   total validity to cover a slow OAuth round-trip. Screenshotting and
   texting the QR works; screenshotting and texting the *token* expires
   in seconds.
2. **Soft geofence (anti-remote check-in).** The instructor optionally
   sets a classroom center + radius (default 75m). Every check-in is
   *always accepted* but flagged `outside_radius` if it lands beyond
   `radius + reported accuracy`. `no_geofence` and `no_location` are
   their own flags. The instructor reviews the flagged column after
   class — no honest student is ever blocked by GPS jitter.
3. **Device cookie + fingerprint (anti-phone-passing).** A long-lived
   `att_dev` cookie pins a device id; we also store a salted SHA-256 of
   `userAgent | screen | timezone | language | platform`. If the same
   cookie *or* the same fingerprint has already checked in **a different
   user** in **the same course on the same day**, the new check-in is
   flagged `duplicate_cookie` / `duplicate_device`. The same device is
   free to be used across different courses — instructors team-teach,
   spouses share phones, etc.

Nothing is ever silently denied. Honest students always succeed; cheaters
end up in a `present_flagged` column the instructor sorts by.

## Data model

- `attendance_sessions` — one per (course, day, opening). Holds the
  geofence parameters and a per-session 32-byte HMAC key for tokens
  (so closing a session invalidates outstanding tokens).
- `attendance_checkins` — one per (session, student). `UNIQUE(session_id,
  user_id)` makes resubmits idempotent.

The `(course_id, session_date)` pair is the duplicate-detection scope; it
is *not* the global uniqueness key. See `findDuplicateDeviceUse` in
`repo.ts`.

## Routes

Mounted by `apps/worker/src/index.ts` at `/api/attendance/*`. See
`routes.ts` for the full list. Two surfaces:

- **Instructor** (gated on `enrollments.role = 'instructor'`):
  - `POST /sessions` open
  - `GET /sessions?courseId=` list
  - `GET /sessions/:id` session + roster
  - `POST /sessions/:id/close`
  - `GET /sessions/:id/qr-token` rotating token (poll every ~15s)
  - `GET /sessions/:id/export.csv` Canvas-friendly export
- **Student** (signed-in + enrolled, any role):
  - `GET /check/:id/info` minimal session info
  - `POST /check/:id` submit (token + geo + fingerprint)

## CSV export

```
email,display_name,status,flags,distance_m,checked_in_at
```

`status` is `present` or `present_flagged`. `flags` is a pipe-separated
list. The instructor pastes the (email, status) columns into a Canvas
custom assignment in their gradebook — no LTI yet.

## Invariants

- Every query filters by `course_id` (directly or via the session).
- Token verification is constant-time string compare.
- Geofence widening uses reported accuracy: `effective_radius = radius +
  accuracy_m`. Don't tighten this without a real reason — indoor GPS
  routinely reports 20-50m accuracy.
- The device fingerprint is hashed with `SESSION_SIGNING_KEY` as salt so
  the on-disk value cannot be reproduced from raw browser headers alone.
- Resubmits are idempotent: the same student calling `POST /check/:id`
  twice returns `alreadyCheckedIn: true` rather than inserting a row.

## Not in scope

- LTI / direct Canvas API push. CSV upload is fine for v1.
- WebAuthn-bound devices. The cookie+fingerprint pair is enough given the
  geofence and rotating token; passkeys add a recovery-flow burden that
  isn't worth it for attendance.
- Per-student attendance history page. The instructor's session view +
  CSV export covers the use cases we know about; revisit if asked.
