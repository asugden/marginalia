// Tag — a mono "kind chip" for content/source types (PDF, Markdown, Text,
// URL) and generic labels. Optionally removable via a × button (filter
// chips, source lists).
//
// Styles live in ../css/Tag.css (imported via components.css); this file is
// markup + props only. Authored against the generic token layer, so a branded
// deploy re-tints the accent-derived `pdf` tone via the accent override — no
// brand-specific colour literal appears here.

import type { HTMLAttributes, ReactNode } from "react";

export interface TagProps extends HTMLAttributes<HTMLSpanElement> {
  /** Content kind, sets the color. Default "default". */
  kind?: "pdf" | "markdown" | "text" | "url" | "default";
  /** When provided, renders a remove (×) button and calls this on click. */
  onRemove?: () => void;
  children?: ReactNode;
}

export function Tag({ kind = "default", onRemove, className = "", children, ...rest }: TagProps) {
  const cls = [
    "ds-tag",
    `ds-tag--${kind}`,
    onRemove ? "ds-tag--removable" : "",
    className,
  ].filter(Boolean).join(" ");
  return (
    <span className={cls} {...rest}>
      {children}
      {onRemove && (
        <button type="button" className="ds-tag__x" onClick={onRemove} aria-label="Remove">
          &times;
        </button>
      )}
    </span>
  );
}
