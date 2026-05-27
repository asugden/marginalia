# Contributing

Marginalia is small and stays small on purpose. The maintainer uses it to
run their own course; the surface area is deliberately narrow.

## Before opening a PR

- **Open an issue first** for anything bigger than a typo or a small bug
  fix. The fastest way to have a PR rejected is to write it before checking
  whether the scope fits.
- **Read the README and `docs/`** — they cover the architectural intent.
  The why is in the docs; the code reflects it.
- **Stay model-independent.** Don't import `@anthropic-ai/sdk` (or any
  provider SDK) outside of `packages/providers/<that-provider>`. The
  `LLMProvider` interface is small on purpose.
- **Filter every query by `course_id`** when touching student data. No
  exceptions.

## Local development

```bash
npm install
cp apps/worker/.dev.vars.example apps/worker/.dev.vars
cp apps/worker/seed.sql.example apps/worker/seed.sql
# Edit both — at minimum set ANTHROPIC_API_KEY and DEV_AUTH_EMAIL.

npx wrangler d1 migrations apply DB --local --cwd apps/worker
npm run db:seed --workspace apps/worker

# Run the worker and the SPA in separate terminals:
npm run dev          # wrangler dev on :8787
npm run dev:web      # vite on :5173
```

The web app proxies `/api/*` to the worker, so visit `http://localhost:5173`.

For a UI-only mock that doesn't need a worker or LLM credentials:

```bash
npm run dev:mock --workspace apps/web
```

## Style

- TypeScript everywhere. No `any`; prefer `unknown` + narrowing.
- No new dependencies without a good reason. Workers have a bundle budget;
  the ecosystem has good native primitives.
- Write the comment only when the *why* isn't obvious. Don't narrate
  *what* the code does.
- Migrations are immutable history: never edit a committed migration; add
  a new one.

See [docs/style.md](docs/style.md) for visual / UX rules.

## Reporting security issues

Don't open public issues for security vulnerabilities — see
[SECURITY.md](SECURITY.md).
