// Badge — a small status pill in the mono face. Use for record state
// (Indexed / Pending / Failed), counts, and "Completed" markers.
//
// Styles live in ../css/Badge.css (imported via components.css); this file is
// markup + props only. Authored against the generic token layer, so a branded
// deploy re-tints the `brand` tone via the accent override — no brand-specific
// colour literal appears here.

import type { HTMLAttributes, ReactNode } from "react";

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  /** Color tone. Default "neutral". */
  tone?: "neutral" | "success" | "warning" | "info" | "danger" | "brand" | "ghost";
  /** Show a leading status dot in the current color. */
  dot?: boolean;
  children?: ReactNode;
}

export function Badge({ tone = "neutral", dot = false, className = "", children, ...rest }: BadgeProps) {
  const cls = ["ds-badge", `ds-badge--${tone}`, className].filter(Boolean).join(" ");
  return (
    <span className={cls} {...rest}>
      {dot && <span className="ds-badge__dot" aria-hidden="true" />}
      {children}
    </span>
  );
}
