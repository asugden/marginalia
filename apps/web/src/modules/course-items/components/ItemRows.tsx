// The item list both dashboards render, in the same row markup the Assign
// and Review pages use (app-list rows: title with its kind badge, then a
// line with the date and where it stands) — so a dashboard looks like the
// rest of the app, not its own thing. `ItemRows` is for dated items (Due
// next, Overdue); `UndatedItemRows` for supplements with no deadline.
//
// The relative phrase is `dueLabel` verbatim — a statement of date
// arithmetic, with no risk or concern framing (the no-false-positives rule
// governs here too). Where a row links to differs per audience, so the caller
// passes its own href mapping (instructorHref or studentHref from ../api.ts).
//
// `showCompletion` appends the caller's OWN completion verb ("submitted",
// "finished", "marked done") — meaningful on the student dashboard, noise on
// the instructor's (their own state says nothing about the class), which is
// why it is opt-in rather than automatic.

import type { ReactNode } from "react";
import { ItemCard } from "../../../components/index.js";
import { itemTitle } from "../title.js";
import { completionLabel, type CourseItemDTO } from "../api.js";
import { dueLabel, shortDate, type DatedItem } from "../../../course/dueness.js";

function Row({
  item,
  href,
  overdue = false,
  sub,
}: {
  item: CourseItemDTO;
  href: string | null;
  overdue?: boolean;
  sub: ReactNode;
}) {
  return (
    <ItemCard
      kind={item.kind}
      seed={item.checkpoint?.id ?? item.payloadRef}
      title={itemTitle(item)}
      href={href}
      sub={sub}
      className={overdue ? "app-list__row--overdue" : undefined}
    />
  );
}

export function ItemRows({
  rows,
  hrefFor,
  showCompletion = false,
  viewer = "student",
}: {
  rows: DatedItem[];
  /** Staff see past deadlines as dates ("Due 2 days ago"), never as overdue. */
  viewer?: "student" | "staff";
  /** Where a row's title links, or null for plain text. */
  hrefFor: (item: CourseItemDTO) => string | null;
  showCompletion?: boolean;
}) {
  return (
    <div className="app-list">
      {rows.map((d) => {
        const done = showCompletion ? completionLabel(d.item.completion) : null;
        return (
          <Row
            key={d.item.id}
            item={d.item}
            href={hrefFor(d.item)}
            overdue={viewer === "student" && d.bucket === "overdue"}
            sub={
              <>
                {shortDate(d.dueAt)} · <span className="app-list__due">{dueLabel(d, viewer)}</span>
                {done && <> · {done}</>}
              </>
            }
          />
        );
      })}
    </div>
  );
}

/** Items with no deadline — offered all term, never late. */
export function UndatedItemRows({
  items,
  hrefFor,
}: {
  items: CourseItemDTO[];
  hrefFor: (item: CourseItemDTO) => string | null;
}) {
  return (
    <div className="app-list">
      {items.map((item) => (
        <Row key={item.id} item={item} href={hrefFor(item)} sub="No deadline" />
      ))}
    </div>
  );
}
