// Card — the workspace container of the student register. White paper, soft
// warm shadow, 16px radius. Set `interactive` for hover-lift list rows; set
// `accent` for the left accent rail on an active/selected card.
//
// Styles live in ../css/Card.css (imported via components.css); we do NOT
// inject a <style> tag at runtime. Class prefix is `ds-`.

import type { HTMLAttributes, ReactNode } from "react";

export interface CardProps extends HTMLAttributes<HTMLElement> {
  /** Inner padding. Default "md". */
  padding?: "none" | "sm" | "md" | "lg";
  /** Drop the shadow. */
  flat?: boolean;
  /** Recessed sand surface instead of white. */
  sunken?: boolean;
  /** Hover-lift + pointer; for clickable rows/tiles. */
  interactive?: boolean;
  /** Left accent rail (active/selected). */
  accent?: boolean;
  /** Render as an anchor. */
  href?: string;
  children?: ReactNode;
}

export function Card({
  padding = "md",
  flat = false,
  sunken = false,
  interactive = false,
  accent = false,
  href,
  className = "",
  children,
  ...rest
}: CardProps) {
  const cls = [
    "ds-card",
    padding === "none"
      ? ""
      : padding === "sm"
        ? "ds-card--pad-sm"
        : padding === "lg"
          ? "ds-card--pad-lg"
          : "ds-card--pad",
    flat ? "ds-card--flat" : "",
    sunken ? "ds-card--sunken" : "",
    interactive ? "ds-card--interactive" : "",
    accent ? "ds-card--accent" : "",
    className,
  ]
    .filter(Boolean)
    .join(" ");

  if (href) {
    return (
      <a className={cls} href={href} {...rest}>
        {children}
      </a>
    );
  }
  return (
    <div className={cls} {...rest}>
      {children}
    </div>
  );
}
