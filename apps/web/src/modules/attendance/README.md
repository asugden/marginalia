# attendance (web)

Client side of the attendance module. See the worker module's
[README](../../../../worker/src/modules/attendance/README.md) for the
overall design, data model, and trust model.

## Routes

- `/attendance?courseId=...` — instructor: open a session, see past
  sessions, download CSV. (`SessionListPage`)
- `/attendance/sessions/:id` — instructor: projected display, live
  roster, close button. (`DisplayPage`)
- `/a/:id` — student check-in landing (short URL, encoded in the QR).
  Reads the rotating token from `?t=`. (`CheckInPage`)

## UX shape

- **Display page** is split: large QR + check-in URL on the left,
  present count + flagged count + roster + CSV / close buttons on the
  right. The QR refreshes every 5s; the underlying token rotates every
  30s server-side.
- **Check-in page** is the simplest possible flow: signed-in students
  see the course title, a date, and one giant "I'm present" button.
  If the server returns 401, we redirect to `/auth/login?return_to=...`
  preserving the QR target so they land back on the same page after
  OAuth.

## Trust signals collected

`api.ts:deviceFingerprintString()` builds a stable, narrow per-browser
string from `userAgent | screen | timezone | language | platform |
deviceMemory`. The server salts and hashes it. Geolocation is read with
`{ enableHighAccuracy: true, timeout: 7s }` and silently fails to null
(flagged `no_location` server-side, not blocked).
