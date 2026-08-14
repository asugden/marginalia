# Theming

Marginalia ships brand-neutral but complete: a warm-paper palette, a calm
editorial-blue accent, and a Space Mono + Hanken Grotesk type system loaded
from Google Fonts. The public build looks finished out of the box — you only
touch theming if you want your own colours, fonts, or assets.

To brand a deployment, you supply a `theme.yaml` and (optionally) brand
assets. The Vite build picks them up automatically — no source edits.

The visual system is a token layer under `apps/web/src/tokens/`
(`colors.css`, `fonts.css`, `typography.css`, plus spacing/radius/motion).
A small set of those tokens are the **brand seam** — CSS custom properties
the theme plugin overrides from your YAML. Everything else (the warm
neutrals, the type scale, the status hues) is deliberately fixed.

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
`theme.default.yaml`. All fields live under a top-level `brand:` key.

| Field | Type | Default | Controls |
|---|---|---|---|
| `page_title` | string | `"Marginalia"` | Browser tab title and (by default) the home-page H1. Also exposed to React as `import.meta.env.BRAND_PAGE_TITLE`. |
| `wordmark` | string | (same as `page_title`) | Header-lockup text. |
| `wordmark_accent_start` | number | `0` | 0-based offset where the accent-coloured run of the wordmark begins. `0` = a leading prefix; a higher value accents a **mid-word** run. |
| `wordmark_accent_len` | number | `0` | How many wordmark characters (from `wordmark_accent_start`) are painted in the accent. `0` = none. |
| `mark_url` | path or `null` | `null` | Brand mark image at the left of the lockup (and the agent avatar). Path under `/branding/`. |
| `primary` | hex colour | `#2b62a8` | The brand accent. Drives primary buttons, focus rings, link colour, the user-message bubble, the wordmark accent. White text must read on it. **Re-tints the whole accent scale** (see below). |
| `primary_dark` | hex colour | `#1c4474` | Hover/active shade of the accent. Aim ~10–15% darker than `primary`. Also feeds the derived scale. |
| `font_sans` | font-family string | `"Hanken Grotesk", …` | Body + UI + headings. Pasted verbatim as a CSS `font-family` value — quote names with spaces and include fallbacks. |
| `font_display` | font-family string | (same as `font_sans`) | Heading face. Defaults to the heavy sans; set a serif here if you want display headings to differ from body. |
| `font_mono` | font-family string | `"Space Mono", …` | The signature/mono voice: wordmark, eyebrows, section labels, metadata, code. |
| `font_import_url` | URL or `null` | `null` | Optional webfont stylesheet, emitted as `<link rel="stylesheet">` in `<head>` so the named families resolve. Needed only if you switch to families not already loaded by `tokens/fonts.css`. |
| `watermark_url` | path or `null` | `null` | Fixed bottom-left background image behind content. Path under `/branding/` (served from `apps/web/public/branding/`). `null` = no watermark. |
| `watermark_opacity` | number | `0` | Opacity of the watermark; `~0.03–0.05` keeps text legible. |
| `footer_text` | string | `"Marginalia · open source under Apache 2.0"` | Home-page footer. Exposed to React as `import.meta.env.BRAND_FOOTER_TEXT`. |
| `favicon_url` | path | `/favicon.svg` | Favicon path. Point at `/branding/<file>` to use your own. |

### The accent is two values that drive the whole scale

You only set `primary` and `primary_dark`. The accent's deeper, brighter,
and tint variants (used for AA-contrast accent text, focus glints, hover
washes, selection, and the user bubble) are **derived from those two** in
`apps/web/src/tokens/colors.css`. So recolouring the entire UI is a
two-line change — you don't enumerate a palette. The warm sand neutrals and
the green/amber/blue status hues are intentionally not part of the brand
seam and stay fixed.

## Worked example: branding a deployment

Say a fictional "Riverside College" wants a green accent and its own
watermark. The whole job is one `theme.yaml`:

```yaml
brand:
  page_title: "Riverside College · Study Assistant"

  # Two values re-tint the entire accent scale.
  primary: "#2f7d52"
  primary_dark: "#1d5836"          # ~12% darker for hover/active

  # A faint crest behind content. The file lives at
  # apps/web/public/branding/riverside-crest.png and is served at
  # /branding/riverside-crest.png.
  watermark_url: "/branding/riverside-crest.png"
  watermark_opacity: 0.04

  footer_text: "Riverside College · self-hosted on Marginalia"
  favicon_url: "/branding/favicon.svg"
```

The fonts are left untouched, so Riverside keeps the default Space Mono +
Hanken Grotesk pairing. To enable the watermark and favicon, drop
`riverside-crest.png` and `favicon.svg` into `apps/web/public/branding/`
(see "Brand assets" below). Any page that shouldn't show the watermark adds
the `.no-watermark` class.

## Fonts

The defaults are Space Mono (the mono/signature voice — wordmark, eyebrows,
labels, code) and Hanken Grotesk (body, UI, headings), loaded by an
`@import` in `apps/web/src/tokens/fonts.css`. They are brand-neutral and
ship ready to use.

To change the font **families**:

1. Set `font_sans`, `font_display`, and/or `font_mono` in `theme.yaml` to
   the new family strings.
2. If those families aren't already loaded by `tokens/fonts.css`, also set
   `font_import_url` to a stylesheet that provides them (e.g. a Google Fonts
   `css2?family=…` URL). The plugin injects it as a `<link>` in `<head>`
   before the brand overrides, so the names resolve.

```yaml
brand:
  font_sans: '"Inter", system-ui, sans-serif'
  font_display: '"Fraunces", Georgia, serif'
  font_mono: '"IBM Plex Mono", ui-monospace, monospace'
  font_import_url: "https://fonts.googleapis.com/css2?family=Fraunces:wght@400;700&family=IBM+Plex+Mono&family=Inter:wght@300..800&display=swap"
```

To **self-host** fonts instead of using a CDN, replace the `@import` in
`apps/web/src/tokens/fonts.css` with local `@font-face` rules pointing at
your font binaries. The token names in `tokens/typography.css`
(`--font-sans` / `--font-display` / `--font-mono`) never change — only the
families behind them — so nothing else needs editing.

## Brand assets

The watermark image and favicon live in `apps/web/public/branding/`, which
Vite serves at `/branding/*`. That directory is gitignored except for
`.gitkeep`, so deployers drop their own assets there without them ever
being committed to the public repo. Reference them from `theme.yaml` as
`/branding/<file>`.

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

That's all the magic. The token layer keeps its brand-neutral defaults and
references `var(--brand-*)` throughout; the plugin emits its overrides under
a `:root:root` selector so they out-specify the default `:root` block
regardless of DOM order.

The watermark is similarly variable-driven (`var(--brand-watermark-url)` /
`var(--brand-watermark-opacity)` on `body::before`), defaulting to `none`/`0`,
so omitting it from your YAML means no watermark at all. Add `.no-watermark`
to any page that should suppress it.

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
