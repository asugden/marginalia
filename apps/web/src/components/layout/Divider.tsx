// Divider — the one hairline rule (1px var(--border)). Low-use by design:
// Section already carries its own header rule, and §9 discourages free-
// floating <hr>. Reach for this only for a genuine zone separator between
// two blocks. `spacing` sets the vertical margin around the rule.
//
// Styles live in ../css/Divider.css (imported via components.css). Class
// prefix `ds-`.

import type { HTMLAttributes } from "react";

export interface DividerProps extends HTMLAttributes<HTMLHRElement> {
  /** Vertical margin around the rule. Default "md". */
  spacing?: "sm" | "md" | "lg";
}

export function Divider({ spacing = "md", className = "", ...rest }: DividerProps) {
  const cls = ["ds-divider", `ds-divider--${spacing}`, className]
    .filter(Boolean)
    .join(" ");
  return <hr className={cls} {...rest} />;
}
