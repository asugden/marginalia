// PageHeader — the page-title lockup: a mono eyebrow over the <h1>, an
// optional one-line scope/subtitle, and an optional right-aligned action
// cluster. This is the page TITLE (the docs/style.md §9 exception that keeps
// display weight), not a section. It unifies the two hand-rolled page heads
// (the staff page head and its legacy module-screen twin) behind one API.
//
// Styles live in ../css/PageHeader.css (imported via components.css). The
// eyebrow uses the global `.eyebrow` utility. Class prefix `ds-`.

import type { HTMLAttributes, ReactNode } from "react";

// `title` shadows the native HTML title attribute on purpose — it's the page
// <h1> content, so drop the DOM one.
export interface PageHeaderProps extends Omit<HTMLAttributes<HTMLDivElement>, "title"> {
  /** Mono kicker above the title. */
  eyebrow?: string;
  /** The page <h1>. */
  title: ReactNode;
  /** One-line scope / subtitle under the title. */
  scope?: ReactNode;
  /** Right-aligned action cluster. */
  actions?: ReactNode;
  /** Optional leading element (an avatar or icon) to the left of the
   *  eyebrow → title → scope lockup, vertically centred with it. */
  lead?: ReactNode;
}

export function PageHeader({
  eyebrow,
  title,
  scope,
  actions,
  lead,
  className = "",
  ...rest
}: PageHeaderProps) {
  const cls = ["ds-page-header", className].filter(Boolean).join(" ");
  return (
    <div className={cls} {...rest}>
      <div className="ds-page-header__lockup">
        {lead != null && <div className="ds-page-header__lead">{lead}</div>}
        <div className="ds-page-header__main">
          {eyebrow != null && <span className="eyebrow">{eyebrow}</span>}
          <h1 className="ds-page-header__title">{title}</h1>
          {scope != null && <div className="ds-page-header__scope">{scope}</div>}
        </div>
      </div>
      {actions != null && <div className="ds-page-header__actions">{actions}</div>}
    </div>
  );
}
