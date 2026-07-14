// v1.0 §1 — per-course context for staff pages.
//
// `CourseLayout` (see ../pages/CourseLayout.tsx) reads `:courseId` from the
// URL, fetches `/api/me` to validate the caller is enrolled, and supplies
// the course id + name + the caller's role via this context. Every staff
// page reads `useCourse()` instead of importing the old `DEMO_COURSE`
// constant.
//
// Putting course id in the URL (not a global) is what lets two browser
// tabs hold two different courses without colliding. The hook just reads
// the value the layout already validated.

import { createContext, useContext } from "react";
import type { MeEnrollment } from "../api.js";

export interface CourseContextValue {
  courseId: string;
  courseName: string;
  role: MeEnrollment["role"];
  showAttendance: boolean;
  showCollections: boolean;
  /** Whether students see provenance origin colouring. Instructors always
   *  see marks; the provenance editor reads this to seed its instructor-only
   *  "hide marks from students" toggle. Carried on the context (not the
   *  tab-visibility predicate) so the writing surface can read it without a
   *  separate fetch. */
  hideProvenanceMarks: boolean;
  /** v1.1 — whether the provenance writing module is on for this course. When
   *  false, the student view drops the Writing module (nav + home panel). */
  provenanceEnabled: boolean;
  /** Instance-wide admin flag (from /api/me). Orthogonal to course role —
   *  feeds the topbar RoleSwitch so it can offer the Admin segment. */
  isAdmin: boolean;
  /** Session-scoped: an instructor is previewing this course as a student.
   *  While true, `role` above is already reported as `student` (so marks etc.
   *  match a real student), so the RoleSwitch reads this flag to keep offering
   *  the way back to Instructor. */
  actingAsStudent: boolean;
}

export const CourseContext = createContext<CourseContextValue | null>(null);

/** Throws when called outside a `<CourseLayout>` — the layout's job is to
 *  guarantee the value is set before any child page renders. */
export function useCourse(): CourseContextValue {
  const v = useContext(CourseContext);
  if (!v) {
    throw new Error(
      "useCourse() called outside <CourseLayout>. Mount the page under /course/:courseId/...",
    );
  }
  return v;
}
