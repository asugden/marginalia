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
// It also carries the COURSE-ADMIN section (People, Settings) on the instructor
// variant. Those two left the header strip when it collapsed to four bands:
// they're course administration rather than course work, and this menu is
// already the course-scoped one, so it is where they belong. See navGroups().
//
// The dropdown lists only CURRENT courses (today within their start/end dates,
// via isCourseCurrent); past and upcoming courses stay reachable through "All
// courses". The course you're in is checkmarked when it's itself current.
import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import type { MeEnrollment } from "../client.js";
import { isCourseCurrent, termLabel } from "../course/term.js";
import {
  adminMenuTabs,
  tabHref,
  type TabVisibilityFlags,
} from "../course/tabs.js";
import { BackIcon, CheckIcon, ChevronIcon, GearIcon, PlusIcon, UsersIcon } from "../icons.js";

export interface CourseSwitcherProps {
  courseId: string;
  courseName: string;
  enrollments: MeEnrollment[];
  variant: "student" | "instructor";
  /** Lazy-reveal flags for the course-admin section (People, Settings). When
   *  omitted — the student variant, and any host that doesn't have them — the
   *  section is left out entirely. */
  flags?: TabVisibilityFlags;
}

export function CourseSwitcher({
  courseId,
  courseName,
  enrollments,
  variant,
  flags,
}: CourseSwitcherProps) {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Close on an outside click / Escape. The other two header menus (RoleSwitch,
  // CourseNav) have always done this; this one never did, so it stayed open
  // until you picked something or clicked its own trigger again.
  useEffect(() => {
    if (!open) return;
    function away(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", away);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", away);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

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

  // Course-admin destinations (People, Settings) for the instructor variant.
  // Empty when no flags were supplied, which is how the student variant and
  // the context-less hosts opt out without a second prop.
  const adminTabs = variant === "instructor" ? adminMenuTabs(flags) : [];

  // Subtitle for a course row: its term (e.g. "Summer 2026") when scheduled,
  // otherwise the caller's role in it.
  const subtitle = (e: MeEnrollment) =>
    e.termSeason != null && e.termYear != null
      ? termLabel(e.termSeason, e.termYear)
      : e.role;

  return (
    <div className="app-course" ref={ref}>
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
          {/* Course admin — People and Settings. These used to be pills in the
              header strip; they're administration of THIS course, so they sit
              under the course's own menu rather than competing with the work
              bands for header width. */}
          {variant === "instructor" && adminTabs.length > 0 && (
            <>
              <div className="app-course__sep" />
              <div className="app-course__eyebrow">This Course</div>
              {adminTabs.map((t) => (
                <button
                  key={t.slug}
                  type="button"
                  role="menuitem"
                  className="app-course__opt"
                  onClick={() => {
                    setOpen(false);
                    navigate(tabHref(t, courseId));
                  }}
                >
                  {t.slug === "roster" ? (
                    <UsersIcon size={15} />
                  ) : (
                    <GearIcon size={15} />
                  )}
                  <span className="app-course__main">
                    <b>{t.label}</b>
                  </span>
                </button>
              ))}
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
