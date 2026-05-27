# Theming

Marginalia ships brand-neutral. To brand a deployment, you supply a
`theme.yaml` and (optionally) brand assets. The Vite build picks them up
automatically — no source edits.

## The 30-second version

1. Copy `apps/web/src/branding/theme.default.yaml` to
   `apps/web/src/branding/theme.yaml`. (`theme.yaml` is gitignored.)
2. Edit colours, fonts, page title, footer text.
3. Drop a watermark / favicon into `apps/web/public/branding/` if you want
   them, and point the YAML at them.
4. `npm run -w apps/web build && npx wrangler deploy --cwd apps/worker`.

That's it. The Vite theme plugin reads the YAML at build time and emits
`:root { --brand-* }` CSS overrides into the rendered HTML. The default
palette in `theme.default.yaml` stays in effect for anything you don't
override.

## The `theme.yaml` schema

Every field is optional — anything you omit keeps the default in
`theme.default.yaml`.

```yaml
brand:
  # Browser tab title and (by default) the home page H1.
  page_title: "My Course AI"

  # Primary accent. Used on primary buttons, focus outlines, link colour,
  # user-message bubble background. Pick something where white text reads.
  primary: "#ba0100"
  primary_dark: "#8e0100"          # ~10% darker for hover/active

  # Body and display fonts. Strings are pasted verbatim as font-family
  # CSS values — quote names with spaces and include fallbacks.
  font_sans: '"Open Sans", -apple-system, system-ui, sans-serif'
  font_display: '"Source Serif Pro", Georgia, serif'

  # Optional webfont stylesheet. Emitted as <link rel="stylesheet"> in
  # <head> so the named families resolve. Omit if your fonts are
  # system-stack (the default).
  font_import_url: "https://fonts.googleapis.com/css2?family=Open+Sans&family=Source+Serif+Pro&display=swap"

  # Optional background watermark. Path is served by Vite from
  # apps/web/public/branding/<file>, exposed at /branding/<file>.
  # Set watermark_url to null to disable.
  watermark_url: "/branding/my-watermark.png"
  watermark_opacity: 0.03

  # Footer text on the home page.
  footer_text: "My Institute · classroom-ai self-hosted"

  # Favicon. Default is /favicon.svg shipped in apps/web/public/.
  favicon_url: "/branding/favicon.svg"
```

If you want webfonts, set `font_import_url` above — the plugin emits a
`<link rel="stylesheet">` so the named families resolve. The default
fonts are system-stack and need no import.

## How the build picks it up

`apps/web/vite-theme-plugin.ts` runs in both `vite dev` and `vite build`:

1. Reads `apps/web/src/branding/theme.yaml` if present, otherwise
   `theme.default.yaml`.
2. Builds a `<style>` block of `:root { --brand-* }` overrides and
   injects it into the rendered HTML before `</head>`.
3. Substitutes `%BRAND_PAGE_TITLE%` and `%BRAND_FAVICON_URL%` in
   `apps/web/index.html`.
4. Exposes `import.meta.env.BRAND_PAGE_TITLE` and
   `import.meta.env.BRAND_FOOTER_TEXT` as compile-time constants for
   React components.

That's all the magic. `apps/web/src/styles.css` keeps its brand-neutral
defaults and references `var(--brand-*)` throughout; the plugin's emitted
overrides win because they're more specific in source order.

The watermark is similarly variable-driven (`var(--brand-watermark-url)`
on `body::before`), so omitting it from your YAML means no watermark at
all.

## The private overlay pattern

For institutions that want to keep branding (and any starter content)
proprietary, the recommended layout is:

```
<your-private-repo>/
├── .gitmodules
├── marginalia/                ← git submodule → public marginalia repo
├── branding/
│   ├── theme.yaml             ← colours, fonts, page title
│   ├── watermark.png
│   └── favicon.svg
├── seed/                      ← starter agents/voices (optional)
│   ├── agents/*.json
│   └── voices/*.json
├── wrangler.overlay.toml      ← your D1/R2/Vectorize ids, env vars
├── .dev.vars                  ← gitignored secrets
└── deploy.sh                  ← ties it all together
```

A typical `deploy.sh`:

```bash
#!/bin/bash
set -e
cd "$(dirname "$0")"

# Ensure the submodule is at the pinned commit.
git submodule update --init

# Symlink branding overlay into the public tree (idempotent).
mkdir -p marginalia/apps/web/src/branding marginalia/apps/web/public/branding
ln -sf "$PWD/branding/theme.yaml"     marginalia/apps/web/src/branding/theme.yaml
ln -sf "$PWD/branding/watermark.png"  marginalia/apps/web/public/branding/watermark.png
ln -sf "$PWD/branding/favicon.svg"    marginalia/apps/web/public/branding/favicon.svg

# Copy the per-deploy wrangler config in.
cp wrangler.overlay.toml marginalia/apps/worker/wrangler.toml

# Build + deploy.
( cd marginalia && npm install && npm run -w apps/web build )
( cd marginalia/apps/worker && npx wrangler deploy )
```

The public Marginalia repo is consumed read-only via submodule pinning;
you `git submodule update --remote` when you want to pull upstream
changes. Your branding repo is the working root.

This pattern lets you:

- Keep brand assets and proprietary seed content out of the public repo.
- Pin Marginalia to a known-good commit (so an upstream change can't
  silently break your deploy).
- Re-deploy with a single `./deploy.sh`.

## Per-deploy secrets

These never go in any repo:

| Secret | Set via |
|---|---|
| `ANTHROPIC_API_KEY` | `wrangler secret put` |
| `AUTH_GOOGLE_CLIENT_SECRET` | `wrangler secret put` |
| `SESSION_SIGNING_KEY` | `wrangler secret put` (generate: `openssl rand -base64 48`) |

For local development, mirror them in `apps/worker/.dev.vars` (gitignored).

## What's NOT themable here

Deliberately:

- The two-register layout (student vs staff pages) — see [style.md](style.md).
- Component-level spacing, type scale, the card radius / shadow.
- The taxonomy of buttons (primary, subtle, danger-link).

If you find yourself wanting to override these per deploy, open an issue
— the rule in [style.md](style.md) is probably the thing to discuss, not
the theming surface.
