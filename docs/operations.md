# Operations runbook

Day-to-day commands for redeploying, debugging, and changing config on
the Cloudflare-deployed instance. Keep this current per deploy.

Throughout this file, `<DB>` is the binding name of your D1 database
(literal — `wrangler d1` accepts the binding instead of the database
name). `<your-domain.example.com>` is whatever you set as the worker's
custom-domain route in `wrangler.toml`.

## Redeploy the worker (which also redeploys the frontend)

Any change under `apps/worker/`, `apps/web/`, `packages/providers/`,
`packages/backbone/`, `packages/schema/src/`, or `packages/voices/`:

```bash
cd apps/web
npm run build        # rebuilds dist/ from current source

cd ../worker
npx wrangler deploy  # bundles worker code + uploads dist/ as static assets
```

The "uncommitted changes" warning from wrangler is informational. Safe
to ignore while iterating; commit before a deploy others rely on.

## Frontend-only changes

`apps/web/` edits still require a worker deploy — the static assets ride
along with the worker bundle. There's no separate Pages deploy; the SPA
and API share an origin so there's no CORS or cross-site cookie problem.

## Apply a new schema migration

When `packages/schema/migrations/` gains a new file:

```bash
cd apps/worker
npx wrangler d1 migrations apply DB --remote
```

Verify:

```bash
npx wrangler d1 execute DB --remote \
  --command "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name;"
```

## Audit agents for orphaned voice ids after a voice removal

When a voice is removed from `packages/voices/src/library.ts`, any agent
whose `definition` JSON still references that id throws at turn time —
`resolveVoice` intentionally refuses to silently substitute.

Find affected agents:

```bash
cd apps/worker
npx wrangler d1 execute DB --remote --command \
  "SELECT id, title FROM agents WHERE definition LIKE '%<removed-voice-id>%';"
```

If any rows come back, edit them via the UI's edit-agent form, which
round-trips the whole JSON. Direct `UPDATE` with a JSON `REPLACE` works
for trivial cases but is brittle.

## Set up the Google OAuth client

Required once per deployed instance before sign-in works.

### 1. Create a Google Cloud project (if you don't have one)

