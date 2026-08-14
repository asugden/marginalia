// StatTile / StatGrid — the dashboard & settings stat pattern. A StatTile is
// a big mono figure over a mono uppercase caption; wrap a row of them in a
// <StatGrid> (a responsive auto-fit grid). `value` is a node, so an accent-
// emphasised figure (an inner <em>) works for free. Faithful to the existing
// stat-tile geometry — migrating a page onto these is a no-op visually.
//
// Styles live in ../css/StatTile.css (imported via components.css). Class
// prefix `ds-`.

import type { HTMLAttributes, ReactNode } from "react";

export interface StatTileProps extends HTMLAttributes<HTMLDivElement> {
  /** The figure. A node so an inner <em> accent emphasis works. */
  value: ReactNode;
  /** Mono uppercase caption. */
  label: ReactNode;
}

export function StatTile({ value, label, className = "", ...rest }: StatTileProps) {
  const cls = ["ds-stat", className].filter(Boolean).join(" ");
  return (
    <div className={cls} {...rest}>
      <div className="ds-stat__n">{value}</div>
      <span className="ds-stat__label">{label}</span>
    </div>
  );
}

export interface StatGridProps extends HTMLAttributes<HTMLDivElement> {
  children?: ReactNode;
}

/** Responsive grid wrapper for a row of StatTiles. Takes children (not an
 *  array) so tiles can be conditionally rendered. */
export function StatGrid({ className = "", children, ...rest }: StatGridProps) {
  const cls = ["ds-stats", className].filter(Boolean).join(" ");
  return (
    <div className={cls} {...rest}>
      {children}
    </div>
  );
}
