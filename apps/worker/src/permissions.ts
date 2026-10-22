// Who may do what — the single permission table for course roles.
//
// Every authorization decision about a course role routes through here.
// Handlers ask `can(role, "author")`, never `role === "instructor"`, so what a
// role may do is written down once and changed in one place.
//
//                     author  manage_students  view_submissions  run_attendance  manage_staff
//   instructor          ✓           ✓                 ✓                ✓              ✓
//   ta                  ✗           ✓                 ✓                ✓              ✗
//   student             ✗           ✗                 ✗                ✗              ✗
//
// `manage_staff` is adding or changing TAs. Adding instructors is never a
// course capability: only an instance admin may do it (see assignableRoles).
//
// Course creation is a separate, per-person permission (users.
// can_create_courses, or admin) — it is not something any course role grants.

import type { EnrollmentRole } from "@marginalia/schema";

export type Capability =
  /** Build and change what the course hands out: agents, assignments,
   *  voices, libraries, settings, examples. */
  | "author"
  /** Add and remove students; manage join codes. */
  | "manage_students"
  /** See what students handed in (writing and code submissions). */
  | "view_submissions"
  /** Open, run, and export attendance sessions. */
  | "run_attendance"
  /** Add, change, and remove TAs. */
  | "manage_staff";

const TABLE: Record<EnrollmentRole, ReadonlySet<Capability>> = {
  instructor: new Set<Capability>([
    "author",
    "manage_students",
    "view_submissions",
    "run_attendance",
    "manage_staff",
  ]),
  ta: new Set<Capability>(["manage_students", "view_submissions", "run_attendance"]),
  student: new Set<Capability>(),
};

/** Whether a course role holds a capability. Unknown or missing roles hold
 *  nothing, so a row from an older schema can never widen access. */
export function can(
  role: string | null | undefined,
  capability: Capability,
): boolean {
  if (!role || !isEnrollmentRole(role)) return false;
  return TABLE[role].has(capability);
}

/** Every capability a role holds, for the SPA: /api/me sends these per
 *  enrollment so the web app never keeps its own copy of the table. */
export function capabilitiesFor(role: string | null | undefined): Capability[] {
  if (!role || !isEnrollmentRole(role)) return [];
  return [...TABLE[role]];
}

/** Course staff: anyone who works on the course rather than taking it. */
export function isStaff(role: string | null | undefined): boolean {
  return role === "instructor" || role === "ta";
}

export function isEnrollmentRole(role: unknown): role is EnrollmentRole {
  return role === "student" || role === "ta" || role === "instructor";
}

/**
 * Which roles an actor may give someone in a course.
 *
 *   admin      → any role
 *   instructor → ta, student
 *   ta         → student
 *   student    → none
 *
 * The same set bounds both ends of a role change: the actor must be allowed
 * to assign the person's current role *and* the new one, so an instructor
 * can't demote a co-instructor and a TA can't touch another TA.
 */
export function assignableRoles(actor: {
  role: string | null | undefined;
  isAdmin: boolean;
}): EnrollmentRole[] {
  if (actor.isAdmin) return ["student", "ta", "instructor"];
  const out: EnrollmentRole[] = [];
  if (can(actor.role, "manage_students")) out.push("student");
  if (can(actor.role, "manage_staff")) out.push("ta");
  return out;
}

export function canAssignRole(
  actor: { role: string | null | undefined; isAdmin: boolean },
  role: EnrollmentRole,
): boolean {
  return assignableRoles(actor).includes(role);
}

/** Course creation: admins always; everyone else needs the per-person flag. */
export function canCreateCourses(user: {
  isAdmin: boolean;
  canCreateCourses: boolean;
}): boolean {
  return user.isAdmin || user.canCreateCourses;
}
