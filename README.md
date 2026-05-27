# Marginalia

An open-source, self-hostable platform for instructor-authored AI tutoring
agents. Built for classroom use; not a SaaS.

Two things Marginalia tries to do well:

1. **Guided ("backbone") conversations.** An LLM-led tutoring session with
   enforced structure — a defined sequence of topics, turn budgets per
   topic, a persona, and an exit condition. Real state machine, not just a
   system prompt. (NotebookLM and Custom GPTs can't enforce this.)
2. **RAG-grounded Q&A.** Students ask questions, the platform answers using
   a curated set of instructor-trusted sources with citations, in the
   pedagogical style the instructor configures.

Each institution runs its own deployment. No phone-home, no shared
backend, bring your own API key.

## Stack

Cloudflare-native: Workers + D1 + R2 + Vectorize + Workers AI. TypeScript
throughout. Designed to fit in ~$5–15/month of Cloudflare for a typical
30-student course, plus the LLM API spend the institution covers directly.

## Quick deploy

You need a Cloudflare account and a Google Cloud project (for OAuth). Both
are free at the scales Marginalia is designed for.

```bash
git clone https://github.com/<your-fork>/marginalia
cd marginalia
npm install

# 1. Configure the Worker.
cp apps/worker/wrangler.toml.example apps/worker/wrangler.toml
# Edit wrangler.toml — fill in the <your-...> placeholders.

# 2. Create the Cloudflare resources named in wrangler.toml.
npx wrangler d1 create marginalia
# → paste the returned database_id into wrangler.toml
npx wrangler r2 bucket create marginalia-sources
npx wrangler vectorize create marginalia-collections \
  --dimensions=768 --metric=cosine

# 3. Set secrets.
npx wrangler secret put ANTHROPIC_API_KEY
npx wrangler secret put AUTH_GOOGLE_CLIENT_SECRET
npx wrangler secret put SESSION_SIGNING_KEY
# (for SESSION_SIGNING_KEY paste: `openssl rand -base64 48`)

# 4. Configure Google OAuth. See docs/operations.md "Set up the Google
#    OAuth client" for the click-by-click; takes about 5 minutes.

# 5. Migrate + deploy.
cd apps/worker
npx wrangler d1 migrations apply DB --remote
cd ../web && npm run build
cd ../worker && npx wrangler deploy

# 6. Open the deploy URL. Sign in with the email you put in
#    INSTANCE_ADMIN_EMAILS. You're now the admin; create your first
#    course from the /admin page.
```

For local development:

```bash
cp apps/worker/.dev.vars.example apps/worker/.dev.vars
# Fill in ANTHROPIC_API_KEY; the dev auth bypass is on by default in the
# example so you can sign in as admin@example.com without going through Google.

cp apps/worker/seed.sql.example apps/worker/seed.sql
npx wrangler d1 migrations apply DB --local --cwd apps/worker
npm run db:seed --workspace apps/worker

# Two terminals:
npm run dev               # apps/worker (wrangler dev on :8787)
npm run dev:web           # apps/web (vite on :5173, proxied to :8787)
```

## Branding & theming

Marginalia ships with a brand-neutral default theme. To brand your
deployment, drop a `theme.yaml` into `apps/web/src/branding/` and (optionally)
brand assets into `apps/web/public/branding/`. The Vite theme plugin reads
the YAML at build time and emits CSS variable overrides — no source edits
needed. See [docs/theming.md](docs/theming.md) for the schema.

If you maintain branding + seed content in a separate private repo, the
recommended pattern is to keep the public Marginalia repo as a git
submodule of the private one, with a deploy script that symlinks the
branding files into place. See [docs/theming.md](docs/theming.md) for the
overlay layout.

## What's in the repo

- `apps/web` — React + Vite SPA. Pages are organised into a "student
  register" (HomePage, ConversationPage, JoinPage) and a "staff register"
  (Author*, RosterPage, AdminPage). See [docs/style.md](docs/style.md).
- `apps/worker` — Cloudflare Worker. Serves both `/api/*` and the static
  SPA from one origin (same-site, no CORS).
- `packages/auth` — Google OAuth + generic OIDC adapter. Identity is
  `(provider_id, subject)`, never email.
- `packages/backbone` — the conversation state machine.
- `packages/providers` — LLM provider adapters (Anthropic first, OpenAI-
  compatible planned).
- `packages/rag` (under `apps/worker/src/rag.ts`) — chunking, indexing,
  retrieval over Vectorize.
- `packages/schema` — D1 migrations.
- `packages/voices` — the voice library (named conversational personas).

## Status

Pre-1.0. The maintainer runs it for their own teaching at one institution.
Open issues and PRs welcome but the surface area is deliberately small —
"this is the tool I use; PRs welcome" is a sustainable stance.

## License

Apache 2.0. See [LICENSE](LICENSE).
