// The card for anything assigned — a writing or coding assignment, an agent,
// an example, a reading — wherever it is listed: Assign, Review, both
// dashboards, the Agents and Examples pages. Every such list renders this one
// component, so the cards cannot drift apart: the kind's icon tile leads, the
// title is the card's link (the whole card is clickable, see .card-link in
// css/cards.css), and the trailing column holds the card's figure or actions.
//
// Submissions are NOT ItemCards: a row without a mark is something that came
// back (SubmissionCards).

import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { ItemMark, type ItemMarkKind } from "./ItemMark.js";

export interface ItemCardProps {
  kind: ItemMarkKind;
  /** A stable id for the mark's tint — the assignment/agent id or example
   *  slug, the same on every page that lists the item. */
  seed: string;
  title: ReactNode;
  /** Where the card opens. Absent = the card isn't a link. */
  href?: string | null;
  /** Status badges after the title (Draft, Unpublished…), spacing included. */
  badges?: ReactNode;
  /** The grey second line. */
  sub?: ReactNode;
  /** Anything else under the text (an inline form, extra dates). */
  children?: ReactNode;
  /** The trailing column: a figure, buttons, or both. */
  meta?: ReactNode;
  /** Row modifiers, e.g. `app-list__row--overdue`. */
  className?: string;
}

export function ItemCard({ kind, seed, title, href, badges, sub, children, meta, className }: ItemCardProps) {
  return (
    <div className={"app-list__row" + (className ? ` ${className}` : "")}>
      <ItemMark kind={kind} seed={seed} />
      <div className="app-list__main">
        <div className="app-list__title">
          {href ? (
            <Link className="card-link" to={href}>
              {title}
            </Link>
          ) : (
            <span>{title}</span>
          )}
          {badges}
        </div>
        {sub != null && sub !== false && <div className="app-list__sub">{sub}</div>}
        {children}
      </div>
      {meta != null && meta !== false && <div className="app-list__meta">{meta}</div>}
    </div>
  );
}
