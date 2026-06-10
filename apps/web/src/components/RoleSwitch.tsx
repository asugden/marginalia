// The single role-switch control. One affordance, present in every shell's
// topbar, that moves a user between the student view, the author (staff) view,
// and the admin console. It replaces the old scattered bridges — the
// "Instructor" navlink on the student home and the "← Student view" button in
// the course header.
//
// Pure presentational: the hosting shell passes the caller's role + admin flag
// + the active courseId. The control decides which segments to show:
//
//   * pure student (role "student", not admin) → renders nothing. A student
//     has nowhere else to switch to; the segmented control would be noise.
//   * instructor → Student ⇄ Author (+ Admin if they're also an admin).
//   * admin-only non-instructor → Student ⇄ Admin (no Author — they author
//     nothing in this course; Student is the course-scoped preview).
//
// The student owns the clean course root; the instructor view is prefixed.
// Targets are URL-derived: Student → /course/:id, Author → /course/:id/instructor,
// Admin → /admin. `current` marks the active segment. When there's no course in
// scope (the admin console, the picker), Student/Author fall back to the course
// picker.

import { Link } from "react-router-dom";
import type { MeEnrollment } from "../api.js";

export type RoleSurface = "student" | "author" | "admin";

export interface RoleSwitchProps {
  /** Active course, or null on instance-wide surfaces (/admin, picker). */
  courseId: string | null;
  role: MeEnrollment["role"];
  isAdmin: boolean;
  /** Which surface the caller is currently on (drives the active pill). */
  current: RoleSurface;
}

export function RoleSwitch({ courseId, role, isAdmin, current }: RoleSwitchProps) {
  const isInstructor = role === "instructor";
  // A pure student has nothing to switch between.
  if (!isInstructor && !isAdmin) return null;

  // With a course in scope, Student/Author point into it; without one, they
  // fall back to the picker so the control still goes somewhere sensible.
  const studentTo = courseId ? `/course/${courseId}` : "/courses";
  const authorTo = courseId ? `/course/${courseId}/instructor` : "/courses";

  const segments: Array<{ key: RoleSurface; label: string; to: string }> = [
    { key: "student", label: "Student", to: studentTo },
  ];
  if (isInstructor) segments.push({ key: "author", label: "Author", to: authorTo });
  if (isAdmin) segments.push({ key: "admin", label: "Admin", to: "/admin" });

  return (
    <div className="ds-seg ds-roleswitch" role="tablist" aria-label="Switch view">
      {segments.map((s) => {
        const active = s.key === current;
        return (
          <Link
            key={s.key}
            to={s.to}
            role="tab"
            aria-selected={active}
            className={"ds-seg__btn" + (active ? " ds-seg__btn--active" : "")}
          >
            {s.label}
          </Link>
        );
      })}
    </div>
  );
}
