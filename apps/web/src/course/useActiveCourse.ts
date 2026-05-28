// Course resolution for *course-agnostic* surfaces — pages that live
// outside `/course/:courseId/*` (and thus outside <CourseLayout>) but
// still need a course id for their API calls. The provenance writing
// tool at /write is the first such surface.
//
// Resolution rule:
//   * 0 enrollments → notEnrolled (caller renders a join prompt).
//   * 1 enrollment  → that course, automatically.
//   * 2+ enrollments → the one whose id is stored in localStorage if it's
//     still a valid enrollment, else the most recent. The caller exposes
//     a switcher (see StandalonePage) that calls setCourseId.
//
// This is deliberately NOT useCourse() — that one throws outside
// CourseLayout. This hook does its own /api/me fetch and owns the
// single-vs-many resolution that CourseLayout gets from the URL instead.

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

export function useActiveCourse(): ActiveCourseState {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [enrollments, setEnrollments] = useState<MeEnrollment[]>([]);
  const [activeId, setActiveId] = useState<string | null>(() => readStored());

  useEffect(() => {
    const ctrl = new AbortController();
    getMe(ctrl.signal)
      .then((m) => {
        if (ctrl.signal.aborted) return;
        setEnrollments(m.enrollments);
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
    notEnrolled: !loading && error === null && enrollments.length === 0,
    setCourseId,
  };
}