[console.cloud.google.com](https://console.cloud.google.com) → project
picker → **New project**. Name is internal-only. No billing account
needed for OAuth.

### 2. Configure the OAuth consent screen

**APIs & Services → OAuth consent screen**:

- **User type:** External (unless your institution has a Google
  Workspace and you want to restrict to it, in which case Internal is
  simpler).
- **App name, support email, developer contact:** fill in. These appear
  on Google's consent screen to end users.
- **Scopes:** add `openid`, `email`, `profile`. All three are
  non-sensitive — no brand verification, no review queue.
- **Test users** (Testing mode only): add every email that needs to
  sign in before you publish, up to 100. Anyone not listed sees an
  "access blocked: app not verified" error.

### 3. Publish to production (when ready for arbitrary users)

OAuth consent screen → **Publish app**. Free, no review required for
the three non-sensitive scopes above. Removes the 100-test-user cap.

### 4. Create the OAuth client

**APIs & Services → Credentials → Create credentials → OAuth client ID**:

- **Application type:** Web application.
- **Authorized JavaScript origins:** leave empty (server-side flow).
- **Authorized redirect URIs:** add both, byte-exact:
  - `https://<your-domain.example.com>/auth/callback`
  - `http://localhost:8787/auth/callback` (loopback is the only
    `http://` Google allows)

Click **Create**. Copy the **client ID** and **client secret**.

### 5. Wire credentials into the worker

```bash
cd apps/worker

# Client ID is not secret — it's sent to the browser in the authorize URL.
# Add to wrangler.toml under [vars]:
#   AUTH_GOOGLE_CLIENT_ID = "...apps.googleusercontent.com"

# Client secret IS secret:
npx wrangler secret put AUTH_GOOGLE_CLIENT_SECRET
# paste at the prompt
```

For local dev, put the secret in `apps/worker/.dev.vars` (gitignored):

```
AUTH_GOOGLE_CLIENT_SECRET=...
```

### 6. Rotate the client secret

Generate a new one in the Cloud Console (Credentials → your client →
**Add secret**), then:

```bash
cd apps/worker
npx wrangler secret put AUTH_GOOGLE_CLIENT_SECRET
```

Google supports two active secrets per client during rotation; disable
the old one once the new one is in place.

## Rotate the LLM provider API key

```bash
cd apps/worker
npx wrangler secret put ANTHROPIC_API_KEY
# paste new key at the prompt
# no redeploy needed — the worker picks up the new secret on the next request
```

Also update `.dev.vars` for local dev (gitignored).

## SESSION_SIGNING_KEY (required)

The worker uses this as the HMAC key for the `oidc_state` cookie (which
carries the PKCE code verifier across the OIDC redirect) and to hash
client IPs stored on session rows. Set once:

```bash
cd apps/worker
openssl rand -base64 48 | npx wrangler secret put SESSION_SIGNING_KEY
```

Mirror in `.dev.vars` for local dev:

```
SESSION_SIGNING_KEY=...
```

Rotating invalidates every in-flight `/auth/login` attempt (users who
were mid-redirect see "Invalid state cookie" and need to retry) but does
NOT log existing sessions out — session ids are opaque random values,
not signed.

## Query the production database

Ad-hoc reads:

```bash
cd apps/worker
npx wrangler d1 execute DB --remote --command "SELECT id, email FROM users;"
```

Ad-hoc writes — be careful, production data:

```bash
npx wrangler d1 execute DB --remote --command \
  "UPDATE users SET email = 'new@example.edu' WHERE id = 'user_dev';"
```

## Add or remove a roster member

Two paths:

- **In-app:** Sign in as an instructor and use the Roster page.
- **Direct DB:** Insert into `users` + `enrollments` like
  `seed.sql.example` does, or use the Roster API documented in
  `apps/worker/src/index.ts`.

## Change who can sign in

Three gates, in order:

1. **`AUTH_GOOGLE_HD`** in `wrangler.toml [vars]` — restricts the Google
   account picker to one Workspace domain. Optional. Changing requires a
   worker redeploy.
2. **`ALLOWED_EMAIL_DOMAINS`** in `wrangler.toml [vars]` — server-side
   gate on join-code claims. Comma-separated. A code claim from any
   other domain is refused at the worker even if the IdP let them sign
   in. Domains of `INSTANCE_ADMIN_EMAILS` entries are implicitly allowed.
3. **Join codes** — even with a permitted email, students don't enter a
   course until they claim an instructor-issued code from
   `/author/roster` → Join codes.

## Adding or removing instance admins

`INSTANCE_ADMIN_EMAILS` in `wrangler.toml [vars]` is the FLOOR — anyone
listed there gets `is_admin=1` on next sign-in (idempotent on every
subsequent sign-in). **The env list never demotes.**

- **Add a new admin** who hasn't signed in: append their email to
  `INSTANCE_ADMIN_EMAILS`, redeploy. They become admin on first sign-in.
- **Add a new admin** who has already signed in: easier via `/admin` →
  Admins tab → "Promote" by email.
- **Remove an admin:** `/admin` → Admins tab → Revoke. Editing
  `INSTANCE_ADMIN_EMAILS` and redeploying does **not** demote.
- **Locked out** (no admins anywhere): add yourself to
  `INSTANCE_ADMIN_EMAILS` and redeploy; next sign-in promotes you.

## Generating, sharing, and revoking join codes

Join codes are how students enroll once an instructor has set up the
course.

**1. Generate.** Instructor opens `/author/roster`. The "Join codes"
section is the top block. Optional fields:

- **Email domain** — restrict claims to `@example.edu`. Defaults to the
  first domain in `INSTANCE_ADMIN_EMAILS`. Leave blank for none.
- **Max uses** — caps how many students can claim. Blank = unlimited.

**2. Share.** Two ways:

- **Verbal or printed:** read the code aloud, write it on a slide, put
  it in an LMS announcement. Student goes to the instance URL, signs in,
  pastes the code into the empty-state form on `/`.
- **Link:** hit "Copy link" for `https://<your-domain>/join/<code>`.
  Best for anything clickable. If the student is signed in, they land on
  a welcome screen and click Continue. If not, they bounce through
  `/auth/login` and back to the same welcome screen automatically.

Either path enrolls the student as `student` on the course.

**3. Rotate** when you want. Revoke the old code (existing enrollments
unaffected — only future claims are blocked), generate a new one.

A student claiming a code from the wrong email domain gets a 403 with a
clear message asking them to sign in with the right account.

## Email-mismatch recovery

A user whose Google account is *not* the same as the address you put on
their roster row (e.g. they sign in with a personal Gmail that happens
to be in the roster) creates a new `users` row instead of claiming the
existing one. The worker logs a warning at callback time.

To merge by hand (rare at classroom scale):

```bash
# 1. Find the two rows.
npx wrangler d1 execute DB --remote --command \
  "SELECT id, email, external_provider, external_subject FROM users \
   WHERE email IN ('roster@example.edu','personal@gmail.com');"

# 2. Move enrollments from the fresh row onto the roster row.
npx wrangler d1 execute DB --remote --command \
  "UPDATE enrollments SET user_id='<roster row id>' \
   WHERE user_id='<fresh row id>';"

# 3. Move conversations.
npx wrangler d1 execute DB --remote --command \
  "UPDATE conversations SET user_id='<roster row id>' \
   WHERE user_id='<fresh row id>';"

# 4. Delete the fresh row.
npx wrangler d1 execute DB --remote --command \
  "DELETE FROM users WHERE id='<fresh row id>';"

# 5. Tell the user to sign out, then sign back in. The next /auth/callback
#    will set external_subject on the roster row.
```

## Working across courses

An instructor can teach any number of courses on one deployment.

- **Signing in.** With a single enrollment you land straight in that
  course (or, as a student, on its agent list) — no picker. With two or
  more enrollments you get a course picker, most-recently-used first.
- **Switching.** Inside a course, the dashboard header has a "Switch
  course" menu listing your other courses. Picking one keeps you in the
  per-course dashboard.
- **Student view.** Every course page has a "← Student view" link that
  drops you into `/` as your students see it. (You'll see the picker
  there too if you're enrolled in more than one course.)
- **Reusing an agent.** On a course's Agents tab, "+ From another course"
  copies an agent you authored elsewhere into this course. The copy is
  independent — editing it here doesn't touch the original. Its voice
  comes along; a course-local source library is dropped (pick a new one
  when prompted). Course creation itself stays admin-only.
- **Tabs that appear over time.** Agents, Provenance, and Roster are
  always shown. Attendance and Sources stay hidden until the course uses
  them once, then become permanent — so a brand-new course starts simple.

The `enrollments` count on the `/admin` Courses tab is the quickest way
to spot an empty course that should be deleted.

## Deleting a course

The `/admin` Courses tab exposes "Delete". This cascades through every
agent, collection, source (R2 + Vectorize), voice, join code, and
enrollment in one transaction. Student conversation transcripts survive
as orphaned rows (their agent_id nulls out, course no longer exists),
but become unreachable through the app. An audit-log entry is written.

Course delete is **not reversible**. Recovery means restoring a D1
backup from before the deletion. If you suspect you'll want to recover,
export first:

```bash
npx wrangler d1 export DB --remote --output ./backup.sql
```

## View live logs from the deployed worker

```bash
cd apps/worker
npx wrangler tail
```

Streams `console.log` / `console.error` from the running worker.

Useful filters during a sign-in cutover:

- `OIDC callback: email .* already claimed` — the email-mismatch
  warning (see recovery above).
- `OIDC exchange failed` — usually a redirect URI not registered with
  the Google client; check the GCP console.

## Roll back the worker to a previous deploy

```bash
cd apps/worker
npx wrangler deployments list
# Find the deploy to roll back to; copy its ID.
npx wrangler rollback <deployment-id>
```

Sessions in D1 stay valid but won't be honoured by an older worker;
users will sign in again next visit.

## Sweeping expired sessions

A `scheduled()` handler exists in `apps/worker/src/scheduled.ts` but the
cron trigger is **deliberately not wired up** by default. Expired
sessions are already harmless on the read path (the worker refuses any
row whose `expires_at` is in the past), so the table just grows slowly
with dead rows until someone sweeps.

At classroom scale, sweep manually once a semester:

```bash
cd apps/worker
npx wrangler d1 execute DB --remote --command \
  "SELECT COUNT(*) FROM sessions WHERE expires_at <= unixepoch() * 1000;"

npx wrangler d1 execute DB --remote --command \
  "DELETE FROM sessions WHERE expires_at <= unixepoch() * 1000;"
```

If the table ever grows past a few thousand rows, re-enable the cron by
adding to `wrangler.toml`:

```
[triggers]
crons = ["0 4 * * *"]
```

The handler is already wired into `index.ts`'s default export.

## Files that should never be committed

These are gitignored already; double-check before any commit:

- `apps/worker/.dev.vars` — local LLM key, `AUTH_GOOGLE_CLIENT_SECRET`,
  `SESSION_SIGNING_KEY`, dev auth bypass
- `apps/worker/wrangler.toml` — your D1 ids and per-deploy config
- `apps/web/src/branding/theme.yaml` — your overlay
- `apps/web/.env.local` — local Vite env overrides
- `apps/worker/.wrangler/` — local cache
- `apps/worker/backup*.sql` — DB exports may contain PII
- `node_modules/`, `dist/`, `*.tsbuildinfo`
