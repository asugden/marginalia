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
import { setActingAsStudent } from "../client.js";
import { ChevronIcon } from "../icons.js";

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
  /** Session-scoped act-as-student. While previewing, `role` is reported as
   *  `student`, so without this the control would vanish and trap the
   *  instructor on the student surface. When true, treat the caller as an
   *  instructor for the purpose of showing the "back to Instructor" option. */
  actingAsStudent?: boolean;
}

interface Option {
  key: RoleSurface;
  label: string;
  detail: string;
  to: string;
}

export function RoleSwitch({
  courseId,
  role,
  isAdmin,
  current,
  actingAsStudent = false,
}: RoleSwitchProps) {
  // While previewing, the reported role is `student`; the caller is really an
  // instructor, so treat them as one for building the switch options.
  const isInstructor = role === "instructor" || actingAsStudent;
  const [open, setOpen] = useState(false);
  const [switching, setSwitching] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();

  // Moving to the student surface is a *real* role downgrade, not just
  // navigation: flip the session's act-as-student flag so the worker reports
  // this instructor as a student everywhere (hidden marks and all), then land
  // on the student view. Moving back to Instructor/Admin clears it. We await
  // the toggle before navigating so the destination page's /api/me already
  // reflects the new role. Admin ⇄ author both run as full instructor.
  async function go(target: RoleSurface, to: string) {
    setOpen(false);
    if (switching) return;
    setSwitching(true);
    try {
      // Target is the source of truth: entering the student surface sets the
      // downgrade, anywhere else (Instructor / Admin) clears it. We must NOT
      // gate the clear on `current === "student"` — an instructor can be
      // acting-as-student on a surface that isn't the student home (e.g. the
      // standalone provenance editor), and choosing Instructor from there must
      // still un-stick them. setActingAsStudent is idempotent, so clearing when
      // already cleared is a harmless no-op.
      await setActingAsStudent(target === "student");
      navigate(to);
    } finally {
      setSwitching(false);
    }
  }

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
    <div className="app-roles" ref={ref}>
      <button
        type="button"
        className="app-roles__btn"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
      >
        {triggerLabel}
        <ChevronIcon size={14} />
      </button>
      {open && (
        <div className="app-roles__menu" role="menu">
          {options.map((o) => {
            const active = o.key === current;
            return (
              <button
                key={o.key}
                type="button"
                role="menuitem"
                className={
                  "app-roles__opt" + (active ? " app-roles__opt--active" : "")
                }
                disabled={switching}
                onClick={() => go(o.key, o.to)}
              >
                <b>{o.label}</b>
                <span>{o.detail}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
