/*
 * vite-theme-plugin — reads apps/web/src/branding/theme.yaml (else
 * theme.default.yaml), and:
 *
 *   1. Injects a <style> block with :root { --brand-* } overrides into
 *      the rendered HTML, so styles.css's defaults are replaced at load
 *      time without rewriting the CSS file.
 *   2. Replaces %BRAND_PAGE_TITLE% / %BRAND_FAVICON_URL% in index.html.
 *   3. Exposes BRAND_PAGE_TITLE / BRAND_FOOTER_TEXT as compile-time
 *      constants via Vite's define option, so React components can read
 *      them with import.meta.env.BRAND_PAGE_TITLE.
 *
 * The plugin runs in both `vite dev` and `vite build`. If theme.yaml is
 * absent, it silently falls back to theme.default.yaml — that's how the
 * public repo deploys cleanly with no overlay.
 */

import fs from "node:fs";
import path from "node:path";
import { parse as parseYaml } from "yaml";
import type { Plugin } from "vite";

interface BrandConfig {
  page_title?: string;
  primary?: string;
  primary_dark?: string;
  font_sans?: string;
  font_display?: string;
  /** Optional webfont stylesheet URL (e.g. a Google Fonts @import URL).
   *  Emitted as a <link rel="stylesheet"> in <head> before the brand
   *  overrides so the named families resolve. */
  font_import_url?: string | null;
  watermark_url?: string | null;
  watermark_opacity?: number;
  footer_text?: string;
  favicon_url?: string;
}

interface ThemeFile {
  brand?: BrandConfig;
}

function loadTheme(srcDir: string): BrandConfig {
  const overlay = path.join(srcDir, "branding", "theme.yaml");
  const fallback = path.join(srcDir, "branding", "theme.default.yaml");
  const filePath = fs.existsSync(overlay) ? overlay : fallback;
  const raw = fs.readFileSync(filePath, "utf8");
  const parsed = parseYaml(raw) as ThemeFile | null;
  return parsed?.brand ?? {};
}

function buildRootCss(brand: BrandConfig): string {
  const lines: string[] = [];
  if (brand.primary)           lines.push(`  --brand-primary: ${brand.primary};`);
  if (brand.primary_dark)      lines.push(`  --brand-primary-dark: ${brand.primary_dark};`);
  if (brand.font_sans)         lines.push(`  --font-sans: ${brand.font_sans};`);
  if (brand.font_display)      lines.push(`  --font-display: ${brand.font_display};`);
  if (brand.watermark_url) {
    lines.push(`  --brand-watermark-url: url("${brand.watermark_url}");`);
    lines.push(`  --brand-watermark-opacity: ${brand.watermark_opacity ?? 0.03};`);
  }
  if (lines.length === 0) return "";
  return `<style data-brand-overrides>\n:root {\n${lines.join("\n")}\n}\n</style>`;
}

export function themePlugin(): Plugin {
  let srcDir = "";
  let brand: BrandConfig = {};

  return {
    name: "marginalia-theme",
    configResolved(config) {
      srcDir = path.join(config.root, "src");
      brand = loadTheme(srcDir);
    },
    config() {
      // Re-load to ensure brand is populated before define is computed.
      // (configResolved fires after config, so we duplicate the read here.)
      const rootSrc = path.join(process.cwd(), "src");
      const b = loadTheme(rootSrc);
      return {
        define: {
          "import.meta.env.BRAND_PAGE_TITLE": JSON.stringify(b.page_title ?? "Marginalia"),
          "import.meta.env.BRAND_FOOTER_TEXT": JSON.stringify(
            b.footer_text ?? "Marginalia · open source under Apache 2.0"
          ),
        },
      };
    },
    transformIndexHtml(html) {
      const pageTitle = brand.page_title ?? "Marginalia";
      const faviconUrl = brand.favicon_url ?? "/favicon.svg";
      let out = html
        .replace(/%BRAND_PAGE_TITLE%/g, pageTitle)
        .replace(/%BRAND_FAVICON_URL%/g, faviconUrl);
      const injections: string[] = [];
      if (brand.font_import_url) {
        injections.push(`<link rel="stylesheet" href="${brand.font_import_url}">`);
      }
      const rootCss = buildRootCss(brand);
      if (rootCss) injections.push(rootCss);
      if (injections.length) {
        out = out.replace("</head>", `  ${injections.join("\n  ")}\n  </head>`);
      }
      return out;
    },
    handleHotUpdate(ctx) {
      // Reload theme on theme.yaml / theme.default.yaml change so dev
      // server picks up edits without a manual restart.
      if (ctx.file.endsWith("theme.yaml") || ctx.file.endsWith("theme.default.yaml")) {
        brand = loadTheme(srcDir);
        ctx.server.ws.send({ type: "full-reload" });
      }
    },
  };
}
