// Section — the canonical section header: a mono uppercase kicker (or an
// optional larger title tier) over a 1px hairline rule, then the section
// body. This is the ONE section-header standard (docs/style.md §9): sections
// are wayfinding, the page <h1> carries the title. It replaces the ad-hoc
// section-label / heading+desc / inline-<h3> / course-section-title treatments
// that drifted across the product screens. A Section with neither a `kicker`
// nor a `title` is just a spacing block (the margin role the old bare section
// wrapper carried).
//
// Styles live in ../css/Section.css (imported via components.css); we do NOT
// inject a <style> tag at runtime. Class prefix `ds-`. The kicker composes the
// global `.mono-label` utility rather than re-declaring the mono face.

import type { HTMLAttributes, ReactNode } from "react";

// `title` shadows the native HTML title attribute on purpose — it's our
// heavier header tier, so drop the DOM one.
export interface SectionProps extends Omit<HTMLAttributes<HTMLElement>, "title"> {
  /** The canonical mono kicker — the default header face. */
  kicker?: string;
  /** Optional heavier title tier (a strong sans heading) for content-heavy
   *  sections. Mutually exclusive with `kicker`; both sit over the same rule. */
  title?: ReactNode;
  /** Muted description under the rule. No built-in max-width — the page (or the
   *  `.app-settings` override) owns the measure. */
  description?: ReactNode;
  /** Quiet right-aligned header meta (a count, a badge). */
  meta?: ReactNode;
  /** Right-aligned header control(s) — a search field, a button. */
  actions?: ReactNode;
  children?: ReactNode;
}

export function Section({
  kicker,
  title,
  description,
  meta,
  actions,
  className = "",
  children,
  ...rest
}: SectionProps) {
  if (import.meta.env.DEV && kicker != null && title != null) {
    console.warn("Section: pass either `kicker` or `title`, not both — using `kicker`.");
  }
  const hasHeader = kicker != null || title != null;
  const cls = ["ds-section", className].filter(Boolean).join(" ");

  return (
    <section className={cls} {...rest}>
      {hasHeader && (
        <div className="ds-section__head">
          {kicker != null ? (
            <span className="mono-label ds-section__kicker">{kicker}</span>
          ) : (
            <h2 className="ds-section__title">{title}</h2>
          )}
          {meta != null && <span className="ds-section__meta">{meta}</span>}
          {actions != null && <div className="ds-section__actions">{actions}</div>}
        </div>
      )}
      {description != null && <p className="ds-section__desc">{description}</p>}
      {children}
    </section>
  );
}

// SubLabel — a mono sub-heading INSIDE a section (no rule). For the secondary
// labels that group content within a Section (e.g. "My voices" / "Shared with
// me"), distinct from Section itself, which owns the hairline rule. Mirrors the
// gallery's `.dsg-sub`. Composes `.mono-label`.
export interface SubLabelProps extends HTMLAttributes<HTMLDivElement> {
  children?: ReactNode;
}

export function SubLabel({ className = "", children, ...rest }: SubLabelProps) {
  const cls = ["mono-label", "ds-sublabel", className].filter(Boolean).join(" ");
  return (
    <div className={cls} {...rest}>
      {children}
    </div>
  );
}
