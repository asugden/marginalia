// Course resolution for surfaces that need a course id but resolve it
// themselves rather than from a layout. The provenance editor (a standalone
// full-screen route at /course/:courseId/write/:id) is the remaining user: it
// passes its URL :courseId in as `preferCourseId` so the hook resolves to that
// course directly.
//
// Resolution rule:
//   * 0 enrollments → notEnrolled.
//   * 1 enrollment  → that course, automatically.
//   * 2+ enrollments → `preferCourseId` if it's a valid enrollment, else the
//     id stored in localStorage if still valid, else the most recent.
//
// This is deliberately NOT useCourse() — that one throws outside a course
// layout. This hook does its own /api/me fetch.

import { useCallback, useEffect, useState } from "react";
import { getMe, type MeEnrollment } from "../client.js";

const ACTIVE_COURSE_KEY = "active.courseId";

export interface ActiveCourseState {
  loading: boolean;
  error: string | null;
  /** All enrollments, for the switcher. */
  enrollments: MeEnrollment[];
  /** The resolved active enrollment, or null while loading / not enrolled. */
  active: MeEnrollment | null;
  /** Session-scoped: an instructor is previewing as a student. Surfaced here
   *  (not on `active`, since it's a top-level /api/me flag) so standalone
   *  surfaces like the provenance editor can replicate the student view
   *  regardless of how the caller arrived. While true, `active.role` is
   *  already reported as `student`. */
  actingAsStudent: boolean;
  notEnrolled: boolean;
  /** Switch the active course (persists to localStorage). No-op for an id
   *  the caller isn't enrolled in. */
  setCourseId: (courseId: string) => void;
}

function readStored(): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(ACTIVE_COURSE_KEY);
}

function resolve(enrollments: MeEnrollment[], preferred: string | null): MeEnrollment | null {
  if (enrollments.length === 0) return null;
  if (preferred) {
    const hit = enrollments.find((e) => e.courseId === preferred);
    if (hit) return hit;
  }
  // /api/me returns enrollments joined-date desc, so [0] is most recent.
  return enrollments[0]!;
}

export function useActiveCourse(preferCourseId?: string | null): ActiveCourseState {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [enrollments, setEnrollments] = useState<MeEnrollment[]>([]);
  const [actingAsStudent, setActingAsStudent] = useState(false);
  // An explicit course id (e.g. from a /course/:courseId/* URL) wins over the
  // localStorage fallback so a deep-linked surface resolves to the course in
  // its own URL, not whatever was last active.
  const [activeId, setActiveId] = useState<string | null>(
    () => preferCourseId ?? readStored(),
  );

  useEffect(() => {
    const ctrl = new AbortController();
    getMe(ctrl.signal)
      .then((m) => {
        if (ctrl.signal.aborted) return;
        setEnrollments(m.enrollments);
        setActingAsStudent(Boolean(m.actingAsStudent));
        setLoading(false);
      })
      .catch((e) => {
        if (ctrl.signal.aborted) return;
        setError(e instanceof Error ? e.message : "Load failed");
        setLoading(false);
      });
    return () => ctrl.abort();
  }, []);

  const setCourseId = useCallback(
    (courseId: string) => {
      // Guard: only honour ids the caller is actually enrolled in.
      if (!enrollments.some((e) => e.courseId === courseId)) return;
      setActiveId(courseId);
      window.localStorage.setItem(ACTIVE_COURSE_KEY, courseId);
    },
    [enrollments],
  );

  const active = resolve(enrollments, activeId);

  return {
    loading,
    error,
    enrollments,
    active,
    actingAsStudent,
    notEnrolled: !loading && error === null && enrollments.length === 0,
    setCourseId,
  };
}
