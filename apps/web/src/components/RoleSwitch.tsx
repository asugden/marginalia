// The single role-switch control. One affordance, present in every shell's
// topbar, that moves a user between authoring, a course-scoped student preview,
// and the instance-wide admin console. It replaces the old scattered bridges —
// the "Instructor" navlink on the student home and the "← Student view" button
// in the course header.
//
// It renders as a small dropdown (not a row of pills): a labelled trigger that
// names the surface you're on now ("Instructor" / "Viewing as student" /
// "Admin"), opening a menu of the places you can go. The menu copy frames the
// student option as a *preview of this one course* — an instructor previewing
// their class sees exactly what a student enrolled in it sees, never any other
// class.
//
// Pure-presentational beyond its own open/close state: the hosting shell passes
// the caller's role + admin flag + the active courseId + which surface is
// current. The control decides which options to show:
//
//   * pure student (role "student", not admin) → renders nothing. A student has
//     nowhere else to switch to; the control would be noise.
//   * instructor → Instructor ⇄ Preview as student (+ Admin console if also an
//     admin).
//   * admin-only non-instructor → Preview as student ⇄ Admin console (no
//     authoring — they author nothing in this course).
//
// The student owns the clean course root; the instructor view is prefixed.
// Targets are URL-derived: Instructor → /course/:id/instructor, student preview
// → /course/:id, Admin → /admin. When there's no course in scope (the admin
// console, the picker) the course-scoped options fall back to the picker.

import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import type { MeEnrollment } from "../api.js";
import { ChevronIcon, CheckIcon } from "../icons.js";

export type RoleSurface = "student" | "author" | "admin";

export interface RoleSwitchProps {
  /** Active course, or null on instance-wide surfaces (/admin, picker). */
  courseId: string | null;
  role: MeEnrollment["role"];
  isAdmin: boolean;
  /** Which surface the caller is currently on (drives the trigger label and
   *  the checked option). On the student surface this only renders when the
   *  caller is an instructor/admin previewing — a pure student gets nothing. */
  current: RoleSurface;
}

interface Option {
  key: RoleSurface;
  label: string;
  detail: string;
  to: string;
}

export function RoleSwitch({ courseId, role, isAdmin, current }: RoleSwitchProps) {
  const isInstructor = role === "instructor";
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();

  useEffect(() => {
    function away(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", away);
    return () => document.removeEventListener("mousedown", away);
  }, []);

  // A pure student has nothing to switch between.
  if (!isInstructor && !isAdmin) return null;

  // With a course in scope, the course-scoped options point into it; without
  // one they fall back to the picker so the control still goes somewhere.
  const studentTo = courseId ? `/course/${courseId}` : "/courses";
  const authorTo = courseId ? `/course/${courseId}/instructor` : "/courses";

  const options: Option[] = [];
  if (isInstructor) {
    options.push({
      key: "author",
      label: "Instructor",
      detail: "Your course & authoring",
      to: authorTo,
    });
  }
  options.push({
    key: "student",
    label: "Preview as student",
    detail: "See this one course the way its students do",
    to: studentTo,
  });
  if (isAdmin) {
    options.push({
      key: "admin",
      label: "Admin console",
      detail: "Admins, users & audit — instance-wide",
      to: "/admin",
    });
  }

  // The trigger names where you are now. On the student surface, an instructor
  // is *previewing*, so say so.
  const triggerLabel =
    current === "admin"
      ? "Admin"
      : current === "student"
        ? "Viewing as student"
        : "Instructor";

  return (
    <div className="ds-roleswitch" ref={ref}>
      <button
        type="button"
        className="ds-roleswitch__btn"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
      >
        {triggerLabel}
        <ChevronIcon size={14} />
      </button>
      {open && (
        <div className="ds-roleswitch__menu" role="menu">
          {options.map((o) => {
            const active = o.key === current;
            return (
              <button
                key={o.key}
                type="button"
                role="menuitem"
                className={
                  "ds-roleswitch__opt" +
                  (active ? " ds-roleswitch__opt--active" : "")
                }
                onClick={() => {
                  setOpen(false);
                  navigate(o.to);
                }}
              >
                <span className="ds-roleswitch__opt-main">
                  <b>{o.label}</b>
                  <span>{o.detail}</span>
                </span>
                {active && (
                  <span className="ds-roleswitch__tick" aria-hidden>
                    <CheckIcon size={15} />
                  </span>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
