// The dated-item list both dashboards render: kind tag · title · absolute
// date · relative phrase. Extracted from InstructorDashboardPage when the
// student dashboard grew its own "Due next" strip, so the two surfaces can't
// drift apart on what a deadline row looks like. The grid (app-dash__* in
// app.css) keeps the four columns aligned down the list so dates and
// deadlines scan vertically.
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

import { Link } from "react-router-dom";
import { completionLabel, kindLabel, type CourseItemDTO } from "../api.js";
import { dueLabel, shortDate, type DatedItem } from "../../../course/dueness.js";

export function ItemRows({
  rows,
  hrefFor,
  showCompletion = false,
}: {
  rows: DatedItem[];
  /** Where a row's title links, or null for plain text. */
  hrefFor: (item: CourseItemDTO) => string | null;
  showCompletion?: boolean;
}) {
  return (
    <ul className="app-dash__list">
      {rows.map((d) => {
        const href = hrefFor(d.item);
        const done = showCompletion ? completionLabel(d.item.completion) : null;
        return (
          <li
            key={d.item.id}
            className={
              "app-dash__row" +
              (d.bucket === "overdue" ? " app-dash__row--overdue" : "")
            }
          >
            <span className="app-dash__kind">{kindLabel(d.item.kind)}</span>
            <span className="app-dash__title">
              {href ? <Link to={href}>{d.item.title}</Link> : d.item.title}
            </span>
            <span className="app-dash__date">{shortDate(d.dueAt)}</span>
            <span className="app-dash__due">
              {dueLabel(d)}
              {done && <span className="app-dash__done"> · {done}</span>}
            </span>
          </li>
        );
      })}
    </ul>
  );
}
