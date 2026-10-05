// The review pages' small navigation cluster, top right of the header:
//
//   [Assignment]  ↑ ↓   ‹ 3 of 24 ›
//
//   ‹ ›  previous / next student in this assignment (submission pages only)
//   ↑ ↓  previous / next dated assignment — the same student's submission
//        there, or that assignment's page (see reviewGrid.ts)
//   Assignment  shows what was assigned, beneath the header
//
// A move that doesn't exist is shown disabled rather than hidden, so the
// cluster keeps its shape as you step through. The Assignment panel's open
// state is remembered for the browser session, so it stays open (or shut)
// while stepping from one student to the next.

import { useState } from "react";
import { IconButton } from "../components/index.js";
import { ChevronIcon } from "../icons.js";
import { Markdown } from "../Markdown.js";
import type { GridAssignment, NavTarget } from "./reviewGrid.js";

const BRIEF_KEY = "review.briefOpen";

/** Whether the Assignment panel is open; survives moving between pages. */
export function useBriefOpen(): [boolean, () => void] {
  const [open, setOpen] = useState(() => {
    try {
      return sessionStorage.getItem(BRIEF_KEY) === "1";
    } catch {
      return false;
    }
  });
  const toggle = () =>
    setOpen((v) => {
      try {
        sessionStorage.setItem(BRIEF_KEY, v ? "0" : "1");
      } catch {
        /* storage unavailable: the toggle still works for this page */
      }
      return !v;
    });
  return [open, toggle];
}

function Move({
  to,
  title,
  dir,
}: {
  to: NavTarget | null | undefined;
  title: string;
  dir: "up" | "down" | "left" | "right";
}) {
  const label = to ? `${title}: ${to.label}` : `${title}: none`;
  return (
    <IconButton size="sm" title={label} href={to?.href} disabled={!to}>
      <ChevronIcon size={16} className={`review-nav__chev review-nav__chev--${dir}`} />
    </IconButton>
  );
}

export function ReviewNav({
  up,
  down,
  students,
  brief,
}: {
  up: NavTarget | null;
  down: NavTarget | null;
  /** Left / right between students; omitted on an assignment's own page. */
  students?: {
    prev: NavTarget | null;
    next: NavTarget | null;
    position: { index: number; of: number } | null;
  };
  /** The Assignment toggle; omitted when nothing was written for it. */
  brief?: { open: boolean; onToggle: () => void } | null;
}) {
  return (
    <nav className="review-nav" aria-label="Move between submissions">
      {brief && (
        <button
          type="button"
          className="review-nav__brief"
          aria-pressed={brief.open}
          onClick={brief.onToggle}
        >
          Assignment
        </button>
      )}
      <span className="review-nav__group">
        <Move to={up} title="Previous assignment" dir="up" />
        <Move to={down} title="Next assignment" dir="down" />
      </span>
      {students && (
        <span className="review-nav__group">
          <Move to={students.prev} title="Previous student" dir="left" />
          {students.position && (
            <span className="review-nav__pos">
              {students.position.index} of {students.position.of}
            </span>
          )}
          <Move to={students.next} title="Next student" dir="right" />
        </span>
      )}
    </nav>
  );
}

/** What was assigned, shown beneath the header while the toggle is on. */
export function AssignmentBrief({
  assignment,
}: {
  assignment: Pick<GridAssignment, "title" | "dueAt" | "instructions">;
}) {
  return (
    <section className="review-brief" aria-label="Assignment">
      <div className="review-brief__head">
        <span className="eyebrow">Assignment</span>
        <span className="review-brief__title">{assignment.title}</span>
        {assignment.dueAt !== null && (
          <span className="review-brief__due">
            Due{" "}
            {new Date(assignment.dueAt).toLocaleString(undefined, {
              dateStyle: "medium",
              timeStyle: "short",
            })}
          </span>
        )}
      </div>
      <div className="review-brief__body">
        <Markdown>{assignment.instructions}</Markdown>
      </div>
    </section>
  );
}
