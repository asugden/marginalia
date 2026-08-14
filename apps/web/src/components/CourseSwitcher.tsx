// The header course switcher — a dropdown that shows the active course and lets
// the caller jump to another of their courses, or out to the full "All courses"
// list. Extracted from CourseLayout so the student shell gets the exact same
// affordance the instructor shell has always had (students previously had no
// way to change course once inside one).
//
// Two variants differ only in where a picked course lands and whether creating
// a course is offered:
//   * instructor — jumps to /course/:id/instructor; offers "New course…".
//   * student    — jumps to /course/:id/dashboard; NO create control (creating
//                  a course is an instructor action).
//
// The dropdown lists only CURRENT courses (today within their start/end dates,
// via isCourseCurrent); past and upcoming courses stay reachable through "All
// courses". The course you're in is checkmarked when it's itself current.
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import type { MeEnrollment } from "../client.js";
import { isCourseCurrent, termLabel } from "../course/term.js";
import { BackIcon, CheckIcon, ChevronIcon, PlusIcon } from "../icons.js";

export interface CourseSwitcherProps {
  courseId: string;
  courseName: string;
  enrollments: MeEnrollment[];
  variant: "student" | "instructor";
}

export function CourseSwitcher({
  courseId,
  courseName,
  enrollments,
  variant,
}: CourseSwitcherProps) {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);

  // Where a picked course lands, per variant.
  const homeFor = (id: string) =>
    variant === "instructor"
      ? `/course/${id}/instructor`
      : `/course/${id}/dashboard`;

  // The dropdown is a QUICK jump between the courses running THIS semester, so
  // it lists only courses that are current by date (start ≤ today ≤ end). Past
  // and upcoming courses are reachable through "All courses". The course you're
  // in appears here (checkmarked) when it's itself current.
  const now = Date.now();
  const current = enrollments.filter((e) =>
    isCourseCurrent(e.startDate, e.endDate, now),
  );

  // Subtitle for a course row: its term (e.g. "Summer 2026") when scheduled,
  // otherwise the caller's role in it.
  const subtitle = (e: MeEnrollment) =>
    e.termSeason != null && e.termYear != null
      ? termLabel(e.termSeason, e.termYear)
      : e.role;

  return (
    <div className="app-course">
      <button
        type="button"
        className="app-course__btn"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <span className="app-course__name">{courseName}</span>
        <ChevronIcon size={14} />
      </button>
      {open && (
        <div className="app-course__menu" role="menu">
          <button
            type="button"
            className="app-course__opt app-course__all"
            onClick={() => {
              setOpen(false);
              navigate("/courses");
            }}
          >
            <BackIcon size={15} />
            <span className="app-course__main">
              <b>All Courses</b>
              <span>Your courses</span>
            </span>
          </button>
          {current.length > 0 && (
            <>
              <div className="app-course__sep" />
              <div className="app-course__eyebrow">Current Courses</div>
              {current.map((e) => {
                const isCurrentCourse = e.courseId === courseId;
                return (
                  <button
                    key={e.courseId}
                    type="button"
                    className="app-course__opt"
                    onClick={() => {
                      setOpen(false);
                      if (!isCurrentCourse) navigate(homeFor(e.courseId));
                    }}
                  >
                    <span className="app-course__main">
                      <b>{e.courseName}</b>
                      <span>{subtitle(e)}</span>
                    </span>
                    {isCurrentCourse && (
                      <span className="app-course__tick">
                        <CheckIcon size={16} />
                      </span>
                    )}
                  </button>
                );
              })}
            </>
          )}
          {variant === "instructor" && (
            <>
              <div className="app-course__sep" />
              <button
                type="button"
                className="app-course__opt app-course__new"
                onClick={() => {
                  setOpen(false);
                  navigate("/courses?new=1");
                }}
              >
                <PlusIcon size={16} />
                <span className="app-course__main">
                  <b>New Course…</b>
                  <span>Blank or copy an existing one</span>
                </span>
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
